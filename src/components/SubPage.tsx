import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconBack } from './Icons';
import { tx } from '../lib/i18n';

/** Trang con có nút quay lại (dùng cho các mục trong Cài đặt, Wishlist…) */
export function SubPage({ title, back = '/cai-dat', backLabel = tx("Cài đặt"), action, children }: {
  title: string; back?: string; backLabel?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="page">
      <header className="sub-head px">
        <Link to={back} className="back-link"><IconBack size={18} />{backLabel}</Link>
        <div className="sub-title-row">
          <h1 className="title-xl" style={{ fontSize: 34 }}>{title}</h1>
          {action}
        </div>
      </header>
      {children}
    </div>
  );
}
