import { useEffect, useState } from 'react';
import { db, setSetting, useSettings } from '../db';
import { fmtTs, parseAmount } from '../lib/format';
import { refreshRates } from '../lib/rates';
import { pingPriceApi } from '../lib/autoPrice';
import { toast } from '../lib/toast';
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
      await pingPriceApi(t);
      await setSetting('priceToken', t);
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
          App nhờ Claude tìm giá đã bán gần đây trên eBay, Yahoo! Auction JP và các cửa hàng máy ảnh, rồi lưu kèm nguồn.
          Nhập mã truy cập bạn đã đặt (biến <span className="mono">PRICE_TOKEN</span> trên Vercel).
        </p>
        <label className="field">Mã truy cập
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={token}
              onChange={(e) => { setToken(e.target.value); setTokenOk(null); }} onBlur={() => setSetting('priceToken', token.trim())} placeholder="Chưa nhập" />
            <button type="button" className="btn small secondary" disabled={!token.trim() || checking} onClick={checkToken}>{checking ? '…' : 'Kiểm tra'}</button>
          </div>
        </label>
        {tokenOk === true && <span className="up" style={{ fontSize: 13 }}>Kết nối tốt, đã bật tự tra giá.</span>}
        {tokenOk === false && <span className="down" style={{ fontSize: 13 }}>{tokenErr}</span>}
        <label className="check rows" style={{ padding: '0 14px' }}>
          <span>Tự tra giá khi mở app</span>
          <input type="checkbox" checked={s.autoPrice} onChange={(e) => setSetting('autoPrice', e.target.checked)} />
        </label>
        <div className="field">Tra lại khi giá cũ hơn
          <Segmented label="Chu kỳ tra giá" value={String(s.autoPriceDays)} onChange={(v) => setSetting('autoPriceDays', Number(v))}
            options={[{ value: '7', label: '7 ngày' }, { value: '30', label: '30 ngày' }, { value: '90', label: '90 ngày' }]} />
        </div>
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
