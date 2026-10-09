import Showcase from './pages/Showcase';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { useSettings } from './db';
import { preferredCurrency, setDisplayMoney } from './lib/format';
import { refreshRates } from './lib/rates';
import { BottomNav, PriceProgress } from './components/ui';
import { autoRefreshStale } from './lib/autoPrice';
import Collection from './pages/Collection';
import Detail from './pages/Detail';
import Edit from './pages/Edit';
import Value from './pages/Value';
import FilmPage from './pages/Film';
import { AuthLanding } from './components/Account';
import { Welcome } from './components/Welcome';
import { useSync } from './lib/sync';
import WishlistPage, { WishDetail, WishEdit } from './pages/Wishlist';
import SettingsPage from './pages/Settings';

const scrollMemory = new Map<string, number>();

export default function App() {
  const settings = useSettings();
  // tiền hiển thị (VNĐ / USD) — đặt trước khi các trang con vẽ
  setDisplayMoney(settings.displayCurrency, settings.rates.USD);
  const loc = useLocation();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accent);
  }, [settings.accent]);

  // Cuộn: trang mới lên đầu; bấm lùi thì về đúng chỗ cũ. Sau khi chuyển trang, nhích cuộn 1px để
  // Safari trên iPhone vẽ lại toàn bộ màn hình (tránh lỗi màn hình đen chỉ còn vài mảng).
  const navType = useNavigationType();
  useEffect(() => {
    const key = loc.pathname + loc.search;
    const target = navType === 'POP' ? scrollMemory.get(key) ?? 0 : 0;
    let tries = 0;
    let raf = 0;
    const apply = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (target > max && tries++ < 30) { raf = requestAnimationFrame(apply); return; }
      window.scrollTo(0, Math.min(target, Math.max(0, max)));
      raf = requestAnimationFrame(() => {
        window.scrollBy(0, 1);
        raf = requestAnimationFrame(() => window.scrollBy(0, -1));
      });
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps
  // nhớ vị trí cuộn của trang đang xem (gỡ ngay khi đổi trang, trước khi trình duyệt tự kéo cuộn về)
  useLayoutEffect(() => {
    const key = loc.pathname + loc.search;
    const save = () => scrollMemory.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    let t: number | undefined;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener('kho-toast', on);
    return () => window.removeEventListener('kho-toast', on);
  }, []);

  // Hiển thị bằng USD mà chưa có tỷ giá (hoặc tỷ giá cũ hơn 7 ngày) → tự lấy
  useEffect(() => {
    if (preferredCurrency() !== 'USD' || !navigator.onLine) return;
    const old = !settings.rates.updatedAt || Date.now() - settings.rates.updatedAt > 7 * 86400000;
    if (!settings.rates.USD || old) refreshRates(settings.rates).catch(() => {});
  }, [settings.displayCurrency, settings.rates.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở app → tự tra giá các máy có giá cũ (chạy ngầm)
  useEffect(() => {
    const t = window.setTimeout(() => { autoRefreshStale().catch(() => {}); }, 1500);
    return () => window.clearTimeout(t);
  }, [settings.priceToken, settings.autoPrice]);

  const sync = useSync();
  const [skipLogin, setSkipLogin] = useState(() => { try { return sessionStorage.getItem('skip-login') === '1'; } catch { return false; } });
  const landing = /^\/(xac-nhan|dat-lai-mat-khau)/.test(loc.pathname);

  // Chưa đăng nhập → màn chào (cài app + đăng nhập) trước khi vào app
  if (!landing && !sync.ready) return <div className="app" />;
  if (!landing && !sync.session && !skipLogin) {
    return (
      <div className="app">
        <Welcome onSkip={() => { try { sessionStorage.setItem('skip-login', '1'); } catch { /* bỏ qua */ } setSkipLogin(true); }} />
        {msg && <div className="toast" role="status">{msg}</div>}
      </div>
    );
  }

  const hideNav = loc.pathname.startsWith('/may/') || loc.pathname === '/trung-bay' || loc.pathname === '/them' || /^\/wishlist\/.+/.test(loc.pathname);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Collection />} />
        <Route path="/may/:id" element={<Detail />} />
        <Route path="/may/:id/sua" element={<Edit />} />
        <Route path="/them" element={<Edit />} />
        <Route path="/gia-tri" element={<Value />} />
        <Route path="/trung-bay" element={<Showcase />} />
        <Route path="/film" element={<FilmPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/wishlist/them" element={<WishEdit />} />
        <Route path="/wishlist/:id" element={<WishDetail />} />
        <Route path="/wishlist/:id/sua" element={<WishEdit />} />
        <Route path="/du-lieu" element={<Navigate to="/cai-dat/nhap-xuat" replace />} />
        <Route path="/xac-nhan" element={<AuthLanding kind="confirm" />} />
        <Route path="/dat-lai-mat-khau" element={<AuthLanding kind="reset" />} />
        <Route path="/cai-dat" element={<SettingsPage />} />
        <Route path="/cai-dat/:section" element={<SettingsPage />} />
        <Route path="*" element={<Collection />} />
      </Routes>
      <PriceProgress raised={!hideNav} />
      {!hideNav && <BottomNav />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}
