import type { CatalogModel } from './catalogTypes';
import { mainLens } from './catalog';

/* Định dạng thông số từ dữ liệu có cấu trúc sang chữ tiếng Việt */

const n = (v: number, d = 1) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
};
const ap = (f: number) => (Number.isInteger(f) ? String(f) : String(Math.round(f * 10) / 10));

export function speed(s: number): string {
  if (s >= 1) return `${n(s)} giây`;
  return `1/${Math.round(1 / s)}`;
}

const FOCUS: Record<string, string> = {
  manual: 'Chỉnh nét tay',
  autofocus: 'Autofocus',
  scale_focus: 'Chỉnh nét theo thang khoảng cách',
  fixed_focus: 'Nét cố định (fix focus)',
  coupled_rangefinder: 'Rangefinder (trùng ảnh)',
  active_autofocus: 'Autofocus chủ động',
  active_infrared_autofocus: 'Autofocus hồng ngoại chủ động',
  passive_autofocus: 'Autofocus thụ động',
  manual_through_slr: 'Chỉnh nét tay qua kính ngắm SLR',
  hybrid_phase_and_contrast_autofocus: 'AF lai (pha + tương phản)'
};

const MODES: Record<string, string> = {
  program: 'Program',
  manual: 'Chỉnh tay',
  shutter_priority: 'Ưu tiên tốc độ',
  aperture_priority: 'Ưu tiên khẩu độ',
  manual_flash_aperture: 'Khẩu độ flash chỉnh tay',
  snap_distance_priority: 'Ưu tiên khoảng cách chụp nhanh'
};

const TYPE_VI: Record<string, string> = {
  compact: 'Compact', slr: 'SLR', rangefinder: 'Rangefinder', tlr: 'TLR', instant: 'Instant', mirrorless: 'Mirrorless'
};

const COND: Record<string, string> = {
  'without batteries': 'không pin', 'without battery': 'không pin', 'with batteries': 'có pin', 'body only': 'chỉ thân máy',
  'without battery and card': 'không pin, thẻ', 'with battery and card': 'có pin, thẻ', 'with battery and memory card': 'có pin, thẻ'
};

export const QUALITY_LABEL: Record<string, { text: string; tone: 'ok' | 'auto' | 'partial' }> = {
  community_reviewed: { text: 'Đã đối chiếu', tone: 'ok' },
  manual_reviewed: { text: 'Đã đối chiếu', tone: 'ok' },
  manufacturer_reviewed: { text: 'Đã đối chiếu', tone: 'ok' },
  manufacturer_specs: { text: 'Trích tự động từ trang hãng', tone: 'auto' },
  collection_reference: { text: 'Thông tin một phần', tone: 'partial' },
  manufacturer_history_partial: { text: 'Thông tin một phần', tone: 'partial' },
  metadata_only: { text: 'Mới có tên mẫu', tone: 'partial' }
};

export function released(m: CatalogModel) {
  const r = m.release;
  if (!r?.year) return null;
  return r.month ? `${String(r.month).padStart(2, '0')}/${r.year}` : String(r.year);
}

export function category(m: CatalogModel) {
  const fmt = m.media === 'digital' ? 'Máy số' : m.film?.format === '135' ? '35mm' : m.film?.format ? `Film ${m.film.format}` : null;
  const t = m.camera_type ? TYPE_VI[m.camera_type] ?? m.camera_type : null;
  return [fmt, t].filter(Boolean).join(' ') || null;
}

export function lensTitle(m: CatalogModel) {
  if (m.lens?.kind === 'interchangeable') return m.lens.mount ? `Thay ống kính · ${m.lens.mount.split(/[.(]/)[0].trim()}` : 'Thay ống kính';
  const l = mainLens(m);
  if (!l?.focal_length_min_mm) return null;
  const zoom = l.focal_length_max_mm && l.focal_length_max_mm > l.focal_length_min_mm;
  const focal = zoom ? `${n(l.focal_length_min_mm)}–${n(l.focal_length_max_mm!)}mm` : `${n(l.focal_length_min_mm)}mm`;
  const a = l.max_aperture_wide_f
    ? zoom && l.max_aperture_tele_f && l.max_aperture_tele_f !== l.max_aperture_wide_f ? ` f/${ap(l.max_aperture_wide_f)}–${ap(l.max_aperture_tele_f)}` : ` f/${ap(l.max_aperture_wide_f)}`
    : '';
  return focal + a;
}

export function lensElements(m: CatalogModel) {
  const l = mainLens(m);
  if (!l?.elements) return null;
  return `${l.elements} thấu kính${l.groups ? ` / ${l.groups} nhóm` : ''}`;
}

