import { useState } from 'react';
import { useSettings } from '../db';
import type { CatalogModel, Contribution } from '../lib/catalogTypes';
import { mainLens } from '../lib/catalog';
import { newModelId, submitContribution } from '../lib/contrib';
import { speed, specRows } from '../lib/specs';
import { todayISO } from '../lib/format';
import { toast } from '../lib/toast';
import { Segmented, Sheet } from './ui';
import { tx } from '../lib/i18n';

const TYPES = [
  { value: 'compact', label: 'Compact / PNS' }, { value: 'rangefinder', label: 'Rangefinder' }, { value: 'slr', label: 'SLR' },
  { value: 'tlr', label: 'TLR' }, { value: 'instant', label: 'Instant' }, { value: 'mirrorless', label: 'Mirrorless' }
];

const num = (s: string): number | undefined => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};
/** "1/500" → 0.002 · "2" hoặc "2s" → 2 */
const parseSpeed = (s: string): number | undefined => {
  const t = s.trim().replace(/\s*(s|giây|sec)$/i, '');
  const m = t.match(/^1\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  if (m) return 1 / parseFloat(m[1].replace(',', '.'));
  return num(t);
};
const str = (v: number | undefined | null) => (v == null ? '' : String(v));

/**
 * Bảng đóng góp: sửa thông số một mẫu có sẵn, hoặc thêm mẫu mới vào thư viện.
 * Chỉ những ô bạn thay đổi mới được ghi vào đóng góp.
 */
export function ContributeSheet({ model, brand, modelName, onClose }: { model: CatalogModel | null; brand: string; modelName: string; onClose: () => void }) {
  const settings = useSettings();
  const isAdd = !model;
  const l = model ? mainLens(model) : null;
  const rowMap = Object.fromEntries(model ? specRows(model) : []);

  const init = {
    brand: model?.brand ?? brand,
    model: model?.model ?? modelName,
    year: str(model?.release?.year),
    month: str(model?.release?.month),
    type: model?.camera_type ?? 'compact',
    media: model?.media ?? 'film',
    format: model?.film?.format ?? '135',
    lensKind: model?.lens?.kind === 'interchangeable' ? 'interchangeable' : 'built_in',
    mount: model?.lens?.mount ?? '',
    fMin: str(l?.focal_length_min_mm), fMax: str(l?.focal_length_max_mm !== l?.focal_length_min_mm ? l?.focal_length_max_mm : undefined),
    aWide: str(l?.max_aperture_wide_f), aTele: str(l?.max_aperture_tele_f !== l?.max_aperture_wide_f ? l?.max_aperture_tele_f : undefined),
    elements: str(l?.elements), groups: str(l?.groups),
    slow: model?.shutter?.slowest_s ? speed(model.shutter.slowest_s).replace(tx(" giây"), '') : '',
    fast: model?.shutter?.fastest_s ? speed(model.shutter.fastest_s).replace(tx(" giây"), '') : '',
    isoMin: str(model?.film?.iso_min ?? model?.digital?.iso_min), isoMax: str(model?.film?.iso_max ?? model?.digital?.iso_max),
    focus: model?.text_vi?.focus ?? rowMap['Lấy nét'] ?? '',
    exposure: model?.text_vi?.exposure ?? rowMap['Phơi sáng'] ?? '',
    battery: model?.text_vi?.battery ?? rowMap['Pin'] ?? '',
    w: str(model?.body?.measurements?.[0]?.width_mm), h: str(model?.body?.measurements?.[0]?.height_mm), d: str(model?.body?.measurements?.[0]?.depth_mm),
    weight: str(model?.body?.weights?.[0]?.g),
    note: model?.text_vi?.note ?? '',
    image: model?.commons_file ?? '',
    srcName: '', srcUrl: '', why: ''
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof init) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const changed = (...keys: (keyof typeof init)[]) => keys.some((k) => f[k] !== init[k]);

  const buildSet = (): Partial<CatalogModel> => {
    const s: Partial<CatalogModel> = {};
    if (isAdd) { s.brand = f.brand.trim(); s.model = f.model.trim(); }
    if (isAdd || changed('year', 'month')) s.release = { year: num(f.year), month: num(f.month) };
    if (isAdd || changed('type', 'media')) { s.camera_type = f.type; s.media = f.media as 'film' | 'digital'; }
    if (isAdd || changed('format', 'isoMin', 'isoMax')) {
      if (f.media === 'film') s.film = { format: f.format || undefined, iso_min: num(f.isoMin), iso_max: num(f.isoMax) };
      else s.digital = { iso_min: num(f.isoMin), iso_max: num(f.isoMax) };
    }
    if (isAdd || changed('lensKind', 'mount', 'fMin', 'fMax', 'aWide', 'aTele', 'elements', 'groups')) {
      const fMin = num(f.fMin), aWide = num(f.aWide);
      s.lens = {
        kind: f.lensKind,
        mount: f.lensKind === 'interchangeable' ? f.mount || undefined : undefined,
        configurations: f.lensKind === 'built_in' && fMin ? [{
          role: 'taking_lens', focal_length_min_mm: fMin, focal_length_max_mm: num(f.fMax) ?? fMin,
          max_aperture_wide_f: aWide, max_aperture_tele_f: num(f.aTele) ?? aWide, elements: num(f.elements), groups: num(f.groups)
        }] : undefined
      };
    }
    if (isAdd || changed('slow', 'fast')) s.shutter = { ...(model?.shutter ?? {}), slowest_s: parseSpeed(f.slow), fastest_s: parseSpeed(f.fast) };
    if (isAdd || changed('w', 'h', 'd', 'weight')) {
      s.body = {
        measurements: num(f.w) ? [{ width_mm: num(f.w), height_mm: num(f.h), depth_mm: num(f.d) }] : undefined,
        weights: num(f.weight) ? [{ g: num(f.weight) }] : undefined
      };
    }
    const tv: Record<string, string> = {};
    if (changed('focus') && f.focus.trim()) tv.focus = f.focus.trim();
    if (changed('exposure') && f.exposure.trim()) tv.exposure = f.exposure.trim();
    if (changed('battery') && f.battery.trim()) tv.battery = f.battery.trim();
    if (changed('note') && f.note.trim()) tv.note = f.note.trim();
    if (Object.keys(tv).length) s.text_vi = tv;
    if (changed('image') && f.image.trim()) s.commons_file = decodeURIComponent(f.image.trim().split('/').pop()!.replace(/^File:/i, '')).replace(/_/g, ' ');
    return JSON.parse(JSON.stringify(s));
  };

  const save = async () => {
    const s = buildSet();
    if (!Object.keys(s).length) { toast(tx("Bạn chưa thay đổi gì")); return; }
    if (isAdd && (!f.brand.trim() || !f.model.trim())) { toast(tx("Cần có hãng và tên mẫu")); return; }
    if (!f.srcUrl.trim() && !f.srcName.trim()) { toast(tx("Ghi nguồn giúp mình (link hoặc tên tài liệu)")); return; }
    const c: Contribution = {
      id: model?.id ?? newModelId(f.brand, f.model),
      action: isAdd ? 'add' : 'edit',
      at: todayISO(),
      by: settings.contribName || settings.ownerName || undefined,
      set: s,
      source: { name: f.srcName.trim() || undefined, url: f.srcUrl.trim() || undefined },
      note: f.why.trim() || undefined
    };
    setBusy(true);
    const r = await submitContribution(c);
    setBusy(false);
    toast(r.state === 'synced' ? tx("Đã gửi đóng góp — thư viện sẽ cập nhật sau ~1 phút") : tx("Đã lưu trên máy. Chưa gửi: {0}", r.error));
    onClose();
  };

  const input = (label: string, k: keyof typeof init, ph = '', mono = false, mode: 'text' | 'decimal' = 'text') => (
    <label className="field">{label}<input className={'input' + (mono ? ' mono' : '')} inputMode={mode} value={f[k]} onChange={set(k)} placeholder={ph} /></label>
  );

  return (
    <Sheet open onClose={onClose} title={isAdd ? tx("Thêm mẫu vào thư viện") : tx("Sửa thông số · {0} {1}", init.brand, init.model)}>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Chỉ những ô bạn sửa mới được ghi lại. Nhớ ghi nguồn để người khác kiểm tra được.")}</p>
      {isAdd && <div className="form-grid">{input(tx("Hãng"), 'brand', 'Olympus')}{input(tx("Tên mẫu"), 'model', 'Trip 35')}</div>}
      <div className="form-grid">{input(tx("Năm ra mắt"), 'year', '1994', true, 'decimal')}{input(tx("Tháng"), 'month', '9', true, 'decimal')}</div>
      <Segmented label={tx("Film hay máy số")} value={f.media} onChange={(v) => setF((p) => ({ ...p, media: v }))} options={[{ value: 'film', label: tx("Máy film") }, { value: 'digital', label: tx("Máy số") }]} />
      <label className="field">{tx("Loại máy")}<select className="input" value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      </label>
      {f.media === 'film' && input(tx("Khổ film"), 'format', '135, 120, 110…', true)}

      <h3 className="h-mono" style={{ marginTop: 6 }}>{tx("ỐNG KÍNH")}</h3>
      <Segmented label={tx("Kiểu ống kính")} value={f.lensKind} onChange={(v) => setF((p) => ({ ...p, lensKind: v }))} options={[{ value: 'built_in', label: tx("Ống kính liền") }, { value: 'interchangeable', label: tx("Thay ống kính") }]} />
      {f.lensKind === 'built_in' ? (
        <>
          <div className="form-grid">{input(tx("Tiêu cự (mm)"), 'fMin', '35', true, 'decimal')}{input(tx("Zoom tới (mm)"), 'fMax', tx("bỏ trống nếu không zoom"), true, 'decimal')}</div>
          <div className="form-grid">{input(tx("Khẩu độ lớn nhất f/"), 'aWide', '2.8', true, 'decimal')}{input(tx("Ở tele f/"), 'aTele', tx("nếu zoom"), true, 'decimal')}</div>
          <div className="form-grid">{input(tx("Số thấu kính"), 'elements', '4', true, 'decimal')}{input(tx("Số nhóm"), 'groups', '4', true, 'decimal')}</div>
        </>
      ) : input(tx("Ngàm"), 'mount', 'Olympus OM, Nikon F…')}

      <h3 className="h-mono" style={{ marginTop: 6 }}>{tx("THÔNG SỐ")}</h3>
      {input(tx("Lấy nét"), 'focus', tx("vd: Autofocus, gần nhất 0,35 m"))}
      {input(tx("Phơi sáng"), 'exposure', tx("vd: Program, đo sáng CdS"))}
      <div className="form-grid">{input(tx("Màn trập chậm nhất"), 'slow', tx("2 hoặc 1/8"), true)}{input(tx("Nhanh nhất"), 'fast', '1/500', true)}</div>
      <div className="form-grid">{input(tx("ISO thấp nhất"), 'isoMin', '50', true, 'decimal')}{input(tx("ISO cao nhất"), 'isoMax', '3200', true, 'decimal')}</div>
      {input(tx("Pin"), 'battery', tx("vd: 1 × CR2"))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{input(tx("Rộng (mm)"), 'w', '117', true, 'decimal')}{input(tx("Cao (mm)"), 'h', '61', true, 'decimal')}{input(tx("Dày"), 'd', '25', true, 'decimal')}</div>
      {input(tx("Khối lượng (g)"), 'weight', '145', true, 'decimal')}
      <label className="field">{tx("Ghi chú")}<textarea className="input" rows={2} value={f.note} onChange={set('note')} placeholder={tx("Điểm đặc biệt, tên gọi khác…")} /></label>
      {input(tx("Ảnh mẫu trên Wikimedia Commons (tên file hoặc link)"), 'image', 'File:Ricoh R1.jpg')}

      <h3 className="h-mono" style={{ marginTop: 6 }}>{tx("NGUỒN")}</h3>
      <div className="form-grid">{input(tx("Tên nguồn"), 'srcName', tx("Sách hướng dẫn, trang hãng…"))}{input('Link', 'srcUrl', 'https://…')}</div>
      {input(tx("Bạn sửa gì? (không bắt buộc)"), 'why', tx("vd: sửa pin theo sách hướng dẫn"))}
      <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? tx("Đang gửi…") : tx("Lưu đóng góp")}</button>
    </Sheet>
  );
}
