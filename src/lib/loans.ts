import { db, patchCamera, uid, type Camera, type Loan } from '../db';

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
  const base = `${l.to} mượn ${s.days === 0 ? 'hôm nay' : `${s.days} ngày`}`;
  if (s.left == null) return base;
  if (s.left < 0) return `${base} · quá hẹn ${-s.left} ngày`;
  if (s.left === 0) return `${base} · hẹn trả hôm nay`;
  return `${base} · còn ${s.left} ngày`;
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
