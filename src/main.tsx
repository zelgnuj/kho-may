import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { backfillLensSpecs, migrateFilmToRolls } from './db';
import { guessLens, loadCatalog } from './lib/catalog';
import { syncPending } from './lib/contrib';
import { ensurePersistent } from './lib/backup';
import { startSync } from './lib/sync';
import { captureInstallPrompt } from './lib/install';
import { registerSW } from 'virtual:pwa-register';
import { findStock, isoFromName } from './lib/filmStocks';

// Xin trình duyệt giữ dữ liệu lâu dài (giảm nguy cơ Safari tự xóa khi máy thiếu dung lượng)
ensurePersistent();
migrateFilmToRolls((st) => ({ iso: isoFromName(st), kind: findStock(st)?.kind })).catch(() => {});
// Tải thư viện mẫu máy (file riêng, được lưu lại để dùng offline), rồi bổ sung thông số cho máy đã có
loadCatalog()
  .then(() => backfillLensSpecs(guessLens))
  .then(() => (navigator.onLine ? syncPending() : undefined))
  .catch(() => {});

// Tài khoản & đồng bộ (trang mở từ link email trong Safari thì không tự đồng bộ)
if (!/^\/(xac-nhan|dat-lai-mat-khau)/.test(location.pathname)) startSync().catch(() => {});

// Nút "Cài app" trên Android
captureInstallPrompt();

// Tự cập nhật bản mới: kiểm tra khi mở lại app và mỗi 30 phút, có bản mới thì tải lại trang
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
