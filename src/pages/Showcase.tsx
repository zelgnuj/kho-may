import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCameras, useSettings, type Camera } from '../db';
import { cameraImage, type CamImage } from '../lib/cameraImage';
import { TYPE_LABEL, lensLabel } from '../lib/format';
import { tx } from '../lib/i18n';
import { CameraArt } from '../components/CameraArt';
import { collectionIndex } from '../components/ShareSheet';
import { IconBack, IconChevron, IconClose, IconPause, IconPlay, IconShuffle } from '../components/Icons';

/* ======================================================================
 * Trình diễn: chiếu bộ sưu tập toàn màn hình, tự chuyển máy.
 * Chạm trái/phải để lùi/tới, chạm giữa để hiện nút. Phím ← → Space Esc.
 * ====================================================================== */

const SPEEDS = [5, 8, 12];

function ls(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function setLs(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* chế độ riêng tư */ }
}

function shuffled<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Ảnh của từng máy, giữ sẵn máy đang chiếu và hai máy bên cạnh. undefined = đang tải, null = không có ảnh */
function useSlideImages(list: Camera[], at: number) {
  const [imgs, setImgs] = useState<Record<string, CamImage | null>>({});
  const held = useRef(new Map<string, CamImage | null | 'loading'>());
  useEffect(() => {
    if (!list.length) return;
    const want = new Set([at, at + 1, at - 1].map((i) => list[(i + list.length) % list.length].id));
    for (const id of want) {
      if (held.current.has(id)) continue;
      held.current.set(id, 'loading');
      const cam = list.find((c) => c.id === id)!;
      cameraImage(cam, 'full').catch(() => null).then((img) => {
        if (!held.current.has(id)) { img?.revoke?.(); return; }
        held.current.set(id, img);
        setImgs((m) => ({ ...m, [id]: img }));
      });
    }
    for (const [id, img] of [...held.current]) {
      if (want.has(id)) continue;
      if (img && img !== 'loading') img.revoke?.();
      held.current.delete(id);
      setImgs((m) => { const n = { ...m }; delete n[id]; return n; });
    }
  }, [list, at]);
  useEffect(() => () => {
    for (const img of held.current.values()) if (img && img !== 'loading') img.revoke?.();
    held.current.clear();
  }, []);
  return imgs;
}

