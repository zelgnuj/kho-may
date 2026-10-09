import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPhotos, addPrice, blankCamera, db, deletePhoto, ensureCover, patchCamera, patchWish, saveCamera, type CamType, type Camera, type Currency, type Photo } from '../db';
import { CONDITIONS, FORMATS, TYPE_LABEL, money, parseAmount, parseVND } from '../lib/format';
import { defaultLensKind, findModel, guessLens, guessType, useCatalogVersion } from '../lib/catalog';
import { ModelPicker } from '../components/ModelPicker';
import { takeHeldPhotos } from '../lib/quickPhotos';
import { LensSpecFields } from '../components/LensSpecFields';
import { compressImage, useObjectURL } from '../lib/images';
import { toast } from '../lib/toast';
import { DateInput, Segmented } from '../components/ui';
import { IconCamera, IconClose, IconImage, IconStar } from '../components/Icons';
import { tx } from '../lib/i18n';

const TYPES: CamType[] = ['PNS', 'RF', 'SLR', 'HALF', 'TLR', 'MF', 'INST', 'DIG', 'OTHER'];

function Thumb({ blob, onRemove, isCover, onCover }: { blob: Blob; onRemove: () => void; isCover?: boolean; onCover?: () => void }) {
  const url = useObjectURL(blob);
  return (
    <div className="photo-slot" style={isCover ? { borderColor: 'var(--accent)' } : undefined}>
      {url && <img src={url} alt="" />}
      <button type="button" className="x" aria-label={tx("Bỏ ảnh")} onClick={onRemove}><IconClose size={14} /></button>
      {onCover && (
        <button type="button" className="x" style={{ top: 'auto', bottom: 4, color: isCover ? 'var(--accent)' : undefined }} aria-label={tx("Đặt làm ảnh bìa")} aria-pressed={isCover} onClick={onCover}>
          <IconStar size={14} />
        </button>
      )}
    </div>
  );
}

/** Các trường người dùng sửa trên form */
function pickForm(c: Camera): Partial<Camera> {
  const { brand, model, type, format, mount, serial, year, condition, status, purchasePrice, purchaseCurrency, purchaseDate, purchaseFrom, tags, notes, lenses, lens } = c;
  return { brand, model, type, format, mount, serial, year, condition, status, purchasePrice, purchaseCurrency, purchaseDate, purchaseFrom, tags, notes, lenses, lens };
}

