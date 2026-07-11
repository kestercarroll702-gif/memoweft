/**
 * MemoWeft MCP tools —— 白名单注册（外部 AI 客户端自主可调的协议面）。
 *
 * 安全硬约束（见 README 的 SECURITY 段 + 任务书 D3）：
 *   - 只暴露 6 个 tool：5 读 + 1 轻写（只存一句用户原话）。
 *   - 破坏性 / 改上云授权 / 整套消化改画像的 Core 方法【一律不注册】——
 *     invalidate、remove、merge、archive、reset、updateEvidenceAuthorization、
 *     handleConversationTurn、updateProfile、ingestObservation、portable 都不出现在这里。
 *   - tool description 用中性协议措辞，不复活人设（Core 无头）。
 *
 * 这一层只做"把 Core 门面翻译成 MCP tool"：取参 → 调门面 → 把结果包成
 * structuredContent + 一段可读 text。
 *
 * 降级（契约 §16.2「记忆层故障→降级不中断」，见 D-0012）：记忆层内部故障/超时不再让进程崩、
 *   不再以协议错误上浮记忆层内部错——handler 兜 core.* 的抛错/超时：
 *     · 读工具（recall / list_* / graph）→ 返回空结果 + isError:false，对话不中断；recall 另包 200ms 超时；
 *     · 写工具（ingest）→ 一次重试后仍失败则返回未落库标记 + isError:false；
 *     · 降级都经【注入的 logger】记一条结构化事件（缺省无 logger = 静默）。
 *   边界：只有 core.* 记忆层故障才降级；参数非法（zod inputSchema 在 handler 之前校验）等
 *   "调用方的错"仍以协议错误上浮，不被吞（降级 vs 真错分清）。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemoWeftCore, RecalledCognition } from 'memoweft';
import {
  DEFAULT_RECALL_TIMEOUT_MS,
  RecallTimeoutError,
  retryOnce,
  withTimeout,
  type McpServerLogger,
} from './degrade.ts';

/** 白名单 tool 名（snake_case + memoweft_ 前缀）。测试枚举它核对"多一个都不行"。 */
export const READ_TOOL_NAMES = [
  'memoweft_recall',
  'memoweft_list_cognitions',
  'memoweft_list_evidence',
  'memoweft_list_events',
  'memoweft_graph',
] as const;

export const WRITE_TOOL_NAMES = ['memoweft_ingest_user_message'] as const;

/** 全部会被注册的 tool 名（读 + 轻写）。测试断言 server 注册的 tool 集合 === 这个集合。 */
export const ALL_TOOL_NAMES = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

