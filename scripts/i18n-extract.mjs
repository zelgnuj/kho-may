// Liệt kê mọi khoá tx("...") trong src/ và báo khoá chưa có bản dịch tiếng Anh.
// node scripts/i18n-extract.mjs [--missing]
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/generated|i18n$/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(p)) files.push(p); } })('src');
const keys = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText() === 'tx' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      const k = n.arguments[0].text;
      if (!keys.has(k)) keys.set(k, `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const enSrc = fs.readFileSync('src/i18n/en.ts', 'utf8');
const enKeys = new Set([...enSrc.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)].map((m) => JSON.parse(m[1])));
const missing = [...keys.keys()].filter((k) => !enKeys.has(k));
const unused = [...enKeys].filter((k) => !keys.has(k));
if (process.argv.includes('--missing')) {
  console.log(JSON.stringify(missing.map((k) => [k, keys.get(k)]), null, 1));
} else {
  console.log(`keys: ${keys.size}, translated: ${keys.size - missing.length}, missing: ${missing.length}, unused: ${unused.length}`);
  if (missing.length) process.exitCode = 1;
}
