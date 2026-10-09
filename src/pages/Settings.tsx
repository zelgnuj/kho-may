import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting, useCameras, useSettings } from '../db';
import { fmtTs, parseAmount } from '../lib/format';
import { refreshRates } from '../lib/rates';
import { estimateMonthlyAuto, normalizeUsage, pingPriceApi, uniqueModels } from '../lib/autoPrice';
import { toast } from '../lib/toast';
import { catalogSize, useCatalogVersion } from '../lib/catalog';
import { exportPendingJSON, pendingStats, pingContrib, syncPending } from '../lib/contrib';
import { download } from '../lib/csv';
import { useBackupStatus } from '../lib/backup';
import { BackupPanel } from '../components/Backup';
import { SubPage } from '../components/SubPage';
import { Segmented } from '../components/ui';
import { IconBook, IconChevron, IconPalette, IconShield, IconSwap, IconTable, IconTag } from '../components/Icons';
import ImportExport from './Data';

const ACCENTS = ['#F2A33A', '#FF6B4A', '#7FB8FF', '#C8E06A'];
const VERSION = '0.2';

export default function SettingsPage() {
  const { section } = useParams();
  switch (section) {
    case 'sao-luu': return <BackupPage />;
    case 'nhap-xuat': return <ImportExport />;
    case 'tra-gia': return <PricePage />;
    case 'ty-gia': return <RatesPage />;
    case 'thu-vien': return <LibraryPage />;
    case 'giao-dien': return <AppearancePage />;
    default: return <SettingsHome />;
  }
}

/* ---------- Trang chính: danh mục ---------- */

function MenuRow({ to, icon, label, value, warn }: { to: string; icon: ReactNode; label: string; value?: ReactNode; warn?: boolean }) {
  return (
    <Link to={to} className="menu-row">
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {value != null && <span className={'menu-value' + (warn ? ' warn' : '')}>{value}</span>}
      <IconChevron size={16} className="menu-chev" />
    </Link>
  );
}

function SettingsHome() {
  const s = useSettings();
  const cams = useCameras() ?? [];
  const wishN = useLiveQuery(() => db.wishlist.filter((w) => !w.deletedAt && !w.acquiredAt).count(), []) ?? 0;
  const backup = useBackupStatus();
  useCatalogVersion();
  const [pending, setPending] = useState(0);
  useEffect(() => { pendingStats().then((p) => setPending(p.waiting)); }, []);
  const usage = normalizeUsage(s.priceUsage);
  const owned = cams.filter((c) => c.status === 'owned').length;
  const backupLabel = !backup ? '…' : backup.daysSince == null ? 'Chưa sao lưu' : backup.daysSince === 0 ? 'Hôm nay' : `${backup.daysSince} ngày trước`;

  return (
    <div className="page">
      <header className="px"><h1 className="title-xl" style={{ fontSize: 44 }}>Cài đặt</h1></header>

      <Link to="/cai-dat/giao-dien" className="profile-card px-card">
        <span className="avatar" style={{ background: s.accent }}>{(s.ownerName || 'K').slice(0, 1).toUpperCase()}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{s.ownerName || 'Chưa đặt tên'}</span>
          <span className="muted mono" style={{ fontSize: 12 }}>{owned} máy trong kho · {wishN} đang săn</span>
        </span>
        <IconChevron size={16} className="menu-chev" />
      </Link>

      <section className="menu-group px" aria-label="Dữ liệu">
        <h2 className="h-mono">DỮ LIỆU</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/sao-luu" icon={<IconShield size={18} />} label="Sao lưu & khôi phục" value={backupLabel} warn={backup?.due} />
          <MenuRow to="/cai-dat/nhap-xuat" icon={<IconTable size={18} />} label="Nhập / xuất bảng tính" value="CSV" />
        </div>
      </section>

      <section className="menu-group px" aria-label="Giá">
        <h2 className="h-mono">GIÁ</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/tra-gia" icon={<IconTag size={18} />} label="Tự tra giá thị trường" value={s.autoPrice ? `${usage.total}/${s.monthlyQuota} lượt` : 'Tắt'} />
          <MenuRow to="/cai-dat/ty-gia" icon={<IconSwap size={18} />} label="Tỷ giá" value={s.rates.USD ? `1 $ ≈ ${Math.round(s.rates.USD).toLocaleString('vi-VN')} đ` : 'Chưa có'} />
        </div>
      </section>

      <section className="menu-group px" aria-label="Thư viện">
        <h2 className="h-mono">THƯ VIỆN</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/thu-vien" icon={<IconBook size={18} />} label="Thư viện mẫu máy" value={`${catalogSize().toLocaleString('vi-VN')} mẫu${pending ? ` · ${pending} chờ gửi` : ''}`} warn={pending > 0} />
        </div>
      </section>

      <section className="menu-group px" aria-label="Hiển thị">
        <h2 className="h-mono">HIỂN THỊ</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/giao-dien" icon={<IconPalette size={18} />} label="Tên & giao diện" value={{ grid: 'Lưới', list: 'Danh sách', shelf: 'Kệ' }[s.defaultView]} />
        </div>
      </section>

      <p className="px muted mono" style={{ fontSize: 11, textAlign: 'center' }}>Kho máy · bản {VERSION}</p>
    </div>
  );
}

