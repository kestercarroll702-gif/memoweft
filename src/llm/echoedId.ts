/**
 * 把模型【回显的 id】解回「白名单内的真 id」；解不出返回 null。
 *
 * 共享给三条「让模型回显 id、再精确匹配」的路径:consolidate(证据 id + cognition_id)、
 * attribute、trends。根因(D-0036,dogfood 6 次撞 5 次):模型会**模仿提示词示例的 id 形态**、
 * 而非照抄输入里的真 id——示例是 4 字符占位(`ev-1`/`cog-x`)、真实是 36 字符 UUID 时,模型间歇性
 * 把 UUID 截成前 8 位写回,精确匹配全落空 → 产出被静默丢弃、证据/假设/趋势蒸发,且零告警。
 *
 * 三级解析:① 标号映射(prompt 发的短标号 `e1` → 真 id,治本正路) → ② 精确匹配(写对时零变化)
 * → ③ 唯一前缀兜底(剥示例前缀 `ev-`/`cog-` 后,在白名单里找唯一前缀命中)。
 *
 * **护栏一寸不让(3a/3d)**:只可能解到白名单【内】、且必须**唯一命中**——捏造 id(非任何真 id 前缀)、
 * 歧义前缀(命中多条)、过短前缀(< MIN_ID_PREFIX)一律 null。宁可不记,不可记错。
 */

/** 前缀容错的最短长度:短于此一律不猜。示例占位如 `ev-1` 剥前缀后只剩 `1`,绝不能撞上真 id。 */
export const MIN_ID_PREFIX = 8;

export function resolveEchoedId(
  raw: string | undefined,
  whitelist: Set<string>,
  tagMap?: Map<string, string>,
): string | null {
  if (!raw) return null;
  const key = raw.trim();
  const byTag = tagMap?.get(key);
  if (byTag && whitelist.has(byTag)) return byTag; // ① 标号(治本):prompt 发的就是 e1,模型照抄即可
  if (whitelist.has(raw)) return raw; // ② 精确:模型写对完整 id → 行为零变化
  const bare = key.replace(/^(ev-|cog-)/i, ''); // ③ 剥掉照抄示例的 ev-/cog- 前缀，再唯一前缀兜底
  if (bare.length < MIN_ID_PREFIX) return null;
  let hit: string | null = null;
  for (const id of whitelist) {
    if (!id.startsWith(bare)) continue;
    if (hit !== null) return null; // 歧义 → 不猜
    hit = id;
  }
  return hit;
}
