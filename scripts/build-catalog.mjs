// Gộp data/catalog.json + data/catalog-contrib.json → src/generated/catalog.json (app đọc file này).
// Chạy tự động trước mỗi lần build (npm run build → prebuild).
import fs from 'node:fs';
import { applyContributions } from './catalog-merge.mjs';

const base = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const contrib = JSON.parse(fs.readFileSync('data/catalog-contrib.json', 'utf8'));
const models = applyContributions(base.models, contrib.contributions ?? []);

fs.mkdirSync('src/generated', { recursive: true });
fs.writeFileSync('src/generated/catalog.json', JSON.stringify({ origin: base.origin, models }));
const edited = (contrib.contributions ?? []).length;
console.log(`catalog: ${models.length} mẫu, ${edited} đóng góp → src/generated/catalog.json`);