export default function Edit() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const existing = useLiveQuery(() => (id ? db.cameras.get(id) : undefined), [id]);
  const savedPhotos = useLiveQuery(() => (id ? db.photos.where('cameraId').equals(id).sortBy('createdAt') : Promise.resolve([] as Photo[])), [id]);
  const brands = useLiveQuery(async () => [...new Set((await db.cameras.toArray()).map((c) => c.brand).filter(Boolean))].sort(), []);
  const mounts = useLiveQuery(async () => [...new Set((await db.cameras.toArray()).map((c) => c.mount).filter(Boolean))].sort(), []);

  const [c, setC] = useState<Camera>(() => blankCamera());
  const [typeTouched, setTypeTouched] = useState(false);
  const [lensTouched, setLensTouched] = useState(false);
  const [lensKey, setLensKey] = useState(0);
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState('');
  const [pending, setPending] = useState<Blob[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing) {
      setC(existing);
      setTypeTouched(true);
      setLensTouched(!!existing.lens && !existing.lens.auto && (existing.lens.focal != null || existing.lens.kind === 'interchangeable'));
      setLensKey((k) => k + 1);
      setPrice(existing.purchasePrice != null ? String(existing.purchasePrice) : '');
      setTags(existing.tags.join(', '));
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Camera>(k: K, v: Camera[K]) => setC((prev) => ({ ...prev, [k]: v }));

  // Mở từ wishlist ("Đã mua được"): điền sẵn hãng/mẫu
  const [params] = useSearchParams();
  const wishId = isNew ? params.get('wish') : null;
  // ảnh vừa chụp từ nút + ("máy mới với ảnh này")
  useEffect(() => {
    if (isNew && params.get('anh')) { const held = takeHeldPhotos(); if (held.length) setPending((p) => [...p, ...held]); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const wish = useLiveQuery(() => (wishId ? db.wishlist.get(wishId) : undefined), [wishId]);
  useEffect(() => {
    if (wish) setC((prev) => ({ ...prev, brand: wish.brand, model: wish.model, notes: wish.wantNote ? tx("Muốn: {0}", wish.wantNote) : prev.notes }));
  }, [wish?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gợi ý loại máy khi gõ hãng + mẫu (chỉ khi người dùng chưa tự chọn)
  const guess = useMemo(() => guessType(c.brand, c.model), [c.brand, c.model]);
  useEffect(() => {
    if (typeTouched || !guess.type) return;
    setC((prev) => ({ ...prev, type: guess.type, format: guess.format ?? (guess.type === 'DIG' ? 'Digital' : prev.format) }));
  }, [guess.type, guess.format, typeTouched]);

  // Gợi ý thông số ống kính liền theo mẫu máy (khi người dùng chưa tự nhập)
  useEffect(() => {
    if (lensTouched) return;
    const g = guessLens(c.brand, c.model, c.type);
    const next = g ?? { kind: defaultLensKind(c.type), focal: null, focalMax: null, aperture: null, apertureMax: null };
    setC((prev) => {
      const cur = prev.lens;
      if (cur && cur.kind === next.kind && cur.focal === next.focal && cur.aperture === next.aperture && cur.focalMax === next.focalMax) return prev;
      return { ...prev, lens: next };
    });
    setLensKey((k) => k + 1);
  }, [c.brand, c.model, c.type, lensTouched]);

  useCatalogVersion();
  const matched = findModel(c.brand, c.model);

  const priceValue = c.purchaseCurrency === 'VND' ? parseVND(price) : parseAmount(price);
  const canSave = c.brand.trim() && c.model.trim();

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].map((f) => compressImage(f)));
    setPending((p) => [...p, ...blobs]);
  };

  const save = async (again: boolean) => {
    if (!canSave) return;
    // Chỉ ghi các trường có trên form; phần còn lại (ảnh bìa, giá thị trường, film…) lấy bản mới nhất trong máy
    const fresh = isNew ? null : await db.cameras.get(c.id);
    const cam: Camera = {
      ...(fresh ?? c),
      ...pickForm(c),
      brand: c.brand.trim(),
      model: c.model.trim(),
      mount: c.mount.trim(),
      serial: c.serial.trim(),
      purchasePrice: priceValue,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean)
    };
    await saveCamera(cam);
    if (pending.length) await addPhotos(cam.id, pending);
    else await ensureCover(cam.id);
    if (wish && !wish.acquiredAt) {
      await patchWish(wish.id, { acquiredAt: Date.now(), acquiredCameraId: cam.id });
      if (wish.marketValue != null) await addPrice(cam.id, wish.marketValue, wish.marketLow, wish.marketHigh, { source: 'auto', note: wish.marketNote, sources: wish.marketSources });
    }
    toast(wish ? tx("Đã chuyển {0} {1} từ wishlist vào kho", cam.brand, cam.model) : isNew ? tx("Đã thêm {0} {1}", cam.brand, cam.model) : tx("Đã lưu"));
    if (again) {
      setC({ ...blankCamera(), brand: cam.brand, format: cam.format });
      setTypeTouched(false);
      setLensTouched(false);
      setPrice(''); setTags(''); setPending([]);
      window.scrollTo(0, 0);
    } else {
      nav(`/may/${cam.id}`, { replace: true });
    }
  };

  if (!isNew && existing === undefined) return <div className="page" />;

  return (
    <div className="page with-bar" style={{ paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 110px)' }}>
      <header className="topbar px">
        <button type="button" onClick={() => nav(-1)} style={{ height: 44, border: 0, background: 'transparent', fontSize: 15, color: 'var(--text-2)', padding: 0 }}>{tx("Hủy")}</button>
        <h1>{wish ? tx("Đã mua được") : isNew ? tx("Thêm máy") : tx("Sửa máy")}</h1>
        {isNew ? <Link to="/cai-dat/nhap-xuat" style={{ fontSize: 13, height: 44, display: 'flex', alignItems: 'center' }}>{tx("Nhập CSV")}</Link> : <span style={{ width: 44 }} />}
      </header>

      <section className="photo-row px" aria-label={tx("Ảnh")}>
        <button type="button" className="photo-slot add" onClick={() => camRef.current?.click()}><IconCamera size={22} />{tx("Chụp")}</button>
        <button type="button" className="photo-slot" onClick={() => libRef.current?.click()}><IconImage size={22} />{tx("Thư viện")}</button>
        {savedPhotos?.map((p) => (
          <Thumb key={p.id} blob={p.blob} isCover={existing?.coverPhotoId === p.id}
            onCover={() => patchCamera(p.cameraId, { coverPhotoId: p.id })}
            onRemove={() => deletePhoto(p)} />
        ))}
        {pending.map((b, i) => <Thumb key={i} blob={b} onRemove={() => setPending(pending.filter((_, j) => j !== i))} />)}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </section>

      <section className="section px" aria-label={tx("Thông tin máy")} style={{ gap: 14 }}>
        <h2 className="h-mono">{tx("THÔNG TIN MÁY")}</h2>
        <ModelPicker brand={c.brand} model={c.model} ownBrands={brands ?? []} onChange={(brand, model) => setC((prev) => ({ ...prev, brand, model }))} />
        {matched ? (
          <div className="dashed" style={{ borderStyle: 'solid', borderColor: 'var(--line)', fontSize: 13 }}>
            <span>{tx("Có trong thư viện:")}{' '}<b>{matched.brand} {matched.model}</b>{matched.release?.year ? ` · ${matched.release.year}` : ''} {' '}{tx("— loại máy, ống kính và bảng thông số được điền sẵn.")}</span>
          </div>
        ) : c.brand && c.model ? (
          <div className="dashed" style={{ fontSize: 13 }}>
            <span className="muted">{tx("Chưa có trong thư viện — lưu máy xong, bạn có thể bổ sung thông số ở trang chi tiết.")}</span>
          </div>
        ) : null}
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>{tx("Loại máy")}{' '}{guess.type && !typeTouched && c.type === guess.type && <span style={{ color: 'var(--accent)' }}> {' '}{tx("· tự nhận dạng")}</span>}</legend>
          <div className="toggles">
            {TYPES.map((t) => (
              <button key={t} type="button" className={'toggle' + (c.type === t ? ' on' : '')} aria-pressed={c.type === t}
                onClick={() => { setTypeTouched(true); set('type', c.type === t ? '' : t); if (t === 'DIG') set('format', 'Digital'); }}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
        {c.type !== 'DIG' && (
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>{tx("Khổ film")}</legend>
            <Segmented label={tx("Khổ film")} value={c.format} onChange={(v) => set('format', v)} options={FORMATS.filter((f) => f !== 'Digital').map((f) => ({ value: f, label: f }))} />
          </fieldset>
        )}
        <div className="form-grid">
          <label className="field">{tx("Ngàm")}<input className="input" list="mounts" value={c.mount} onChange={(e) => set('mount', e.target.value)} placeholder={tx("Không bắt buộc")} />
            <datalist id="mounts">{mounts?.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field">{tx("Năm sản xuất")}<input className="input mono" inputMode="numeric" value={c.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null)} placeholder={tx("Không bắt buộc")} />
          </label>
        </div>
        <label className="field">{tx("Số serial")}<input className="input mono" value={c.serial} onChange={(e) => set('serial', e.target.value)} placeholder={tx("Không bắt buộc")} />
        </label>
      </section>

      <section className="section px" aria-label={tx("Ống kính")} style={{ gap: 14 }}>
        <h2 className="h-mono">{tx("ỐNG KÍNH")}{' '}{c.lens?.auto && <span style={{ color: 'var(--accent)', letterSpacing: 0 }}> {' '}{tx("· tự điền theo mẫu, kiểm tra lại")}</span>}</h2>
        <LensSpecFields
          key={lensKey}
          value={c.lens ?? { kind: defaultLensKind(c.type), focal: null, focalMax: null, aperture: null, apertureMax: null }}
          onChange={(v) => { setLensTouched(true); set('lens', v); }}
        />
      </section>

      <section className="section px" aria-label={tx("Tình trạng")} style={{ gap: 14 }}>
        <h2 className="h-mono">{tx("TÌNH TRẠNG")}</h2>
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>{tx("Ngoại hình")}</legend>
          <div className="grade">
            {CONDITIONS.map((g) => (
              <button key={g} type="button" className={c.condition === g ? 'on' : ''} aria-pressed={c.condition === g} onClick={() => set('condition', c.condition === g ? '' : g)}>{g}</button>
            ))}
          </div>
        </fieldset>
        <Segmented label={tx("Trạng thái")} value={c.status} onChange={(v) => set('status', v)} options={[{ value: 'owned', label: tx("Trong kho") }, { value: 'sold', label: tx("Đã bán") }]} colorFor={(v) => (v === 'owned' ? 'var(--up)' : undefined)} />
      </section>

      <section className="section px" aria-label={tx("Mua")} style={{ gap: 14 }}>
        <h2 className="h-mono">{tx("MUA")}</h2>
        <div className="field">
          <label htmlFor="price">{tx("Giá mua")}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="price" className="input mono" inputMode="decimal" style={{ flex: 1, minWidth: 0 }} value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder={c.purchaseCurrency === 'VND' ? tx("vd 3,2tr") : tx("vd 4800")} />
            <div className="views" role="group" aria-label={tx("Đơn vị tiền")}>
              {(['VND', 'JPY', 'USD'] as Currency[]).map((cur) => (
                <button key={cur} type="button" aria-pressed={c.purchaseCurrency === cur} onClick={() => set('purchaseCurrency', cur)} style={{ width: cur === 'VND' ? 50 : 40, fontSize: 13 }}>
                  {cur === 'VND' ? tx("VNĐ") : cur === 'JPY' ? '¥' : '$'}
                </button>
              ))}
            </div>
          </div>
          {priceValue != null && <span className="mono">= {money(priceValue, c.purchaseCurrency)}</span>}
        </div>
        <div className="form-grid">
          <div className="field"><span>{tx("Ngày mua")}</span><DateInput label={tx("Ngày mua")} value={c.purchaseDate} onChange={(v) => set('purchaseDate', v)} /></div>
          <label className="field">{tx("Mua ở đâu")}<input className="input" value={c.purchaseFrom} onChange={(e) => set('purchaseFrom', e.target.value)} placeholder="Buyee, shop…" /></label>
        </div>
        <label className="field">{tx("Thẻ (cách nhau bằng dấu phẩy)")}<input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tx("máy đi phố, kỷ niệm")} />
        </label>
        <label className="field">{tx("Ghi chú")}<textarea className="input" rows={3} value={c.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx("Lỗi nhỏ, lịch sử máy, cảm nhận khi chụp…")} />
        </label>
      </section>

      <div className="savebar">
        {isNew && <button type="button" className="btn secondary" style={{ flex: 1 }} disabled={!canSave} onClick={() => save(true)}>{tx("Lưu & thêm tiếp")}</button>}
        <button type="button" className="btn" style={{ flex: 1.3 }} disabled={!canSave} onClick={() => save(false)}>{tx("Lưu máy")}</button>
      </div>
    </div>
  );
}
