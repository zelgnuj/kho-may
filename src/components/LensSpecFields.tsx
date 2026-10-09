import { useState } from 'react';
import type { LensSpec } from '../db';
import { lensLabel } from '../lib/format';
import { Segmented } from './ui';
import { tx } from '../lib/i18n';

const toStr = (v: number | null | undefined) => (v == null ? '' : String(v));
const toNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.').replace(/^f\/?/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Ô nhập thông số ống kính: liền / thay được, tiêu cự, khẩu độ, zoom */
export function LensSpecFields({ value, onChange }: { value: LensSpec; onChange: (v: LensSpec) => void }) {
  const [zoom, setZoom] = useState(!!value.focalMax);
  const [f, setF] = useState(toStr(value.focal));
  const [fMax, setFMax] = useState(toStr(value.focalMax));
  const [a, setA] = useState(toStr(value.aperture));
  const [aMax, setAMax] = useState(toStr(value.apertureMax));

  const emit = (patch: Partial<{ zoom: boolean; f: string; fMax: string; a: string; aMax: string }>) => {
    const z = patch.zoom ?? zoom;
    const next = { f, fMax, a, aMax, ...patch };
    onChange({
      ...value,
      auto: false,
      focal: toNum(next.f),
      focalMax: z ? toNum(next.fMax) : null,
      aperture: toNum(next.a),
      apertureMax: z ? toNum(next.aMax) : null
    });
  };

  const preview = lensLabel(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Segmented
        label={tx("Kiểu ống kính")}
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind, auto: false })}
        options={[{ value: 'fixed', label: tx("Ống kính liền") }, { value: 'interchangeable', label: tx("Thay ống kính") }]}
      />
      {value.kind === 'fixed' ? (
        <>
          <div className="toggles">
            <button type="button" className={'toggle' + (!zoom ? ' on' : '')} aria-pressed={!zoom} onClick={() => { setZoom(false); emit({ zoom: false }); }}>{tx("Tiêu cự cố định")}</button>
            <button type="button" className={'toggle' + (zoom ? ' on' : '')} aria-pressed={zoom} onClick={() => { setZoom(true); emit({ zoom: true }); }}>Zoom</button>
          </div>
          <div className="form-grid">
            <label className="field">{zoom ? tx("Tiêu cự từ (mm)") : tx("Tiêu cự (mm)")}
              <input className="input mono" inputMode="decimal" value={f} placeholder={zoom ? '38' : '35'} onChange={(e) => { setF(e.target.value); emit({ f: e.target.value }); }} />
            </label>
            {zoom ? (
              <label className="field">{tx("đến (mm)")}<input className="input mono" inputMode="decimal" value={fMax} placeholder="80" onChange={(e) => { setFMax(e.target.value); emit({ fMax: e.target.value }); }} />
              </label>
            ) : (
              <label className="field">{tx("Khẩu độ lớn nhất (f/)")}<input className="input mono" inputMode="decimal" value={a} placeholder="2.8" onChange={(e) => { setA(e.target.value); emit({ a: e.target.value }); }} />
              </label>
            )}
          </div>
          {zoom && (
            <div className="form-grid">
              <label className="field">{tx("Khẩu độ ở góc rộng (f/)")}<input className="input mono" inputMode="decimal" value={a} placeholder="4.5" onChange={(e) => { setA(e.target.value); emit({ a: e.target.value }); }} />
              </label>
              <label className="field">{tx("ở tele (f/)")}<input className="input mono" inputMode="decimal" value={aMax} placeholder="8" onChange={(e) => { setAMax(e.target.value); emit({ aMax: e.target.value }); }} />
              </label>
            </div>
          )}
          {preview && <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>= {preview}</span>}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{tx("Máy thay ống kính: ghi ngàm ở phần thông tin máy, và thêm các ống kính bạn có ở màn chi tiết.")}</p>
      )}
    </div>
  );
}
