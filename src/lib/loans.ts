import { db, patchCamera, uid, type Camera, type Loan } from '../db';
import { tx } from './i18n';

const DAY = 86400000;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

export function lendCamera(cam: Camera, l: Omit<Loan, 'id'>) {
  return patchCamera(cam.id, { loan: { ...l, id: uid(), to: l.to.trim(), note: l.note?.trim() || undefined } });
}

export function updateLoan(cam: Camera, l: Omit<Loan, 'id'>) {
  if (!cam.loan) return lendCamera(cam, l);
  return patchCamera(cam.id, { loan: { ...cam.loan, ...l, to: l.to.trim(), note: l.note?.trim() || undefined } });
}

export function returnCamera(cam: Camera, returnedAt = today()) {
  if (!cam.loan) return Promise.resolve();
  return patchCamera(cam.id, { loan: null, loanHistory: [{ ...cam.loan, returnedAt }, ...(cam.loanHistory ?? [])] });
}

/** Số ngày đã mượn, số ngày còn lại tới hẹn trả (âm = quá hạn) */
export function loanStatus(l: Loan) {
  const days = Math.max(0, Math.floor((Date.now() - at(l.since)) / DAY));
  const left = l.due ? Math.ceil((at(l.due) - at(today())) / DAY) : null;
  return { days, left, overdue: left != null && left < 0 };
}

export function loanLabel(l: Loan) {
  const s = loanStatus(l);
  const base = tx("{0} mượn {1}", l.to, s.days === 0 ? tx("hôm nay") : tx("{0} ngày", s.days));
  if (s.left == null) return base;
  if (s.left < 0) return tx("{0} · quá hẹn {1} ngày", base, -s.left);
  if (s.left === 0) return tx("{0} · hẹn trả hôm nay", base);
  return tx("{0} · còn {1} ngày", base, s.left);
}

/** Tên những người từng mượn (gợi ý khi nhập) */
export async function borrowerNames(): Promise<string[]> {
  const cams = await db.cameras.toArray();
  const names = cams.flatMap((c) => [c.loan?.to, ...(c.loanHistory ?? []).map((h) => h.to)]).filter(Boolean) as string[];
  return [...new Set(names)];
}

export function addDays(iso: string, n: number) {
  const d = new Date(at(iso) + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { today as todayLocal };
