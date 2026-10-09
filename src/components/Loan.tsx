import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Camera } from '../db';
import { fmtDate } from '../lib/format';
import { addDays, borrowerNames, lendCamera, loanLabel, loanStatus, returnCamera, todayLocal, updateLoan } from '../lib/loans';
import { toast } from '../lib/toast';
import { DateInput, Sheet } from './ui';

/** Phần "Cho mượn" trên trang máy */
export function LoanSection({ cam }: { cam: Camera }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = cam.loanHistory ?? [];
  const l = cam.loan;
  const st = l ? loanStatus(l) : null;

  const giveBack = async () => {
    if (!window.confirm(`${l!.to} đã trả ${cam.brand} ${cam.model}?`)) return;
    await returnCamera(cam);
    toast('Đã ghi nhận trả máy');
  };

  return (
    <section className="section px" style={{ gap: 10 }} aria-label="Cho mượn">
      <h2 className="h-mono">CHO MƯỢN</h2>
      {l ? (
        <div className={'loan-card' + (st?.overdue ? ' overdue' : '')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Đang cho {l.to} mượn</span>
            <span className="mono" style={{ fontSize: 12 }}>
              từ {fmtDate(l.since)} · {st!.days} ngày
              {l.due && <> · hẹn trả {fmtDate(l.due)}{st!.overdue ? ` (quá ${-st!.left!} ngày)` : st!.left === 0 ? ' (hôm nay)' : ` (còn ${st!.left} ngày)`}</>}
            </span>
            {l.note && <span style={{ fontSize: 13 }}>{l.note}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" style={{ flex: 1 }} onClick={giveBack}>Đã trả</button>
            <button type="button" className="btn small secondary" onClick={() => setOpen(true)}>Sửa</button>
          </div>
        </div>
      ) : (
        <button type="button" className="dashed" style={{ width: '100%', background: 'transparent', justifyContent: 'center', minHeight: 48 }} onClick={() => setOpen(true)}>
          Cho bạn mượn máy này
        </button>
      )}
      {history.length > 0 && (
        <>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowHistory((x) => !x)}>
            {showHistory ? 'Ẩn' : 'Xem'} {history.length} lần cho mượn trước
          </button>
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
    toast(cam.loan ? 'Đã lưu' : `Đã ghi: ${to.trim()} mượn ${cam.brand} ${cam.model}`);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={cam.loan ? 'Sửa thông tin mượn' : `Cho mượn ${cam.model}`}>
      <label className="field">Người mượn
        <input className="input" list="borrowers" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Tên bạn mượn" autoCapitalize="words" />
        <datalist id="borrowers">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="field">Ngày mượn<DateInput label="Ngày mượn" value={since} onChange={setSince} /></div>
      <div className="field">Hẹn trả (không bắt buộc)
        <div className="chips" style={{ padding: 0 }} role="group" aria-label="Hẹn trả nhanh">
          {[['3 ngày', 3], ['1 tuần', 7], ['2 tuần', 14], ['1 tháng', 30]].map(([label, n]) => (
            <button key={label} type="button" className={'chip' + (due === addDays(since || todayLocal(), n as number) ? ' on' : '')} onClick={() => setDue(addDays(since || todayLocal(), n as number))}>{label}</button>
          ))}
        </div>
        <DateInput label="Ngày hẹn trả" value={due} onChange={setDue} />
      </div>
      <label className="field">Ghi chú
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: kèm lens 50mm, 2 cuộn film, pin mới" />
      </label>
      <button type="button" className="btn" disabled={!to.trim()} onClick={save}>{cam.loan ? 'Lưu' : 'Cho mượn'}</button>
    </Sheet>
  );
}

export { loanLabel };
