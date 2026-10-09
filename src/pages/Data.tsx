import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCameras } from '../db';
import { commitImport, exportCSV, parseCSVFile, type ImportPreview } from '../lib/csv';
import { applyRestore, readBackup } from '../lib/backup';
import { SubPage } from '../components/SubPage';
import { TYPE_LABEL, fullName, money } from '../lib/format';
import { toast } from '../lib/toast';
import { Segmented } from '../components/ui';
import { IconData } from '../components/Icons';
import { tx } from '../lib/i18n';

const CAMDEX_MAP: [string, string][] = [
  ['brand, name', tx("Hãng, Mẫu")],
  ['groupName', tx("Máy film / Máy số")],
  ['status', tx("Trạng thái")],
  ['purchasePrice', tx("Giá mua + tiền tệ")],
  ['filmFormat', tx("Khổ film")],
  ['notes', tx("Ghi chú (tự tách ngày mua, nơi mua)")]
];

export default function Data() {
  const cams = useCameras();
  const nav = useNavigate();
  const [scope, setScope] = useState<'owned' | 'all'>('owned');
  const [incPurchase, setIncPurchase] = useState(true);
  const [incSerial, setIncSerial] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lensOk, setLensOk] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = (cams ?? []).filter((c) => scope === 'all' || c.status === 'owned');

  const doExport = async () => {
    setBusy(true);
    try {
      await exportCSV(list, { purchase: incPurchase, serial: incSerial });
    } finally { setBusy(false); }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (/\.(json|zip)$/i.test(file.name)) {
        const plan = await readBackup(file);
        if (!window.confirm(tx("Khôi phục bản sao lưu ({0} máy, {1} ảnh)? Máy đã có sẽ giữ bản sửa gần đây hơn, không xoá gì.", plan.cameras, plan.photos))) return;
        const r = await applyRestore(plan);
        toast(tx("Đã khôi phục: thêm {0} máy, cập nhật {1}, {2} ảnh", r.added, r.updated, r.photos));
        nav('/');
        return;
      }
      const p = await parseCSVFile(file);
      if (p.source === 'unknown' || !p.rows.length) {
        toast(tx("Không đọc được file này. Cần CSV từ CamDex hoặc file xuất từ Camera Cabinet."));
        return;
      }
      setPreview(p);
    } catch (e) {
      toast(e instanceof Error ? e.message : tx("Lỗi khi đọc file"));
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const n = await commitImport(preview.rows, { lensFromNotes: lensOk, skipDuplicates: skipDup });
      toast(tx("Đã nhập {0} máy", n));
      setPreview(null);
      nav('/');
    } finally { setBusy(false); }
  };

  const rows = preview?.rows ?? [];
  const ownedN = rows.filter((r) => r.camera.status === 'owned').length;
  const soldN = rows.length - ownedN;
  const digN = rows.filter((r) => r.camera.status === 'owned' && r.camera.type === 'DIG').length;
  const untyped = rows.filter((r) => !r.camera.type);
  const lensRows = rows.filter((r) => r.lensFromNotes);
  const dupN = rows.filter((r) => r.duplicate).length;
  const foreign = rows.filter((r) => r.camera.purchasePrice != null && r.camera.purchaseCurrency !== 'VND');
  const importN = rows.length - (skipDup ? dupN : 0);

  return (
    <SubPage title={tx("Nhập / Xuất")}>
      <section className="section px" aria-label={tx("Nhập dữ liệu")}>
        <h2 className="h-mono">{tx("NHẬP VÀO")}</h2>
        {!preview ? (
          <button type="button" className="dashed" style={{ flexDirection: 'column', background: 'transparent', padding: '22px 14px', gap: 8 }} onClick={() => fileRef.current?.click()}>
            <IconData size={24} />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{tx("Chọn file CSV hoặc file sao lưu")}</span>
            <span className="muted" style={{ fontSize: 12 }}>{tx("Đọc được CSV từ CamDex và file xuất từ Camera Cabinet")}</span>
          </button>
        ) : (
          <div className="panel" style={{ borderColor: 'var(--accent)', borderWidth: 1.5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{preview.fileName}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tx("Nhận dạng:")}{' '}{preview.source === 'camdex' ? tx("định dạng CamDex") : tx("file Camera Cabinet")} · {rows.length} {' '}{tx("dòng")}</span>
            </div>
            <div className="form-grid">
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{ownedN}</div>
                <span className="muted" style={{ fontSize: 11 }}>{tx("đang có")}{digN ? tx(" ({0} film, {1} số)", ownedN - digN, digN) : ''}</span>
              </div>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{soldN}</div>
                <span className="muted" style={{ fontSize: 11 }}>{tx("đã bán")}</span>
              </div>
            </div>

            {preview.source === 'camdex' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>{tx("Ghép cột")}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 16px minmax(0,1.3fr)', gap: '6px 8px', fontSize: 12 }}>
                  {CAMDEX_MAP.map(([a, b]) => [
                    <span key={a} className="mono" style={{ color: 'var(--text-2)' }}>{a}</span>,
                    <span key={a + '→'} style={{ color: 'var(--muted-2)' }}>→</span>,
                    <span key={a + 'b'}>{b}</span>
                  ])}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: 12 }}>{tx("Xem lại trước khi nhập")}</span>
              {lensRows.length > 0 && (
                <label className="check" style={{ padding: 0 }}>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    {tx("Tách ống kính từ ghi chú:")}{' '}{lensRows.map((r) => `${fullName(r.camera)} → ${r.lensFromNotes}`).join('; ')}
                  </span>
                  <input type="checkbox" checked={lensOk} onChange={(e) => setLensOk(e.target.checked)} />
                </label>
              )}
              {dupN > 0 && (
                <label className="check" style={{ padding: 0 }}>
                  <span style={{ fontSize: 13 }}>{tx("Bỏ qua")}{' '}{dupN} {' '}{tx("máy đã có trong kho")}</span>
                  <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                </label>
              )}
              {foreign.length > 0 && (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>{tx("Giá mua ngoại tệ giữ nguyên:")}{' '}{foreign.map((r) => `${fullName(r.camera)} ${money(r.camera.purchasePrice!, r.camera.purchaseCurrency)}`).join('; ')}</p>
              )}
              {untyped.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>{untyped.length} {' '}{tx("máy chưa nhận dạng được loại (")}{untyped.map((r) => fullName(r.camera)).join(', ')}{tx("). Sau khi nhập, lọc “Chưa phân loại” để chọn.")}</p>
              ) : (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>{tx("Đã nhận dạng loại cho cả")}{' '}{rows.length} {' '}{tx("máy:")}{' '}{[...new Set(rows.map((r) => TYPE_LABEL[r.camera.type]))].join(', ')}.</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn secondary" onClick={() => setPreview(null)}>{tx("Hủy")}</button>
              <button type="button" className="btn" style={{ flex: 1 }} disabled={busy || importN === 0} onClick={doImport}>{tx("Nhập")}{' '}{importN} {' '}{tx("máy")}</button>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".csv,.json,.zip,text/csv,application/json,application/zip" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </section>

      <section className="section px" aria-label={tx("Xuất dữ liệu")} style={{ gap: 12 }}>
        <h2 className="h-mono">{tx("XUẤT BẢNG TÍNH")}</h2>
        <Segmented label={tx("Phạm vi")} value={scope} onChange={setScope} options={[{ value: 'owned', label: tx("Đang có · {0}", (cams ?? []).filter((c) => c.status === 'owned').length) }, { value: 'all', label: tx("Tất cả · {0}", (cams ?? []).length) }]} />
        <div className="rows" style={{ padding: 0 }}>
          <label className="check"><span>{tx("Kèm giá mua & nơi mua")}</span><input type="checkbox" checked={incPurchase} onChange={(e) => setIncPurchase(e.target.checked)} /></label>
          <label className="check"><span>{tx("Kèm số serial")}</span><input type="checkbox" checked={incSerial} onChange={(e) => setIncSerial(e.target.checked)} /></label>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Mở được bằng Excel, Google Sheets, Numbers. Nhập lại vào Camera Cabinet cũng được.")}</p>
        <button type="button" className="btn" disabled={busy || !(cams ?? []).length} onClick={doExport}>
          {tx("Xuất")}{' '}{list.length} {' '}{tx("máy ra CSV")}</button>
      </section>

      <p className="px muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
        {tx("Muốn chuyển toàn bộ dữ liệu kèm ảnh sang máy khác, dùng Cài đặt → Sao lưu thay vì CSV.")}</p>
    </SubPage>
  );
}
