/**
 * @memoweft/adapter-ai-sdk · 公开面。
 *
 * 把 MemoWeft 的长期记忆接进 Vercel AI SDK（`ai`）：
 *   - 读：createMemoWeftMiddleware(core) → 塞进 wrapLanguageModel，召回记忆注入进 prompt。
 *   - 写：createPersistOnEnd(core, { userMessage, originId }) → 塞进 generateText 的 onEnd，
 *         对话结束后把【用户原话】沉淀成 spoken 证据（不存助手回话）；
 *         persistToolResults(core, { messages }) → 把 role:'tool' 消息里的【工具返回结果】
 *         沉淀成 tool 证据（只取 result、不取调用意图，AD-3/D-0013）。
 */
export {
  createMemoWeftMiddleware,
  buildKnowledgeBlock,
  getLastUserMessageText,
  addToLastUserMessage,
  type MemoWeftMiddlewareOptions,
} from './recallMiddleware.ts';

export {
  createPersistOnEnd,
  persistUserTurn,
  persistToolResults,
  type PersistOnEndOptions,
  type PersistUserTurnInput,
  type PersistToolResultsInput,
} from './persistOnEnd.ts';

// 降级语义（§16.2）公开件：供宿主为注入的 logger 标类型。
export {
  DEFAULT_RECALL_TIMEOUT_MS,
  type MemoWeftLogger,
  type MemoWeftDegradedEvent,
} from './degrade.ts';
