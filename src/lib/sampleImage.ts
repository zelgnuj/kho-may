import { useEffect, useState } from 'react';
import { db } from '../db';
import type { CatalogModel } from './catalogTypes';

export interface SampleImage { url: string; page: string; artist: string; license: string; licenseUrl?: string }

const memory = new Map<string, SampleImage | null>();
const inflight = new Map<string, Promise<SampleImage | null>>();
const DAY = 86400000;

async function fetchImage(m: CatalogModel): Promise<SampleImage | null> {
  const key = `img:${m.id}:${m.commons_file ?? ''}`;
  if (memory.has(key)) return memory.get(key)!;
  const cached = await db.settings.get(key);
  const v = cached?.value as { img: SampleImage | null; at: number } | undefined;
  if (v && (v.img || Date.now() - v.at < 30 * DAY)) { memory.set(key, v.img); return v.img; }
  if (!navigator.onLine) return null;
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      try {
        const qs = new URLSearchParams();
        if (m.commons_file) qs.set('file', m.commons_file);
        else if (m.wikidata) qs.set('qid', m.wikidata);
        else qs.set('q', `${m.brand} ${m.model}`);
        const r = await fetch(`/api/image?${qs}`);
        if (!r.ok) return null;
        const d = await r.json();
        const img = d.found ? { url: d.url, page: d.page, artist: d.artist, license: d.license, licenseUrl: d.licenseUrl } : null;
        memory.set(key, img);
        await db.settings.put({ key, value: { img, at: Date.now() } });
        return img;
      } catch { return null; } finally { inflight.delete(key); }
    })());
  }
  return inflight.get(key)!;
}

/** Ảnh mẫu (Wikimedia Commons) cho một mẫu máy, kèm ghi công. null nếu không có. */
export function useSampleImage(m: CatalogModel | null | undefined, enabled = true) {
  const [img, setImg] = useState<SampleImage | null>(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (m && enabled) fetchImage(m).then((x) => { if (alive) setImg(x); });
    return () => { alive = false; };
  }, [m?.id, m?.wikidata, m?.commons_file, enabled]);
  return img;
}
