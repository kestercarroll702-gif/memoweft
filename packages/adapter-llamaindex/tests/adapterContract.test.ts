/**
 * adapter-llamaindex · adapter-kit 契约接入（AD-1…AD-9）。
 *
 * 一份 kit（../../../tests/adapter-kit）喂多个适配器；这里是 LlamaIndex（`@llamaindex/core` 记忆块 +
 *   `@llamaindex/workflow` agent 流）侧的薄驱动：
 *   - 测试【直接 new MemoWeftMemoryBlock 调其 get() / 喂构造事件流给 persistFromAgentStream 并 drain】——
 *     【不跑真实 agent】、不触网、不打模型。召回走 `block.get([userMsg])`（BaseMemoryBlock 的召回主体，
 *     Memory 每轮取记忆上下文的内核），写走透传式 `persistFromAgentStream(core, 构造流, extras)`。
 *   - AD 断言由 runAdapterContract 产出（本文件是 *.test.ts，node --test 直接跑）。
 *
 * 与 A（adapter-ai-sdk）/ langchain / openai-agents / claude-agent-sdk 的对照：都不启动宿主运行时、都靠
 *   「直接调处理函数 + 喂构造事件」在离线核上断言（同一范式）。本包是 memory-block-读 + stream-tap-写 型。
 *   AD-1 守结构不变量 / AD-6 隔离 recall 降级 / AD-8 补隐私断言（provenance 不进注入块）的写法照抄 langchain。
 *
 * 铁律 3a（代码级 by-construction·物理隔离）：③ 写路径 persistFromAgentStream【只】用
 *   `agentToolCallResultEvent.include(ev)` 判别【结果事件】，取 `ev.data.toolOutput.result`（工具真实返回结果）。
 *   `agentToolCallEvent`（LLM 的【调用意图 / 入参 toolKwargs】）、`agentStreamEvent`/`agentOutputEvent`
 *   （助手流式/最终输出）都是【另外的事件类型】——结果判别器【物理上】不认它们（实测 `.include()` 返回 false，
 *   见 AD-1/AD-3 结构不变量断言）→ 调用意图/助手输出进不了写路径，只被原样 re-yield。
 *   实测 `@llamaindex/workflow@1.1.25` .d.ts：`AgentToolCallResult.toolOutput: ToolResult{ id,result,isError }`；
 *   `agentToolCallEvent`/`agentStreamEvent`/`agentOutputEvent` 承载调用意图/助手输出——AD-1 断言结果判别器全不认它们。
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
  agentToolCallEvent,
  agentToolCallResultEvent,
  agentStreamEvent,
  agentOutputEvent,
} from '@llamaindex/workflow';
import type { WorkflowEventData } from '@llamaindex/workflow';
import type { MemoryMessage } from 'llamaindex';
import {
  MemoWeftMemoryBlock,
  persistFromAgentStream,
  type MemoWeftMemoryBlockOptions,
  type PersistFromAgentStreamExtras,
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

// ── 离线 core（同 A / langchain / openai / claude adapterContract.test.ts 手法：stub LLM + 空召回器，:memory: 库）──
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

// MemoWeftMemoryBlock 期望的 core 面（MemoryBlockCore = Pick<MemoWeftCore,'recall'> 未导出，从构造签名取），fake core 据此 cast。
type MemoryBlockCoreArg = ConstructorParameters<typeof MemoWeftMemoryBlock>[0];
// persistFromAgentStream 期望的 core 面（StreamTapCore 未导出，从函数签名取），fake / faulty core 据此 cast。
type StreamTapCoreArg = Parameters<typeof persistFromAgentStream>[0];
// onRecall 回调收到的召回项类型（透传的 v2 面：id/contentType/score/provenance）。从公开选项类型提取，
//   AD-7/8 据此把「透传进 onRecall 的召回对象」当断言源（非驱动自造结果）。
type OnRecallItems = Parameters<NonNullable<MemoWeftMemoryBlockOptions['onRecall']>>[0];

// ── AD-4/7/8 离线 fake recall core：照 Core 门面 recall 语义（createCore.ts recall）──
//   contentTypes → 后过滤 fixture（allow 名单）；explain → 逐条附 provenance（证据链带授权位）。
//   据 input 真读选项行事 → 端到端证明适配器把 contentTypes/explain 透传进了 core.recall（非驱动自造结果）。
function fakeRecallCore(fixture: RecallFixtureItem[]): MemoryBlockCoreArg {
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
  } as unknown as MemoryBlockCoreArg;
}

// ── 构造事件流工具（喂给 persistFromAgentStream；不跑真实 agent）──
/** 把若干构造好的 WorkflowEventData 串成一个 async 事件流（模拟 agent.runStream 的产物）。 */
async function* streamOf(...events: WorkflowEventData<unknown>[]): AsyncGenerator<WorkflowEventData<unknown>> {
  for (const e of events) yield e;
}
/** 空事件流（AD-2：只摄用户原话、无任何工具/助手事件）。 */
async function* emptyStream(): AsyncGenerator<WorkflowEventData<unknown>> {}
/** drain 透传式 generator：原样消费全部 re-yield 事件（触发内部摄入 + 末尾 settle）。 */
async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
  for await (const _ of gen) { /* 丢弃 re-yield 的事件——只为触发摄入 */ }
}

