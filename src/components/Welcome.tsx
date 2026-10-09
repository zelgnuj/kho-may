import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { isStandalone, platform, promptInstall, useCanPromptInstall } from '../lib/install';
import { AuthForm } from './Account';
import { lang, setLang, tx } from '../lib/i18n';

/** Màn chào cho người mới / chưa đăng nhập: cài app ra màn hình chính → đăng nhập → vào app */
export function Welcome({ onSkip }: { onSkip: () => void }) {
  const standalone = isStandalone();
  const plat = platform();
  const [step, setStep] = useState<'install' | 'auth'>(standalone || plat === 'desktop' ? 'auth' : 'install');
  const canPrompt = useCanPromptInstall();
  const localCount = useLiveQuery(() => db.cameras.filter((c) => !c.deletedAt).count(), []) ?? 0;

  return (
    <div className="welcome">
      <div className="lang-toggle" role="group" aria-label="Language">
        <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        <button type="button" className={lang === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>VI</button>
      </div>
      <header className="welcome-head">
        <img src="/icon-192.png" alt="" width={72} height={72} className="welcome-icon" />
        <h1 className="title-xl welcome-title">Camera<br />Cabinet</h1>
        <p className="welcome-tag">{tx("Tủ kính cho bộ sưu tập máy ảnh film của bạn — giá thị trường, nhật ký film, wishlist, đồng bộ mọi thiết bị.")}</p>
      </header>

      {step === 'install' ? (
        <section className="welcome-card" aria-label={tx("Cài app")}>
          <span className="h-mono">{tx("BƯỚC 1 · CÀI APP")}</span>
          {plat === 'ios-safari' && (
            <ol className="install-steps">
              <li>{tx("Bấm nút")}{' '}<b>{tx("Chia sẻ")}</b> <ShareIcon /> {' '}{tx("ở thanh dưới của Safari.")}</li>
              <li>{tx("Kéo xuống, chọn")}{' '}<b>{tx("Thêm vào MH chính")}</b>.</li>
              <li>{tx("Mở")}{' '}<b>Camera Cabinet</b> {' '}{tx("từ màn hình chính và đăng nhập ở đó.")}</li>
            </ol>
          )}
          {plat === 'ios-other' && (
            <ol className="install-steps">
              <li>{tx("Mở trang này bằng")}{' '}<b>Safari</b> {' '}{tx("(bấm ⋯ hoặc biểu tượng la bàn → Mở trong Safari).")}</li>
              <li>{tx("Trong Safari:")}{' '}<b>{tx("Chia sẻ")}</b> <ShareIcon /> → <b>{tx("Thêm vào MH chính")}</b>.</li>
              <li>{tx("Mở")}{' '}<b>Camera Cabinet</b> {' '}{tx("từ màn hình chính và đăng nhập ở đó.")}</li>
            </ol>
          )}
          {plat === 'android' && (canPrompt ? (
            <button type="button" className="btn" onClick={() => promptInstall()}>{tx("Cài Camera Cabinet")}</button>
          ) : (
            <ol className="install-steps">
              <li>{tx("Bấm menu")}{' '}<b>⋮</b> {' '}{tx("ở góc trên của Chrome.")}</li>
              <li>{tx("Chọn")}{' '}<b>{tx("Cài đặt ứng dụng")}</b> {' '}{tx("hoặc")}{' '}<b>{tx("Thêm vào màn hình chính")}</b>.</li>
              <li>{tx("Mở")}{' '}<b>Camera Cabinet</b> {' '}{tx("từ màn hình chính và đăng nhập ở đó.")}</li>
            </ol>
          ))}
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            {tx("App trên màn hình chính chạy toàn màn hình như app thật, dùng được khi mất mạng, và giữ dữ liệu ổn định hơn mở bằng trình duyệt.")}{plat.startsWith('ios') && tx(" Trên iPhone, app ngoài màn hình chính có bộ nhớ riêng với Safari — nên đăng nhập trong app.")}
          </p>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setStep('auth')}>{tx("Dùng luôn trên trình duyệt này →")}</button>
        </section>
      ) : (
        <section className="welcome-card" aria-label={tx("Đăng nhập")}>
          {!standalone && plat !== 'desktop' && <span className="h-mono">{tx("BƯỚC 2 · ĐĂNG NHẬP")}</span>}
          <AuthForm />
          {!standalone && plat !== 'desktop' && (
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setStep('install')}>{tx("← Xem lại cách cài app")}</button>
          )}
        </section>
      )}

      {localCount > 0 && (
        <button type="button" className="link-btn welcome-skip" onClick={onSkip}>
          {tx("Máy này đang có")}{' '}{localCount} {' '}{tx("máy ảnh · dùng tạm, đăng nhập sau")}</button>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={tx("biểu tượng Chia sẻ")} style={{ verticalAlign: '-2px' }}>
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
