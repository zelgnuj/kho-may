import { useMemo, useState } from 'react';
import { canonicalBrand, findModel, searchBrands, searchModels, squash, useCatalogVersion } from '../lib/catalog';
import type { CatalogModel } from '../lib/catalogTypes';
import { category, lensTitle } from '../lib/specs';
import { Segmented, Sheet } from './ui';
import { tx } from '../lib/i18n';

type Media = 'all' | 'film' | 'digital';

/** Hai ô Hãng / Mẫu: bấm vào mở danh sách chọn từ thư viện, có ô tìm chịu gõ sai; vẫn cho dùng tên tự nhập nếu thư viện chưa có */
export function ModelPicker({ brand, model, ownBrands, onChange }: {
  brand: string;
  model: string;
  ownBrands: string[];
  onChange: (brand: string, model: string) => void;
}) {
  useCatalogVersion();
  const [open, setOpen] = useState<'brand' | 'model' | null>(null);
  const [q, setQ] = useState('');
  const [media, setMedia] = useState<Media>('all');

  const show = (which: 'brand' | 'model') => { setQ(''); setOpen(which); };
  const close = () => setOpen(null);

  const pickBrand = (b: string) => {
    const keep = model && findModel(b, model)?.brand === b;
    onChange(b, keep ? model : '');
    if (keep) close(); else show('model');
  };
  const pickModel = (m: CatalogModel) => { onChange(m.brand, m.model); close(); };
  const useTypedModel = (name: string) => { onChange(brand, name.trim()); close(); };

  const brandHits = useMemo(() => (open === 'brand' ? searchBrands(q) : []), [open, q]);
  const own = useMemo(() => [...new Set(ownBrands.map((b) => canonicalBrand(b) ?? b))].sort(), [ownBrands]);
  const modelHits = useMemo(() => (open === 'model' ? searchModels(brand, q, media) : []), [open, brand, q, media]);
  const exactBrand = brandHits.some((b) => squash(b.brand) === squash(q));
  const exactModel = modelHits.some((m) => squash(m.model) === squash(q) || squash(`${m.brand} ${m.model}`) === squash(q));
  const libBrand = canonicalBrand(brand) === brand;

  return (
    <>
      <div className="form-grid">
        <div className="field">{tx("Hãng")}<button type="button" className={'input picker' + (brand ? '' : ' is-empty')} onClick={() => show('brand')} aria-haspopup="dialog">
            <span>{brand || tx("Chọn hãng")}</span><Chevron />
          </button>
        </div>
        <div className="field">{tx("Mẫu")}<button type="button" className={'input picker' + (model ? '' : ' is-empty')} onClick={() => show('model')} aria-haspopup="dialog">
            <span>{model || tx("Chọn mẫu")}</span><Chevron />
          </button>
        </div>
      </div>

      <Sheet open={open === 'brand'} onClose={close} title={tx("Chọn hãng")} tall>
        <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Tìm hãng, ví dụ Olympus")} aria-label={tx("Tìm hãng")} autoCapitalize="words" />
        {!q.trim() && own.length > 0 && (
          <>
            <div className="h-mono pick-head">{tx("TRONG KHO CỦA BẠN")}</div>
            <div className="rows pick-list">
              {own.map((b) => <BrandRow key={b} brand={b} active={b === brand} onPick={pickBrand} />)}
            </div>
            <div className="h-mono pick-head">{tx("TẤT CẢ HÃNG")}</div>
          </>
        )}
        {brandHits.length > 0 && (
          <div className="rows pick-list" role="listbox" aria-label={tx("Danh sách hãng")}>
            {brandHits.map((b) => <BrandRow key={b.brand} brand={b.brand} count={b.count} active={b.brand === brand} onPick={pickBrand} />)}
          </div>
        )}
        {q.trim() && !exactBrand && (
          <button type="button" className="pick-free" onClick={() => pickBrand(q.trim().replace(/\s+/g, ' '))}>
            {brandHits[0] ? <>{tx("Dùng tên “")}{q.trim()}{tx("” · chưa có trong thư viện")}</> : <>{tx("Thư viện chưa có hãng này — dùng tên “")}{q.trim()}”</>}
          </button>
        )}
      </Sheet>

      <Sheet open={open === 'model'} onClose={close} title={brand ? tx("Chọn mẫu · {0}", brand) : tx("Chọn mẫu")} tall>
        <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={brand ? tx("Tìm trong {0}", brand) : tx("Tìm tên máy, ví dụ Olympus XA")} aria-label={tx("Tìm mẫu")} />
        <Segmented<Media> value={media} onChange={setMedia} label={tx("Loại")} options={[{ value: 'all', label: tx("Tất cả") }, { value: 'film', label: 'Film' }, { value: 'digital', label: tx("Máy số") }]} />
        {brand && !libBrand && !q.trim() && <p className="muted" style={{ fontSize: 13 }}>{tx("Thư viện chưa có máy của hãng “")}{brand}{tx("”. Gõ tên mẫu để dùng tên tự nhập.")}</p>}
        {modelHits.length > 0 ? (
          <div className="rows pick-list" role="listbox" aria-label={tx("Danh sách mẫu")}>
            {modelHits.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={m.brand === brand && m.model === model} className="pick-row" onClick={() => pickModel(m)}>
                <span className="pick-name">
                  <span>{brand ? m.model : `${m.brand} ${m.model}`}</span>
                  <span className="pick-meta">{[m.release?.year, category(m), lensTitle(m)].filter(Boolean).join(' · ')}</span>
                </span>
                {m.quality && m.quality !== 'metadata_only' && <span className="pick-spec" title={tx("Có bảng thông số")}>{tx("Thông số")}</span>}
              </button>
            ))}
          </div>
        ) : (q.trim() || libBrand) && <p className="muted" style={{ fontSize: 13 }}>{tx("Không tìm thấy mẫu nào khớp.")}</p>}
        {q.trim() && !exactModel && (
          <button type="button" className="pick-free" onClick={() => useTypedModel(q)}>
            {tx("Dùng tên “")}{q.trim()}{tx("” · chưa có trong thư viện, bổ sung sau cũng được")}</button>
        )}
        {modelHits.length >= 120 && <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{tx("Gõ thêm để lọc — đang hiện 120 mẫu đầu")}</p>}
      </Sheet>
    </>
  );
}

function BrandRow({ brand, count, active, onPick }: { brand: string; count?: number; active: boolean; onPick: (b: string) => void }) {
  return (
    <button type="button" role="option" aria-selected={active} className="pick-row" onClick={() => onPick(brand)}>
      <span>{brand}</span>
      {count != null && <span className="pick-meta">{count} {' '}{tx("mẫu")}</span>}
    </button>
  );
}

function Chevron() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}
