/**
 * Thư viện mẫu máy — thông số kỹ thuật theo từng mẫu.
 *
 * Quy tắc biên soạn:
 *  - Mỗi mẫu có `source`: trang đã dùng để lấy số liệu. Ưu tiên trang chính thức của hãng
 *    (Canon Camera Museum, Ricoh), sau đó Wikipedia và các trang tư liệu máy ảnh.
 *  - Trường nào nguồn không ghi thì BỎ TRỐNG, không suy đoán.
 *  - `image`: chỉ dùng ảnh có giấy phép tự do (vd Wikimedia Commons) kèm ghi công.
 */

import type { CamType } from '../db';

export interface CatalogLens {
  name?: string;
  focal: number;
  focalMax?: number;
  aperture: number;
  apertureMax?: number;
  elements?: number;
  groups?: number;
  /** Tiêu cự tương đương 35mm (máy số) */
  equiv?: string;
}

export interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  /** Các tên khác dùng để nhận dạng (đã viết thường, bỏ dấu cách thừa) */
  aliases?: string[];
  /** "1994-09" hoặc "1994" */
  released?: string;
  category: string;
  type: CamType;
  lens?: CatalogLens;
  mount?: string;
  film?: string;
  frame?: string;
  sensor?: string;
  focus?: string;
  exposure?: string;
  shutter?: string;
  iso?: string;
  battery?: string;
  dimensions?: string;
  weight?: string;
  note?: string;
  source: { title: string; url: string };
  image?: { url: string; credit: string; license: string; page: string };
}

const F135 = '135 (35mm)';
const FULL = '24 × 36 mm';