/** 构造一个【工具返回结果】事件（agentToolCallResultEvent）——③ 写路径【唯一】认的类型。 */
function makeToolResultEvent(result: string, toolId: string): WorkflowEventData<unknown> {
  return agentToolCallResultEvent.with({
    toolName: 'get_weather',
    toolKwargs: { city: 'Xiamen' },
    toolId,
    toolOutput: { id: toolId, result, isError: false },
    returnDirect: false,
    raw: {}, // AgentToolCallResult.raw: JSONValue（不含 null）——用空对象占位（本适配器不读 raw）
  }) as WorkflowEventData<unknown>;
}
/** 构造一个【工具调用意图】事件（agentToolCallEvent）——LLM 的入参/toolName，绝不该落库（铁律 3a）。 */
function makeToolCallIntentEvent(toolId: string): WorkflowEventData<unknown> {
  return agentToolCallEvent.with({
    agentName: 'agent',
    toolName: 'get_weather', // 只出现在【调用侧】的标识串
    toolKwargs: { city: 'Xiamen' },
    toolId,
  }) as WorkflowEventData<unknown>;
}
/** 构造一个【助手流式输出】事件（agentStreamEvent）——助手回话正文，绝不该落库。 */
function makeAssistantStreamEvent(text: string): WorkflowEventData<unknown> {
  return agentStreamEvent.with({ delta: text, response: text, currentAgentName: 'agent', raw: null }) as WorkflowEventData<unknown>;
}
/** 构造一个【助手最终输出】事件（agentOutputEvent）——助手最终答复，绝不该落库。 */
function makeAssistantOutputEvent(text: string): WorkflowEventData<unknown> {
  return agentOutputEvent.with({
    response: { role: 'assistant', content: text },
    toolCalls: [],
    raw: null,
    currentAgentName: 'agent',
  }) as WorkflowEventData<unknown>;
}

/** 把召回注入块从 memoryBlock.get() 里取出：喂一条 user 消息（query）→ 取 Memory 消息的 content 文本。 */
async function renderInjection(block: MemoWeftMemoryBlock, query = 'How should I phrase this?'): Promise<string> {
  const userMsg = { id: 'u1', role: 'user', content: query } as MemoryMessage;
  const msgs = await block.get([userMsg]);
  if (msgs.length === 0) return '';
  const c = msgs[0]!.content;
  return typeof c === 'string' ? c : JSON.stringify(c);
}

