import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import {
  REMIND_OPTIONS, applyRestore, buildBackup, canShareFile, downloadBackup, formatBytes, markBackedUp, readBackup,
  shareBackup, snoozeBackup, storageState, useBackupStatus, type BackupInfo, type RestorePlan, type StorageState
} from '../lib/backup';
import { toast } from '../lib/toast';
import { Segmented, Sheet } from './ui';
import { locale, tx } from '../lib/i18n';

const ago = (d: number | null) => (d == null ? tx("chưa lần nào") : d === 0 ? tx("hôm nay") : d === 1 ? tx("hôm qua") : tx("{0} ngày trước", d));
const dateVi = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Bảng tạo bản sao lưu: tạo file → lưu vào Tệp/iCloud (iPhone) hoặc tải về */
export function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<'building' | 'ready' | 'error'>('building');
  const [res, setRes] = useState<{ file: File; info: BackupInfo } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState('building'); setRes(null);
    buildBackup().then((r) => { if (alive) { setRes(r); setState('ready'); } }).catch((e) => { if (alive) { setErr(e instanceof Error ? e.message : tx("Lỗi")); setState('error'); } });
    return () => { alive = false; };
  }, [open]);

  const done = async () => {
    if (!res) return;
    await markBackedUp(res.info);
    toast(tx("Đã sao lưu"));
    onClose();
  };
  const share = async () => {
    if (!res) return;
    try { if (await shareBackup(res.file)) await done(); }
    catch { downloadBackup(res.file); await done(); }
  };
  const dl = async () => { if (res) { downloadBackup(res.file); await done(); } };
  const shareable = res ? canShareFile(res.file) : false;

  return (
    <Sheet open={open} onClose={onClose} title={tx("Sao lưu")}>
      {state === 'building' && <p className="muted" style={{ fontSize: 14 }}>{tx("Đang gom dữ liệu và ảnh…")}</p>}
      {state === 'error' && <p style={{ fontSize: 14, color: 'var(--danger, #e66)' }}>{tx("Không tạo được bản sao lưu:")}{' '}{err}</p>}
      {state === 'ready' && res && (
        <>
          <div className="backup-file">
            <span className="mono" style={{ fontSize: 13 }}>{res.file.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>{res.info.cameras} {' '}{tx("máy ·")}{' '}{res.info.photos} {' '}{tx("ảnh")}{res.info.wishlist ? ` · ${res.info.wishlist} wishlist` : ""} · {formatBytes(res.info.bytes)}</span>
          </div>
          {shareable ? (
            <>
              <button type="button" className="btn" onClick={share}>{tx("Lưu vào Tệp / iCloud Drive")}</button>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Trong bảng chia sẻ, chọn")}{' '}<b>{tx("Lưu vào Tệp")}</b> {' '}{tx("rồi chọn một thư mục trên iCloud Drive. Lưu ở iCloud thì mất máy vẫn còn bản sao.")}</p>
              <button type="button" className="btn secondary" onClick={dl}>{tx("Tải file về")}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={dl}>{tx("Tải file sao lưu")}</button>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Nên chép file sang nơi khác (Google Drive, iCloud, máy tính) để phòng mất thiết bị.")}</p>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Mục Sao lưu trên trang Nhập / Xuất */
export function BackupPanel() {
  const status = useBackupStatus();
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState<StorageState | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => { storageState().then(setStore); }, [open]);

  const onFile = async (f?: File) => {
    if (!f) return;
    try { setPlan(await readBackup(f)); } catch (e) { toast(e instanceof Error ? e.message : tx("Không đọc được file")); }
  };
  const restore = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await applyRestore(plan);
      const parts = [r.added && tx("thêm {0} máy", r.added), r.updated && tx("cập nhật {0}", r.updated), r.photos && tx("{0} ảnh", r.photos)].filter(Boolean);
      toast(parts.length ? tx("Đã khôi phục: {0}", parts.join(', ')) : tx("Dữ liệu trên máy đã đầy đủ, không cần khôi phục gì"));
      setPlan(null);
      nav('/');
    } catch (e) { toast(e instanceof Error ? e.message : tx("Lỗi khi khôi phục")); }
    finally { setBusy(false); }
  };

  const every = status?.everyDays ?? 14;
  return (
    <section className="section px" aria-label={tx("Sao lưu")} style={{ gap: 12 }}>
      <h2 className="h-mono">{tx("SAO LƯU")}</h2>
      <div className="rows">
        <div><span>{tx("Lần sao lưu gần nhất")}</span><span className={'mono' + (status?.due ? ' warn' : ' muted')} style={{ fontSize: 13 }}>{status ? ago(status.daysSince) : '…'}</span></div>
        {status?.last && <div><span>{tx("Bản đó gồm")}</span><span className="mono muted" style={{ fontSize: 13 }}>{status.last.cameras} {' '}{tx("máy ·")}{' '}{status.last.photos} {' '}{tx("ảnh")}</span></div>}
        <div><span>{tx("Thay đổi chưa sao lưu")}</span><span className="mono muted" style={{ fontSize: 13 }}>{status ? (status.changed ? tx("có") : tx("không")) : '…'}</span></div>
        <div>
          <span>{tx("Chống tự xoá dữ liệu")}</span>
          <span className="mono muted" style={{ fontSize: 13 }}>{store?.persisted == null ? tx("không rõ") : store.persisted ? tx("đã bật") : tx("chưa được cấp")}</span>
        </div>
        {store?.usage != null && <div><span>{tx("Dung lượng đang dùng")}</span><span className="mono muted" style={{ fontSize: 13 }}>{formatBytes(store.usage)}</span></div>}
      </div>
      <button type="button" className="btn" onClick={() => setOpen(true)}>{tx("Sao lưu ngay · kèm ảnh")}</button>
      <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>{tx("Khôi phục từ file sao lưu")}</button>
      <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="field" style={{ gap: 8 }}>{tx("Nhắc sao lưu khi có thay đổi")}<Segmented<string> label={tx("Nhắc sao lưu")} value={String(every)} onChange={(v) => db.settings.put({ key: 'backupEvery', value: Number(v) })}
          options={REMIND_OPTIONS.map((d) => ({ value: String(d), label: d ? tx("{0} ngày", d) : tx("Tắt") }))} />
      </div>
      {store?.persisted === false && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tx("Trình duyệt chưa cam kết giữ dữ liệu lâu dài. Trên iPhone, hãy mở app từ biểu tượng ngoài màn hình chính (“Thêm vào Màn hình chính”) thay vì từ Safari, và sao lưu đều đặn.")}</p>
      )}
      <BackupSheet open={open} onClose={() => setOpen(false)} />
      <Sheet open={!!plan} onClose={() => setPlan(null)} title={tx("Khôi phục")}>
        {plan && (
          <>
            <div className="backup-file">
              <span style={{ fontSize: 14 }}>{tx("Bản sao lưu ngày")}{' '}{dateVi(plan.exportedAt)}</span>
              <span className="muted" style={{ fontSize: 12 }}>{plan.cameras} {' '}{tx("máy ·")}{' '}{plan.photos} {' '}{tx("ảnh")}</span>
            </div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{tx("Máy chưa có sẽ được thêm vào. Máy đã có thì giữ bản nào sửa gần đây hơn. Không xoá gì trên máy này.")}</p>
            <button type="button" className="btn" disabled={busy} onClick={restore}>{busy ? tx("Đang khôi phục…") : tx("Khôi phục")}</button>
          </>
        )}
      </Sheet>
    </section>
  );
}

/** Lời nhắc trên trang Kho máy khi đã lâu chưa sao lưu mà dữ liệu có thay đổi */
export function BackupReminder() {
  const status = useBackupStatus();
  const [open, setOpen] = useState(false);
  if (!status?.due && !open) return null;
  return (
    <>
      {status?.due && (
        <div className="backup-nudge px" role="status">
          <div className="backup-nudge-card">
            <span style={{ fontSize: 14 }}>{status.last ? tx("Đã {0} ngày chưa sao lưu", status.daysSince) : tx("Bạn chưa sao lưu lần nào")}</span>
            <span className="muted" style={{ fontSize: 12 }}>{tx("Dữ liệu và ảnh chỉ đang nằm trên máy này.")}</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" className="pill-btn on" onClick={() => setOpen(true)}>{tx("Sao lưu")}</button>
              <button type="button" className="pill-btn" onClick={() => snoozeBackup(3)}>{tx("Để sau")}</button>
            </div>
          </div>
        </div>
      )}
      <BackupSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
