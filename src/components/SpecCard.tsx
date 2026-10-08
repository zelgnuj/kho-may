import type { Camera } from '../db';
import type { CatalogEntry } from '../data/catalog';
import { CameraThumb } from './ui';
import { IconExternal } from './Icons';

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));

function lensLine(e: CatalogEntry) {
  const l = e.lens;
  if (!l) return null;
  const focal = l.focalMax ? `${num(l.focal)}–${num(l.focalMax)}mm` : `${num(l.focal)}mm`;
  const ap = l.apertureMax ? `f/${l.aperture}–${l.apertureMax}` : `f/${l.aperture}`;
  return [focal, ap, l.name].filter(Boolean).join(' ').replace(`${ap} ${l.name}`, `${ap} ${l.name}`);
}

function released(r?: string) {
  if (!r) return null;
  const [y, m] = r.split('-');
  return m ? `${m}/${y}` : y;
}

/** Bảng thông số kỹ thuật của một mẫu máy, lấy từ thư viện mẫu máy */
export function SpecCard({ camera, entry }: { camera: Camera; entry: CatalogEntry }) {
  const year = entry.released?.slice(0, 4);
  const sub = [year, entry.category].filter(Boolean).join(' · ');
  const lens = lensLine(entry);
  const eg = entry.lens?.elements
    ? `${entry.lens.elements} thấu kính${entry.lens.groups ? ` / ${entry.lens.groups} nhóm` : ''}`
    : null;

  const rows: [string, string | null | undefined][] = [
    ['Ngày ra mắt', released(entry.released)],
    ['Film', entry.film],
    ['Khung hình', entry.frame],
    ['Cảm biến', entry.sensor],
    ['Ngàm', entry.mount],
    ['Tiêu cự tương đương', entry.lens?.equiv],
    ['Lấy nét', entry.focus],
    ['Phơi sáng', entry.exposure],
    ['Màn trập', entry.shutter],
    ['ISO', entry.iso],
    ['Pin', entry.battery],
    ['Kích thước', entry.dimensions],
    ['Khối lượng', entry.weight]
  ];

  return (
    <div className="spec-card">
      <div className="spec-head">
        <div className="spec-thumb">
          <CameraThumb camera={camera} artWidth={88} strokeWidth={2} catalogImage={entry.image?.url} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="spec-name">{entry.brand} {entry.model}</span>
          {sub && <span className="spec-sub">{sub}</span>}
          {lens && <span className="spec-lens">{lens}</span>}
          {eg && <span className="spec-sub">{eg}</span>}
        </div>
      </div>
      <dl className="spec-rows">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {entry.note && <p className="spec-note">{entry.note}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11 }}>
          Nguồn: {entry.source.title}
          {entry.image && <> · Ảnh: <a href={entry.image.page} target="_blank" rel="noreferrer">{entry.image.credit}</a>, {entry.image.license}</>}
        </span>
        <a className="pill-btn" href={entry.source.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px' }}>
          Xem thông số gốc <IconExternal size={14} />
        </a>
      </div>
    </div>
  );
}
