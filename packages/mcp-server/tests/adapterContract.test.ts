/**
 * mcp-server · adapter-kit 契约接入（AD-1…AD-6）。
 *
 * 一份 kit（../../../tests/adapter-kit）喂两个适配器；这里是 MCP 侧的薄驱动：
 *   - 写路径经真 in-memory core + InMemoryTransport 双工，调 memoweft_ingest_user_message；
 *   - 召回呈现走 memoweft_recall 的 structuredContent（AD-4 结构化 JSON golden）。
 * 不起真 stdio、不触网。AD 断言由 runAdapterContract 产出。
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMemoWeftCore, type ChatMessage, type MemoWeftCore, type RecalledCognition } from 'memoweft';
import { createMcpServer } from '../src/index.ts';
import { runAdapterContract } from '../../../tests/adapter-kit/contract.ts';
import type {
  AdapterDriver,
  FaultMode,
  FaultOutcome,
  RecallFixtureItem,
  RecallSurface,
  ToolResultTurnResult,
  UserTurnResult,
} from '../../../tests/adapter-kit/spi.ts';
import { makeFaultyCore } from '../../../tests/adapter-kit/faultyCore.ts';

// ── 离线 core（同 server.test.ts：stub LLM + 空召回器，:memory: 库）──
function stubLLM(reply = 'ok') {
  return {
    callCount: 0,
    async chat(_messages: ChatMessage[]) {
      this.callCount++;
      return reply;
    },
  };
}
const nullRetriever = { async indexAll() {}, async search() { return []; } };
function makeCore() {
  return createMemoWeftCore({ dbPath: ':memory:', llm: stubLLM(), retriever: nullRetriever });
}

/** 建 server + 连好 in-memory client。core 的关闭由调用方负责（fake core 无需关）。可注入降级 logger（AD-6）。 */
async function connect(core: MemoWeftCore, opts: Parameters<typeof createMcpServer>[1] = {}) {
  const server = createMcpServer(core, opts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'contract-client', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

const driver: AdapterDriver = {
  name: 'mcp',

  // AD-2：走 memoweft_ingest_user_message 落一句用户原话 → 前后计数恰好 +1、spoken。
  async ingestUserTurn(text: string): Promise<UserTurnResult> {
    const core = makeCore();
    const { client, close } = await connect(core);
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));
      const res = await client.callTool({
        name: 'memoweft_ingest_user_message',
        arguments: { content: text, originId: 'turn-1' },
      });
      const payload = (res.structuredContent as { result: { sourceKind: string } }).result;
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      return { delta: after.length - before.length, sourceKind: payload.sourceKind, content: added[0]?.rawContent };
    } finally {
      await close();
      core.close();
    }
  },

  // AD-1：MCP 客户端驱动 —— 写 tool 只有「用户原话」与「工具返回结果」两个摄入面，
  //   无任何【助手输出】摄入 tool。没有可调的助手落库入口 → 助手消息流经产生零证据（by-construction）。
  async ingestAssistantTurn(_text: string): Promise<number> {
    const core = makeCore();
    const { client, close } = await connect(core);
    try {
      const before = core.memory.listEvidence({}).length;
      const { tools } = await client.listTools();
      const writeTools = tools
        .filter((t) => (t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint !== true)
        .map((t) => t.name)
        .sort();
      assert.deepEqual(
        writeTools,
        ['memoweft_ingest_tool_result', 'memoweft_ingest_user_message'],
        'AD-1：写 tool 仅摄入用户原话 / 工具返回结果，无【助手输出】摄入入口',
      );
      return core.memory.listEvidence({}).length - before;
    } finally {
      await close();
      core.close();
    }
  },

  // AD-3：外部客户端调 memoweft_ingest_tool_result 存工具返回结果 → +1 tool 证据。
  //   MCP 注册面【无】摄入 assistant/tool-call 的 tool，故 LLM 的调用意图/入参无渠道落库（铁律 3a，by-construction）。
  async ingestToolResult(resultPayload: string, callIntent: string): Promise<ToolResultTurnResult> {
    const core = makeCore();
    const { client, close } = await connect(core);
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));
      const res = await client.callTool({
        name: 'memoweft_ingest_tool_result',
        arguments: { content: resultPayload, originId: 'call-1' },
      });
      const payload = (res.structuredContent as { result: { sourceKind: string } }).result;
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      // 铁律 3a：落库证据里无一条等于/含调用意图（callIntent 含 'get_weather'，result 不含）。
      const callIntentExcluded = added.every((e) => e.rawContent !== callIntent && !e.rawContent.includes('get_weather'));
      return { delta: after.length - before.length, sourceKind: payload.sourceKind, content: added[0]?.rawContent, callIntentExcluded };
    } finally {
      await close();
      core.close();
    }
  },

  // AD-4：memoweft_recall 的 structuredContent 即结构化呈现面。用 fake-recall core 注入夹具。
  async recallSurface(fixture: RecallFixtureItem[]): Promise<RecallSurface> {
    const fakeCore = { recall: async (): Promise<RecalledCognition[]> => fixture as unknown as RecalledCognition[] } as unknown as MemoWeftCore;
    const { client, close } = await connect(fakeCore);
    try {
      const res = await client.callTool({ name: 'memoweft_recall', arguments: { query: 'anything' } });
      const items = (res.structuredContent as { result: RecallSurface['items'] }).result;
      return { kind: 'structured-json', rendered: JSON.stringify(res.structuredContent, null, 2), items };
    } finally {
      await close();
    }
  },

  // AD-6：故障 core → 读 tool（recall）。handler 兜 core.* 抛错/超时 → 降级为空召回 + isError:false（不崩、不中断），
  //   经注入 logger 记一条结构化事件。throw / timeout 两模式都真跑（timeout 由 handler 200ms 超时器有界赢下）。
  async runWithFaultyCore(mode: FaultMode): Promise<FaultOutcome> {
    const faulty = makeFaultyCore(mode) as unknown as MemoWeftCore;
    const events: unknown[] = [];
    const { client, close } = await connect(faulty, { logger: () => events.push(1) });
    try {
      const res = await client.callTool({ name: 'memoweft_recall', arguments: { query: 'q' } });
      const result = (res.structuredContent as { result?: unknown[] } | undefined)?.result;
      // 降级 = 不以协议错误上浮（isError 非真）且返回空召回（无记忆）。
      const degraded = res.isError !== true && Array.isArray(result) && result.length === 0;
      return { degraded, logged: events.length > 0 };
    } finally {
      await close();
    }
  },

  applicability: {
    ad3: {
      status: 'applicable',
      reason: 'memoweft_ingest_tool_result 存工具返回结果 → +1 tool 证据；无 assistant/tool-call 摄入 tool，调用意图不落库（铁律 3a，AD-3/D-0013）',
    },
    ad5: {
      status: 'na',
      reason: 'AD-5 na(mcp)：写 tool 仅收 verbatim content、无 evidenceId 入参，无 LLM 输出→落库回捞',
    },
    ad6: {
      status: 'applicable',
      reason: 'handler 兜 core.* 抛错/超时 → 读工具降级空召回 + isError:false，经注入 logger 记一条（契约 §16.2）',
    },
  },
};

runAdapterContract(driver, { goldenDir: fileURLToPath(new URL('./golden', import.meta.url)) });
