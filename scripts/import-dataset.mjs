// Nhập dataset camera_catalog_en.json → data/catalog.json (rút gọn, bỏ trường rỗng).
// Dùng: node scripts/import-dataset.mjs <đường-dẫn-dataset.json>
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('Thiếu đường dẫn dataset'); process.exit(1); }
const ds = JSON.parse(fs.readFileSync(src, 'utf8'));

const DROP = new Set(['field_sources', 'specification_facts', 'regional_names', 'inception_year']);

function prune(v) {
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (DROP.has(k)) continue;
      const p = prune(x);
      if (p !== undefined) o[k] = p;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || v === '' ? undefined : v;
}

const models = ds.cameras
  .filter((c) => c.record_type === 'model')
  .map((c) => {
    const level = c.quality?.level;
    const base = {
      id: c.id, brand: c.brand, model: c.model,
      aliases: c.aliases, media: c.media, camera_type: c.camera_type,
      wikidata: c.external_ids?.wikidata?.[0],
      quality: level
    };
    if (level === 'metadata_only') return prune(base);
    return prune({
      ...base,
      variant_of_id: c.variant_of_id, release: c.release, discontinued_year: c.discontinued_year,
      film: c.film, lens: c.lens, focus: c.focus, exposure: c.exposure, shutter: c.shutter,
      viewfinder: c.viewfinder, flash: c.flash, power: c.power, body: c.body, digital: c.digital,
      sources: c.sources?.map((s) => ({ name: s.name, url: s.url, kind: s.kind }))
    });
  });

const out = {
  schema: 'kho-may-catalog/1',
  origin: { dataset: ds.dataset_name, version: ds.schema_version, generated_at: ds.generated_at, conventions: ds.conventions },
  models
};
fs.writeFileSync('data/catalog.json', JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"'));
const withSpecs = models.filter((m) => m.quality !== 'metadata_only').length;
console.log(`Đã ghi ${models.length} mẫu (${withSpecs} có thông số) · ${(fs.statSync('data/catalog.json').size / 1024).toFixed(0)} KB`);
