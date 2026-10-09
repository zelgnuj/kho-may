// Logic gộp đóng góp — dùng chung cho script build và cho app (đóng góp chờ đồng bộ trên máy).

/** Gộp sâu: object gộp từng khóa; mảng và giá trị đơn thì thay hẳn; null = xóa trường */
export function deepMerge(target, patch) {
  if (patch === null) return undefined;
  if (Array.isArray(patch) || typeof patch !== 'object') return patch;
  const out = { ...(target && typeof target === 'object' && !Array.isArray(target) ? target : {}) };
  for (const [k, v] of Object.entries(patch)) {
    const merged = deepMerge(out[k], v);
    if (merged === undefined) delete out[k];
    else out[k] = merged;
  }
  return out;
}

export function applyContributions(models, contributions) {
  const byId = new Map(models.map((m) => [m.id, m]));
  for (const c of contributions) {
    const meta = { at: c.at, by: c.by, source: c.source, note: c.note };
    if (c.action === 'add') {
      if (byId.has(c.id)) continue;
      byId.set(c.id, { ...c.set, id: c.id, quality: 'community_reviewed', sources: c.source ? [c.source] : [], contributions: [meta] });
      continue;
    }
    const cur = byId.get(c.id);
    if (!cur) continue;
    const next = deepMerge(cur, c.set ?? {});
    next.quality = 'community_reviewed';
    next.contributions = [...(cur.contributions ?? []), meta];
    if (c.source?.url && !(next.sources ?? []).some((s) => s.url === c.source.url)) {
      next.sources = [...(next.sources ?? []), c.source];
    }
    byId.set(c.id, next);
  }
  return [...byId.values()];
}