export default function Showcase() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const cams = useCameras();
  const settings = useSettings();
  const owned = useMemo(() => (cams ?? []).filter((c) => c.status === 'owned'), [cams]);
  const withPhoto = owned.filter((c) => c.coverPhotoId).length;

  const [speed, setSpeed] = useState(() => Number(ls('show-speed', '8')) || 8);
  const [shuffle, setShuffle] = useState(() => ls('show-shuffle', '0') === '1');
  const [photosOnly, setPhotosOnly] = useState(() => ls('show-photos', '') === '' ? null : ls('show-photos', '') === '1');
  const onlyPhotos = photosOnly ?? withPhoto >= 3;

  // Danh sách chiếu: theo thứ tự về kho (Nº 01, 02…), hoặc xáo trộn
  const order = useMemo(() => {
    const base = owned.filter((c) => !onlyPhotos || c.coverPhotoId);
    const ranked = base.map((c) => ({ c, n: collectionIndex(owned, c.id) ?? 0 })).sort((a, b) => a.n - b.n);
    return shuffle ? shuffled(ranked) : ranked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned.length, onlyPhotos, shuffle, cams === undefined]);
  const list = useMemo(() => order.map((x) => x.c), [order]);

  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ui, setUi] = useState(true);
  const [cycle, setCycle] = useState(0);
  const startId = params.get('tu');

  useEffect(() => {
    if (!startId || !list.length) return;
    const i = list.findIndex((c) => c.id === startId);
    if (i >= 0) setAt(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  useEffect(() => { if (at >= list.length && list.length) setAt(0); }, [list.length, at]);

  const imgs = useSlideImages(list, at);
  const go = useCallback((d: number) => {
    if (!list.length) return;
    setAt((i) => (i + d + list.length) % list.length);
    setCycle((c) => c + 1);
  }, [list.length]);
  const close = useCallback(() => (window.history.length > 1 ? nav(-1) : nav('/')), [nav]);

  // Nút tự ẩn khi đang chạy
  const hideTimer = useRef<number>();
  const poke = useCallback(() => {
    setUi(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUi(false), 3000);
  }, []);
  useEffect(() => { if (playing) poke(); else { window.clearTimeout(hideTimer.current); setUi(true); } }, [playing, poke]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // Giữ màn hình sáng + toàn màn hình
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const want = async () => {
      try { if (playing && document.visibilityState === 'visible') lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* không hỗ trợ */ }
    };
    want();
    document.addEventListener('visibilitychange', want);
    return () => { document.removeEventListener('visibilitychange', want); lock?.release().catch(() => {}); };
  }, [playing]);
  useEffect(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, close]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX / window.innerWidth;
    if (x < 0.28) go(-1);
    else if (x > 0.72) go(1);
    else if (ui && !playing) setPlaying(true);
    else if (ui) setUi(false);
    else poke();
  };

  if (cams === undefined) return <div className="stage" />;

  if (!list.length) {
    return (
      <div className="stage stage-empty">
        <p>{owned.length ? tx("Chưa có máy nào có ảnh. Thêm ảnh máy của bạn, hoặc tắt “Chỉ máy có ảnh”.") : tx("Kho chưa có máy nào để trình diễn.")}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {owned.length > 0 && <button type="button" className="btn secondary" onClick={() => { setPhotosOnly(false); setLs('show-photos', '0'); }}>{tx("Chiếu cả máy chưa có ảnh")}</button>}
          <button type="button" className="btn" onClick={close}>{tx("Quay lại")}</button>
        </div>
      </div>
    );
  }

  const cur = list[at] ?? list[0];
  const n = order[at]?.n ?? 0;
  const segs = list.length <= 30;

  return (
    <div className={'stage' + (ui ? ' ui' : '') + (playing ? '' : ' paused')} role="region" aria-label={tx("Trình diễn bộ sưu tập")}
      style={{ ['--dur' as string]: `${speed}s` }}
      onClick={onTap}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const s = touch.current; touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
      }}>
      {list.map((c, i) => {
        const near = i === at || i === (at + 1) % list.length || i === (at - 1 + list.length) % list.length;
        if (!near) return null;
        const img = imgs[c.id];
        return (
          <div key={c.id} className={'stage-slide' + (i === at ? ' on' : '')} aria-hidden={i !== at}>
            {img ? (
              <>
                <img className="stage-bg" src={img.src} alt="" />
                <img key={i === at ? `kb${cycle}` : 'idle'} className={'stage-img kb' + ((at + cycle) % 4)} src={img.src} alt={`${c.brand} ${c.model}`} />
              </>
            ) : c.id in imgs ? (
              <div className="stage-art"><CameraArt type={c.type} width={Math.min(420, window.innerWidth * 0.7)} strokeWidth={0.9} /></div>
            ) : null}
          </div>
        );
      })}
      <div className="stage-shade" aria-hidden="true" />

      <div className="stage-progress" aria-hidden="true">
        {segs ? list.map((c, i) => (
          <span key={c.id + (i === at ? cycle : '')} className={i < at ? 'done' : i === at ? 'run' : ''}>
            {i === at && <i onAnimationEnd={() => { if (playing) go(1); }} />}
          </span>
        )) : (
          <span className="run single"><i key={`${at}-${cycle}`} onAnimationEnd={() => { if (playing) go(1); }} /></span>
        )}
      </div>

      <div key={`cap-${cur.id}-${cycle}`} className="stage-caption">
        <span className="stage-no" style={{ color: settings.accent }}>Nº {String(n + 1).padStart(2, '0')} · {cur.brand.toUpperCase()}</span>
        <h1 className="stage-title">{cur.model}</h1>
        <span className="stage-meta">{[cur.year ? String(cur.year) : null, lensLabel(cur.lens), TYPE_LABEL[cur.type]].filter(Boolean).join(' · ')}</span>
        {cur.film && <span className="stage-meta film">{tx("Đang lắp {0}", cur.film.stock)}</span>}
        {imgs[cur.id] && !imgs[cur.id]!.own && imgs[cur.id]!.credit && <span className="stage-credit">{tx("Ảnh mẫu:")} {imgs[cur.id]!.credit} / Wikimedia Commons</span>}
      </div>

      <div className="stage-top" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="stage-btn" aria-label={tx("Đóng trình diễn")} onClick={close}><IconClose size={20} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {withPhoto > 0 && withPhoto < owned.length && (
            <button type="button" className={'stage-chip' + (onlyPhotos ? ' on' : '')} aria-pressed={onlyPhotos} onClick={() => {
              const v = !onlyPhotos; setPhotosOnly(v); setLs('show-photos', v ? '1' : '0'); setAt(0); setCycle((c) => c + 1); poke();
            }}>{tx("Chỉ máy có ảnh")}</button>
          )}
          <span className="stage-count">{at + 1} / {list.length}</span>
        </div>
      </div>

      <div className="stage-controls" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="stage-btn" aria-label={tx("Máy trước")} onClick={() => { go(-1); poke(); }}><IconBack size={20} /></button>
        <button type="button" className="stage-btn big" aria-label={playing ? tx("Tạm dừng") : tx("Chạy tiếp")} onClick={() => setPlaying((p) => !p)}>
          {playing ? <IconPause size={22} /> : <IconPlay size={22} />}</button>
        <button type="button" className="stage-btn" aria-label={tx("Máy tiếp")} onClick={() => { go(1); poke(); }}><IconChevron size={20} /></button>
        <span className="stage-sep" />
        <button type="button" className="stage-chip" aria-label={tx("Thời gian mỗi máy")} onClick={() => {
          const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; setSpeed(s); setLs('show-speed', String(s)); setCycle((c) => c + 1); poke();
        }}>{tx("{0} giây", speed)}</button>
        <button type="button" className={'stage-chip' + (shuffle ? ' on' : '')} aria-pressed={shuffle} aria-label={tx("Xáo trộn")} onClick={() => {
          setShuffle((v) => { setLs('show-shuffle', v ? '0' : '1'); return !v; }); setAt(0); setCycle((c) => c + 1); poke();
        }}><IconShuffle size={16} /></button>
      </div>
    </div>
  );
}
