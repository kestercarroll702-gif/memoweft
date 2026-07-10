/**
 * 类型声明:供 tests/api/api-freeze.test.ts 在 strict typecheck 下 import。
 * 运行时实现见同名 api-snapshot.mjs(纯 JS,用 TypeScript 编译器 API 生成快照)。
 */

/** 生成公共 API 快照文本(按符号名排序,确定性)。 */
export declare function generateSnapshot(): string;

/** 快照文件的绝对路径(tests/api/api-surface.snapshot)。 */
export declare const SNAPSHOT_PATH: string;
