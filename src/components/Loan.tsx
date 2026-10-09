import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Camera } from '../db';
import { fmtDate } from '../lib/format';
import { addDays, borrowerNames, lendCamera, loanLabel, loanStatus, returnCamera, todayLocal, updateLoan } from '../lib/loans';
import { toast } from '../lib/toast';
import { DateInput, Sheet } from './ui';
import { tx } from '../lib/i18n';

/** Phần "Cho mượn" trên trang máy */
export function LoanSection({ cam }: { cam: Camera }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = cam.loanHistory ?? [];
  const l = cam.loan;
  const st = l ? loanStatus(l) : null;

  const giveBack = async () => {
    if (!window.confirm(tx("{0} đã trả {1} {2}?", l!.to, cam.brand, cam.model))) return;
    await returnCamera(cam);
    toast(tx("Đã ghi nhận trả máy"));
  };

  return (
    <section className="section px" style={{ gap: 10 }} aria-label={tx("Cho mượn")}>
      <h2 className="h-mono">{tx("CHO MƯỢN")}</h2>
      {l ? (
        <div className={'loan-card' + (st?.overdue ? ' overdue' : '')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{tx("Đang cho")}{' '}{l.to} {' '}{tx("mượn")}</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {tx("từ")}{' '}{fmtDate(l.since)} · {st!.days} {' '}{tx("ngày")}{l.due && <> {' '}{tx("· hẹn trả")}{' '}{fmtDate(l.due)}{st!.overdue ? tx(" (quá {0} ngày)", -st!.left!) : st!.left === 0 ? tx(" (hôm nay)") : tx(" (còn {0} ngày)", st!.left)}</>}
            </span>
            {l.note && <span style={{ fontSize: 13 }}>{l.note}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" style={{ flex: 1 }} onClick={giveBack}>{tx("Đã trả")}</button>
            <button type="button" className="btn small secondary" onClick={() => setOpen(true)}>{tx("Sửa")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="dashed" style={{ width: '100%', background: 'transparent', justifyContent: 'center', minHeight: 48 }} onClick={() => setOpen(true)}>
          {tx("Cho bạn mượn máy này")}</button>
      )}
      {history.length > 0 && (
        <>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowHistory((x) => !x)}>
            {showHistory ? tx("Ẩn") : tx("Xem")} {history.length} {' '}{tx("lần cho mượn trước")}</button>
          {showHistory && (
            <div className="rows">
              {history.map((h) => (
                <div key={h.id}>
                  <span>{h.to}{h.note ? <span className="muted" style={{ fontSize: 12 }}> · {h.note}</span> : null}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>{fmtDate(h.since)} → {fmtDate(h.returnedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <LoanSheet open={open} onClose={() => setOpen(false)} cam={cam} />
    </section>
  );
}

export function LoanSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const names = useLiveQuery(() => borrowerNames(), []) ?? [];
  const [to, setTo] = useState('');
  const [since, setSince] = useState(todayLocal());
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setTo(cam.loan?.to ?? ''); setSince(cam.loan?.since ?? todayLocal()); setDue(cam.loan?.due ?? ''); setNote(cam.loan?.note ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!to.trim()) return;
    const data = { to, since: since || todayLocal(), due: due || undefined, note };
    if (cam.loan) await updateLoan(cam, data); else await lendCamera(cam, data);
    toast(cam.loan ? tx("Đã lưu") : tx("Đã ghi: {0} mượn {1} {2}", to.trim(), cam.brand, cam.model));
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={cam.loan ? tx("Sửa thông tin mượn") : tx("Cho mượn {0}", cam.model)}>
      <label className="field">{tx("Người mượn")}<input className="input" list="borrowers" value={to} onChange={(e) => setTo(e.target.value)} placeholder={tx("Tên bạn mượn")} autoCapitalize="words" />
        <datalist id="borrowers">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="field">{tx("Ngày mượn")}<DateInput label={tx("Ngày mượn")} value={since} onChange={setSince} /></div>
      <div className="field">{tx("Hẹn trả (không bắt buộc)")}<div className="chips" style={{ padding: 0 }} role="group" aria-label={tx("Hẹn trả nhanh")}>
          {[[tx("3 ngày"), 3], [tx("1 tuần"), 7], [tx("2 tuần"), 14], [tx("1 tháng"), 30]].map(([label, n]) => (
            <button key={label} type="button" className={'chip' + (due === addDays(since || todayLocal(), n as number) ? ' on' : '')} onClick={() => setDue(addDays(since || todayLocal(), n as number))}>{label}</button>
          ))}
        </div>
        <DateInput label={tx("Ngày hẹn trả")} value={due} onChange={setDue} />
      </div>
      <label className="field">{tx("Ghi chú")}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("vd: kèm lens 50mm, 2 cuộn film, pin mới")} />
      </label>
      <button type="button" className="btn" disabled={!to.trim()} onClick={save}>{cam.loan ? tx("Lưu") : tx("Cho mượn")}</button>
    </Sheet>
  );
}

export { loanLabel };
