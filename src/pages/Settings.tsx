import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting, useCameras, useSettings } from '../db';
import { fmtTs, parseAmount, preferredCurrency } from '../lib/format';
import { refreshRates } from '../lib/rates';
import { estimateMonthlyAuto, normalizeUsage, pingPriceApi, uniqueModels } from '../lib/autoPrice';
import { toast } from '../lib/toast';
import { catalogSize, useCatalogVersion } from '../lib/catalog';
import { exportPendingJSON, pendingStats, pingContrib, syncPending } from '../lib/contrib';
import { download } from '../lib/csv';
import { useBackupStatus } from '../lib/backup';
import { BackupPanel } from '../components/Backup';
import { SubPage } from '../components/SubPage';
import { AccountPage, accountLabel } from '../components/Account';
import { syncState as syncStateNow, useSync, wipeLocalKeepCloud } from '../lib/sync';
import { Segmented } from '../components/ui';
import { IconBook, IconChevron, IconPalette, IconShield, IconSwap, IconTable, IconTag } from '../components/Icons';
import ImportExport from './Data';
import { lang, locale, setLang, tx, type Lang } from '../lib/i18n';

const ACCENTS = ['#F2A33A', '#FF6B4A', '#7FB8FF', '#C8E06A'];
const VERSION = '0.3';

export default function SettingsPage() {
  const { section } = useParams();
  switch (section) {
    case 'sao-luu': return <BackupPage />;
    case 'nhap-xuat': return <ImportExport />;
    case 'tra-gia': return <PricePage />;
    case 'ty-gia': return <RatesPage />;
    case 'thu-vien': return <LibraryPage />;
    case 'giao-dien': return <AppearancePage />;
    case 'tai-khoan': return <AccountPage />;
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
  const sync = useSync();
  useCatalogVersion();
  const [pending, setPending] = useState(0);
  useEffect(() => { pendingStats().then((p) => setPending(p.waiting)); }, []);
  const usage = normalizeUsage(s.priceUsage);
  const owned = cams.filter((c) => c.status === 'owned').length;
  const backupLabel = !backup ? '…' : backup.daysSince == null ? tx("Chưa sao lưu") : backup.daysSince === 0 ? tx("Hôm nay") : tx("{0} ngày trước", backup.daysSince);

  return (
    <div className="page">
      <header className="px"><h1 className="title-xl" style={{ fontSize: 44 }}>{tx("Cài đặt")}</h1></header>

      <Link to="/cai-dat/tai-khoan" className="profile-card px-card" aria-label={tx("Tài khoản")}>
        <span className="avatar" style={{ background: s.accent }}>{(s.ownerName || 'C').slice(0, 1).toUpperCase()}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{s.ownerName || tx("Chưa đặt tên")}</span>
          <span className="muted mono" style={{ fontSize: 12 }}>{owned} {' '}{tx("máy trong kho ·")}{' '}{wishN} {' '}{tx("đang săn")}</span>
          {sync.session?.user.email && <span className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sync.session.user.email}</span>}
          <span className={'mono ' + (sync.error || (sync.ready && !sync.session) ? 'warn' : 'muted')} style={{ fontSize: 11 }}>{accountLabel(sync)}</span>
        </span>
        <IconChevron size={16} className="menu-chev" />
      </Link>

      <section className="menu-group px" aria-label={tx("Dữ liệu")}>
        <h2 className="h-mono">{tx("DỮ LIỆU")}</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/sao-luu" icon={<IconShield size={18} />} label={tx("Sao lưu & khôi phục")} value={backupLabel} warn={backup?.due} />
          <MenuRow to="/cai-dat/nhap-xuat" icon={<IconTable size={18} />} label={tx("Nhập / xuất bảng tính")} value="CSV" />
        </div>
      </section>

      <section className="menu-group px" aria-label={tx("Giá")}>
        <h2 className="h-mono">{tx("GIÁ")}</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/tra-gia" icon={<IconTag size={18} />} label={tx("Tự tra giá thị trường")} value={s.autoPrice ? tx("{0}/{1} lượt", usage.total, s.monthlyQuota) : tx("Tắt")} />
          <MenuRow to="/cai-dat/ty-gia" icon={<IconSwap size={18} />} label={tx("Tỷ giá")} value={s.rates.USD ? tx("1 $ ≈ {0} đ", Math.round(s.rates.USD).toLocaleString(locale)) : tx("Chưa có")} />
        </div>
      </section>

      <section className="menu-group px" aria-label={tx("Thư viện")}>
        <h2 className="h-mono">{tx("THƯ VIỆN")}</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/thu-vien" icon={<IconBook size={18} />} label={tx("Thư viện mẫu máy")} value={tx("{0} mẫu{1}", catalogSize().toLocaleString(locale), pending ? tx(" · {0} chờ gửi", pending) : '')} warn={pending > 0} />
        </div>
      </section>

      <section className="menu-group px" aria-label={tx("Hiển thị")}>
        <h2 className="h-mono">{tx("HIỂN THỊ")}</h2>
        <div className="menu">
          <MenuRow to="/cai-dat/giao-dien" icon={<IconPalette size={18} />} label={tx("Giao diện")} value={{ grid: tx("Lưới"), list: tx("Danh sách"), shelf: tx("Kệ") }[s.defaultView]} />
        </div>
      </section>

      <p className="px muted mono" style={{ fontSize: 11, textAlign: 'center' }}>{tx("Camera Cabinet · bản")}{' '}{VERSION}</p>
    </div>
  );
}

