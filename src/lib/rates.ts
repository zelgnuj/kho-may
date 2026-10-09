import { setSetting, type Settings } from '../db';
import { tx } from './i18n';

/**
 * Lấy tỷ giá JPY, USD -> VNĐ từ open.er-api.com (miễn phí, không cần khóa).
 * Nếu lỗi mạng, giữ nguyên tỷ giá cũ; người dùng vẫn có thể nhập tay trong Cài đặt.
 */
export async function refreshRates(current: Settings['rates']): Promise<Settings['rates']> {
  const res = await fetch('https://open.er-api.com/v6/latest/VND');
  if (!res.ok) throw new Error(tx("Không lấy được tỷ giá"));
  const data = await res.json();
  const jpy = data?.rates?.JPY;
  const usd = data?.rates?.USD;
  if (!jpy || !usd) throw new Error(tx("Dữ liệu tỷ giá không hợp lệ"));
  const next = {
    JPY: Math.round((1 / jpy) * 100) / 100,
    USD: Math.round(1 / usd),
    updatedAt: Date.now()
  };
  await setSetting('rates', { ...current, ...next });
  return next;
}