/* ---------- Sao lưu ---------- */

function BackupPage() {
  const wipe = async () => {
    if (!window.confirm('Xóa TOÀN BỘ dữ liệu trên thiết bị này? Hãy chắc là bạn đã có bản sao lưu.')) return;
    if (!window.confirm('Xác nhận lần nữa: xóa hết máy, ảnh, lịch sử giá, nhật ký và wishlist?')) return;
    await Promise.all([db.cameras.clear(), db.photos.clear(), db.prices.clear(), db.service.clear(), db.wishlist.clear()]);
    toast('Đã xóa toàn bộ dữ liệu');
  };
  return (
    <SubPage title="Sao lưu">
      <BackupPanel />
      <section className="section px" style={{ gap: 10 }} aria-label="Vùng nguy hiểm">
        <h2 className="h-mono">VÙNG NGUY HIỂM</h2>
        <button type="button" className="btn danger" onClick={wipe}>Xóa toàn bộ dữ liệu trên máy này</button>
      </section>
    </SubPage>
  );
}

/* ---------- Tự tra giá ---------- */

function PricePage() {
  const s = useSettings();
  const cams = useCameras() ?? [];
  const [token, setToken] = useState(s.priceToken);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => { setToken(s.priceToken); }, [s.priceToken]);
  const usage = normalizeUsage(s.priceUsage);
  const models = uniqueModels(cams.filter((c) => c.status === 'owned')).length;
  const estimate = estimateMonthlyAuto(cams, s.autoPriceDays);

  const check = async () => {
    const t = token.trim();
    setChecking(true);
    try {
      const r = await pingPriceApi(t);
      await setSetting('priceToken', t);
      setResult({ ok: true, msg: `Kết nối tốt · nguồn: ${r.providers.map((p) => (p === 'compsniper' ? 'eBay đã bán (CompSniper)' : p === 'ebay' ? 'eBay đang rao' : 'Claude (dự phòng)')).join(' + ')}` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Không kết nối được' });
    } finally { setChecking(false); }
  };

  return (
    <SubPage title="Tra giá">
      <section className="section px" style={{ gap: 12 }}>
        <div className="panel" aria-label="Lượt tra giá tháng này">
          <div className="section-head">
            <h3 className="h2">Tháng này</h3>
            <span className="mono" style={{ fontSize: 13 }}>{usage.total} / {s.monthlyQuota} lượt</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.min(100, (usage.total / s.monthlyQuota) * 100)}%`, background: usage.total >= s.monthlyQuota ? 'var(--down)' : undefined }} /></div>
          <div className="form-grid" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span>Tự động: {usage.auto} / {s.autoBudget}</span>
            <span>Bạn tự bấm: {usage.total - usage.auto}</span>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)' }}>
            {models} mẫu máy, tra lại mỗi {s.autoPriceDays} ngày ≈ <b>{estimate} lượt/tháng</b>. Máy cùng mẫu dùng chung 1 lượt.
            {estimate > s.autoBudget && <span className="down"> Vượt hạn mức tự động — nên chọn chu kỳ dài hơn.</span>}
          </p>
        </div>

        <div className="rows" style={{ padding: 0 }}>
          <label className="check"><span>Tự tra giá khi mở app</span><input type="checkbox" checked={s.autoPrice} onChange={(e) => setSetting('autoPrice', e.target.checked)} /></label>
        </div>
        <div className="field">Tra lại khi giá cũ hơn
          <Segmented label="Chu kỳ tra giá" value={String(s.autoPriceDays)} onChange={(v) => setSetting('autoPriceDays', Number(v))}
            options={[{ value: '30', label: '30 ngày' }, { value: '60', label: '60 ngày' }, { value: '90', label: '90 ngày' }]} />
        </div>
        <div className="field">Lượt dành cho tự động mỗi tháng
          <Segmented label="Lượt tự động" value={String(s.autoBudget)} onChange={(v) => setSetting('autoBudget', Number(v))}
            options={[{ value: '30', label: '30' }, { value: '60', label: '60' }, { value: '80', label: '80' }]} />
        </div>
      </section>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">KẾT NỐI</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          Giá lấy từ máy đã bán gần đây trên eBay (qua CompSniper), thiếu thì dùng giá đang rao; lọc máy hỏng, phụ kiện, biến thể khác tên rồi lấy giá giữa.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn small secondary" disabled={checking} onClick={check}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</button>
          {result && <span className={result.ok ? 'up' : 'down'} style={{ fontSize: 13, lineHeight: 1.5 }}>{result.msg}</span>}
        </div>
        <details>
          <summary className="muted" style={{ fontSize: 13, minHeight: 36, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Mã truy cập (nếu có đặt PRICE_TOKEN)</summary>
          <input className="input mono" type="password" autoComplete="off" value={token}
            onChange={(e) => { setToken(e.target.value); setResult(null); }} onBlur={() => setSetting('priceToken', token.trim())} placeholder="Để trống nếu không đặt" />
        </details>
        <span className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>Lượt được đếm trên thiết bị này. Gói miễn phí CompSniper: {s.monthlyQuota} lượt/tháng.</span>
      </section>
    </SubPage>
  );
}

/* ---------- Tỷ giá ---------- */

function RatesPage() {
  const s = useSettings();
  const [jpy, setJpy] = useState('');
  const [usd, setUsd] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setJpy(s.rates.JPY != null ? String(s.rates.JPY).replace('.', ',') : '');
    setUsd(s.rates.USD != null ? String(s.rates.USD) : '');
  }, [s.rates.JPY, s.rates.USD]);

  const fetchRates = async () => {
    setBusy(true);
    try {
      const r = await refreshRates(s.rates);
      toast(`1 ¥ ≈ ${r.JPY?.toLocaleString('vi-VN')} đ · 1 $ ≈ ${r.USD?.toLocaleString('vi-VN')} đ`);
    } catch { toast('Không lấy được tỷ giá. Bạn có thể nhập tay bên dưới.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    await setSetting('rates', { JPY: parseAmount(jpy), USD: parseAmount(usd), updatedAt: Date.now() });
    toast('Đã lưu tỷ giá');
  };

  return (
    <SubPage title="Tỷ giá">
      <section className="section px" style={{ gap: 12 }}>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Dùng để quy đổi giá mua bằng ¥ / $ sang VNĐ.{s.rates.updatedAt ? ` Cập nhật ${fmtTs(s.rates.updatedAt)}.` : ''}</p>
        <button type="button" className="btn" disabled={busy} onClick={fetchRates}>{busy ? 'Đang lấy…' : 'Lấy tỷ giá tự động'}</button>
        <div className="form-grid">
          <label className="field">1 ¥ = ? đ<input className="input mono" inputMode="decimal" value={jpy} onChange={(e) => setJpy(e.target.value)} placeholder="—" /></label>
          <label className="field">1 $ = ? đ<input className="input mono" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="—" /></label>
        </div>
        <button type="button" className="btn secondary" onClick={save}>Lưu số nhập tay</button>
      </section>
    </SubPage>
  );
}

/* ---------- Thư viện mẫu máy ---------- */

function LibraryPage() {
  const s = useSettings();
  useCatalogVersion();
  const [cName, setCName] = useState(s.contribName);
  const [cToken, setCToken] = useState(s.contribToken);
  const [cOk, setCOk] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof pendingStats>>>({ waiting: 0, synced: 0, items: [] });
  useEffect(() => { setCName(s.contribName); setCToken(s.contribToken); }, [s.contribName, s.contribToken]);
  useEffect(() => { pendingStats().then(setStats); }, []);
  const check = async () => {
    try {
      const r = await pingContrib(cToken.trim());
      await setSetting('contribToken', cToken.trim());
      setCOk({ ok: true, msg: `Kết nối tốt · ghi vào ${r.repo}` });
    } catch (e) { setCOk({ ok: false, msg: e instanceof Error ? e.message : 'Không kết nối được' }); }
  };

  return (
    <SubPage title="Thư viện">
      <section className="section px" style={{ gap: 12 }} aria-label="Thư viện mẫu máy">
        <div className="rows">
          <div><span>Số mẫu máy</span><span className="mono muted">{catalogSize().toLocaleString('vi-VN')}</span></div>
          <div><span>Đóng góp chờ gửi</span><span className={'mono ' + (stats.waiting ? 'warn' : 'muted')}>{stats.waiting}</span></div>
          <div><span>Đã gửi gần đây</span><span className="mono muted">{stats.synced}</span></div>
        </div>
        {stats.waiting > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" onClick={async () => { await syncPending(); setStats(await pendingStats()); toast('Đã thử gửi lại'); }}>Gửi lại</button>
            <button type="button" className="btn small secondary" onClick={() => download('kho-may-dong-gop.json', new Blob([exportPendingJSON(stats.items.filter((p) => !p.syncedAt))], { type: 'application/json' }))}>Xuất file JSON</button>
          </div>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          Sửa hoặc thêm thông số ở trang chi tiết máy. Đóng góp được gửi lên GitHub và app tự cập nhật cho mọi thiết bị.
        </p>
      </section>
      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">ĐÓNG GÓP</h2>
        <label className="field">Tên hiển thị khi đóng góp
          <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} onBlur={() => setSetting('contribName', cName.trim())} placeholder={s.ownerName || 'vd: Lâm'} />
        </label>
        <label className="field">Mã đóng góp (CONTRIB_TOKEN trên Vercel)
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={cToken}
              onChange={(e) => { setCToken(e.target.value); setCOk(null); }} onBlur={() => setSetting('contribToken', cToken.trim())} placeholder="Chưa nhập" />
            <button type="button" className="btn small secondary" disabled={!cToken.trim()} onClick={check}>Kiểm tra</button>
          </div>
        </label>
        {cOk && <span className={cOk.ok ? 'up' : 'down'} style={{ fontSize: 13 }}>{cOk.msg}</span>}
      </section>
    </SubPage>
  );
}

/* ---------- Tên & giao diện ---------- */

function AppearancePage() {
  const s = useSettings();
  const [name, setName] = useState(s.ownerName);
  useEffect(() => { setName(s.ownerName); }, [s.ownerName]);
  return (
    <SubPage title="Giao diện">
      <section className="section px" style={{ gap: 16 }}>
        <label className="field">Tên hiển thị
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setSetting('ownerName', name.trim())} placeholder="vd: Lâm" />
        </label>
        <div className="field">Màu nhấn
          <div style={{ display: 'flex', gap: 10 }}>
            {ACCENTS.map((a) => (
              <button key={a} type="button" aria-label={`Màu ${a}`} aria-pressed={s.accent === a} onClick={() => setSetting('accent', a)}
                style={{ width: 44, height: 44, borderRadius: 12, background: a, border: s.accent === a ? '3px solid var(--text)' : '3px solid transparent' }} />
            ))}
          </div>
        </div>
        <div className="field">Kiểu xem mặc định ở Kho máy
          <Segmented label="Kiểu xem mặc định" value={s.defaultView} onChange={(v) => setSetting('defaultView', v)} options={[{ value: 'grid', label: 'Lưới' }, { value: 'list', label: 'Danh sách' }, { value: 'shelf', label: 'Kệ' }]} />
        </div>
      </section>
    </SubPage>
  );
}
