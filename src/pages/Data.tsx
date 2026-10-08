import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCameras } from '../db';
import { commitImport, exportCSV, exportJSON, parseCSVFile, restoreJSON, type ImportPreview } from '../lib/csv';
import { TYPE_LABEL, fullName, money } from '../lib/format';
import { toast } from '../lib/toast';
import { Segmented } from '../components/ui';
import { IconData } from '../components/Icons';

const CAMDEX_MAP: [string, string][] = [
  ['brand, name', 'Hãng, Mẫu'],
  ['groupName', 'Máy film / Máy số'],
  ['status', 'Trạng thái'],
  ['purchasePrice', 'Giá mua + tiền tệ'],
  ['filmFormat', 'Khổ film'],
  ['notes', 'Ghi chú (tự tách ngày mua, nơi mua)']
];

export default function Data() {
  const cams = useCameras();
  const nav = useNavigate();
  const [fmt, setFmt] = useState<'csv' | 'json'>('csv');
  const [scope, setScope] = useState<'owned' | 'all'>('owned');
  const [incPurchase, setIncPurchase] = useState(true);
  const [incSerial, setIncSerial] = useState(true);
  const [incPhotos, setIncPhotos] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lensOk, setLensOk] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = (cams ?? []).filter((c) => scope === 'all' || c.status === 'owned');

  const doExport = async () => {
    setBusy(true);
    try {
      if (fmt === 'csv') await exportCSV(list, { purchase: incPurchase, serial: incSerial });
      else await exportJSON(incPhotos);
    } finally { setBusy(false); }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        if (!window.confirm('Khôi phục từ bản sao lưu? Máy trùng mã sẽ được ghi đè bằng dữ liệu trong file.')) return;
        const n = await restoreJSON(file);
        toast(`Đã khôi phục ${n} máy`);
        nav('/');
        return;
      }
      const p = await parseCSVFile(file);
      if (p.source === 'unknown' || !p.rows.length) {
        toast('Không đọc được file này. Cần CSV từ CamDex hoặc file xuất từ Kho máy.');
        return;
      }
      setPreview(p);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi khi đọc file');
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const n = await commitImport(preview.rows, { lensFromNotes: lensOk, skipDuplicates: skipDup });
      toast(`Đã nhập ${n} máy`);
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
    <div className="page">
      <header className="px" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="eyebrow">Sao lưu & chuyển dữ liệu</span>
        <h1 className="title-xl" style={{ fontSize: 44 }}>Nhập / Xuất</h1>
      </header>

      <section className="section px" aria-label="Nhập dữ liệu">
        <h2 className="h-mono">NHẬP VÀO</h2>
        {!preview ? (
          <button type="button" className="dashed" style={{ flexDirection: 'column', background: 'transparent', padding: '22px 14px', gap: 8 }} onClick={() => fileRef.current?.click()}>
            <IconData size={24} />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Chọn file CSV hoặc bản sao lưu JSON</span>
            <span className="muted" style={{ fontSize: 12 }}>Đọc được CSV từ CamDex và file xuất từ Kho máy</span>
          </button>
        ) : (
          <div className="panel" style={{ borderColor: 'var(--accent)', borderWidth: 1.5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{preview.fileName}</span>
              <span className="muted" style={{ fontSize: 12 }}>Nhận dạng: {preview.source === 'camdex' ? 'định dạng CamDex' : 'file Kho máy'} · {rows.length} dòng</span>
            </div>
            <div className="form-grid">
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{ownedN}</div>
                <span className="muted" style={{ fontSize: 11 }}>đang có{digN ? ` (${ownedN - digN} film, ${digN} số)` : ''}</span>
              </div>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{soldN}</div>
                <span className="muted" style={{ fontSize: 11 }}>đã bán</span>
              </div>
            </div>

            {preview.source === 'camdex' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Ghép cột</span>
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
              <span className="muted" style={{ fontSize: 12 }}>Xem lại trước khi nhập</span>
              {lensRows.length > 0 && (
                <label className="check" style={{ padding: 0 }}>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    Tách ống kính từ ghi chú: {lensRows.map((r) => `${fullName(r.camera)} → ${r.lensFromNotes}`).join('; ')}
                  </span>
                  <input type="checkbox" checked={lensOk} onChange={(e) => setLensOk(e.target.checked)} />
                </label>
              )}
              {dupN > 0 && (
                <label className="check" style={{ padding: 0 }}>
                  <span style={{ fontSize: 13 }}>Bỏ qua {dupN} máy đã có trong kho</span>
                  <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                </label>
              )}
              {foreign.length > 0 && (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>Giá mua ngoại tệ giữ nguyên: {foreign.map((r) => `${fullName(r.camera)} ${money(r.camera.purchasePrice!, r.camera.purchaseCurrency)}`).join('; ')}</p>
              )}
              {untyped.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>{untyped.length} máy chưa nhận dạng được loại ({untyped.map((r) => fullName(r.camera)).join(', ')}). Sau khi nhập, lọc “Chưa phân loại” để chọn.</p>
              ) : (
                <p style={{ fontSize: 13, lineHeight: 1.45 }}>Đã nhận dạng loại cho cả {rows.length} máy: {[...new Set(rows.map((r) => TYPE_LABEL[r.camera.type]))].join(', ')}.</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn secondary" onClick={() => setPreview(null)}>Hủy</button>
              <button type="button" className="btn" style={{ flex: 1 }} disabled={busy || importN === 0} onClick={doImport}>Nhập {importN} máy</button>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </section>

      <section className="section px" aria-label="Xuất dữ liệu" style={{ gap: 12 }}>
        <h2 className="h-mono">XUẤT RA</h2>
        <Segmented label="Định dạng" value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV · bảng tính' }, { value: 'json', label: 'JSON · sao lưu' }]} />
        {fmt === 'csv' ? (
          <>
            <Segmented label="Phạm vi" value={scope} onChange={setScope} options={[{ value: 'owned', label: `Đang có · ${(cams ?? []).filter((c) => c.status === 'owned').length}` }, { value: 'all', label: `Tất cả · ${(cams ?? []).length}` }]} />
            <div className="rows" style={{ padding: 0 }}>
              <label className="check"><span>Kèm giá mua &amp; nơi mua</span><input type="checkbox" checked={incPurchase} onChange={(e) => setIncPurchase(e.target.checked)} /></label>
              <label className="check"><span>Kèm số serial</span><input type="checkbox" checked={incSerial} onChange={(e) => setIncSerial(e.target.checked)} /></label>
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Mở được bằng Excel, Google Sheets, Numbers. Nhập lại vào Kho máy cũng được.</p>
          </>
        ) : (
          <>
            <div className="rows" style={{ padding: 0 }}>
              <label className="check"><span>Kèm ảnh (file sẽ nặng hơn)</span><input type="checkbox" checked={incPhotos} onChange={(e) => setIncPhotos(e.target.checked)} /></label>
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Bản sao lưu đầy đủ: máy, lịch sử giá, nhật ký, cài đặt. Dùng để chuyển sang máy khác hoặc khôi phục khi cần.</p>
          </>
        )}
        <button type="button" className="btn" disabled={busy || !(cams ?? []).length} onClick={doExport}>
          {fmt === 'csv' ? `Xuất ${list.length} máy ra CSV` : 'Tạo bản sao lưu'}
        </button>
      </section>

      <p className="px muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
        Dữ liệu đang lưu ngay trên thiết bị này, chưa đồng bộ lên mạng. Thỉnh thoảng hãy tạo bản sao lưu JSON để phòng mất máy hoặc xóa trình duyệt.
      </p>
    </div>
  );
}
