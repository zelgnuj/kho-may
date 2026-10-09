// Bọc chuỗi tiếng Việt trong src/ bằng tx(...). Chạy một lần: node scripts/i18n-codemod.mjs
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
const SKIP = [/src\/i18n\//, /src\/lib\/i18n\.ts$/, /src\/generated\//, /src\/lib\/supabase\.ts$/];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(p) && !SKIP.some((r) => r.test(p))) files.push(p); } })('src');

const keys = new Set();
const report = [];
const q = (s) => JSON.stringify(s);

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start, end, text}
  const visit = (node) => {
    // bỏ qua kiểu, import, khoá thuộc tính
    if (ts.isImportDeclaration(node) || ts.isLiteralTypeNode(node) || ts.isTypeNode(node) && !ts.isTypeLiteralNode(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent;
      const isKey = (ts.isPropertyAssignment(p) && p.name === node) || ts.isPropertySignature(p) || (ts.isElementAccessExpression(p) && p.argumentExpression === node);
      if (!isKey && VI.test(node.text) && !(ts.isCallExpression(p) && p.expression.getText() === 'tx')) {
        keys.add(node.text);
        const call = `tx(${q(node.text)})`;
        if (ts.isJsxAttribute(p)) edits.push({ start: node.getStart(), end: node.getEnd(), text: `{${call}}` });
        else edits.push({ start: node.getStart(), end: node.getEnd(), text: call });
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((t) => VI.test(t))) {
        let key = node.head.text;
        const args = [];
        node.templateSpans.forEach((s, i) => {
          if (containsVi(s.expression)) report.push(`${file}:${sf.getLineAndCharacterOfPosition(s.getStart()).line + 1} nested`);
          key += `{${i}}` + s.literal.text;
          args.push(s.expression.getText());
        });
        keys.add(key);
        edits.push({ start: node.getStart(), end: node.getEnd(), text: `tx(${q(key)}${args.map((a) => ', ' + a).join('')})` });
        return;
      }
    }
    if (ts.isJsxText(node) && VI.test(node.text)) {
      const raw = node.text;
      const trimmed = raw.replace(/\s+/g, ' ').trim();
      keys.add(trimmed);
      const lead = /^[ \t]+\S/.test(raw) || (/^\s/.test(raw) && !/^\s*\n/.test(raw)) ? "{' '}" : '';
      const trail = /\S[ \t]+$/.test(raw) && !/\n\s*$/.test(raw) ? "{' '}" : '';
      edits.push({ start: node.getStart(), end: node.getEnd(), text: `${lead}{tx(${q(trimmed)})}${trail}` });
      return;
    }
    ts.forEachChild(node, visit);
  };
  const containsVi = (n) => { let f = false; const v = (x) => { if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateHead(x) || ts.isTemplateMiddle(x) || ts.isTemplateTail(x) || ts.isJsxText(x)) && VI.test(x.text)) f = true; ts.forEachChild(x, v); }; v(n); return f; };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // thêm import
  const rel = path.relative(path.dirname(file), 'src/lib/i18n').replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  if (!/import \{[^}]*\btx\b[^}]*\} from/.test(out)) {
    const m = out.match(/^(import [\s\S]*?;\n)(?!import)/m);
    const firstNonImport = out.search(/^(?!import |\s*$|\/\/|\/\*| \*|\*\/).+/m);
    const lastImport = [...out.matchAll(/^import [^;]+;\n/gm)].pop();
    const at = lastImport ? lastImport.index + lastImport[0].length : 0;
    out = out.slice(0, at) + `import { tx } from '${spec}';\n` + out.slice(at);
    void m; void firstNonImport;
  }
  fs.writeFileSync(file, out);
  report.push(`${file}: ${edits.length}`);
}
fs.writeFileSync('scripts/i18n-keys.json', JSON.stringify([...keys].sort(), null, 1));
console.log(report.join('\n'));
console.log('keys:', keys.size);
