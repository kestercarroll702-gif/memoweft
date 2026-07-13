/**
 * @memoweft/adapter-claude-agent-sdk · 公开面。
 *
 * 把 MemoWeft 的长期记忆接进 Claude Agent SDK（`@anthropic-ai/claude-agent-sdk`）的 hooks：
 *   一个工厂 createMemoWeftAgentHooks(core) 造两个 hook，覆盖读写三条路径——
 *     - UserPromptSubmit：① 召回注入（读，走返回值 additionalContext）+ ② 用户原话摄入（写，spoken）；
 *     - PostToolUse：③ 工具结果摄入（写，tool；铁律 3a 只取 tool_response，绝不碰 tool_input）。
 *   用法：query({ prompt, options: { hooks: { ...createMemoWeftAgentHooks(core).hooks } } })。
 */
export {
  createMemoWeftAgentHooks,
  type MemoWeftAgentHooks,
  type MemoWeftAgentHooksOptions,
} from './agentHooks.ts';

// 召回注入块拼装 + 召回项形状（对外也当独立工具用；隐私口径见文件注释）。
export { buildKnowledgeBlock, type RecalledLike } from './knowledgeBlock.ts';

// 降级语义（§16.2）公开件：供宿主为注入的 logger 标类型。
export {
  DEFAULT_RECALL_TIMEOUT_MS,
  type MemoWeftLogger,
  type MemoWeftDegradedEvent,
} from './degrade.ts';
