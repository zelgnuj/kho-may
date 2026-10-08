import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useSettings } from './db';
import { BottomNav } from './components/ui';
import Collection from './pages/Collection';
import Detail from './pages/Detail';
import Edit from './pages/Edit';
import Value from './pages/Value';
import Data from './pages/Data';
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

  const hideNav = loc.pathname.startsWith('/may/') || loc.pathname === '/them';

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Collection />} />
        <Route path="/may/:id" element={<Detail />} />
        <Route path="/may/:id/sua" element={<Edit />} />
        <Route path="/them" element={<Edit />} />
        <Route path="/gia-tri" element={<Value />} />
        <Route path="/du-lieu" element={<Data />} />
        <Route path="/cai-dat" element={<SettingsPage />} />
        <Route path="*" element={<Collection />} />
      </Routes>
      {!hideNav && <BottomNav />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}
