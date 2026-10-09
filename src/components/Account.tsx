import { useEffect, useState } from 'react';
import { db, setSetting, useSettings } from '../db';
import { sendReset, sessionFromUrlHash, setNewPassword, signIn, signOut, signUp, syncNow, useSync } from '../lib/sync';
import { Segmented } from './ui';
import { toast } from '../lib/toast';
import { SubPage } from './SubPage';
import { locale, tx } from '../lib/i18n';

export function agoLabel(ts: number | null) {
  if (!ts) return tx("chưa");
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return tx("vừa xong");
  if (s < 3600) return tx("{0} phút trước", Math.round(s / 60));
  if (s < 86400) return tx("{0} giờ trước", Math.round(s / 3600));
  return tx("{0} ngày trước", Math.round(s / 86400));
}

/** Nhãn ngắn cho dòng Tài khoản ở trang Cài đặt */
export function accountLabel(sync: ReturnType<typeof useSync>) {
  if (!sync.ready) return '…';
  if (!sync.session) return tx("Chưa đăng nhập");
  if (sync.running) return tx("Đang đồng bộ…");
  if (sync.error) return tx("Lỗi đồng bộ");
  return tx("Đồng bộ {0}", agoLabel(sync.lastAt));
}

export function AccountPage() {
  const sync = useSync();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const out = async (wipe: boolean) => {
    const msg = wipe
      ? tx("Đăng xuất và XOÁ dữ liệu trên máy này? Dữ liệu vẫn còn trên tài khoản, đăng nhập lại sẽ tải về.")
      : tx("Đăng xuất? Dữ liệu vẫn nằm trên máy và vẫn thuộc tài khoản này — đăng nhập lại là dùng tiếp. Nếu đăng nhập tài khoản khác, dữ liệu này sẽ được dọn khỏi máy (vẫn còn trên tài khoản cũ).");
    if (!window.confirm(msg)) return;
    await signOut(wipe);
    toast(tx("Đã đăng xuất"));
  };

  if (sync.session) {
    const counts = <Counts key={sync.lastAt ?? 0} />;
    return (
      <SubPage title={tx("Tài khoản")}>
        <section className="section px" style={{ gap: 12 }}>
          <NameField />
          <div className="rows">
            <div><span>Email</span><span className="muted" style={{ fontSize: 13 }}>{sync.session.user.email}</span></div>
            <div><span>{tx("Đồng bộ lần cuối")}</span><span className={'mono ' + (sync.error ? 'down' : 'muted')} style={{ fontSize: 13 }}>{sync.running ? tx("đang chạy…") : agoLabel(sync.lastAt)}</span></div>
            {counts}
          </div>
          {sync.error && <p className="down" style={{ fontSize: 13, lineHeight: 1.5 }}>{tx("Lỗi:")}{' '}{sync.error}</p>}
          {sync.detail && <p className="muted" style={{ fontSize: 12 }}>{sync.detail}</p>}
          <button type="button" className="btn" disabled={sync.running} onClick={() => syncNow()}>{sync.running ? tx("Đang đồng bộ…") : tx("Đồng bộ ngay")}</button>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            {tx("Dữ liệu vẫn nằm trên máy để dùng khi mất mạng; mỗi khi có thay đổi app tự đồng bộ lên tài khoản sau vài giây. Đăng nhập cùng email trên máy khác là thấy đủ máy, ảnh, wishlist, nhật ký film.")}</p>
        </section>
        <section className="section px" style={{ gap: 10 }}>
          <h2 className="h-mono">{tx("ĐĂNG XUẤT")}</h2>
          <button type="button" className="btn secondary" onClick={() => out(false)}>{tx("Đăng xuất, giữ dữ liệu trên máy")}</button>
          <button type="button" className="btn danger" onClick={() => out(true)}>{tx("Đăng xuất và xoá dữ liệu trên máy này")}</button>
        </section>
      </SubPage>
    );
  }

  return (
    <SubPage title={tx("Tài khoản")}>
      <section className="section px" style={{ gap: 12 }}>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {tx("Đăng nhập để dữ liệu được lưu vào tài khoản: không lo mất khi đổi điện thoại, và dùng được trên nhiều máy.")}</p>
        <AuthForm />
      </section>
    </SubPage>
  );
}

