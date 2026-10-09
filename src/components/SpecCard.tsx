import type { Camera } from '../db';
import type { CatalogModel } from '../lib/catalogTypes';
import { QUALITY_LABEL, category, lensElements, lensTitle, specRows } from '../lib/specs';
import { useSampleImage } from '../lib/sampleImage';
import { CameraThumb } from './ui';
import { IconExternal } from './Icons';
import { tx } from '../lib/i18n';

/** Bảng thông số kỹ thuật của một mẫu máy, lấy từ thư viện */
export function SpecCard({ camera, model, onContribute }: { camera: Camera; model: CatalogModel; onContribute: () => void }) {
  const img = useSampleImage(model, !camera.coverPhotoId);
  const year = model.release?.year;
  const sub = [year, category(model)].filter(Boolean).join(' · ');
  const lens = lensTitle(model);
  const eg = lensElements(model);
  const rows = specRows(model);
  const q = QUALITY_LABEL[model.quality ?? ''] ?? QUALITY_LABEL.metadata_only;
  const sources = (model.sources ?? []).filter((s) => s.url);
  const last = model.contributions?.at(-1);

  return (
    <div className="spec-card">
      <div className="spec-head">
        <div className="spec-thumb">
          <CameraThumb camera={camera} artWidth={88} strokeWidth={2} sampleUrl={img?.url} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="spec-name">{model.brand} {model.model}</span>
          {sub && <span className="spec-sub">{sub}</span>}
          {lens && <span className="spec-lens">{lens}</span>}
          {eg && <span className="spec-sub">{eg}</span>}
          <span className={'quality-chip ' + q.tone}>{q.text}</span>
        </div>
      </div>

      {rows.length > 1 ? (
        <dl className="spec-rows">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : (
        <p className="spec-note">{tx("Thư viện mới có tên mẫu này, chưa có thông số. Bạn có thể bổ sung kèm nguồn.")}</p>
      )}
      {model.text_vi?.note && <p className="spec-note">{model.text_vi.note}</p>}
      {q.tone === 'auto' && <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Số liệu trích tự động từ trang của hãng, chưa đối chiếu từng mẫu. Thấy sai thì bấm “Sửa thông số”.")}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
        {sources.length > 0 && <span>{tx("Nguồn:")}{' '}{sources.map((s, i) => <span key={s.url}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.name ?? new URL(s.url!).hostname}</a></span>)}</span>}
        {last && <span>{tx("Cập nhật bởi")}{' '}{last.by || tx("cộng đồng")}{last.at ? ` · ${last.at.split('-').reverse().join('/')}` : ''}{last.note ? ` — ${last.note}` : ''}</span>}
        {img && !camera.coverPhotoId && <span>{tx("Ảnh mẫu:")}{' '}<a href={img.page} target="_blank" rel="noreferrer">{img.artist}</a>{img.license ? `, ${img.license}` : ''} · Wikimedia Commons</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="pill-btn" style={{ height: 40, padding: '0 14px', borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={onContribute}>
          {rows.length > 1 ? tx("Sửa thông số") : tx("+ Bổ sung thông số")}
        </button>
        {sources[0] && (
          <a className="pill-btn" href={sources[0].url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px' }}>
            {tx("Xem thông số gốc")}{' '}<IconExternal size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
