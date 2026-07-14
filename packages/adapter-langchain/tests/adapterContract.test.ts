/**
 * adapter-langchain · adapter-kit 契约接入（AD-1…AD-9）。
 *
 * 一份 kit（../../../tests/adapter-kit）喂多个适配器；这里是 LangChain（`@langchain/core`）侧的薄驱动：
 *   - 测试【直接 new MemoWeftRetriever / MemoWeftWriteCallback 调其方法、喂构造对象】——【不跑真实链】、
 *     不触网、不打模型。召回走 `retriever._getRelevantDocuments(query)`（BaseRetriever 的检索主体，
 *     invoke 的内核），写走 `writeCallback.handleToolEnd(output, runId)` 与导出的 `persistUserTurn(core, …)`。
 *   - AD 断言由 runAdapterContract 产出（本文件是 *.test.ts，node --test 直接跑）。
 *
 * 与 A（adapter-ai-sdk）/ openai-agents / claude-agent-sdk 的对照：都不启动宿主运行时、都靠「直接调处理函数 +
 *   喂构造事件」在离线核上断言（同一范式）。本包是 retriever-读 + callback/闭包-写 型（硬事实：LangChain callbacks
 *   是【观察-only】，CallbackManager 丢弃 handler 返回值 → 召回注入不能走 callback，必须走 BaseRetriever/Runnable）。
 *   AD-1 守结构不变量 / AD-6 隔离 recall 降级 / AD-8 补隐私断言（provenance 不进注入块）的写法照抄 openai-agents。
 *
 * 铁律 3a（代码级 by-construction·物理隔离）：③ 写回调【只】实现 `handleToolEnd`（工具真实【返回结果】），
 *   【绝不】声明 `handleToolStart`（它给的是调用意图/入参 string）——LangChain 的 CallbackManager 是
 *   `if (handler.handleToolStart) …` 才投递，本类无此方法 → 调用意图物理上进不来（AD-1/AD-3 的结构不变量断言证这条）。
 *   实测 `@langchain/core@1.2.2` .d.ts：本版回调面【无】`handleChatModelEnd`；承载助手输出/调用意图的可选 hook 是
 *   `handleLLMEnd`（模型完成输出）/`handleLLMNewToken`（流式 token）/`handleToolStart`+`handleAgentAction`（调用意图）/
 *   `handleChatModelStart`（携带注入过的模型输入）——AD-1 断言这些在写回调实例上一律 `undefined`（未声明）。
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  createMemoWeftCore,
  type ChatMessage,
  type RecalledCognition,
  type RecallInput,
  type ContentType,
} from 'memoweft';
import {
  MemoWeftRetriever,
  MemoWeftWriteCallback,
  formatMemoWeftDocs,
  persistUserTurn,
  type MemoWeftRetrieverOptions,
} from '../src/index.ts';
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

// ── 离线 core（同 A / openai / claude adapterContract.test.ts 手法：stub LLM + 空召回器，:memory: 库）──
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

// MemoWeftRetriever 期望的 core 面（RetrieverCore = Pick<MemoWeftCore,'recall'> 未导出，从构造签名取），fake core 据此 cast。
type RetrieverCoreArg = ConstructorParameters<typeof MemoWeftRetriever>[0];
// onRecall 回调收到的召回项类型（透传的 v2 面：id/contentType/score/provenance）。从公开选项类型提取，
//   AD-7/8 据此把「透传进 onRecall 的召回对象」当断言源（非驱动自造结果）。
type OnRecallItems = Parameters<NonNullable<MemoWeftRetrieverOptions['onRecall']>>[0];

// ── AD-4/7/8 离线 fake recall core：照 Core 门面 recall 语义（createCore.ts recall）──
//   contentTypes → 后过滤 fixture（allow 名单）；explain → 逐条附 provenance（证据链带授权位）。
//   据 input 真读选项行事 → 端到端证明适配器把 contentTypes/explain 透传进了 core.recall（非驱动自造结果）。
function fakeRecallCore(fixture: RecallFixtureItem[]): RetrieverCoreArg {
  return {
    async recall(input: RecallInput): Promise<RecalledCognition[]> {
      let rows = fixture.slice();
      if (input.contentTypes?.length) {
        const allow = new Set<string>(input.contentTypes);
        rows = rows.filter((f) => f.contentType !== undefined && allow.has(f.contentType));
      }
      const items = rows.map((f) => {
        const item: Record<string, unknown> = {
          id: f.id, content: f.content, confidence: f.confidence,
          credStatus: f.credStatus, score: f.score, contentType: f.contentType,
        };
        // explain 附 provenance——支撑/反证链，每条含授权位；仅经 onRecall 交宿主（绝不进注入块）。
        if (input.explain && f.provenance) item.provenance = f.provenance;
        return item;
      });
      return items as unknown as RecalledCognition[];
    },
  } as unknown as RetrieverCoreArg;
}

const driver: AdapterDriver = {
  name: 'langchain',

  // AD-2：一轮用户原话经宿主闭包 persistUserTurn(core,{text,originId}) → ingestUserMessage(spoken) 落库 → +1 spoken。
  //   原话由宿主在调用点显式持有并传入（LangChain callbacks 观察-only，不从事件回捞；召回注入落在 prompt 拼装侧，
  //   绝不碰这份原话）→ 存进证据的原话永不含召回注入内容。
  async ingestUserTurn(text: string): Promise<UserTurnResult> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));
      await persistUserTurn(core, { text, originId: 'turn-1' });
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      return { delta: after.length - before.length, sourceKind: added[0]?.sourceKind, content: added[0]?.rawContent };
    } finally {
      core.close();
    }
  },

  // AD-1：助手消息流经适配器 → 零落库（by-construction）。
  //   守结构不变量（照 openai AD-1，非空断言，别让 AD-1 形同虚设）：本适配器【无助手摄入路径】——写回调的【唯一】
  //   写入口是 handleToolEnd（工具真实返回结果），persistUserTurn 只收宿主显式传入的【用户原话】。承载助手输出/
  //   调用意图的 LangChain 回调 hook（handleLLMEnd 模型完成输出 / handleLLMNewToken 流式 token / handleToolStart+
  //   handleAgentAction 调用意图 / handleChatModelStart 携注入过的模型输入）在写回调实例上一律【未声明】(=undefined)
  //   → CallbackManager 的 `if (handler.handleX)` 便不投递 → 助手侧内容物理上进不来（铁律 3a）。
  //   若将来误声明了其中任一 hook 并借它落库，此断言即红。handleToolEnd 是【仅】有的写 hook（且只收工具返回结果）。
  async ingestAssistantTurn(_text: string): Promise<number> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({}).length;
      const cb = new MemoWeftWriteCallback(core);
      // 唯一写 hook 是 handleToolEnd（工具返回结果专用）。
      assert.equal(typeof cb.handleToolEnd, 'function', 'write callback must expose handleToolEnd (the only write hook)');
      // 承载助手输出 / 调用意图 / 注入过输入的 hook 一律未声明 → 助手侧内容无入口（铁律 3a·by-construction）。
      //   清单穷举【本版 @langchain/core 1.x 里所有会带助手输出/调用意图的可选 hook】(逐条对 base.d.ts 核过),
      //   含 1.x 新增的 handleChatModelStreamEvent / handleAgentEnd / handleChainEnd / handleText——防日后维护者
      //   给写回调加其一并借它落库、却因清单不全而 AD-1 仍绿的回归漏洞。
      for (const hook of [
        'handleToolStart',            // 工具调用意图/入参 string（铁律 3a）
        'handleAgentAction',          // agent 选择的动作/入参 = 调用意图
        'handleLLMEnd',               // 模型完成输出（助手回话）
        'handleLLMNewToken',          // 流式助手 token
        'handleChatModelStart',       // 携带注入过的模型输入（回捞会污染原话）
        'handleChatModelStreamEvent', // 1.x 流式助手正文（ChatModelStreamEvent 的 TextDelta.text）
        'handleAgentEnd',             // agent 最终答复（AgentFinish.returnValues）
        'handleChainEnd',             // 链输出（对话链常即助手最终消息）
        'handleText',                 // 任意 text（可含助手输出）
      ] as const) {
        assert.equal(
          typeof (cb as unknown as Record<string, unknown>)[hook],
          'undefined',
          `write callback must NOT declare ${hook} — no assistant-output / call-intent path may exist (iron rule 3a, by-construction)`,
        );
      }
      // 无助手摄入路径 → evidence 表零新增（by construction）。
      return core.memory.listEvidence({}).length - before; // 0
    } finally {
      core.close();
    }
  },

  // AD-2 幂等：同一轮稳定 originId，persistUserTurn 触发多次 → ingestUserMessage put 幂等去重 → 仍一条。
  async ingestUserTurnIdempotent(text: string, times: number): Promise<number> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({}).length;
      for (let i = 0; i < times; i++) await persistUserTurn(core, { text, originId: 'stable-turn' });
      return core.memory.listEvidence({}).length - before;
    } finally {
      core.close();
    }
  },

  // AD-3：writeCallback.handleToolEnd(工具返回结果, runId) → 只落工具返回结果为 tool 证据（+1，originId=runId 保幂等）。
  //   callIntentExcluded：写回调【无 handleToolStart】→ LLM 的工具调用意图/入参根本无入口（铁律 3a，代码级
  //   by-construction）；此处既断言该 hook 未声明，又断言落库证据里无一条含调用意图标识串（'get_weather'）。
  async ingestToolResult(resultPayload: string, _callIntent: string): Promise<ToolResultTurnResult> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));
      const cb = new MemoWeftWriteCallback(core);
      // 铁律 3a·结构不变量：调用意图/入参的入口（handleToolStart）根本不存在 → 意图物理上无从落库。
      assert.equal(
        typeof (cb as unknown as Record<string, unknown>).handleToolStart,
        'undefined',
        'AD-3/iron rule 3a: call intent has no entry — handleToolStart must not be declared',
      );
      // 只喂工具【返回结果】；runId 作稳定幂等键（handleToolEnd 的第 2 形参，实测 .d.ts 无 tool_call_id 形参）。
      await cb.handleToolEnd(resultPayload, 'run-tool-1');
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      // 铁律 3a：新落库证据里，无一条含调用意图标识串（'get_weather'）——意图从无入口，落库自然不含。
      const callIntentExcluded = added.every((e) => !e.rawContent.includes('get_weather'));
      return { delta: after.length - before.length, sourceKind: added[0]?.sourceKind, content: added[0]?.rawContent, callIntentExcluded };
    } finally {
      core.close();
    }
  },

  // AD-4：new MemoWeftRetriever(fakeRecallCore(fixture)) → _getRelevantDocuments(query) → Document[] →
  //   formatMemoWeftDocs(docs, lang) 中性注入块（照 openai/A 出 en/zh golden）。
  //   隐私（D-0024）：buildKnowledgeBlock 只用 content/confidence/credStatus，块绝不含 id/contentType/score/provenance。
  //   注：LangChain 的呈现面是 formatMemoWeftDocs（= buildKnowledgeBlock 原样，带前导分隔空行）——如实 golden 其原样。
  async recallSurface(fixture: RecallFixtureItem[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    const retriever = new MemoWeftRetriever(fakeRecallCore(fixture), { lang });
    const docs = await retriever._getRelevantDocuments('How should I phrase this?');
    return {
      kind: 'text-block',
      rendered: formatMemoWeftDocs(docs, lang),
      items: fixture.map((f) => ({ id: f.id, content: f.content, confidence: f.confidence, credStatus: f.credStatus, score: f.score })),
    };
  },

  // AD-7：retriever 带 contentTypes（经构造 opts）→ _getRelevantDocuments → fakeRecallCore 后过滤 →
  //   适配器把选项透传进 core.recall → onRecall 只收到匹配类型项。surface.items 取自 onRecall 捕获对象
  //   （非驱动自造）——contentTypes 端到端透传的直接证据。
  async recallSurfaceFiltered(fixture: RecallFixtureItem[], contentTypes: string[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    let captured: OnRecallItems = [];
    const retriever = new MemoWeftRetriever(fakeRecallCore(fixture), {
      lang,
      contentTypes: contentTypes as ContentType[],
      onRecall: (items) => { captured = items; },
    });
    const docs = await retriever._getRelevantDocuments('How should I phrase this?');
    return {
      kind: 'text-block',
      rendered: formatMemoWeftDocs(docs, lang),
      items: captured.map((c) => ({ id: c.id!, content: c.content, confidence: c.confidence, credStatus: c.credStatus, score: c.score, contentType: c.contentType })),
    };
  },

  // AD-8：retriever 带 explain（经构造 opts）→ fakeRecallCore 逐条附 provenance → 适配器透传 explain →
  //   经 onRecall 交宿主。surface.items 取自 onRecall 捕获对象，携带 provenance（含 allowCloudRead/allowInference 授权位）。
  //   隐私（D-0024·头号铁律）：provenance 只走 onRecall，formatMemoWeftDocs/buildKnowledgeBlock 不用它 →
  //   绝不进注入块（此处照 openai AD-8 断言注入块不含任何 provenance summary）。
  async recallSurfaceExplained(fixture: RecallFixtureItem[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    let captured: OnRecallItems = [];
    const retriever = new MemoWeftRetriever(fakeRecallCore(fixture), {
      lang,
      explain: true,
      onRecall: (items) => { captured = items; },
    });
    const docs = await retriever._getRelevantDocuments('How should I phrase this?');
    const rendered = formatMemoWeftDocs(docs, lang);
    // 隐私硬约束实证（D-0024 头号铁律）：provenance 的证据【原文】(summary)绝不进注入块——只经 onRecall 交宿主自筛。
    //   此处断言注入块不含任何 provenance summary（by-construction：buildKnowledgeBlock 只用 content/confidence/credStatus）。
    //   fixture 必须带 provenance summary 断言才有意义。
    const provSummaries = captured
      .flatMap((c) => c.provenance ?? [])
      .map((p) => (p as { summary?: unknown }).summary)
      .filter((s): s is string => typeof s === 'string' && s !== '');
    assert.ok(provSummaries.length > 0, 'AD-8 fixture must carry provenance summaries for the privacy assertion to be meaningful');
    for (const s of provSummaries) {
      assert.ok(!rendered.includes(s), `injected knowledge block must NOT contain provenance summary (D-0024 privacy hard constraint): "${s}"`);
    }
    return {
      kind: 'text-block',
      rendered,
      items: captured.map((c) => ({ id: c.id!, content: c.content, confidence: c.confidence, credStatus: c.credStatus, score: c.score, contentType: c.contentType, provenance: c.provenance })),
    };
  },

  // AD-6：故障 core → _getRelevantDocuments 降级为【返回 []】（不注入）、经注入 logger 记一条。
  //   读路径只调 recall（写路径 ingest 在 handleToolEnd/persistUserTurn，不在此）→ 本路径只会 emit op:'recall' 事件。
  //   recall 套有界超时（recallTimeoutMs=50）→ throw 立即拒、timeout 由超时器有界赢下，均不真 hang；任何情况都不向链抛。
  //   降级判据：返回的 Document[] 为空 = 降级不注入；logger 记了 ≥1 条结构化事件 = logged。
  async runWithFaultyCore(mode: FaultMode): Promise<FaultOutcome> {
    const faulty = makeFaultyCore(mode) as unknown as RetrieverCoreArg;
    const events: Array<{ op?: string }> = [];
    const retriever = new MemoWeftRetriever(faulty, {
      recallTimeoutMs: 50,
      logger: (e) => { events.push(e); },
    });
    const docs = await retriever._getRelevantDocuments('q');
    // 隔离 recall 降级（照 openai/claude；别让别的 op 掩盖 recall 日志回归）：断言确有一条 recall 面降级事件。
    assert.ok(
      events.some((e) => e.op === 'recall'),
      'faulty-core recall degradation must emit a memory_degraded event with op:recall',
    );
    return { degraded: Array.isArray(docs) && docs.length === 0, logged: events.length > 0 };
  },

  applicability: {
    ad3: {
      status: 'applicable',
      reason: 'MemoWeftWriteCallback 只实现 handleToolEnd（工具真实返回结果 → +1 tool 证据，originId=runId）；绝不声明 handleToolStart（LLM 调用意图/入参 string），CallbackManager 便不投递 → 意图物理上进不来（铁律 3a，代码级 by-construction，AD-3/D-0013）',
    },
    ad5: {
      status: 'na',
      reason: 'AD-5 na(langchain)：召回走 BaseRetriever 返回 Document[]（宿主自拼进 prompt），写走 handleToolEnd 扫工具返回结果 + persistUserTurn 存用户原话，无 LLM 输出→evidenceId 回捞落库路径（同 A/openai/claude）',
    },
    ad6: {
      status: 'applicable',
      reason: '_getRelevantDocuments 里 recall 抛错/超时（recallTimeoutMs 有界）降级为返回 []（不注入）、写走 runIngestWithRetry 失败重试一次仍失败静默吞——都不向链抛，经注入 logger 记一条结构化事件（契约 §16.2；throw/timeout 两模式都真跑）',
    },
    ad7: {
      status: 'applicable',
      reason: 'MemoWeftRetriever 把 opts.contentTypes 透传进 core.recall({contentTypes}) → Core 后过滤 → onRecall 只收到匹配类型项（D-0022/D-0024，端到端透传）',
    },
    ad8: {
      status: 'applicable',
      reason: 'opts.explain 透传进 core.recall({explain}) → Core 附 provenance（含 allowCloudRead/allowInference 授权位）→ 经 onRecall 交宿主；provenance 绝不进 Document.pageContent/metadata，也绝不进 formatMemoWeftDocs 注入块（D-0021/D-0024 隐私加固）',
    },
    ad9: {
      status: 'na',
      reason: 'AD-9 na(langchain)：retriever-读 + callback/闭包-写 型适配器只经 BaseRetriever 召回注入 + handleToolEnd/persistUserTurn 写，不暴露 mute 写口；mute 负反馈是受控记忆管理（memory.mute），经宿主/B 适配器直调 Core，本适配器无此写路径（D-0023，仅 B applicable，同 A/openai/claude）',
    },
  },
};

runAdapterContract(driver, { goldenDir: fileURLToPath(new URL('./golden', import.meta.url)) });