/** Ô đăng nhập / tạo tài khoản (dùng ở màn chào và trang Tài khoản) */
export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const mail = email.trim().toLowerCase();
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
  const submit = async () => {
    if (!okEmail) { setErr(tx("Email chưa đúng")); return; }
    if (password.length < 6) { setErr(tx("Mật khẩu cần ít nhất 6 ký tự")); return; }
    setBusy(true); setErr(''); setInfo('');
    try {
      if (mode === 'up') {
        const needConfirm = await signUp(mail, password);
        if (needConfirm) {
          setMode('in');
          setInfo(tx("Đã gửi thư xác nhận tới {0}. Mở thư, bấm link xác nhận (mở trong Safari cũng được), rồi quay lại đây bấm Đăng nhập.", mail));
        } else toast(tx("Đã tạo tài khoản · đang đồng bộ"));
      } else {
        await signIn(mail, password);
        toast(tx("Đã đăng nhập · đang đồng bộ"));
      }
    } catch (x) { setErr(x instanceof Error ? x.message : tx("Không thực hiện được")); }
    finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!okEmail) { setErr(tx("Nhập email trước, rồi bấm Quên mật khẩu")); return; }
    setBusy(true); setErr(''); setInfo('');
    try { await sendReset(mail); setInfo(tx("Đã gửi link đặt lại mật khẩu tới {0}. Mở link, đặt mật khẩu mới, rồi quay lại app đăng nhập.", mail)); }
    catch (x) { setErr(x instanceof Error ? x.message : tx("Không gửi được")); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-form">
        <Segmented<'in' | 'up'> label={tx("Đăng nhập hoặc tạo tài khoản")} value={mode} onChange={(v) => { setMode(v); setErr(''); }}
        options={[{ value: 'in', label: tx("Đăng nhập") }, { value: 'up', label: tx("Tạo tài khoản") }]} />
      <label className="field">Email
        <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="ban@gmail.com" />
      </label>
      <label className="field">{tx("Mật khẩu")}<div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} type={show ? 'text' : 'password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={mode === 'up' ? tx("Ít nhất 6 ký tự") : ''} />
          <button type="button" className="btn small secondary" onClick={() => setShow((x) => !x)}>{show ? tx("Ẩn") : tx("Hiện")}</button>
        </div>
      </label>
      <button type="button" className="btn" disabled={busy || !email.trim() || !password} onClick={submit}>
        {busy ? tx("Đang xử lý…") : mode === 'up' ? tx("Tạo tài khoản") : tx("Đăng nhập")}
      </button>
      {mode === 'in' && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} disabled={busy} onClick={forgot}>{tx("Quên mật khẩu?")}</button>}
      {err && <p className="down" style={{ fontSize: 13, lineHeight: 1.5 }}>{err}</p>}
      {info && <p className="info-box">{info}</p>}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>{tx("Dữ liệu đang có trên máy này sẽ được đưa lên tài khoản ngay sau khi đăng nhập.")}</p>
    </div>
  );
}

/** Trang mở từ link trong email (thường là Safari): xác nhận tài khoản / đặt lại mật khẩu */
export function AuthLanding({ kind }: { kind: 'confirm' | 'reset' }) {
  const [state, setState] = useState<'loading' | 'ok' | 'form' | 'done' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sessionFromUrlHash().then((r) => {
      if (r.error) { setState('error'); setMsg(r.error); return; }
      if (kind === 'reset') setState(r.ok ? 'form' : 'error');
      else setState('ok');
      if (!r.ok && kind === 'reset') setMsg(tx("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Gửi lại link từ app."));
    });
  }, [kind]);
  const save = async () => {
    setBusy(true);
    try { await setNewPassword(pw); await signOut(false); setState('done'); }
    catch (x) { setMsg(x instanceof Error ? x.message : tx("Không đổi được mật khẩu")); }
    finally { setBusy(false); }
  };
  return (
    <SubPage title={kind === 'reset' ? tx("Mật khẩu mới") : tx("Xác nhận email")} back="/" backLabel="Camera Cabinet">
      <section className="section px" style={{ gap: 12 }}>
        {state === 'loading' && <p className="muted">{tx("Đang kiểm tra…")}</p>}
        {state === 'ok' && <p className="info-box">{tx("Email đã được xác nhận. Quay lại app Camera Cabinet (biểu tượng trên màn hình chính) và đăng nhập bằng email + mật khẩu vừa tạo.")}</p>}
        {state === 'error' && <p className="down" style={{ fontSize: 14, lineHeight: 1.5 }}>{msg || tx("Link không hợp lệ hoặc đã hết hạn.")}</p>}
        {state === 'form' && (
          <>
            <label className="field">{tx("Mật khẩu mới")}<input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={tx("Ít nhất 6 ký tự")} />
            </label>
            <button type="button" className="btn" disabled={busy || pw.length < 6} onClick={save}>{tx("Lưu mật khẩu mới")}</button>
            {msg && <p className="down" style={{ fontSize: 13 }}>{msg}</p>}
          </>
        )}
        {state === 'done' && <p className="info-box">{tx("Đã đổi mật khẩu. Quay lại app Camera Cabinet và đăng nhập bằng mật khẩu mới.")}</p>}
      </section>
    </SubPage>
  );
}

function Counts() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { db.syncMeta.count().then(setN); }, []);
  return n == null ? null : <div><span>{tx("Bản ghi đã đồng bộ")}</span><span className="mono muted" style={{ fontSize: 13 }}>{n.toLocaleString(locale)}</span></div>;
}

function NameField() {
  const s = useSettings();
  const [name, setName] = useState(s.ownerName);
  useEffect(() => { setName(s.ownerName); }, [s.ownerName]);
  return (
    <label className="field">{tx("Tên hiển thị")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setSetting('ownerName', name.trim())} placeholder={tx("vd: Lâm")} />
    </label>
  );
}
