import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPhotos, blankCamera, db, deletePhoto, patchCamera, saveCamera, type CamType, type Camera, type Currency, type Photo } from '../db';
import { CONDITIONS, FORMATS, TYPE_LABEL, money, parseAmount, parseVND } from '../lib/format';
import { guessType } from '../lib/catalog';
import { compressImage, useObjectURL } from '../lib/images';
import { toast } from '../lib/toast';
import { DateInput, Segmented } from '../components/ui';
import { IconCamera, IconClose, IconImage, IconStar } from '../components/Icons';

const TYPES: CamType[] = ['PNS', 'RF', 'SLR', 'HALF', 'TLR', 'MF', 'INST', 'DIG', 'OTHER'];

function Thumb({ blob, onRemove, isCover, onCover }: { blob: Blob; onRemove: () => void; isCover?: boolean; onCover?: () => void }) {
  const url = useObjectURL(blob);
  return (
    <div className="photo-slot" style={isCover ? { borderColor: 'var(--accent)' } : undefined}>
      {url && <img src={url} alt="" />}
      <button type="button" className="x" aria-label="Bỏ ảnh" onClick={onRemove}><IconClose size={14} /></button>
      {onCover && (
        <button type="button" className="x" style={{ top: 'auto', bottom: 4, color: isCover ? 'var(--accent)' : undefined }} aria-label="Đặt làm ảnh bìa" aria-pressed={isCover} onClick={onCover}>
          <IconStar size={14} />
        </button>
      )}
    </div>
  );
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
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState('');
  const [pending, setPending] = useState<Blob[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing) {
      setC(existing);
      setTypeTouched(true);
      setPrice(existing.purchasePrice != null ? String(existing.purchasePrice) : '');
      setTags(existing.tags.join(', '));
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Camera>(k: K, v: Camera[K]) => setC((prev) => ({ ...prev, [k]: v }));

  // Gợi ý loại máy khi gõ hãng + mẫu (chỉ khi người dùng chưa tự chọn)
  const guess = useMemo(() => guessType(c.brand, c.model), [c.brand, c.model]);
  useEffect(() => {
    if (typeTouched || !guess.type) return;
    setC((prev) => ({ ...prev, type: guess.type, format: guess.format ?? (guess.type === 'DIG' ? 'Digital' : prev.format) }));
  }, [guess.type, guess.format, typeTouched]);

  const priceValue = c.purchaseCurrency === 'VND' ? parseVND(price) : parseAmount(price);
  const canSave = c.brand.trim() && c.model.trim();

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].map((f) => compressImage(f)));
    setPending((p) => [...p, ...blobs]);
  };

  const save = async (again: boolean) => {
    if (!canSave) return;
    const cam: Camera = {
      ...c,
      brand: c.brand.trim(),
      model: c.model.trim(),
      mount: c.mount.trim(),
      serial: c.serial.trim(),
      purchasePrice: priceValue,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean)
    };
    await saveCamera(cam);
    if (pending.length) await addPhotos(cam.id, pending);
    toast(isNew ? `Đã thêm ${cam.brand} ${cam.model}` : 'Đã lưu');
    if (again) {
      setC({ ...blankCamera(), brand: cam.brand, format: cam.format });
      setTypeTouched(false);
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
        <button type="button" onClick={() => nav(-1)} style={{ height: 44, border: 0, background: 'transparent', fontSize: 15, color: 'var(--text-2)', padding: 0 }}>Hủy</button>
        <h1>{isNew ? 'Thêm máy' : 'Sửa máy'}</h1>
        {isNew ? <Link to="/du-lieu" style={{ fontSize: 13, height: 44, display: 'flex', alignItems: 'center' }}>Nhập CSV</Link> : <span style={{ width: 44 }} />}
      </header>

      <section className="photo-row px" aria-label="Ảnh">
        <button type="button" className="photo-slot add" onClick={() => camRef.current?.click()}><IconCamera size={22} />Chụp</button>
        <button type="button" className="photo-slot" onClick={() => libRef.current?.click()}><IconImage size={22} />Thư viện</button>
        {savedPhotos?.map((p) => (
          <Thumb key={p.id} blob={p.blob} isCover={existing?.coverPhotoId === p.id}
            onCover={() => patchCamera(p.cameraId, { coverPhotoId: p.id })}
            onRemove={() => deletePhoto(p)} />
        ))}
        {pending.map((b, i) => <Thumb key={i} blob={b} onRemove={() => setPending(pending.filter((_, j) => j !== i))} />)}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </section>

      <section className="section px" aria-label="Thông tin máy" style={{ gap: 14 }}>
        <h2 className="h-mono">THÔNG TIN MÁY</h2>
        <div className="form-grid">
          <label className="field">Hãng
            <input className="input" list="brands" value={c.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Olympus" autoCapitalize="words" />
            <datalist id="brands">{brands?.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
          <label className="field">Mẫu
            <input className="input" value={c.model} onChange={(e) => set('model', e.target.value)} placeholder="OM-2N" />
          </label>
        </div>
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>Loại máy {guess.type && !typeTouched && c.type === guess.type && <span style={{ color: 'var(--accent)' }}> · tự nhận dạng</span>}</legend>
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
            <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>Khổ film</legend>
            <Segmented label="Khổ film" value={c.format} onChange={(v) => set('format', v)} options={FORMATS.filter((f) => f !== 'Digital').map((f) => ({ value: f, label: f }))} />
          </fieldset>
        )}
        <div className="form-grid">
          <label className="field">Ngàm
            <input className="input" list="mounts" value={c.mount} onChange={(e) => set('mount', e.target.value)} placeholder="Không bắt buộc" />
            <datalist id="mounts">{mounts?.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field">Năm sản xuất
            <input className="input mono" inputMode="numeric" value={c.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null)} placeholder="Không bắt buộc" />
          </label>
        </div>
        <label className="field">Số serial
          <input className="input mono" value={c.serial} onChange={(e) => set('serial', e.target.value)} placeholder="Không bắt buộc" />
        </label>
      </section>

      <section className="section px" aria-label="Tình trạng" style={{ gap: 14 }}>
        <h2 className="h-mono">TÌNH TRẠNG</h2>
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>Ngoại hình</legend>
          <div className="grade">
            {CONDITIONS.map((g) => (
              <button key={g} type="button" className={c.condition === g ? 'on' : ''} aria-pressed={c.condition === g} onClick={() => set('condition', c.condition === g ? '' : g)}>{g}</button>
            ))}
          </div>
        </fieldset>
        <Segmented label="Trạng thái" value={c.status} onChange={(v) => set('status', v)} options={[{ value: 'owned', label: 'Trong kho' }, { value: 'sold', label: 'Đã bán' }]} colorFor={(v) => (v === 'owned' ? 'var(--up)' : undefined)} />
      </section>

      <section className="section px" aria-label="Mua" style={{ gap: 14 }}>
        <h2 className="h-mono">MUA</h2>
        <div className="field">
          <label htmlFor="price">Giá mua</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="price" className="input mono" inputMode="decimal" style={{ flex: 1, minWidth: 0 }} value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder={c.purchaseCurrency === 'VND' ? 'vd 3,2tr' : 'vd 4800'} />
            <div className="views" role="group" aria-label="Đơn vị tiền">
              {(['VND', 'JPY', 'USD'] as Currency[]).map((cur) => (
                <button key={cur} type="button" aria-pressed={c.purchaseCurrency === cur} onClick={() => set('purchaseCurrency', cur)} style={{ width: cur === 'VND' ? 50 : 40, fontSize: 13 }}>
                  {cur === 'VND' ? 'VNĐ' : cur === 'JPY' ? '¥' : '$'}
                </button>
              ))}
            </div>
          </div>
          {priceValue != null && <span className="mono">= {money(priceValue, c.purchaseCurrency)}</span>}
        </div>
        <div className="form-grid">
          <div className="field"><span>Ngày mua</span><DateInput label="Ngày mua" value={c.purchaseDate} onChange={(v) => set('purchaseDate', v)} /></div>
          <label className="field">Mua ở đâu<input className="input" value={c.purchaseFrom} onChange={(e) => set('purchaseFrom', e.target.value)} placeholder="Buyee, shop…" /></label>
        </div>
        <label className="field">Thẻ (cách nhau bằng dấu phẩy)
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="máy đi phố, kỷ niệm" />
        </label>
        <label className="field">Ghi chú
          <textarea className="input" rows={3} value={c.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Lỗi nhỏ, lịch sử máy, cảm nhận khi chụp…" />
        </label>
      </section>

      <div className="savebar">
        {isNew && <button type="button" className="btn secondary" style={{ flex: 1 }} disabled={!canSave} onClick={() => save(true)}>Lưu &amp; thêm tiếp</button>}
        <button type="button" className="btn" style={{ flex: 1.3 }} disabled={!canSave} onClick={() => save(false)}>Lưu máy</button>
      </div>
    </div>
  );
}
