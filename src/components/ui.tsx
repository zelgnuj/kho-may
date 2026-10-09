import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { Camera } from '../db';
import { valueParts } from '../lib/format';
import { clearPriceQueueError, stopPriceQueue, usePriceQueue } from '../lib/autoPrice';
import { useThumb } from '../lib/thumbs';
import { CameraArt } from './CameraArt';
import { QuickActions } from './QuickActions';
import { findModel, useCatalogVersion } from '../lib/catalog';
import { useSampleImage } from '../lib/sampleImage';
import { IconCamera, IconClose, IconHeart, IconSettings, IconTrend } from './Icons';
import { lang, tx } from '../lib/i18n';

export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => 'nav-item' + (isActive ? ' active' : '');
  return (
    <nav className="bottom-nav" aria-label={tx("Điều hướng chính")}>
      <NavLink to="/" end className={cls}><IconCamera size={22} />{tx("Kho máy")}</NavLink>
      <NavLink to="/wishlist" className={cls}><IconHeart size={22} />Wishlist</NavLink>
      <QuickActions />
      <NavLink to="/gia-tri" className={cls}><IconTrend size={22} />{tx("Giá trị")}</NavLink>
      <NavLink to="/cai-dat" className={cls}><IconSettings size={22} />{tx("Cài đặt")}</NavLink>
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

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title: string; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={'sheet' + (tall ? ' tall' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn ghost" aria-label={tx("Đóng")} onClick={onClose}><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ảnh bìa của máy, hoặc hình vẽ theo loại máy nếu chưa có ảnh */
export function CameraThumb({ camera, artWidth, strokeWidth, sampleUrl }: { camera: Camera; artWidth: number; strokeWidth?: number; sampleUrl?: string }) {
  const url = useThumb(camera.coverPhotoId);
  useCatalogVersion();
  const hasPhoto = !!camera.coverPhotoId && url !== null;
  const model = hasPhoto || sampleUrl ? null : findModel(camera.brand, camera.model);
  const auto = useSampleImage(model, !hasPhoto && !sampleUrl);
  if (url) return <img className="thumb-img" src={url} alt="" decoding="async" />;
  if (camera.coverPhotoId && url === undefined) return <span className="thumb-img thumb-wait" aria-hidden="true" />;
  const sample = sampleUrl ?? auto?.url;
  if (sample) return <SampleImg className="thumb-img sample" src={sample} />;
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
            {tx("Đang tra giá")}{' '}{Math.min(q.done + 1, q.total)}/{q.total}{q.current ? ` · ${q.current}` : ''}
          </span>
          <button type="button" className="link-btn" onClick={stopPriceQueue}>{tx("Dừng")}</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: 'var(--down)' }}>{tx("Tra giá:")}{' '}{q.error}</span>
          <button type="button" className="link-btn" onClick={clearPriceQueueError}>{tx("Đóng")}</button>
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
      {!value && <span className="date-empty" aria-hidden="true">{tx("Chưa chọn")}</span>}
      {value && (
        <button type="button" className="date-clear" aria-label={tx("Xóa {0}", label.toLowerCase())} onClick={() => onChange('')}>
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
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={tx("Diễn biến giá")}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
    </svg>
  );
}

/** Ảnh mẫu từ Wikimedia: thử tải kiểu CORS (cache gọn hơn), lỗi thì tải kiểu thường */
export function SampleImg({ src, className, alt = '', lazy = true }: { src: string; className?: string; alt?: string; lazy?: boolean }) {
  const [cors, setCors] = useState(true);
  return (
    <img key={cors ? 'c' : 'n'} className={className} src={src} alt={alt} decoding="async" loading={lazy ? 'lazy' : undefined}
      crossOrigin={cors ? 'anonymous' : undefined} onError={() => { if (cors) setCors(false); }} />
  );
}

/** Số tiền lớn: "84,3 tr" / "$3,290" (đơn vị nhỏ hơn) */
export function Money({ vnd, digits }: { vnd: number; digits?: number }) {
  const p = valueParts(vnd, digits);
  return <>{p.pre}{p.num}{p.unit && <small>{lang === 'vi' ? ' ' : ''}{p.unit}</small>}</>;
}
