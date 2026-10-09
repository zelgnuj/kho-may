// Kiểm tra logic gộp đóng góp + tính toàn vẹn của dữ liệu thư viện.
// Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyContributions, deepMerge } from '../../scripts/catalog-merge.mjs';

test('deepMerge: object gộp, mảng thay hẳn, null xoá', () => {
  const a = { lens: { focal: 35, f: 2.8 }, batteries: [1, 2], keep: 1 };
  const b = { lens: { f: 3.5 }, batteries: [9], keep: null };
  assert.deepEqual(deepMerge(a, b), { lens: { focal: 35, f: 3.5 }, batteries: [9] });
});

test('applyContributions: sửa + thêm, ghi nguồn và nhãn cộng đồng', () => {
  const base = [{ id: 'x-1', brand: 'X', model: '1', quality: 'metadata_only' }];
  const out = applyContributions(base, [
    { id: 'x-1', action: 'edit', at: '2026-01-01', set: { release: { year: 1980 } }, source: { name: 'S', url: 'https://s' } },
    { id: 'x-2', action: 'add', at: '2026-01-02', set: { brand: 'X', model: '2' }, source: { name: 'S2' } },
    { id: 'khong-co', action: 'edit', at: '2026-01-03', set: { a: 1 } }
  ]);
  assert.equal(out.length, 2);
  const x1 = out.find((m) => m.id === 'x-1');
  assert.equal(x1.release.year, 1980);
  assert.equal(x1.quality, 'community_reviewed');
  assert.equal(x1.sources[0].url, 'https://s');
  assert.equal(out.find((m) => m.id === 'x-2').model, '2');
});

const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const contrib = JSON.parse(fs.readFileSync('data/catalog-contrib.json', 'utf8'));

test('thư viện gốc: mã không trùng, đủ hãng + tên mẫu', () => {
  const ids = new Set();
  for (const m of catalog.models) {
    assert.ok(m.id && m.brand && m.model, `thiếu trường: ${JSON.stringify(m).slice(0, 80)}`);
    assert.ok(!ids.has(m.id), `trùng mã ${m.id}`);
    ids.add(m.id);
  }
  assert.ok(ids.size > 4000);
});

test('mọi đóng góp đều hợp lệ (để một đóng góp lỗi không làm hỏng app)', () => {
  const ids = new Set(catalog.models.map((m) => m.id));
  const added = new Set();
  for (const c of contrib.contributions ?? []) {
    const where = `${c.action} ${c.id}`;
    assert.match(c.id, /^[a-z0-9][a-z0-9-]{1,80}$/, `mã không hợp lệ: ${where}`);
    assert.ok(['edit', 'add'].includes(c.action), `action lạ: ${where}`);
    assert.match(c.at ?? '', /^\d{4}-\d{2}-\d{2}/, `thiếu ngày: ${where}`);
    assert.ok(c.set && typeof c.set === 'object' && !Array.isArray(c.set), `set phải là object: ${where}`);
    assert.ok(c.source?.name || c.source?.url, `thiếu nguồn: ${where}`);
    if (c.action === 'edit') assert.ok(ids.has(c.id) || added.has(c.id), `sửa mẫu không tồn tại: ${where}`);
    if (c.action === 'add') { assert.ok(c.set.brand && c.set.model, `thêm mẫu thiếu hãng/tên: ${where}`); added.add(c.id); }
  }
  const merged = applyContributions(catalog.models, contrib.contributions ?? []);
  assert.equal(new Set(merged.map((m) => m.id)).size, merged.length);
});
