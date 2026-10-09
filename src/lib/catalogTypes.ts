/** Kiểu dữ liệu một mẫu máy trong thư viện (theo schema dataset camera_catalog_en, đã bỏ trường rỗng) */

export interface LensConfig {
  role?: string;
  focal_length_min_mm?: number;
  focal_length_max_mm?: number;
  max_aperture_wide_f?: number;
  max_aperture_tele_f?: number;
  min_aperture_f?: number;
  elements?: number;
  groups?: number;
  filter_thread_mm?: number;
  equivalent_35mm_min_mm?: number;
  equivalent_35mm_max_mm?: number;
}

export interface Battery { type?: string; count?: number; voltage_each_v?: number; purpose?: string }
export interface SourceRef { name?: string; url?: string; kind?: string }
export interface ContributionMeta { at?: string; by?: string; source?: SourceRef; note?: string }

export interface CatalogModel {
  id: string;
  brand: string;
  model: string;
  aliases?: string[];
  media?: 'film' | 'digital';
  camera_type?: 'compact' | 'slr' | 'rangefinder' | 'tlr' | 'instant' | 'mirrorless' | string;
  wikidata?: string;
  quality?: string;
  variant_of_id?: string;
  release?: { year?: number; month?: number; market?: string };
  discontinued_year?: number;
  film?: {
    format?: string;
    frame_sizes_mm?: { width_mm?: number; height_mm?: number; mode?: string }[];
    iso_min?: number; iso_max?: number;
    date_imprint?: boolean;
    advance?: string;
  };
  lens?: { kind?: 'built_in' | 'interchangeable' | string; mount?: string; configurations?: LensConfig[] };
  focus?: { method?: string; minimum_distance_m?: number; lock?: boolean };
  exposure?: { modes?: string[]; meter_sensor?: string; ev_min_iso100?: number; ev_max_iso100?: number };
  shutter?: { type?: string; control?: string; fastest_s?: number; slowest_s?: number; bulb?: boolean; manual_slowest_s?: number };
  viewfinder?: { type?: string; magnification_x?: number; coverage_percent?: number };
  flash?: { built_in?: boolean; guide_number_m_iso100?: number; hot_shoe?: boolean };
  power?: { batteries?: Battery[] };
  body?: {
    measurements?: { width_mm?: number; height_mm?: number; depth_mm?: number; condition?: string }[];
    weights?: { g?: number; condition?: string }[];
  };
  digital?: {
    sensor_type?: string; sensor_format?: string; sensor_size_mm?: string | number[];
    effective_megapixels?: number; iso_min?: number; iso_max?: number; expanded_iso_max?: number;
  };
  sources?: SourceRef[];
  /** Thông tin dạng chữ (tiếng Việt) do người dùng đóng góp, ưu tiên khi hiển thị */
  text_vi?: Partial<Record<'focus' | 'exposure' | 'shutter' | 'battery' | 'iso' | 'note', string>>;
  /** Ảnh mẫu trên Wikimedia Commons (tên file), ưu tiên hơn ảnh lấy theo Wikidata */
  commons_file?: string;
  contributions?: ContributionMeta[];
}

export interface Contribution {
  id: string;
  action: 'edit' | 'add';
  at: string;
  by?: string;
  set: Partial<CatalogModel>;
  source?: SourceRef;
  note?: string;
}