/* ---------- Sao lưu ---------- */

function BackupPage() {
  const wipe = async () => {
    const signedIn = !!syncStateNow().session;
    if (!window.confirm(signedIn ? tx("Xoá dữ liệu trên máy này? Dữ liệu trên tài khoản KHÔNG bị xoá và sẽ được tải lại ở lần đồng bộ sau.") : tx("Xóa TOÀN BỘ dữ liệu trên thiết bị này? Hãy chắc là bạn đã có bản sao lưu."))) return;
    if (!signedIn && !window.confirm(tx("Xác nhận lần nữa: xóa hết máy, ảnh, lịch sử giá, nhật ký và wishlist?"))) return;
    await wipeLocalKeepCloud(() => Promise.all([db.cameras.clear(), db.photos.clear(), db.prices.clear(), db.service.clear(), db.wishlist.clear(), db.rolls.clear()]));
    toast(tx("Đã xóa dữ liệu trên máy này"));
  };
  return (
    <SubPage title={tx("Sao lưu")}>
      <BackupPanel />
      <section className="section px" style={{ gap: 10 }} aria-label={tx("Vùng nguy hiểm")}>
        <h2 className="h-mono">{tx("VÙNG NGUY HIỂM")}</h2>
        <button type="button" className="btn danger" onClick={wipe}>{tx("Xóa toàn bộ dữ liệu trên máy này")}</button>
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
      setResult({ ok: true, msg: tx("Kết nối tốt · nguồn: {0}", r.providers.map((p) => (p === 'compsniper' ? tx("eBay đã bán (CompSniper)") : p === 'ebay' ? tx("eBay đang rao") : tx("Claude (dự phòng)"))).join(' + ')) });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : tx("Không kết nối được") });
    } finally { setChecking(false); }
  };

  return (
    <SubPage title={tx("Tra giá")}>
      <section className="section px" style={{ gap: 12 }}>
        <div className="panel" aria-label={tx("Lượt tra giá tháng này")}>
          <div className="section-head">
            <h3 className="h2">{tx("Tháng này")}</h3>
            <span className="mono" style={{ fontSize: 13 }}>{usage.total} / {s.monthlyQuota} {' '}{tx("lượt")}</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.min(100, (usage.total / s.monthlyQuota) * 100)}%`, background: usage.total >= s.monthlyQuota ? 'var(--down)' : undefined }} /></div>
          <div className="form-grid" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span>{tx("Tự động:")}{' '}{usage.auto} / {s.autoBudget}</span>
            <span>{tx("Bạn tự bấm:")}{' '}{usage.total - usage.auto}</span>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)' }}>
            {models} {' '}{tx("mẫu máy, tra lại mỗi")}{' '}{s.autoPriceDays} {' '}{tx("ngày ≈")}{' '}<b>{estimate} {' '}{tx("lượt/tháng")}</b>{tx(". Máy cùng mẫu dùng chung 1 lượt.")}{estimate > s.autoBudget && <span className="down"> {' '}{tx("Vượt hạn mức tự động — nên chọn chu kỳ dài hơn.")}</span>}
          </p>
        </div>

        <div className="rows" style={{ padding: 0 }}>
          <label className="check"><span>{tx("Tự tra giá khi mở app")}</span><input type="checkbox" checked={s.autoPrice} onChange={(e) => setSetting('autoPrice', e.target.checked)} /></label>
        </div>
        <div className="field">{tx("Tra lại khi giá cũ hơn")}<Segmented label={tx("Chu kỳ tra giá")} value={String(s.autoPriceDays)} onChange={(v) => setSetting('autoPriceDays', Number(v))}
            options={[{ value: '30', label: tx("30 ngày") }, { value: '60', label: tx("60 ngày") }, { value: '90', label: tx("90 ngày") }]} />
        </div>
        <div className="field">{tx("Lượt dành cho tự động mỗi tháng")}<Segmented label={tx("Lượt tự động")} value={String(s.autoBudget)} onChange={(v) => setSetting('autoBudget', Number(v))}
            options={[{ value: '30', label: '30' }, { value: '60', label: '60' }, { value: '80', label: '80' }]} />
        </div>
      </section>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">{tx("KẾT NỐI")}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {tx("Giá lấy từ máy đã bán gần đây trên eBay (qua CompSniper), thiếu thì dùng giá đang rao; lọc máy hỏng, phụ kiện, biến thể khác tên rồi lấy giá giữa.")}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn small secondary" disabled={checking} onClick={check}>{checking ? tx("Đang kiểm tra…") : tx("Kiểm tra kết nối")}</button>
          {result && <span className={result.ok ? 'up' : 'down'} style={{ fontSize: 13, lineHeight: 1.5 }}>{result.msg}</span>}
        </div>
        <details>
          <summary className="muted" style={{ fontSize: 13, minHeight: 36, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>{tx("Mã truy cập (nếu có đặt PRICE_TOKEN)")}</summary>
          <input className="input mono" type="password" autoComplete="off" value={token}
            onChange={(e) => { setToken(e.target.value); setResult(null); }} onBlur={() => setSetting('priceToken', token.trim())} placeholder={tx("Để trống nếu không đặt")} />
        </details>
        <span className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{tx("Lượt được đếm trên thiết bị này. Gói miễn phí CompSniper:")}{' '}{s.monthlyQuota} {' '}{tx("lượt/tháng.")}</span>
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
      toast(tx("1 ¥ ≈ {0} đ · 1 $ ≈ {1} đ", r.JPY?.toLocaleString(locale), r.USD?.toLocaleString(locale)));
    } catch { toast(tx("Không lấy được tỷ giá. Bạn có thể nhập tay bên dưới.")); }
    finally { setBusy(false); }
  };
  const save = async () => {
    await setSetting('rates', { JPY: parseAmount(jpy), USD: parseAmount(usd), updatedAt: Date.now() });
    toast(tx("Đã lưu tỷ giá"));
  };

  return (
    <SubPage title={tx("Tỷ giá")}>
      <section className="section px" style={{ gap: 12 }}>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{tx("Dùng để quy đổi giá mua bằng ¥ / $ sang VNĐ.")}{s.rates.updatedAt ? tx(" Cập nhật {0}.", fmtTs(s.rates.updatedAt)) : ''}</p>
        <button type="button" className="btn" disabled={busy} onClick={fetchRates}>{busy ? tx("Đang lấy…") : tx("Lấy tỷ giá tự động")}</button>
        <div className="form-grid">
          <label className="field">{tx("1 ¥ = ? đ")}<input className="input mono" inputMode="decimal" value={jpy} onChange={(e) => setJpy(e.target.value)} placeholder="—" /></label>
          <label className="field">{tx("1 $ = ? đ")}<input className="input mono" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="—" /></label>
        </div>
        <button type="button" className="btn secondary" onClick={save}>{tx("Lưu số nhập tay")}</button>
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
      setCOk({ ok: true, msg: tx("Kết nối tốt · ghi vào {0}", r.repo) });
    } catch (e) { setCOk({ ok: false, msg: e instanceof Error ? e.message : tx("Không kết nối được") }); }
  };

  return (
    <SubPage title={tx("Thư viện")}>
      <section className="section px" style={{ gap: 12 }} aria-label={tx("Thư viện mẫu máy")}>
        <div className="rows">
          <div><span>{tx("Số mẫu máy")}</span><span className="mono muted">{catalogSize().toLocaleString(locale)}</span></div>
          <div><span>{tx("Đóng góp chờ gửi")}</span><span className={'mono ' + (stats.waiting ? 'warn' : 'muted')}>{stats.waiting}</span></div>
          <div><span>{tx("Đã gửi gần đây")}</span><span className="mono muted">{stats.synced}</span></div>
        </div>
        {stats.waiting > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" onClick={async () => { await syncPending(); setStats(await pendingStats()); toast(tx("Đã thử gửi lại")); }}>{tx("Gửi lại")}</button>
            <button type="button" className="btn small secondary" onClick={() => download('kho-may-dong-gop.json', new Blob([exportPendingJSON(stats.items.filter((p) => !p.syncedAt))], { type: 'application/json' }))}>{tx("Xuất file JSON")}</button>
          </div>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {tx("Sửa hoặc thêm thông số ở trang chi tiết máy. Đóng góp được gửi lên GitHub và app tự cập nhật cho mọi thiết bị.")}</p>
      </section>
      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">{tx("ĐÓNG GÓP")}</h2>
        <label className="field">{tx("Tên hiển thị khi đóng góp")}<input className="input" value={cName} onChange={(e) => setCName(e.target.value)} onBlur={() => setSetting('contribName', cName.trim())} placeholder={s.ownerName || tx("vd: Lâm")} />
        </label>
        <label className="field">{tx("Mã đóng góp (CONTRIB_TOKEN trên Vercel)")}<div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={cToken}
              onChange={(e) => { setCToken(e.target.value); setCOk(null); }} onBlur={() => setSetting('contribToken', cToken.trim())} placeholder={tx("Chưa nhập")} />
            <button type="button" className="btn small secondary" disabled={!cToken.trim()} onClick={check}>{tx("Kiểm tra")}</button>
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
  return (
    <SubPage title={tx("Giao diện")}>
      <section className="section px" style={{ gap: 16 }}>
        <div className="field">{tx("Ngôn ngữ")}
          <Segmented<Lang> label={tx("Ngôn ngữ")} value={lang} onChange={(v) => { if (v !== lang) setLang(v); }}
            options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
        </div>
        <div className="field">{tx("Hiển thị giá trị máy bằng")}
          <Segmented<string> label={tx("Tiền hiển thị")} value={preferredCurrency()} onChange={(v) => setSetting('displayCurrency', v as 'VND' | 'USD')}
            options={[{ value: 'VND', label: tx("VNĐ") }, { value: 'USD', label: 'USD ($)' }]} />
          {preferredCurrency() === 'USD' && !s.rates.USD && <span className="muted" style={{ fontSize: 12 }}>{tx("Đang lấy tỷ giá… tạm hiển thị bằng VNĐ.")}</span>}
        </div>
        <div className="field">{tx("Màu nhấn")}<div style={{ display: 'flex', gap: 10 }}>
            {ACCENTS.map((a) => (
              <button key={a} type="button" aria-label={tx("Màu {0}", a)} aria-pressed={s.accent === a} onClick={() => setSetting('accent', a)}
                style={{ width: 44, height: 44, borderRadius: 12, background: a, border: s.accent === a ? '3px solid var(--text)' : '3px solid transparent' }} />
            ))}
          </div>
        </div>
        <div className="field">{tx("Kiểu xem mặc định ở Kho máy")}<Segmented label={tx("Kiểu xem mặc định")} value={s.defaultView} onChange={(v) => setSetting('defaultView', v)} options={[{ value: 'grid', label: tx("Lưới") }, { value: 'list', label: tx("Danh sách") }, { value: 'shelf', label: tx("Kệ") }]} />
        </div>
        <div className="field">{tx("Giá trên thẻ máy ở Kho máy")}<Segmented label={tx("Giá trên thẻ máy")} value={s.cardPrice ? 'on' : 'off'} onChange={(v) => setSetting('cardPrice', v === 'on')} options={[{ value: 'off', label: tx("Ẩn") }, { value: 'on', label: tx("Hiện") }]} />
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{tx("Tổng giá trị vẫn ở đầu Kho máy và trang Giá trị; giá từng máy xem trong trang chi tiết.")}</span>
        </div>
      </section>
    </SubPage>
  );
}