/** 结果统一包成 { structuredContent, content:[text] }：结构给机器读，text 给人读/兜底。 */
function ok(payload: unknown): {
  structuredContent: { result: unknown };
  content: { type: 'text'; text: string }[];
} {
  return {
    structuredContent: { result: payload },
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

/** registerTools 选项（降级语义，契约 §16.2）。 */
export interface RegisterToolsOptions {
  /**
   * 注入式 logger（可选）：记忆层故障/超时降级时记一条【结构化事件】
   *   （`{ event:'memory_degraded', tool, op, reason }`）。缺省不注入 = 静默降级。
   * 认知纪律 + 隐私：只记事件元信息，绝不记用户内容 / 原话 / 密钥。
   */
  logger?: McpServerLogger;
  /** recall 超时阈值（毫秒）。缺省 200ms（契约 §16.2）。 */
  recallTimeoutMs?: number;
}

/**
 * 把白名单 tool 注册到给定 McpServer。
 * @param server 已建好的 McpServer（serverInfo/capabilities 由 createMcpServer 定）。
 * @param core   进程内的 MemoWeftCore 门面（读写都经它，绝不直接碰 store）。
 * @param opts   降级语义选项（logger / recallTimeoutMs，契约 §16.2）。
 */
export function registerTools(server: McpServer, core: MemoWeftCore, opts: RegisterToolsOptions = {}): void {
  const { logger, recallTimeoutMs = DEFAULT_RECALL_TIMEOUT_MS } = opts;

  /**
   * 读工具降级包裹：跑 core 读操作 → 成功回真结果；记忆层抛错/超时 → 记一条 + 返回 emptyValue（降级）。
   * recall 另包 recallTimeoutMs 超时（op==='recall'）；list_* 与 graph 只兜抛错（op==='read'）。
   */
  async function guardRead<T>(tool: string, op: 'recall' | 'read', empty: T, run: () => Promise<T>): Promise<T> {
    try {
      return op === 'recall' ? await withTimeout(run(), recallTimeoutMs) : await run();
    } catch (err) {
      logger?.({
        event: 'memory_degraded',
        tool,
        op,
        reason: err instanceof RecallTimeoutError ? 'timeout' : 'error',
      });
      return empty;
    }
  }
  // ── 读 1：召回相关认知 ───────────────────────────────────────────────
  server.registerTool(
    'memoweft_recall',
    {
      title: 'Recall memory',
      description:
        'Recall stored knowledge relevant to a query. Returns cognitions with confidence and credibility status; low-credibility items are guesses, not established facts.',
      inputSchema: {
        query: z.string().min(1).describe('The query to recall knowledge for.'),
        subjectId: z
          .string()
          .optional()
          .describe('Subject to recall for; defaults to the configured subject.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, subjectId }) => {
      // 降级：召回超时（200ms）/ 抛错 → 记一条 + 返回空召回（无记忆），isError:false 不中断。
      const items = await guardRead('memoweft_recall', 'recall', [] as RecalledCognition[], () =>
        core.recall({ query, subjectId }),
      );
      return ok(
        items.map((c) => ({
          id: c.id,
          content: c.content,
          confidence: c.confidence,
          credStatus: c.credStatus,
          score: c.score,
        })),
      );
    },
  );

  // ── 读 2：列取认知（画像条目 + 溯源链 + 有效置信）────────────────────
  server.registerTool(
    'memoweft_list_cognitions',
    {
      title: 'List cognitions',
      description:
        'List all stored cognitions for a subject, each with its evidence links and a read-time effective confidence. Read-only.',
      inputSchema: {
        subjectId: z
          .string()
          .optional()
          .describe('Subject to list for; defaults to the configured subject.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ subjectId }) =>
      ok(await guardRead('memoweft_list_cognitions', 'read', [], async () => core.memory.listCognitions({ subjectId }))),
  );

  // ── 读 3：列取证据（原始来源）────────────────────────────────────────
  server.registerTool(
    'memoweft_list_evidence',
    {
      title: 'List evidence',
      description:
        'List all stored evidence (raw sources) for a subject. Read-only; does not expose or change authorization bits.',
      inputSchema: {
        subjectId: z
          .string()
          .optional()
          .describe('Subject to list for; defaults to the configured subject.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ subjectId }) =>
      ok(await guardRead('memoweft_list_evidence', 'read', [], async () => core.memory.listEvidence({ subjectId }))),
  );

  // ── 读 4：列取事件（证据聚合）───────────────────────────────────────
  server.registerTool(
    'memoweft_list_events',
    {
      title: 'List events',
      description:
        'List all stored events for a subject, each with the ids of the evidence it covers. Read-only.',
      inputSchema: {
        subjectId: z
          .string()
          .optional()
          .describe('Subject to list for; defaults to the configured subject.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ subjectId }) =>
      ok(await guardRead('memoweft_list_events', 'read', [], async () => core.memory.listEvents({ subjectId }))),
  );

  // ── 读 5：记忆图谱 payload（nodes/edges/stats）──────────────────────
  server.registerTool(
    'memoweft_graph',
    {
      title: 'Build memory graph',
      description:
        'Build a memory graph payload (nodes, edges, stats) for a subject. Read-only. Archived cognitions are excluded unless includeArchived is true.',
      inputSchema: {
        subjectId: z
          .string()
          .optional()
          .describe('Subject to build the graph for; defaults to the configured subject.'),
        includeArchived: z
          .boolean()
          .optional()
          .describe('Include archived cognitions in the graph. Defaults to false.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ subjectId, includeArchived }) =>
      ok(
        await guardRead(
          'memoweft_graph',
          'read',
          // 降级空图（best-effort「无记忆」）：只保空 nodes/edges，形状对齐 payload。
          { nodes: [], edges: [] } as unknown as ReturnType<typeof core.graph.buildMemoryGraph>,
          async () => core.graph.buildMemoryGraph({ subjectId, includeArchived }),
        ),
      ),
  );

  // ── 写·轻：存一句用户原话为 spoken 证据（不改画像、不做消化）──────────
  server.registerTool(
    'memoweft_ingest_user_message',
    {
      title: 'Ingest user message',
      description:
        'Store a single verbatim user message as spoken evidence. This only records the raw message; it does not update the profile, run consolidation, or grant any cloud-read authorization.',
      inputSchema: {
        content: z.string().min(1).describe('The verbatim user message to store.'),
        subjectId: z
          .string()
          .optional()
          .describe('Subject the message belongs to; defaults to the configured subject.'),
        originId: z
          .string()
          .optional()
          .describe('Idempotency key: repeated ingests with the same originId store only once.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ content, subjectId, originId }) => {
      // 降级（契约 §16.2）：写路径失败重试一次；仍失败 → 记一条 + 返回未落库标记，isError:false 不中断。
      try {
        const ev = await retryOnce(() => core.ingestUserMessage({ content, subjectId, originId }));
        return ok({ id: ev.id, subjectId: ev.subjectId, sourceKind: ev.sourceKind, recordedAt: ev.recordedAt });
      } catch {
        logger?.({ event: 'memory_degraded', tool: 'memoweft_ingest_user_message', op: 'ingest', reason: 'error' });
        return ok({ stored: false, degraded: true });
      }
    },
  );
}
