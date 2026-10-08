import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { backfillLensSpecs } from './db';
import { guessLens } from './lib/catalog';

// Xin trình duyệt giữ dữ liệu lâu dài (giảm nguy cơ Safari tự xóa khi máy thiếu dung lượng)
navigator.storage?.persist?.().catch(() => {});
backfillLensSpecs(guessLens).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
