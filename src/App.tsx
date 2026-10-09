import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSettings } from './db';
import { BottomNav, PriceProgress } from './components/ui';
import { autoRefreshStale } from './lib/autoPrice';
import Collection from './pages/Collection';
import Detail from './pages/Detail';
import Edit from './pages/Edit';
import Value from './pages/Value';
import WishlistPage, { WishDetail, WishEdit } from './pages/Wishlist';
import SettingsPage from './pages/Settings';

export default function App() {
  const settings = useSettings();
  const loc = useLocation();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accent);
  }, [settings.accent]);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

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

  // Mở app → tự tra giá các máy có giá cũ (chạy ngầm)
  useEffect(() => {
    const t = window.setTimeout(() => { autoRefreshStale().catch(() => {}); }, 1500);
    return () => window.clearTimeout(t);
  }, [settings.priceToken, settings.autoPrice]);

  const hideNav = loc.pathname.startsWith('/may/') || loc.pathname === '/them' || /^\/wishlist\/.+/.test(loc.pathname);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Collection />} />
        <Route path="/may/:id" element={<Detail />} />
        <Route path="/may/:id/sua" element={<Edit />} />
        <Route path="/them" element={<Edit />} />
        <Route path="/gia-tri" element={<Value />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/wishlist/them" element={<WishEdit />} />
        <Route path="/wishlist/:id" element={<WishDetail />} />
        <Route path="/wishlist/:id/sua" element={<WishEdit />} />
        <Route path="/du-lieu" element={<Navigate to="/cai-dat/nhap-xuat" replace />} />
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
