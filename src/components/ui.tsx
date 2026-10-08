import { useEffect, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { db, type Camera } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useObjectURL } from '../lib/images';
import { clearPriceQueueError, stopPriceQueue, usePriceQueue } from '../lib/autoPrice';
import { CameraArt } from './CameraArt';
import { findModel } from '../lib/catalog';
import { IconCamera, IconClose, IconData, IconPlus, IconSettings, IconTrend } from './Icons';

export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => 'nav-item' + (isActive ? ' active' : '');
  return (
    <nav className="bottom-nav" aria-label="Điều hướng chính">
      <NavLink to="/" end className={cls}><IconCamera size={22} />Kho máy</NavLink>
      <NavLink to="/gia-tri" className={cls}><IconTrend size={22} />Giá trị</NavLink>
      <NavLink to="/them" className="nav-add" aria-label="Thêm máy"><IconPlus size={26} /></NavLink>
      <NavLink to="/du-lieu" className={cls}><IconData size={22} />Dữ liệu</NavLink>
      <NavLink to="/cai-dat" className={cls}><IconSettings size={22} />Cài đặt</NavLink>
    </nav>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, colorFor }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; colorFor?: (v: T) => string | undefined;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''}
            style={on && colorFor?.(o.value) ? { color: colorFor(o.value) } : undefined}
            onClick={() => onChange(o.value)}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn ghost" aria-label="Đóng" onClick={onClose}><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ảnh bìa của máy, hoặc hình vẽ theo loại máy nếu chưa có ảnh */
export function CameraThumb({ camera, artWidth, strokeWidth, catalogImage }: { camera: Camera; artWidth: number; strokeWidth?: number; catalogImage?: string }) {
  const photo = useLiveQuery(() => (camera.coverPhotoId ? db.photos.get(camera.coverPhotoId) : undefined), [camera.coverPhotoId]);
  const url = useObjectURL(photo?.blob);
  if (url) return <img className="thumb-img" src={url} alt="" />;
  const sample = catalogImage ?? findModel(camera.brand, camera.model)?.image?.url;
  if (sample) return <img className="thumb-img" src={sample} alt="" loading="lazy" style={{ objectFit: 'contain', background: '#d9d6d0' }} />;
  return <CameraArt type={camera.type} width={artWidth} strokeWidth={strokeWidth} />;
}

/** Thanh tiến độ tra giá tự động */
export function PriceProgress({ raised }: { raised: boolean }) {
  const q = usePriceQueue();
  if (!q.running && !q.error) return null;
  return (
    <div className="price-progress" style={{ bottom: raised ? 'calc(var(--safe-bottom) + 86px)' : 'calc(var(--safe-bottom) + 16px)' }} role="status">
      {q.running ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Đang tra giá {Math.min(q.done + 1, q.total)}/{q.total}{q.current ? ` · ${q.current}` : ''}
          </span>
          <button type="button" className="link-btn" onClick={stopPriceQueue}>Dừng</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: 'var(--down)' }}>Tra giá: {q.error}</span>
          <button type="button" className="link-btn" onClick={clearPriceQueueError}>Đóng</button>
        </>
      )}
    </div>
  );
}

/** Ô chọn ngày có nút xóa (iPhone không cho xóa ngày đã chọn trong ô date) */
export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="date-input">
      <input className={'input mono' + (value ? '' : ' empty')} type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      {!value && <span className="date-empty" aria-hidden="true">Chưa chọn</span>}
      {value && (
        <button type="button" className="date-clear" aria-label={`Xóa ${label.toLowerCase()}`} onClick={() => onChange('')}>
          <IconClose size={16} />
        </button>
      )}
    </div>
  );
}

export function Sparkline({ values, color, height = 64 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 320;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 8 - ((v - min) / span) * (height - 16)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label="Diễn biến giá">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
    </svg>
  );
}
