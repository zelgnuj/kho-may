import { useEffect, useState } from 'react';
import { db } from '../db';
import { sendReset, sessionFromUrlHash, setNewPassword, signIn, signOut, signUp, syncNow, useSync } from '../lib/sync';
import { Segmented } from './ui';
import { toast } from '../lib/toast';
import { SubPage } from './SubPage';

export function agoLabel(ts: number | null) {
  if (!ts) return 'chưa';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  return `${Math.round(s / 86400)} ngày trước`;
}

/** Nhãn ngắn cho dòng Tài khoản ở trang Cài đặt */
export function accountLabel(sync: ReturnType<typeof useSync>) {
  if (!sync.ready) return '…';
  if (!sync.session) return 'Chưa đăng nhập';
  if (sync.running) return 'Đang đồng bộ…';
  if (sync.error) return 'Lỗi đồng bộ';
  return `Đồng bộ ${agoLabel(sync.lastAt)}`;
}

export function AccountPage() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const mail = email.trim().toLowerCase();
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
  const submit = async () => {
    if (!okEmail) { setErr('Email chưa đúng'); return; }
    if (password.length < 6) { setErr('Mật khẩu cần ít nhất 6 ký tự'); return; }
    setBusy(true); setErr(''); setInfo('');
    try {
      if (mode === 'up') {
        const needConfirm = await signUp(mail, password);
        if (needConfirm) {
          setMode('in');
          setInfo(`Đã gửi thư xác nhận tới ${mail}. Mở thư, bấm link xác nhận (mở trong Safari cũng được), rồi quay lại đây bấm Đăng nhập.`);
        } else toast('Đã tạo tài khoản · đang đồng bộ');
      } else {
        await signIn(mail, password);
        toast('Đã đăng nhập · đang đồng bộ');
      }
    } catch (x) { setErr(x instanceof Error ? x.message : 'Không thực hiện được'); }
    finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!okEmail) { setErr('Nhập email trước, rồi bấm Quên mật khẩu'); return; }
    setBusy(true); setErr(''); setInfo('');
    try { await sendReset(mail); setInfo(`Đã gửi link đặt lại mật khẩu tới ${mail}. Mở link, đặt mật khẩu mới, rồi quay lại app đăng nhập.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Không gửi được'); }
    finally { setBusy(false); }
  };
  const out = async (wipe: boolean) => {
    const msg = wipe
      ? 'Đăng xuất và XOÁ dữ liệu trên máy này? Dữ liệu vẫn còn trên tài khoản, đăng nhập lại sẽ tải về.'
      : 'Đăng xuất? Dữ liệu trên máy này được giữ nguyên nhưng không đồng bộ nữa.';
    if (!window.confirm(msg)) return;
    await signOut(wipe);
    toast('Đã đăng xuất');
  };

  if (sync.session) {
    const counts = <Counts key={sync.lastAt ?? 0} />;
    return (
      <SubPage title="Tài khoản">
        <section className="section px" style={{ gap: 12 }}>
          <div className="rows">
            <div><span>Email</span><span className="muted" style={{ fontSize: 13 }}>{sync.session.user.email}</span></div>
            <div><span>Đồng bộ lần cuối</span><span className={'mono ' + (sync.error ? 'down' : 'muted')} style={{ fontSize: 13 }}>{sync.running ? 'đang chạy…' : agoLabel(sync.lastAt)}</span></div>
            {counts}
          </div>
          {sync.error && <p className="down" style={{ fontSize: 13, lineHeight: 1.5 }}>Lỗi: {sync.error}</p>}
          {sync.detail && <p className="muted" style={{ fontSize: 12 }}>{sync.detail}</p>}
          <button type="button" className="btn" disabled={sync.running} onClick={() => syncNow()}>{sync.running ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</button>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            Dữ liệu vẫn nằm trên máy để dùng khi mất mạng; mỗi khi có thay đổi app tự đồng bộ lên tài khoản sau vài giây. Đăng nhập cùng email trên máy khác là thấy đủ máy, ảnh, wishlist, nhật ký film.
          </p>
        </section>
        <section className="section px" style={{ gap: 10 }}>
          <h2 className="h-mono">ĐĂNG XUẤT</h2>
          <button type="button" className="btn secondary" onClick={() => out(false)}>Đăng xuất, giữ dữ liệu trên máy</button>
          <button type="button" className="btn danger" onClick={() => out(true)}>Đăng xuất và xoá dữ liệu trên máy này</button>
        </section>
      </SubPage>
    );
  }

  return (
    <SubPage title="Tài khoản">
      <section className="section px" style={{ gap: 12 }}>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
          Đăng nhập để dữ liệu được lưu vào tài khoản: không lo mất khi đổi điện thoại, và dùng được trên nhiều máy.
        </p>
        <Segmented<'in' | 'up'> label="Đăng nhập hoặc tạo tài khoản" value={mode} onChange={(v) => { setMode(v); setErr(''); }}
          options={[{ value: 'in', label: 'Đăng nhập' }, { value: 'up', label: 'Tạo tài khoản' }]} />
        <label className="field">Email
          <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="ban@gmail.com" />
        </label>
        <label className="field">Mật khẩu
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 0 }} type={show ? 'text' : 'password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={mode === 'up' ? 'Ít nhất 6 ký tự' : ''} />
            <button type="button" className="btn small secondary" onClick={() => setShow((x) => !x)}>{show ? 'Ẩn' : 'Hiện'}</button>
          </div>
        </label>
        <button type="button" className="btn" disabled={busy || !email.trim() || !password} onClick={submit}>
          {busy ? 'Đang xử lý…' : mode === 'up' ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
        {mode === 'in' && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} disabled={busy} onClick={forgot}>Quên mật khẩu?</button>}
        {err && <p className="down" style={{ fontSize: 13, lineHeight: 1.5 }}>{err}</p>}
        {info && <p className="info-box">{info}</p>}
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>Dữ liệu đang có trên máy này sẽ được đưa lên tài khoản ngay sau khi đăng nhập.</p>
      </section>
    </SubPage>
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
      if (!r.ok && kind === 'reset') setMsg('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Gửi lại link từ app.');
    });
  }, [kind]);
  const save = async () => {
    setBusy(true);
    try { await setNewPassword(pw); await signOut(false); setState('done'); }
    catch (x) { setMsg(x instanceof Error ? x.message : 'Không đổi được mật khẩu'); }
    finally { setBusy(false); }
  };
  return (
    <SubPage title={kind === 'reset' ? 'Mật khẩu mới' : 'Xác nhận email'} back="/" backLabel="Camera Cabinet">
      <section className="section px" style={{ gap: 12 }}>
        {state === 'loading' && <p className="muted">Đang kiểm tra…</p>}
        {state === 'ok' && <p className="info-box">Email đã được xác nhận. Quay lại app Camera Cabinet (biểu tượng trên màn hình chính) và đăng nhập bằng email + mật khẩu vừa tạo.</p>}
        {state === 'error' && <p className="down" style={{ fontSize: 14, lineHeight: 1.5 }}>{msg || 'Link không hợp lệ hoặc đã hết hạn.'}</p>}
        {state === 'form' && (
          <>
            <label className="field">Mật khẩu mới
              <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Ít nhất 6 ký tự" />
            </label>
            <button type="button" className="btn" disabled={busy || pw.length < 6} onClick={save}>Lưu mật khẩu mới</button>
            {msg && <p className="down" style={{ fontSize: 13 }}>{msg}</p>}
          </>
        )}
        {state === 'done' && <p className="info-box">Đã đổi mật khẩu. Quay lại app Camera Cabinet và đăng nhập bằng mật khẩu mới.</p>}
      </section>
    </SubPage>
  );
}

function Counts() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { db.syncMeta.count().then(setN); }, []);
  return n == null ? null : <div><span>Bản ghi đã đồng bộ</span><span className="mono muted" style={{ fontSize: 13 }}>{n.toLocaleString('vi-VN')}</span></div>;
}
