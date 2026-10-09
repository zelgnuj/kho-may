import { useEffect, useState } from 'react';
import { db, setSetting, useCameras, useSettings } from '../db';
import { fmtTs, parseAmount } from '../lib/format';
import { refreshRates } from '../lib/rates';
import { estimateMonthlyAuto, normalizeUsage, pingPriceApi, uniqueModels } from '../lib/autoPrice';
import { toast } from '../lib/toast';
import { catalogSize, useCatalogVersion } from '../lib/catalog';
import { exportPendingJSON, pendingStats, pingContrib, syncPending } from '../lib/contrib';
import { download } from '../lib/csv';
import { Segmented } from '../components/ui';

const ACCENTS = ['#F2A33A', '#FF6B4A', '#7FB8FF', '#C8E06A'];

export default function SettingsPage() {
  const s = useSettings();
  const [name, setName] = useState(s.ownerName);
  const [jpy, setJpy] = useState('');
  const [usd, setUsd] = useState('');
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [token, setToken] = useState(s.priceToken);
  const [checking, setChecking] = useState(false);
  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [tokenErr, setTokenErr] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  useCatalogVersion();
  const [cName, setCName] = useState(s.contribName);
  const [cToken, setCToken] = useState(s.contribToken);
  const [cOk, setCOk] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof pendingStats>>>({ waiting: 0, synced: 0, items: [] });
  useEffect(() => { setCName(s.contribName); setCToken(s.contribToken); }, [s.contribName, s.contribToken]);
  useEffect(() => { pendingStats().then(setStats); }, []);
  const checkContrib = async () => {
    try {
      const r = await pingContrib(cToken.trim());
      await setSetting('contribToken', cToken.trim());
      setCOk({ ok: true, msg: `Kết nối tốt · ghi vào ${r.repo}` });
    } catch (e) { setCOk({ ok: false, msg: e instanceof Error ? e.message : 'Không kết nối được' }); }
  };
  const cams = useCameras() ?? [];
  const usage = normalizeUsage(s.priceUsage);
  const models = uniqueModels(cams.filter((c) => c.status === 'owned')).length;
  const estimate = estimateMonthlyAuto(cams, s.autoPriceDays);
  useEffect(() => { setToken(s.priceToken); }, [s.priceToken]);

  useEffect(() => { setName(s.ownerName); }, [s.ownerName]);
  useEffect(() => {
    setJpy(s.rates.JPY != null ? String(s.rates.JPY).replace('.', ',') : '');
    setUsd(s.rates.USD != null ? String(s.rates.USD) : '');
  }, [s.rates.JPY, s.rates.USD]);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);

  const checkToken = async () => {
    const t = token.trim();
    setChecking(true);
    try {
      const r = await pingPriceApi(t);
      await setSetting('priceToken', t);
      setProviderLabel(`Kết nối tốt · nguồn: ${r.providers.map((p) => (p === 'compsniper' ? 'eBay đã bán (CompSniper)' : p === 'ebay' ? 'eBay đang rao' : 'Claude (dự phòng)')).join(' + ')}`);
      setTokenOk(true);
    } catch (e) {
      setTokenOk(false);
      setTokenErr(e instanceof Error ? e.message : 'Không kết nối được');
    } finally { setChecking(false); }
  };

  const fetchRates = async () => {
    setBusy(true);
    try {
      const r = await refreshRates(s.rates);
      toast(`1 ¥ ≈ ${r.JPY?.toLocaleString('vi-VN')} đ · 1 $ ≈ ${r.USD?.toLocaleString('vi-VN')} đ`);
    } catch {
      toast('Không lấy được tỷ giá. Bạn có thể nhập tay bên dưới.');
    } finally { setBusy(false); }
  };

  const saveRates = async () => {
    await setSetting('rates', { JPY: parseAmount(jpy), USD: parseAmount(usd), updatedAt: Date.now() });
    toast('Đã lưu tỷ giá');
  };

  const wipe = async () => {
    if (!window.confirm('Xóa TOÀN BỘ dữ liệu trên thiết bị này? Hãy chắc là bạn đã có bản sao lưu.')) return;
    if (!window.confirm('Xác nhận lần nữa: xóa hết máy, ảnh, lịch sử giá và nhật ký?')) return;
    await Promise.all([db.cameras.clear(), db.photos.clear(), db.prices.clear(), db.service.clear()]);
    toast('Đã xóa toàn bộ dữ liệu');
  };

  return (
    <div className="page">
      <header className="px"><h1 className="title-xl" style={{ fontSize: 44 }}>Cài đặt</h1></header>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">CÁ NHÂN</h2>
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
        <div className="field">Kiểu xem mặc định
          <Segmented label="Kiểu xem mặc định" value={s.defaultView} onChange={(v) => setSetting('defaultView', v)} options={[{ value: 'grid', label: 'Lưới' }, { value: 'list', label: 'Danh sách' }, { value: 'shelf', label: 'Kệ' }]} />
        </div>
      </section>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">TỰ TRA GIÁ THỊ TRƯỜNG</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          App lấy giá đã bán gần đây trên eBay (qua CompSniper), thiếu thì dùng giá đang rao trên eBay; lọc máy hỏng, phụ kiện, biến thể khác tên rồi lấy giá giữa.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn small secondary" disabled={checking} onClick={checkToken}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</button>
          {tokenOk === true && <span className="up" style={{ fontSize: 13 }}>{providerLabel}</span>}
        </div>
        {tokenOk === false && <span className="down" style={{ fontSize: 13, lineHeight: 1.5 }}>{tokenErr}</span>}
        <details>
          <summary style={{ fontSize: 13, color: 'var(--muted)', minHeight: 36, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Mã truy cập (nếu bạn có đặt PRICE_TOKEN)</summary>
          <input className="input mono" type="password" autoComplete="off" value={token}
            onChange={(e) => { setToken(e.target.value); setTokenOk(null); }} onBlur={() => setSetting('priceToken', token.trim())} placeholder="Để trống nếu không đặt" />
        </details>
        <div className="rows" style={{ padding: 0 }}>
          <label className="check">
            <span>Tự tra giá khi mở app</span>
            <input type="checkbox" checked={s.autoPrice} onChange={(e) => setSetting('autoPrice', e.target.checked)} />
          </label>
        </div>
        <div className="field">Tra lại khi giá cũ hơn
          <Segmented label="Chu kỳ tra giá" value={String(s.autoPriceDays)} onChange={(v) => setSetting('autoPriceDays', Number(v))}
            options={[{ value: '30', label: '30 ngày' }, { value: '60', label: '60 ngày' }, { value: '90', label: '90 ngày' }]} />
        </div>
        <div className="field">Lượt dành cho tự động mỗi tháng
          <Segmented label="Lượt tự động" value={String(s.autoBudget)} onChange={(v) => setSetting('autoBudget', Number(v))}
            options={[{ value: '30', label: '30' }, { value: '60', label: '60' }, { value: '80', label: '80' }]} />
        </div>

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
            Với {models} mẫu máy, tra lại mỗi {s.autoPriceDays} ngày tốn khoảng <b>{estimate} lượt/tháng</b>.
            Máy cùng mẫu dùng chung 1 lượt; máy mới được tra ngay, còn máy cũ được rải tối đa {Math.max(1, Math.ceil(s.autoBudget / 30))} máy mỗi ngày.
            {estimate > s.autoBudget && <span className="down"> Vượt hạn mức tự động — nên chọn chu kỳ dài hơn.</span>}
          </p>
          <span className="muted" style={{ fontSize: 11 }}>Đếm trên thiết bị này. Gói miễn phí CompSniper: {s.monthlyQuota} lượt/tháng, hết lượt app tự chuyển sang giá rao eBay (nếu có khóa).</span>
        </div>
      </section>

      <section className="section px" style={{ gap: 12 }} aria-label="Thư viện mẫu máy">
        <h2 className="h-mono">THƯ VIỆN MẪU MÁY</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {catalogSize().toLocaleString('vi-VN')} mẫu. Bạn sửa hoặc thêm thông số ở trang chi tiết máy; đóng góp được gửi lên GitHub và app tự cập nhật cho mọi thiết bị.
        </p>
        <label className="field">Tên hiển thị khi đóng góp
          <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} onBlur={() => setSetting('contribName', cName.trim())} placeholder={s.ownerName || 'vd: Lâm'} />
        </label>
        <label className="field">Mã đóng góp (CONTRIB_TOKEN trên Vercel)
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={cToken}
              onChange={(e) => { setCToken(e.target.value); setCOk(null); }} onBlur={() => setSetting('contribToken', cToken.trim())} placeholder="Chưa nhập" />
            <button type="button" className="btn small secondary" disabled={!cToken.trim()} onClick={checkContrib}>Kiểm tra</button>
          </div>
        </label>
        {cOk && <span className={cOk.ok ? 'up' : 'down'} style={{ fontSize: 13 }}>{cOk.msg}</span>}
        {(stats.waiting > 0 || stats.synced > 0) && (
          <div className="rows" style={{ padding: 0 }}>
            <div><span>Đóng góp chờ gửi</span><span className="mono">{stats.waiting}</span></div>
            <div><span>Đã gửi gần đây</span><span className="mono">{stats.synced}</span></div>
          </div>
        )}
        {stats.waiting > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" onClick={async () => { await syncPending(); setStats(await pendingStats()); toast('Đã thử gửi lại'); }}>Gửi lại</button>
            <button type="button" className="btn small secondary" onClick={() => download('kho-may-dong-gop.json', new Blob([exportPendingJSON(stats.items.filter((p) => !p.syncedAt))], { type: 'application/json' }))}>Xuất file JSON</button>
          </div>
        )}
      </section>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">TỶ GIÁ</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Dùng để quy đổi giá mua và giá tham khảo bằng ¥ / $ sang VNĐ.{s.rates.updatedAt ? ` Cập nhật ${fmtTs(s.rates.updatedAt)}.` : ''}</p>
        <div className="form-grid">
          <label className="field">1 ¥ = ? đ<input className="input mono" inputMode="decimal" value={jpy} onChange={(e) => setJpy(e.target.value)} placeholder="—" /></label>
          <label className="field">1 $ = ? đ<input className="input mono" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="—" /></label>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn small" disabled={busy} onClick={fetchRates}>Lấy tỷ giá tự động</button>
          <button type="button" className="btn small secondary" onClick={saveRates}>Lưu số nhập tay</button>
        </div>
      </section>

      <section className="section px" style={{ gap: 12 }}>
        <h2 className="h-mono">DỮ LIỆU</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          Mọi thứ lưu ngay trên thiết bị này.{' '}
          {persisted === true && 'Trình duyệt đã cho phép giữ dữ liệu lâu dài.'}
          {persisted === false && 'Trình duyệt chưa cam kết giữ dữ liệu lâu dài — nên thêm app vào Màn hình chính và sao lưu định kỳ.'}
        </p>
        <button type="button" className="btn danger" onClick={wipe}>Xóa toàn bộ dữ liệu</button>
      </section>

      <p className="px muted" style={{ fontSize: 12 }}>Kho máy · bản 0.1</p>
    </div>
  );
}
