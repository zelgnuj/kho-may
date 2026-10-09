import { useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import type { Session } from '@supabase/supabase-js';
import { db, type SyncMeta, type Camera, type Photo, type PricePoint, type Roll, type ServiceEntry, type WishItem } from '../db';
import { supabase } from './supabase';

/* ======================================================================
 * Đồng bộ local-first với Supabase
 *
 * - Dữ liệu chính vẫn nằm trong IndexedDB trên máy; app chạy được khi mất mạng.
 * - Mỗi bản ghi có "phiên bản" (thời điểm sửa). syncMeta nhớ phiên bản đã đồng bộ.
 * - Mỗi lần đồng bộ: KÉO thay đổi mới từ máy chủ trước, rồi ĐẨY những gì khác syncMeta.
 * - Bản ghi có trong syncMeta mà không còn trên máy → đã bị xoá → gửi "bia mộ".
 * - Xung đột: bản nào sửa sau thì thắng (máy chủ cũng kiểm tra điều này).
 * - Ảnh: tệp lưu ở Storage (photos/{user}/{id}), bản ghi chỉ chứa thông tin.
 * ====================================================================== */

type Kind = 'camera' | 'price' | 'service' | 'photo' | 'wish' | 'roll' | 'setting';

/** Cài đặt được đồng bộ giữa các thiết bị (mã bí mật & bộ đệm thì không) */
const SYNCED_SETTINGS = ['ownerName', 'accent', 'defaultView', 'rates', 'autoPrice', 'autoPriceDays', 'autoBudget', 'monthlyQuota', 'contribName', 'backupEvery'];

interface RemoteRow { kind: Kind; id: string; data: unknown; updated_at: number; deleted: boolean; server_ts: string }

const hash = (v: unknown) => {
  const s = JSON.stringify(v) ?? '';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
};

/* ---------- Trạng thái ---------- */

export interface SyncState { session: Session | null; ready: boolean; running: boolean; lastAt: number | null; error: string | null; detail: string }
let state: SyncState = { session: null, ready: false, running: false, lastAt: null, error: null, detail: '' };
const listeners = new Set<() => void>();
const emit = (p: Partial<SyncState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useSync() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export const syncState = () => state;

/* ---------- Đọc dữ liệu trên máy theo từng loại ---------- */

interface Local { id: string; ver: string; updated_at: number; data: unknown; deleted: boolean }

async function localRows(kind: Kind): Promise<Local[]> {
  switch (kind) {
    case 'camera': return (await db.cameras.toArray()).map((c) => ({ id: c.id, ver: String(c.updatedAt), updated_at: c.updatedAt, data: c, deleted: !!c.deletedAt }));
    case 'wish': return (await db.wishlist.toArray()).map((w) => ({ id: w.id, ver: String(w.updatedAt), updated_at: w.updatedAt, data: w, deleted: !!w.deletedAt }));
    case 'roll': return (await db.rolls.toArray()).map((r) => ({ id: r.id, ver: String(r.updatedAt), updated_at: r.updatedAt, data: r, deleted: !!r.deletedAt }));
    case 'price': return (await db.prices.toArray()).map((p) => ({ id: p.id, ver: String(p.date), updated_at: p.date, data: p, deleted: false }));
    case 'service': return (await db.service.toArray()).map((s) => ({ id: s.id, ver: String(s.createdAt), updated_at: s.createdAt, data: s, deleted: false }));
    case 'photo': {
      // không đọc blob ở đây cho nhẹ; chỉ khoá + thời điểm
      const rows: Local[] = [];
      await db.photos.each((p) => { rows.push({ id: p.id, ver: String(p.createdAt), updated_at: p.createdAt, data: { id: p.id, cameraId: p.cameraId, createdAt: p.createdAt, type: p.blob?.type || 'image/jpeg' }, deleted: false }); });
      return rows;
    }
    case 'setting': {
      const all = await db.settings.where('key').anyOf(SYNCED_SETTINGS).toArray();
      return all.map((s) => ({ id: s.key, ver: hash(s.value), updated_at: 0, data: { value: s.value }, deleted: false }));
    }
  }
}

/** Một bản ghi trên máy theo id (dùng khi áp dữ liệu kéo về) */
async function localOne(kind: Kind, id: string): Promise<Local | undefined> {
  switch (kind) {
    case 'camera': { const c = await db.cameras.get(id); return c && { id, ver: String(c.updatedAt), updated_at: c.updatedAt, data: c, deleted: !!c.deletedAt }; }
    case 'wish': { const w = await db.wishlist.get(id); return w && { id, ver: String(w.updatedAt), updated_at: w.updatedAt, data: w, deleted: !!w.deletedAt }; }
    case 'roll': { const r = await db.rolls.get(id); return r && { id, ver: String(r.updatedAt), updated_at: r.updatedAt, data: r, deleted: !!r.deletedAt }; }
    case 'price': { const p = await db.prices.get(id); return p && { id, ver: String(p.date), updated_at: p.date, data: p, deleted: false }; }
    case 'service': { const v = await db.service.get(id); return v && { id, ver: String(v.createdAt), updated_at: v.createdAt, data: v, deleted: false }; }
    case 'photo': { const n = await db.photos.where('id').equals(id).count(); if (!n) return undefined; const p = (await db.photos.get(id))!; return { id, ver: String(p.createdAt), updated_at: p.createdAt, data: null, deleted: false }; }
    case 'setting': { const st = await db.settings.get(id); return st && { id, ver: hash(st.value), updated_at: 0, data: { value: st.value }, deleted: false }; }
  }
}

const KINDS: Kind[] = ['setting', 'camera', 'wish', 'roll', 'price', 'service', 'photo'];

/* ---------- Kéo ---------- */

async function pull(uid: string) {
  const cursorRow = await db.settings.get('syncCursor');
  let cursor = (cursorRow?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  // lùi 2 phút để không lỡ các dòng được ghi đồng thời
  const since = new Date(new Date(cursor).getTime() - 120000).toISOString();
  let from = 0;
  const PAGE = 500;
  let applied = 0;
  for (;;) {
    const { data, error } = await supabase.from('records').select('kind,id,data,updated_at,deleted,server_ts')
      .gt('server_ts', since).order('server_ts', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteRow[];
    for (const r of rows) {
      if (await applyRemote(uid, r)) applied++;
      if (r.server_ts > cursor) cursor = r.server_ts;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
    emit({ detail: `Đang tải về… ${from}` });
  }
  await db.settings.put({ key: 'syncCursor', value: cursor });
  return applied;
}

/** Áp một bản ghi từ máy chủ nếu nó mới hơn bản trên máy. Trả về true nếu có thay đổi. */
async function applyRemote(uid: string, r: RemoteRow): Promise<boolean> {
  const metaKey: [string, string] = [r.kind, r.id];
  const meta = await db.syncMeta.get(metaKey);
  const local = await localOne(r.kind, r.id);

  if (r.kind === 'setting') {
    const value = (r.data as { value: unknown }).value;
    // máy này đã sửa cài đặt sau lần đồng bộ trước → giữ bản trên máy (sẽ được đẩy lên)
    if (local && meta && local.ver !== meta.ver) return false;
    const changed = local?.ver !== hash(value);
    if (changed) await db.settings.put({ key: r.id, value });
    await db.syncMeta.put({ kind: r.kind, id: r.id, ver: hash(value) });
    return changed;
  }

  // máy này đã xoá bản ghi (chưa kịp gửi bia mộ) và máy chủ không có bản mới hơn → giữ trạng thái đã xoá
  if (!local && meta && r.updated_at <= Number(meta.ver)) return false;

  if (r.deleted) {
    // bia mộ: xoá trên máy nếu máy chưa sửa sau thời điểm xoá
    if (local && local.updated_at > r.updated_at) return false;
    if (local) await tableFor(r.kind).delete(r.id);
    await db.syncMeta.delete(metaKey);
    return !!local;
  }
  if (local && local.updated_at >= r.updated_at) {
    if (!meta && local.updated_at === r.updated_at) await db.syncMeta.put({ kind: r.kind, id: r.id, ver: local.ver });
    return false;
  }
  if (r.kind === 'photo') {
    const d = r.data as { id: string; cameraId: string; createdAt: number; type?: string };
    const { data: blob, error } = await supabase.storage.from('photos').download(`${uid}/${d.id}`);
    if (error || !blob) return false; // ảnh chưa tải lên xong; lần sau thử lại
    await db.photos.put({ id: d.id, cameraId: d.cameraId, createdAt: d.createdAt, blob: blob.type ? blob : new Blob([blob], { type: d.type || 'image/jpeg' }) } as Photo);
  } else {
    await tableFor(r.kind).put(r.data as never);
  }
  await db.syncMeta.put({ kind: r.kind, id: r.id, ver: String(r.updated_at) });
  return true;
}

function tableFor(kind: Kind) {
  switch (kind) {
    case 'camera': return db.cameras as unknown as typeof db.cameras;
    case 'wish': return db.wishlist as unknown as typeof db.cameras;
    case 'roll': return db.rolls as unknown as typeof db.cameras;
    case 'price': return db.prices as unknown as typeof db.cameras;
    case 'service': return db.service as unknown as typeof db.cameras;
    case 'photo': return db.photos as unknown as typeof db.cameras;
    default: throw new Error(kind);
  }
}

/* ---------- Đẩy ---------- */

async function push(uid: string) {
  let pushed = 0;
  for (const kind of KINDS) {
    const rows = await localRows(kind);
    const metas = new Map((await db.syncMeta.where('kind').equals(kind).toArray()).map((m) => [m.id, m]));
    const out: { kind: Kind; id: string; data: unknown; updated_at: number; deleted: boolean }[] = [];
    const newMeta: SyncMeta[] = [];
    const now = Date.now();
    for (const r of rows) {
      const m = metas.get(r.id);
      metas.delete(r.id);
      if (m?.ver === r.ver) continue;
      const updated = kind === 'setting' ? now : r.updated_at;
      if (kind === 'photo') {
        const p = await db.photos.get(r.id);
        if (!p?.blob) continue;
        const { error } = await supabase.storage.from('photos').upload(`${uid}/${r.id}`, p.blob, { upsert: true, contentType: p.blob.type || 'image/jpeg' });
        if (error && !/exists/i.test(error.message)) throw new Error(`Tải ảnh lên: ${error.message}`);
      }
      out.push({ kind, id: r.id, data: r.data, updated_at: updated, deleted: r.deleted });
      newMeta.push({ kind, id: r.id, ver: r.ver });
    }
    // còn trong syncMeta nhưng không còn trên máy → đã xoá
    for (const m of metas.values()) {
      out.push({ kind, id: m.id, data: {}, updated_at: Date.now(), deleted: true });
      if (kind === 'photo') await supabase.storage.from('photos').remove([`${uid}/${m.id}`]);
    }
    for (let i = 0; i < out.length; i += 200) {
      const chunk = out.slice(i, i + 200);
      const { error } = await supabase.rpc('sync_push', { rows: chunk });
      if (error) throw new Error(error.message);
      emit({ detail: `Đang tải lên… ${pushed + i + chunk.length}` });
    }
    pushed += out.length;
    if (newMeta.length) await db.syncMeta.bulkPut(newMeta);
    const gone = [...metas.keys()].map((id) => [kind, id] as [string, string]);
    if (gone.length) await db.syncMeta.bulkDelete(gone);
  }
  return pushed;
}

/* ---------- Điều phối ---------- */

let pending = false;
let blocked = false;

export async function syncNow(): Promise<void> {
  const session = state.session;
  if (!session || !navigator.onLine || blocked) return;
  if (state.running) { pending = true; return; }
  emit({ running: true, error: null, detail: '' });
  try {
    const uid = session.user.id;
    const owner = (await db.settings.get('syncUser'))?.value;
    if (owner && owner !== uid) {
      // Dữ liệu trên máy thuộc tài khoản khác (đã lưu trên tài khoản đó) → dọn sạch rồi tải dữ liệu của tài khoản này.
      // Chỉ dữ liệu CHƯA từng gắn với tài khoản nào (dùng app trước khi đăng nhập) mới được đưa lên tài khoản mới.
      await clearAccountData();
    }
    await db.settings.put({ key: 'syncUser', value: uid });
    await pull(uid);
    await push(uid);
    emit({ lastAt: Date.now(), detail: '' });
    await db.settings.put({ key: 'syncLastAt', value: Date.now() });
  } catch (e) {
    emit({ error: e instanceof Error ? e.message : 'Lỗi đồng bộ' });
  } finally {
    emit({ running: false });
    if (pending) { pending = false; setTimeout(() => { syncNow(); }, 500); }
  }
}

let debounce: number | undefined;
export function scheduleSync(ms = 4000) {
  if (!state.session) return;
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => { syncNow(); }, ms);
}

/** Gọi một lần khi mở app */
export async function startSync() {
  const last = (await db.settings.get('syncLastAt'))?.value as number | undefined;
  emit({ lastAt: last ?? null });
  const { data } = await supabase.auth.getSession();
  emit({ session: data.session, ready: true });
  supabase.auth.onAuthStateChange((event, session) => {
    emit({ session });
    if (event === 'SIGNED_IN') syncNow();
  });
  if (data.session) syncNow();

  // dữ liệu trên máy đổi → đồng bộ sau vài giây (bỏ qua thay đổi do chính bộ đồng bộ ghi)
  let first = true;
  liveQuery(async () => {
    const [c, w, r, p, s, ph, st] = await Promise.all([
      db.cameras.toArray(), db.wishlist.toArray(), db.rolls.toArray(), db.prices.count(), db.service.count(), db.photos.count(),
      db.settings.where('key').anyOf(SYNCED_SETTINGS).toArray()
    ]);
    const mx = (xs: { updatedAt: number }[]) => xs.reduce((m, x) => Math.max(m, x.updatedAt ?? 0), 0);
    return `${c.length}:${mx(c)}:${w.length}:${mx(w)}:${r.length}:${mx(r)}:${p}:${s}:${ph}:${hash(st)}`;
  }).subscribe(() => {
    if (first) { first = false; return; }
    if (!state.running) scheduleSync();
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(800); });
  window.addEventListener('online', () => scheduleSync(800));
  window.setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60 * 1000);
}

/* ---------- Đăng nhập bằng email + mật khẩu ---------- */

const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://kho-may.vercel.app';

function authError(msg: string): Error {
  if (/invalid login credentials/i.test(msg)) return new Error('Sai email hoặc mật khẩu');
  if (/email not confirmed/i.test(msg)) return new Error('Email chưa được xác nhận — mở thư xác nhận Supabase gửi, bấm link, rồi đăng nhập lại');
  if (/already registered|already exists/i.test(msg)) return new Error('Email này đã có tài khoản — chuyển sang Đăng nhập');
  if (/password should be|at least 6/i.test(msg)) return new Error('Mật khẩu cần ít nhất 6 ký tự');
  if (/not authorized/i.test(msg)) return new Error('Máy chủ chưa gửi được thư tới email này (hiện chỉ gửi tới email của tài khoản Supabase quản lý app)');
  if (/rate|seconds|too many/i.test(msg)) return new Error('Thao tác hơi nhiều — đợi một chút rồi thử lại');
  return new Error(msg);
}

/** Tạo tài khoản. Trả về true nếu cần xác nhận email trước khi đăng nhập. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${SITE}/xac-nhan` } });
  if (error) throw authError(error.message);
  // Supabase trả user không có identities khi email đã tồn tại (để không lộ thông tin)
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw authError('already registered');
  return !data.session;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authError(error.message);
}

export async function sendReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE}/dat-lai-mat-khau` });
  if (error) throw authError(error.message);
}

/** Trang mở từ link trong email (Safari): đọc phiên từ #access_token… */
export async function sessionFromUrlHash(): Promise<{ ok: boolean; type: string | null; error: string | null }> {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const q = new URLSearchParams(window.location.search);
  const err = h.get('error_description') || q.get('error_description');
  if (err) return { ok: false, type: null, error: err.replace(/\+/g, ' ') };
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  if (!access_token || !refresh_token) return { ok: false, type: null, error: null };
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  history.replaceState(null, '', window.location.pathname);
  return { ok: !error, type: h.get('type'), error: error?.message ?? null };
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authError(error.message);
}

/** Xoá toàn bộ dữ liệu thuộc tài khoản trên máy (máy, ảnh, giá, nhật ký, wishlist, cuộn film, cài đặt đồng bộ) */
async function clearAccountData() {
  await Promise.all([
    db.cameras.clear(), db.photos.clear(), db.thumbs.clear(), db.prices.clear(), db.service.clear(), db.wishlist.clear(), db.rolls.clear(),
    db.syncMeta.clear(), db.settings.bulkDelete(['syncCursor', 'syncLastAt', 'lastBackup', ...SYNCED_SETTINGS])
  ]);
}

/**
 * Đăng xuất.
 * - Giữ dữ liệu: đồng bộ lần cuối, dữ liệu trên máy vẫn gắn với tài khoản này. Đăng nhập lại đúng tài khoản thì dùng tiếp;
 *   đăng nhập tài khoản KHÁC thì dữ liệu này được dọn khỏi máy (vẫn còn nguyên trên tài khoản cũ).
 * - Xoá dữ liệu: dọn sạch máy.
 */
export async function signOut(wipeLocal: boolean) {
  if (!wipeLocal && state.session && navigator.onLine) {
    await syncNow();
    while (state.running) await new Promise((r) => setTimeout(r, 100));
  }
  blocked = true;
  window.clearTimeout(debounce);
  try {
    while (state.running) await new Promise((r) => setTimeout(r, 100));
    try { await supabase.auth.signOut(); } catch { /* mất mạng vẫn đăng xuất trên máy */ }
    if (wipeLocal) {
      await clearAccountData();
      await db.settings.delete('syncUser');
    }
  } finally {
    blocked = false;
  }
  emit({ session: null, lastAt: null, error: null });
}

/**
 * Xoá dữ liệu trên máy mà KHÔNG xoá trên tài khoản (lần đồng bộ sau sẽ tải lại).
 * Chặn đồng bộ trong lúc xoá để không bao giờ gửi nhầm "đã xoá tất cả" lên máy chủ.
 */
export async function wipeLocalKeepCloud(clearTables: () => Promise<unknown>) {
  blocked = true;
  window.clearTimeout(debounce);
  try {
    while (state.running) await new Promise((r) => setTimeout(r, 100));
    await db.syncMeta.clear();
    await db.settings.delete('syncCursor');
    await clearTables();
  } finally {
    blocked = false;
  }
  if (state.session) scheduleSync(300);
}

export type { Camera, PricePoint, ServiceEntry, WishItem, Roll };
