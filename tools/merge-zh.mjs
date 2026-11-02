// 汉化合并器：把翻译批次（work/out/batch-NN.json）合并成语言包（src/i18n/zh/e/NNN.json）
// 用法:
//   node tools/merge-zh.mjs           # 合并并写文件
//   node tools/merge-zh.mjs --check   # 只检查覆盖率，不写文件
// 说明: 翻译代理只返回 {id,title,summary,hint,kw,tr:{索引:译文},demo:{韩文:中文}}，
//       韩文原文始终取自工作单 work/batch/*.json，避免代理重新敲韩文导致 key 对不上。
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const batchDir = join(root, 'work', 'batch');
const outDir = join(root, 'work', 'out');
const zhDir = join(root, 'src', 'i18n', 'zh', 'e');
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const checkOnly = process.argv.includes('--check');
const overridesPath = join(here, 'zh-overrides.json');
const OVERRIDES = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};

if (!existsSync(batchDir)) { console.error('缺少 work/batch，请先运行 node tools/extract-zh-work.mjs'); process.exit(1); }

const orders = [];
for (const f of readdirSync(batchDir).filter((n) => /^batch-\d+\.json$/.test(n)).sort()) {
  const list = JSON.parse(readFileSync(join(batchDir, f), 'utf8'));
  list.forEach((it) => orders.push(Object.assign({ _batch: f }, it)));
}

const problems = [];
const made = [];
let totalStrings = 0, doneStrings = 0;

for (const it of orders) {
  const outFile = join(outDir, 'batch-' + it._batch.replace(/^batch-/, ''));
  let tr = null;
  if (existsSync(outFile)) {
    try { tr = JSON.parse(readFileSync(outFile, 'utf8')); } catch (e) { problems.push(`${it._batch}: JSON 解析失败 ${e.message}`); continue; }
  }
  const mine = Array.isArray(tr) ? tr.find((x) => x && x.id === it.id) : null;
  if (!mine) { problems.push(`${it.id}: 缺少译文（${it._batch}）`); continue; }
  const entry = { id: it.id, title: String(mine.title || '').trim(), summary: String(mine.summary || '').trim(), hint: String(mine.hint || '').trim(), kw: Array.isArray(mine.kw) ? mine.kw.map((s) => String(s).trim()).filter(Boolean) : [], map: [], demo: {} };
  if (!entry.title) problems.push(`${it.id}: title 为空`);
  if (!entry.summary) problems.push(`${it.id}: summary 为空`);
  ['title', 'summary', 'hint'].forEach((k) => { if (HANGUL.test(entry[k])) problems.push(`${it.id}: ${k} 含韩文`); });
  const t = mine.tr && typeof mine.tr === 'object' ? mine.tr : {};
  const ov = OVERRIDES[it.id] && typeof OVERRIDES[it.id] === 'object' ? OVERRIDES[it.id] : {};
  const ovTr = ov.tr && typeof ov.tr === 'object' ? ov.tr : {};
  const ovMap = Array.isArray(ov.map) ? ov.map : [];
  const ovKeys = ovMap.map((p) => String(p[0]));
  const missing = [];
  it.strings.forEach((s) => {
    totalStrings += 1;
    const raw = s.i in ovTr ? ovTr[s.i] : t[String(s.i)];
    if (raw == null) {
      // 人工改写：整段代码被 map 覆盖时，里面的碎词就不用再单独翻
      if (ovKeys.some((k) => k.indexOf(s.s) >= 0)) return;
      missing.push(s.i);
      return;
    }
    // 空译文 = 删除（中文不需要韩文助词），也要进 map，否则源码里会残留韩文
    if (raw === '') { entry.map.push([s.s, '']); doneStrings += 1; return; }
    let zh = String(raw);
    if (HANGUL.test(zh)) { problems.push(`${it.id}#${s.i}: 译文含韩文 ${JSON.stringify(zh).slice(0, 40)}`); return; }
    // 保留原文首尾空格（拼接型文案必须保留，否则会粘在一起）
    if (/^\s/.test(s.s) && !/^\s/.test(zh)) zh = ' ' + zh.trimStart();
    if (/\s$/.test(s.s) && !/\s$/.test(zh)) zh = zh.trimEnd() + ' ';
    if (!zh.trim()) { missing.push(s.i); return; }
    entry.map.push([s.s, zh]);
    doneStrings += 1;
  });
  ovMap.forEach((p) => { if (Array.isArray(p) && p.length === 2) entry.map.push([String(p[0]), String(p[1])]); });
  if (missing.length) problems.push(`${it.id}: 缺 ${missing.length} 条字符串译文（索引 ${missing.slice(0, 8).join(',')}${missing.length > 8 ? '…' : ''}）`);
  const demo = mine.demo && typeof mine.demo === 'object' ? mine.demo : {};
  it.demoStrings.forEach((ko) => {
    const zh = demo[ko];
    if (!zh) problems.push(`${it.id}: 缺演示文案译文 ${JSON.stringify(ko)}`);
    else if (HANGUL.test(zh)) problems.push(`${it.id}: 演示文案含韩文 ${JSON.stringify(zh)}`);
    else entry.demo[ko] = String(zh);
  });
  made.push(entry);
}

// 未被工作单覆盖的旧文件不删除，但要报告
if (existsSync(zhDir)) {
  const existing = new Set(readdirSync(zhDir).map((f) => f.slice(0, 3)));
  made.forEach((e) => { if (!existing.has(e.id)) return; });
}

const summary = {
  elements: made.length,
  elementsTotal: orders.length,
  strings: doneStrings,
  stringsTotal: totalStrings,
  problems: problems.length
};
console.log(JSON.stringify(summary, null, 2));
if (problems.length) {
  console.log('\n问题（前 40 条）:');
  problems.slice(0, 40).forEach((p) => console.log(' - ' + p));
  if (problems.length > 40) console.log(` …另外 ${problems.length - 40} 条`);
}
if (!checkOnly) {
  mkdirSync(zhDir, { recursive: true });
  made.forEach((e) => writeFileSync(join(zhDir, e.id + '.json'), JSON.stringify(e, null, 1) + '\n'));
  console.log(`\n已写入 ${made.length} 个语言文件到 src/i18n/zh/e/`);
}
process.exit(problems.length ? 1 : 0);