const driver: AdapterDriver = {
  name: 'llamaindex',

  // AD-2：一轮用户原话经 persistFromAgentStream(core, 空事件流, {userMessage, originId}) drain → ingestUserMessage(spoken) → +1 spoken。
  //   原话由宿主在【注入前】显式持有并经 extras.userMessage 传入（绝不从流事件回捞；召回注入落在 memoryBlock 的
  //   'memory' 消息侧，绝不碰这份原话）→ 存进证据的原话永不含召回注入内容。
  async ingestUserTurn(text: string): Promise<UserTurnResult> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));
      await drain(persistFromAgentStream(core as unknown as StreamTapCoreArg, emptyStream(), { userMessage: text, originId: 'turn-1' }));
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      return { delta: after.length - before.length, sourceKind: added[0]?.sourceKind, content: added[0]?.rawContent };
    } finally {
      core.close();
    }
  },

  // AD-1：助手侧事件（调用意图 + 流式/最终输出）流经适配器 → 零落库（by-construction）。
  //   守结构不变量（照 langchain AD-1，非空断言，别让 AD-1 形同虚设）：写路径 persistFromAgentStream 的【唯一】
  //   摄入判别器是 `agentToolCallResultEvent.include(ev)`（工具真实返回结果）。承载【调用意图】(agentToolCallEvent)
  //   与【助手输出】(agentStreamEvent 流式正文 / agentOutputEvent 最终答复) 的事件类型，被该结果判别器【物理上】
  //   不认（实测 `.include()` 皆返回 false）→ 助手侧内容根本进不了写路径（铁律 3a·代码级 by-construction）。
  //   若将来误把某助手/意图事件当结果摄入（或判别器放宽到认它们），下列断言即红。
  async ingestAssistantTurn(text: string): Promise<number> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({}).length;

      // 穷举【承载调用意图 / 助手输出的全部事件类型】，逐条断言结果判别器不认它们（结构不变量·by-construction）。
      const callIntent = makeToolCallIntentEvent('t-assist-1'); // LLM 工具调用意图 / 入参（铁律 3a）
      const assistantStream = makeAssistantStreamEvent(text);    // 助手流式正文（delta/response）
      const assistantOutput = makeAssistantOutputEvent(text);    // 助手最终答复（AgentOutput.response）
      for (const [label, ev] of [
        ['agentToolCallEvent(call-intent)', callIntent],
        ['agentStreamEvent(assistant-delta)', assistantStream],
        ['agentOutputEvent(assistant-final)', assistantOutput],
      ] as const) {
        assert.equal(
          agentToolCallResultEvent.include(ev),
          false,
          `result discriminator must NOT match ${label} — no assistant-output / call-intent path may exist (iron rule 3a, by-construction)`,
        );
      }

      // 行为面：把这些助手侧事件喂进透传流、无 userMessage（空串）→ drain → evidence 零新增（by construction）。
      await drain(
        persistFromAgentStream(core as unknown as StreamTapCoreArg, streamOf(callIntent, assistantStream, assistantOutput), {
          userMessage: '', // 无用户原话可摄
        }),
      );
      return core.memory.listEvidence({}).length - before; // 0
    } finally {
      core.close();
    }
  },

  // AD-2 幂等：同一轮稳定 originId，persistFromAgentStream 触发多次 → ingestUserMessage put 幂等去重 → 仍一条。
  async ingestUserTurnIdempotent(text: string, times: number): Promise<number> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({}).length;
      for (let i = 0; i < times; i++) {
        await drain(persistFromAgentStream(core as unknown as StreamTapCoreArg, emptyStream(), { userMessage: text, originId: 'stable-turn' }));
      }
      return core.memory.listEvidence({}).length - before;
    } finally {
      core.close();
    }
  },

  // AD-3：事件流 = [调用意图, 工具返回结果] 喂 persistFromAgentStream → 只落工具返回结果为 tool 证据
  //   （+1，originId=toolId 保幂等）。callIntentExcluded：结果判别器【物理上】不认 agentToolCallEvent（铁律 3a），
  //   故 LLM 的工具调用意图/入参根本无入口；此处既断言该判别器对意图事件返回 false（对结果事件返回 true 作正对照），
  //   又断言落库证据里无一条含调用意图标识串（'get_weather'）。
  async ingestToolResult(resultPayload: string, _callIntent: string): Promise<ToolResultTurnResult> {
    const core = makeCore();
    try {
      const before = core.memory.listEvidence({});
      const beforeIds = new Set(before.map((e) => e.id));

      const toolId = 'call-weather-1';
      const callEv = makeToolCallIntentEvent(toolId);   // 调用意图（入参 city=Xiamen / toolName=get_weather）
      const resultEv = makeToolResultEvent(resultPayload, toolId); // 工具真实返回结果（应落库）
      // 铁律 3a·结构不变量：结果判别器不认调用意图（false）、只认真结果（true）——意图物理上无从落库，正对照非空。
      assert.equal(
        agentToolCallResultEvent.include(callEv),
        false,
        'AD-3/iron rule 3a: call-intent event must NOT be recognized by the tool-result discriminator',
      );
      assert.equal(
        agentToolCallResultEvent.include(resultEv),
        true,
        'AD-3 positive control: the tool-result event MUST be recognized (assertion is not vacuous)',
      );

      // 一轮里【先调用意图、后返回结果】——只结果落库。无 userMessage（空串）。
      await drain(
        persistFromAgentStream(core as unknown as StreamTapCoreArg, streamOf(callEv, resultEv), { userMessage: '' }),
      );
      const after = core.memory.listEvidence({});
      const added = after.filter((e) => !beforeIds.has(e.id));
      // 铁律 3a：新落库证据里，无一条含调用意图标识串（'get_weather'）——意图从无入口，落库自然不含。
      const callIntentExcluded = added.every((e) => !e.rawContent.includes('get_weather'));
      return { delta: after.length - before.length, sourceKind: added[0]?.sourceKind, content: added[0]?.rawContent, callIntentExcluded };
    } finally {
      core.close();
    }
  },

  // AD-4：new MemoWeftMemoryBlock(fakeRecallCore(fixture)) → get([userMsg]) → 一条 role:'memory' 消息 →
  //   取其 content 为中性注入块（照 langchain/A 出 en/zh golden）。
  //   隐私（D-0024）：buildKnowledgeBlock 只用 content/confidence/credStatus，块绝不含 id/contentType/score/provenance。
  //   注：memoryBlock.get() 把块首前导空行（buildKnowledgeBlock 的 \n\n）去掉——故 llamaindex golden 无前导空行（与
  //     langchain 的 formatMemoWeftDocs 原样带前导空行不同，各出各的 golden）。此处如实 golden 其原样。
  async recallSurface(fixture: RecallFixtureItem[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    const block = new MemoWeftMemoryBlock(fakeRecallCore(fixture), { lang });
    const rendered = await renderInjection(block);
    // 隐私硬约束旁证（D-0024）：fixture c3 静态携带 provenance summary——注入块绝不含其原文（buildKnowledgeBlock 不用 provenance）。
    const provSummaries = fixture
      .flatMap((f) => f.provenance ?? [])
      .map((p) => p.summary)
      .filter((s): s is string => typeof s === 'string' && s !== '');
    for (const s of provSummaries) {
      assert.ok(!rendered.includes(s), `AD-4: injected knowledge block must NOT contain provenance summary (D-0024): "${s}"`);
    }
    return {
      kind: 'text-block',
      rendered,
      items: fixture.map((f) => ({ id: f.id, content: f.content, confidence: f.confidence, credStatus: f.credStatus, score: f.score })),
    };
  },

  // AD-7：memoryBlock 带 contentTypes（经构造 opts）→ get() → fakeRecallCore 后过滤 → 适配器把选项透传进
  //   core.recall → onRecall 只收到匹配类型项。surface.items 取自 onRecall 捕获对象（非驱动自造）——
  //   contentTypes 端到端透传的直接证据。
  async recallSurfaceFiltered(fixture: RecallFixtureItem[], contentTypes: string[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    let captured: OnRecallItems = [];
    const block = new MemoWeftMemoryBlock(fakeRecallCore(fixture), {
      lang,
      contentTypes: contentTypes as ContentType[],
      onRecall: (items) => { captured = items; },
    });
    const rendered = await renderInjection(block);
    return {
      kind: 'text-block',
      rendered,
      items: captured.map((c) => ({ id: c.id!, content: c.content, confidence: c.confidence, credStatus: c.credStatus, score: c.score, contentType: c.contentType })),
    };
  },

  // AD-8：memoryBlock 带 explain（经构造 opts）→ fakeRecallCore 逐条附 provenance → 适配器透传 explain →
  //   经 onRecall 交宿主。surface.items 取自 onRecall 捕获对象，携带 provenance（含 allowCloudRead/allowInference 授权位）。
  //   隐私（D-0024·头号铁律）：provenance 只走 onRecall，buildKnowledgeBlock/memoryBlock.get 不用它 →
  //   绝不进注入块（此处照 langchain AD-8 断言注入块不含任何 provenance summary）。
  async recallSurfaceExplained(fixture: RecallFixtureItem[], lang: 'en' | 'zh' = 'en'): Promise<RecallSurface> {
    let captured: OnRecallItems = [];
    const block = new MemoWeftMemoryBlock(fakeRecallCore(fixture), {
      lang,
      explain: true,
      onRecall: (items) => { captured = items; },
    });
    const rendered = await renderInjection(block);
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

  // AD-6：故障 core → block.get() 降级为【返回 []】（不注入）、经注入 logger 记一条。
  //   读路径只调 recall（写路径 ingest 在 persistFromAgentStream，不在此）→ 本路径只会 emit op:'recall' 事件。
  //   recall 套有界超时（recallTimeoutMs=50）→ throw 立即拒、timeout 由超时器有界赢下，均不真 hang；任何情况都不向 Memory 抛。
  //   降级判据：返回的 MemoryMessage[] 为空 = 降级不注入；logger 记了 ≥1 条结构化事件 = logged。
  async runWithFaultyCore(mode: FaultMode): Promise<FaultOutcome> {
    const faulty = makeFaultyCore(mode) as unknown as MemoryBlockCoreArg;
    const events: Array<{ op?: string }> = [];
    const block = new MemoWeftMemoryBlock(faulty, {
      recallTimeoutMs: 50,
      logger: (e) => { events.push(e); },
    });
    const userMsg = { id: 'u1', role: 'user', content: 'q' } as MemoryMessage;
    const msgs = await block.get([userMsg]);
    // 隔离 recall 降级（照 langchain/openai/claude；别让别的 op 掩盖 recall 日志回归）：断言确有一条 recall 面降级事件。
    assert.ok(
      events.some((e) => e.op === 'recall'),
      'faulty-core recall degradation must emit a memory_degraded event with op:recall',
    );
    return { degraded: Array.isArray(msgs) && msgs.length === 0, logged: events.length > 0 };
  },

  applicability: {
    ad3: {
      status: 'applicable',
      reason: 'persistFromAgentStream 只用 agentToolCallResultEvent.include(ev) 判别【工具返回结果】(取 toolOutput.result → +1 tool 证据，originId=toolId)；agentToolCallEvent（LLM 调用意图/入参 toolKwargs）是另一事件类型，结果判别器物理上不认（.include 返回 false）→ 意图进不来（铁律 3a，代码级 by-construction，AD-3/D-0013）',
    },
    ad5: {
      status: 'na',
      reason: 'AD-5 na(llamaindex)：召回走 BaseMemoryBlock.get() 注入一条 role:memory 消息（Memory 每轮取记忆上下文），写走 persistFromAgentStream 扫 agentToolCallResultEvent + extras.userMessage 存用户原话，无 LLM 输出→evidenceId 回捞落库路径（同 A/langchain/openai/claude）',
    },
    ad6: {
      status: 'applicable',
      reason: 'block.get() 里 recall 抛错/超时（recallTimeoutMs 有界）降级为返回 []（不注入）、写走 runIngestWithRetry 失败重试一次仍失败静默吞——都不向 Memory/stream 抛，经注入 logger 记一条结构化事件（契约 §16.2；throw/timeout 两模式都真跑）',
    },
    ad7: {
      status: 'applicable',
      reason: 'MemoWeftMemoryBlock 把 opts.contentTypes 透传进 core.recall({contentTypes}) → Core 后过滤 → onRecall 只收到匹配类型项（D-0022/D-0024，端到端透传）',
    },
    ad8: {
      status: 'applicable',
      reason: 'opts.explain 透传进 core.recall({explain}) → Core 附 provenance（含 allowCloudRead/allowInference 授权位）→ 经 onRecall 交宿主；provenance 绝不进 memoryBlock.get() 注入的 memory 消息 content，也绝不进 buildKnowledgeBlock 注入块（D-0021/D-0024 隐私加固）',
    },
    ad9: {
      status: 'na',
      reason: 'AD-9 na(llamaindex)：memory-block-读 + stream-tap-写 型适配器只经 BaseMemoryBlock.get() 召回注入 + persistFromAgentStream/extras.userMessage 写，不暴露 mute 写口；mute 负反馈是受控记忆管理（memory.mute），经宿主/B 适配器直调 Core，本适配器无此写路径（D-0023，仅 B applicable，同 A/langchain/openai/claude）',
    },
  },
};

runAdapterContract(driver, { goldenDir: fileURLToPath(new URL('./golden', import.meta.url)) });
