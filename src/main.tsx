import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { backfillLensSpecs } from './db';
import { guessLens, loadCatalog } from './lib/catalog';
import { syncPending } from './lib/contrib';
import { ensurePersistent } from './lib/backup';

// Xin trình duyệt giữ dữ liệu lâu dài (giảm nguy cơ Safari tự xóa khi máy thiếu dung lượng)
ensurePersistent();
// Tải thư viện mẫu máy (file riêng, được lưu lại để dùng offline), rồi bổ sung thông số cho máy đã có
loadCatalog()
  .then(() => backfillLensSpecs(guessLens))
  .then(() => (navigator.onLine ? syncPending() : undefined))
  .catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