export function specRows(m: CatalogModel): [string, string][] {
  const rows: [string, string | null | undefined][] = [];
  const tv = m.text_vi ?? {};
  rows.push(['Ngày ra mắt', released(m)]);

  if (m.media !== 'digital') {
    const f = m.film?.format;
    rows.push(['Film', f === '135' ? '135 (35mm)' : f]);
    const frames = m.film?.frame_sizes_mm?.filter((x) => x.width_mm && x.height_mm)
      .map((x) => `${n(Math.min(x.width_mm!, x.height_mm!))} × ${n(Math.max(x.width_mm!, x.height_mm!))} mm${x.mode === 'half_frame' ? ' (half-frame)' : x.mode === 'panorama' ? ' (panorama)' : ''}`);
    rows.push(['Khung hình', frames?.length ? frames.join(' · ') : null]);
  } else {
    const d = m.digital;
    const size = Array.isArray(d?.sensor_size_mm) ? d!.sensor_size_mm.join(' × ') + ' mm' : d?.sensor_size_mm;
    rows.push(['Cảm biến', [d?.sensor_format, d?.sensor_type, size, d?.effective_megapixels ? `${n(d.effective_megapixels)} MP` : null].filter(Boolean).join(' · ') || null]);
  }

  if (m.lens?.kind === 'interchangeable' && m.lens.mount) rows.push(['Ngàm', m.lens.mount]);
  const l = mainLens(m);
  if (l?.equivalent_35mm_min_mm) {
    rows.push(['Tiêu cự tương đương', l.equivalent_35mm_max_mm && l.equivalent_35mm_max_mm !== l.equivalent_35mm_min_mm ? `${n(l.equivalent_35mm_min_mm)}–${n(l.equivalent_35mm_max_mm)}mm` : `${n(l.equivalent_35mm_min_mm)}mm`]);
  }

  const focus = m.focus?.method ? FOCUS[m.focus.method] ?? m.focus.method.replace(/_/g, ' ') : null;
  rows.push(['Lấy nét', tv.focus ?? (focus ? focus + (m.focus?.minimum_distance_m ? `, gần nhất ${n(m.focus.minimum_distance_m, 2)} m` : '') : null)]);

  const e = m.exposure;
  const modes = e?.modes?.map((x) => MODES[x] ?? x).join(', ');
  const meter = e?.meter_sensor ? `đo sáng ${e.meter_sensor}` : null;
  const ev = e?.ev_min_iso100 != null && e?.ev_max_iso100 != null ? `EV ${n(e.ev_min_iso100)}–${n(e.ev_max_iso100)}` : null;
  rows.push(['Phơi sáng', tv.exposure ?? ([modes, meter, ev].filter(Boolean).join(' · ') || null)]);

  const s = m.shutter;
  let shutter: string | null = null;
  if (s?.fastest_s) {
    shutter = s.slowest_s && s.slowest_s !== s.fastest_s ? `${speed(s.slowest_s)} – ${speed(s.fastest_s)}` : `${speed(s.fastest_s)}${s.slowest_s === s.fastest_s ? ' (một tốc độ)' : ''}`;
    if (!shutter.includes('giây')) shutter += ' giây';
    if (s.bulb) shutter += ' + B';
    const kind = [s.type === 'leaf' ? 'lá' : s.type === 'focal_plane' ? 'màn' : null, s.control === 'electronic' ? 'điện tử' : s.control === 'mechanical' ? 'cơ' : null].filter(Boolean).join(' ');
    if (kind) shutter = `${kind[0].toUpperCase()}${kind.slice(1)} · ${shutter}`;
  }
  rows.push(['Màn trập', tv.shutter ?? shutter]);

  const isoMin = m.film?.iso_min ?? m.digital?.iso_min;
  const isoMax = m.film?.iso_max ?? m.digital?.iso_max;
  rows.push(['ISO', tv.iso ?? (isoMin && isoMax ? `${isoMin}–${isoMax.toLocaleString('vi-VN')}${m.digital?.expanded_iso_max ? ` (mở rộng ${m.digital.expanded_iso_max.toLocaleString('vi-VN')})` : ''}` : null)]);

  const vf = m.viewfinder;
  if (vf?.type) rows.push(['Kính ngắm', [vf.type, vf.magnification_x ? `${n(vf.magnification_x, 2)}×` : null, vf.coverage_percent ? `phủ ${n(vf.coverage_percent)}%` : null].filter(Boolean).join(' · ')]);
  if (m.flash?.built_in) rows.push(['Đèn flash', `Tích hợp${m.flash.guide_number_m_iso100 ? `, GN ${n(m.flash.guide_number_m_iso100)}` : ''}`]);

  const batt = m.power?.batteries?.map((b) => `${b.count ? `${b.count} × ` : ''}${b.type ?? ''}${b.voltage_each_v ? ` (${n(b.voltage_each_v, 2)}V)` : ''}`).join(' + ');
  rows.push(['Pin', tv.battery ?? (batt || null)]);

  const dims = m.body?.measurements?.filter((x) => x.width_mm).map((x) => `${n(x.width_mm!)} × ${n(x.height_mm ?? 0)} × ${n(x.depth_mm ?? 0)} mm${x.condition && x.condition !== 'not stated' ? ` (${COND[x.condition] ?? x.condition})` : ''}`);
  rows.push(['Kích thước', dims?.length ? dims.join(' · ') : null]);
  const weights = m.body?.weights?.filter((x) => x.g).map((x) => `${n(x.g!)} g${x.condition && x.condition !== 'not stated' ? ` (${COND[x.condition] ?? x.condition})` : ''}`);
  rows.push(['Khối lượng', weights?.length ? weights.join(' · ') : null]);

  return rows.filter((r): r is [string, string] => !!r[1]);
}
