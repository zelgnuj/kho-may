import type { Camera, PricePoint } from '../db';

const DAY = 86400000;

export function groupPrices(prices: PricePoint[] | undefined) {
  const map = new Map<string, PricePoint[]>();
  (prices ?? []).forEach((p) => {
    const arr = map.get(p.cameraId) ?? [];
    arr.push(p);
    map.set(p.cameraId, arr);
  });
  map.forEach((arr) => arr.sort((a, b) => a.date - b.date));
  return map;
}

/** % thay đổi giá trong `days` ngày. Cần ít nhất 2 lần cập nhật giá. */
export function changePct(points: PricePoint[] | undefined, days = 90): number | null {
  if (!points || points.length < 2) return null;
  const latest = points[points.length - 1];
  const cutoff = latest.date - days * DAY;
  const before = [...points].reverse().find((p) => p.date <= cutoff) ?? points[0];
  if (before === latest || !before.value) return null;
  return Math.round(((latest.value - before.value) / before.value) * 100);
}

/**
 * Tổng giá trị bộ sưu tập theo thời gian: tại mỗi mốc có cập nhật giá,
 * cộng giá gần nhất (≤ mốc đó) của các máy đang có.
 */
export function valueTimeline(cams: Camera[], byCam: Map<string, PricePoint[]>, sinceTs: number) {
  const owned = cams.filter((c) => c.status === 'owned');
  const dates = new Set<number>();
  owned.forEach((c) => byCam.get(c.id)?.forEach((p) => dates.add(dayKey(p.date))));
  const sorted = [...dates].sort((a, b) => a - b);
  const points = sorted.map((d) => {
    let total = 0;
    owned.forEach((c) => {
      const pts = byCam.get(c.id);
      if (!pts) return;
      let v: number | null = null;
      for (const p of pts) { if (dayKey(p.date) <= d) v = p.value; else break; }
      if (v != null) total += v;
    });
    return { date: d, total };
  });
  const inRange = points.filter((p) => p.date >= sinceTs);
  const prior = points.filter((p) => p.date < sinceTs).pop();
  return prior ? [prior, ...inRange] : inRange;
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isStale(c: Camera, days = 90) {
  return !c.marketUpdatedAt || Date.now() - c.marketUpdatedAt > days * DAY;
}
