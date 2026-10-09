import { useEffect, useState } from 'react';
import { db } from '../db';
import { sendCode, signOut, syncNow, useSync, verifyCode } from '../lib/sync';
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
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr('Email chưa đúng'); return; }
    setBusy(true); setErr('');
    try { await sendCode(e); setStep('code'); setCode(''); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Không gửi được mã'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr('');
    try { await verifyCode(email.trim().toLowerCase(), code); toast('Đã đăng nhập · đang đồng bộ'); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Không đăng nhập được'); }
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
          Đăng nhập để dữ liệu được lưu vào tài khoản: không lo mất khi đổi điện thoại, và dùng được trên nhiều máy. Không cần mật khẩu — app gửi mã gồm 6 số vào email.
        </p>
        {step === 'email' ? (
          <>
            <label className="field">Email
              <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email}
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="ban@gmail.com" />
            </label>
            <button type="button" className="btn" disabled={busy || !email.trim()} onClick={send}>{busy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5 }}>Đã gửi mã tới <b>{email.trim()}</b>. Mở email và nhập mã vào đây (xem cả mục Spam / Quảng cáo).</p>
            <label className="field">Mã đăng nhập
              <input className="input mono otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} placeholder="••••••" autoFocus />
            </label>
            <button type="button" className="btn" disabled={busy || code.length < 6} onClick={verify}>{busy ? 'Đang kiểm tra…' : 'Đăng nhập'}</button>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" className="link-btn" onClick={() => { setStep('email'); setErr(''); }}>Đổi email</button>
              <button type="button" className="link-btn" disabled={busy} onClick={send}>Gửi lại mã</button>
            </div>
          </>
        )}
        {err && <p className="down" style={{ fontSize: 13 }}>{err}</p>}
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>Dữ liệu đang có trên máy này sẽ được đưa lên tài khoản ngay sau khi đăng nhập.</p>
      </section>
    </SubPage>
  );
}

function Counts() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { db.syncMeta.count().then(setN); }, []);
  return n == null ? null : <div><span>Bản ghi đã đồng bộ</span><span className="mono muted" style={{ fontSize: 13 }}>{n.toLocaleString('vi-VN')}</span></div>;
}