export const CATALOG: CatalogEntry[] = [
  {
    id: 'canon-a35-datelux', brand: 'Canon', model: 'A35 Datelux',
    released: '1977-10', category: '35mm Rangefinder', type: 'RF',
    lens: { name: 'Canon Lens', focal: 40, aperture: 2.8, elements: 5, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Rangefinder (trùng ảnh)',
    exposure: 'Program EE tự động hoàn toàn (CdS), EV 9–17',
    shutter: '1/60 – 1/320 giây',
    iso: '25–400',
    battery: '2 × pin thủy ngân 1,35V H-D + 1 × AA (đèn flash)',
    dimensions: '122 × 75 × 61 mm', weight: '540 g',
    note: 'Đèn flash tích hợp GN 12, in ngày lên phim. Ở Nhật có tên "Nighter".',
    source: { title: 'Canon Camera Museum', url: 'https://global.canon/en/c-museum/product/film98.html' }
  },
  {
    id: 'canon-canonet-giii-ql17', brand: 'Canon', model: 'Canonet G-III QL17',
    aliases: ['canon canonet ql17 giii', 'canon canonet ql17 g-iii', 'canon canonet g-iii 17', 'canon canonet giii ql17'],
    released: '1972-03', category: '35mm Rangefinder', type: 'RF',
    lens: { name: 'Canon Lens', focal: 40, aperture: 1.7, elements: 6, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Rangefinder (trùng ảnh)',
    exposure: 'Ưu tiên tốc độ (EE, CdS), có chỉnh tay',
    shutter: 'B, 1/4 – 1/500 giây',
    iso: '25–800',
    battery: '1 × pin thủy ngân 1,3V H-D',
    dimensions: '120 × 75 × 60 mm', weight: '620 g',
    source: { title: 'Canon Camera Museum', url: 'https://global.canon/en/c-museum/product/film84.html' }
  },
  {
    id: 'canon-mc', brand: 'Canon', model: 'MC',
    aliases: ['canon mc qd'],
    released: '1984-04', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Canon Lens', focal: 35, aperture: 2.8, elements: 4, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Autofocus hồng ngoại chủ động',
    exposure: 'Program EE tự động hoàn toàn, EV 6–17',
    shutter: 'Điện tử: f/2.8 1/8 giây – f/16 1/500 giây',
    iso: '64–1000',
    battery: '2 × AAA',
    dimensions: '106 × 65 × 42 mm', weight: '255 g (có pin)',
    note: 'Bản MC QD có in ngày. Đèn flash rời MC-S gắn bên hông.',
    source: { title: 'Canon Camera Museum', url: 'https://global.canon/en/c-museum/product/film113.html' }
  },
  {
    id: 'chinon-bellami', brand: 'Chinon', model: 'Bellami',
    released: '1980', category: '35mm Compact', type: 'PNS',
    lens: { name: 'Chinon', focal: 35, aperture: 2.8, elements: 4, groups: 3 },
    film: F135, frame: FULL,
    focus: 'Chỉnh nét tay, gần nhất 1 m',
    exposure: 'EE tự động (CdS), EV 6–17',
    shutter: 'Seiko program 1/8 – 1/1000 giây',
    iso: '25–400',
    battery: '2 × pin bạc 1,5V',
    dimensions: '105 × 63 × 33 mm (đóng nắp)', weight: '250 g',
    note: 'Ống kính thu vào thân khi đóng nắp. Đèn flash rời Chinon S-120.',
    source: { title: 'Chinon Bellami — bảng thông số gốc', url: 'https://www.cameramanuals.org/chinon_specs/chinon_bellami_specs.pdf' }
  },
  {
    id: 'nikon-af600', brand: 'Nikon', model: 'AF600',
    aliases: ['nikon lite touch af', 'nikon af 600', 'nikon af-600'],
    released: '1993', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Nikon Lens', focal: 28, aperture: 3.5, elements: 3, groups: 3 },
    film: F135, frame: FULL,
    focus: 'Autofocus, gần nhất 0,35 m',
    exposure: 'Tự động',
    shutter: 'Điện tử 1/3 – 1/500 giây',
    iso: '100–1000 (DX)',
    battery: '1 × CR123A',
    dimensions: '108 × 62 × 32 mm', weight: '155 g (không pin)',
    note: 'Ở Mỹ bán với tên Nikon Lite Touch AF.',
    source: { title: '135compact.com', url: 'https://135compact.com/nikon_af600.htm' }
  },
  {
    id: 'nikon-l35af', brand: 'Nikon', model: 'L35AF',
    aliases: ['nikon l35 af', 'nikon pikaichi'],
    released: '1983', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Nikon Lens', focal: 35, aperture: 2.8, elements: 5, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Autofocus, gần nhất 0,8 m',
    exposure: 'Tự động',
    shutter: '1/8 – 1/430 giây',
    iso: '50–400 (đời đầu), tới 1000 (đời sau)',
    battery: 'Pin AA',
    dimensions: '124 × 73 × 46 mm', weight: '346 g',
    source: { title: 'Kamerastore', url: 'https://kamerastore.com/products/nikon-l35af' }
  },
  {
    id: 'olympus-xa', brand: 'Olympus', model: 'XA',
    released: '1979', category: '35mm Rangefinder thu gọn', type: 'RF',
    lens: { name: 'F.Zuiko', focal: 35, aperture: 2.8, elements: 6, groups: 5 },
    film: F135, frame: FULL,
    focus: 'Rangefinder, 0,9 m – ∞',
    exposure: 'Ưu tiên khẩu độ, bù ngược sáng +1,5 EV',
    shutter: '10 giây – 1/500 giây',
    iso: '25–800',
    battery: '2 × SR44',
    dimensions: '102 × 64,5 × 40 mm', weight: '225 g',
    source: { title: 'Wikipedia — Olympus XA', url: 'https://en.wikipedia.org/wiki/Olympus_XA' }
  },
  {
    id: 'olympus-pen-eed', brand: 'Olympus', model: 'PEN EED',
    aliases: ['olympus pen-eed'],
    released: '1967', category: 'Half-frame', type: 'HALF',
    lens: { name: 'Zuiko', focal: 32, aperture: 1.7, elements: 6, groups: 4 },
    film: F135, frame: '18 × 24 mm (half-frame)',
    focus: 'Chỉnh nét theo thang khoảng cách, 0,8 m – ∞',
    exposure: 'Tự động (EE), đo sáng CdS',
    iso: '12–400',
    battery: '1 × PX625 1,35V (thủy ngân)',
    weight: '430 g',
    note: 'Sản xuất 1967–1972. Cuộn 36 kiểu chụp được 72 khung.',
    source: { title: '35mmc — Olympus PEN EED', url: 'https://www.35mmc.com/30/05/2025/olympus-pen-eed-the-underrated-pen' }
  },
  {
    id: 'olympus-mju-i', brand: 'Olympus', model: 'mju I',
    aliases: ['olympus mju', 'olympus mju-1', 'olympus mju 1', 'olympus μ', 'olympus stylus', 'olympus infinity stylus'],
    released: '1991', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Olympus Lens', focal: 35, aperture: 3.5, elements: 3, groups: 3 },
    film: F135, frame: FULL,
    focus: 'Autofocus, gần nhất 0,35 m',
    exposure: 'Tự động hoàn toàn',
    shutter: 'Điện tử 1/15 – 1/500 giây',
    iso: '50–3200',
    battery: '1 × CR123A',
    dimensions: '117 × 63 × 37 mm', weight: '170 g (không pin)',
    note: 'Ở Mỹ có tên Stylus. Flash tích hợp GN ~12.',
    source: { title: '135compact.com', url: 'https://135compact.com/olympus_mju_I.htm' }
  },
  {
    id: 'olympus-om-2n', brand: 'Olympus', model: 'OM-2N',
    aliases: ['olympus om-2n', 'olympus om2n', 'olympus om-2 n'],
    released: '1979', category: '35mm SLR', type: 'SLR',
    mount: 'Olympus OM',
    film: F135, frame: FULL,
    focus: 'Chỉnh nét tay',
    exposure: 'Ưu tiên khẩu độ, chỉnh tay có đo sáng',
    shutter: 'Tự động 120 giây – 1/1000; tay 1 giây – 1/1000 + B',
    dimensions: '136 × 83 × 50 mm', weight: '520 g',
    source: { title: 'Wikipedia — Olympus OM-2', url: 'https://en.wikipedia.org/wiki/Olympus_OM-2' }
  },
  {
    id: 'pentax-pc35af', brand: 'Pentax', model: 'PC35AF',
    aliases: ['pentax pc 35 af', 'pentax pc35 af'],
    released: '1982', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Pentax', focal: 35, aperture: 2.8, elements: 5 },
    film: F135, frame: FULL,
    focus: 'Autofocus hồng ngoại chủ động',
    exposure: 'Program AE (CdS), EV 6–17',
    shutter: 'Điện tử 1/8 – 1/430 giây',
    iso: '25–400',
    battery: '2 × AAA',
    weight: '312 g (có pin)',
    source: { title: 'Mike Eckman — Pentax PC35AF', url: 'https://mikeeckman.com/pentax-pc35af-1982/' }
  },
  {
    id: 'ricoh-ff-70', brand: 'Ricoh', model: 'FF-70',
    aliases: ['ricoh ff70', 'ricoh ff-70d', 'ricoh ff70d', 'ricoh ff 70', 'ricoh ff 70d'],
    released: '1985-04', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Rikenon', focal: 35, aperture: 2.8, elements: 5, groups: 5 },
    film: F135, frame: FULL,
    focus: 'Autofocus',
    exposure: 'Program (màn trập điện tử)',
    shutter: 'Điện tử 2 giây – 1/500 giây',
    iso: '25–1600',
    battery: '2 × AA',
    dimensions: 'FF-70: 128 × 70 × 41 mm · FF-70D: 128 × 70 × 46 mm',
    weight: 'FF-70: 290 g · FF-70D: 300 g (không pin)',
    source: { title: 'Ricoh Imaging — danh sách máy ảnh Ricoh', url: 'https://www.ricoh-imaging.co.jp/japan/products/ricoh-filmcamera/cameralist/FF-70.html' }
  },
  {
    id: 'ricoh-r1', brand: 'Ricoh', model: 'R1',
    released: '1994-09', category: '35mm Compact · Point & Shoot', type: 'PNS',
    lens: { name: 'Ricoh Lens', focal: 30, aperture: 3.5, elements: 4, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Passive autofocus, tự chọn chủ thể',
    exposure: 'Program Auto',
    shutter: 'Điện tử 2 giây – 1/500 giây',
    iso: '50–3200',
    battery: '1 × CR2',
    dimensions: '117 × 61 × 25 mm*', weight: '145 g (không pin)',
    note: '*Độ dày 25 mm không tính phần tay cầm. Máy còn có chế độ wide panorama 24mm f/8.',
    source: { title: 'Ricoh Imaging — danh sách máy ảnh Ricoh', url: 'https://www.ricoh-imaging.co.jp/japan/products/ricoh-filmcamera/cameralist/R1.html' }
  },
  {
    id: 'yashica-electro-35-gx', brand: 'Yashica', model: 'Electro 35 GX',
    released: '1975', category: '35mm Rangefinder', type: 'RF',
    lens: { name: 'Color-Yashinon DX', focal: 40, aperture: 1.7, elements: 6, groups: 4 },
    film: F135, frame: FULL,
    focus: 'Rangefinder, gần nhất 0,8 m',
    exposure: 'Ưu tiên khẩu độ (điện tử)',
    shutter: 'Copal lá, 30 giây – 1/500 giây',
    battery: 'PX640 (pin gốc)',
    dimensions: '123 × 75 × 64 mm', weight: '580 g',
    source: { title: 'Kamerastore', url: 'https://kamerastore.com/en-au/products/yashica-electro-35-gx-1' }
  },
  {
    id: 'yashica-electro-35-mc', brand: 'Yashica', model: 'Electro 35 MC',
    released: '1972', category: '35mm Compact', type: 'PNS',
    lens: { name: 'Yashinon-DX', focal: 40, aperture: 2.8 },
    film: F135, frame: FULL,
    focus: 'Chỉnh nét tay, gần nhất 0,9 m',
    exposure: 'Ưu tiên khẩu độ (điện tử)',
    iso: '25–1000',
    battery: '4LR44',
    dimensions: '104 × 74 × 54 mm', weight: '365 g',
    source: { title: 'Kamerastore', url: 'https://kamerastore.com/products/yashica-electro-35-mc' }
  },
  {
    id: 'panasonic-lumix-tz3', brand: 'Panasonic', model: 'Lumix DMC-TZ3',
    aliases: ['panasonic lumix tz3', 'panasonic tz3', 'panasonic lumix dmc-tz3', 'panasonic lumix dmc tz3'],
    released: '2007-03', category: 'Máy số compact · siêu zoom', type: 'DIG',
    lens: { focal: 4.6, focalMax: 46, aperture: 3.3, apertureMax: 4.9, equiv: '28–280mm' },
    sensor: 'CCD 1/2,35", 7,2 MP',
    exposure: 'Program, các chế độ cảnh',
    shutter: '60 giây – 1/2000 giây',
    iso: '100–1250 (3200 ở chế độ độ nhạy cao)',
    battery: 'Pin Li-ion riêng của hãng (~270 kiểu/lần sạc, CIPA)',
    dimensions: '105 × 59 × 37 mm', weight: '257 g (có pin)',
    source: { title: 'Imaging Resource', url: 'https://imaging-resource.com/PRODS/TZ3/TZ3DAT.HTM' }
  },
  {
    id: 'ricoh-gr-iv', brand: 'Ricoh', model: 'GR IV',
    aliases: ['ricoh gr4'],
    released: '2025-09', category: 'Máy số compact · APS-C', type: 'DIG',
    lens: { name: 'GR Lens', focal: 18.3, aperture: 2.8, elements: 7, groups: 5, equiv: '28mm' },
    sensor: 'APS-C BSI CMOS, 25,7 MP',
    iso: '100–204.800',
    battery: 'DB-120',
    dimensions: '109,4 × 61,1 × 32,7 mm',
    note: 'Ngày công bố: 09/2025.',
    source: { title: 'Wikipedia — Ricoh GR', url: 'https://en.wikipedia.org/wiki/Ricoh_GR_(large_sensor_compact_camera)' }
  }
];
