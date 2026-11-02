// 汉化工作单提取器
// 从上游 src/elements/NNN-*.html 里抽出需要翻译的韩文串，生成分批工作单供翻译代理使用。
// 用法: node tools/extract-zh-work.mjs [batchSize]
// 输出: work/batch-NN.json
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const elDir = join(root, 'src', 'elements');
const workDir = join(root, 'work');
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const HANGUL_RUN = /[\u3131-\u318E\uAC00-\uD7A3]+/g;

// 与 build.mjs 保持一致的分类型（用于给翻译代理提供中文分类名）
const CATEGORY_ZH = {
  '버튼': '按钮', '토글·선택': '开关·选择', '입력·검색': '输入·搜索', '메뉴·탭': '菜单·标签页',
  '카드·콘텐츠': '卡片·内容', '로그인·가입': '登录·注册', '알림·피드백': '提示·反馈',
  '로딩·진행': '加载·进度', '빈·오류 상태': '空状态·错误状态', '위젯·차트': '组件·图表',
  '공간·일정·디자인 도구': '布局·日程·设计工具', '문서·데이터 편집': '文档·数据编辑',
  '분석·데이터': '分析·数据', '작업·시스템': '工作流·系统',
  '텍스트 모션': '文字动效', '히어로·배경': '首屏·背景', '내비게이션': '导航', '스크롤 모션': '滚动动效',
  '섹션·콘텐츠': '区块·内容', '소셜 증명': '社会证明', '커머스·가격': '电商·定价', '폼·입력': '表单·输入',
  '앱 화면': '应用界面', '빌더 도구': '建站工具', '커서·호버': '光标·悬停', '프로모션·보상': '促销·奖励',
  '데이터 모션': '数据动效'
};

// 去注释：html/js 各按上游 i18n-core 的规则处理（只用于提取，不影响构建）
function stripComments(code, kind) {
  let out = String(code);
  if (kind === 'html') {
    out = out.replace(/<!--[\s\S]*?-->/g, (m) => (HANGUL.test(m) ? '' : m));
    out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => (HANGUL.test(m) ? '' : m));
  } else {
    out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => (HANGUL.test(m) ? '' : m));
    out = out.split('\n').filter((line) => !(/^\s*\/\//.test(line) && HANGUL.test(line))).join('\n');
    out = out.replace(/([^\s:'"\\])([ \t]+)\/\/ [^\n'"]*$/gm, (m, a) => (HANGUL.test(m) ? a : m));
  }
  return out;
}

// 从 HTML 里抽候选串：文本节点、属性值、<style> 里的字符串
function htmlCandidates(html) {
  const out = [];
  const styleBlocks = [];
  const withoutStyle = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => { styleBlocks.push(css); return ''; });
  // 属性值
  withoutStyle.replace(/\b([a-zA-Z-]+)="([^"]*)"/g, (m, name, val) => {
    if (HANGUL.test(val)) out.push({ s: val, ctx: `attr:${name}`, src: 'html' });
    return m;
  });
  // 文本节点：去掉标签后按换行/尖括号切分
  const texts = withoutStyle.replace(/<[^>]*>/g, '\n').split('\n');
  texts.forEach((t) => { if (HANGUL.test(t)) { const s = t.trim(); if (s) out.push({ s, ctx: 'html-text', src: 'html' }); } });
  // CSS 里的字符串（content:"..." 等）
  styleBlocks.forEach((css) => {
    css.replace(/"([^"]*)"/g, (m, v) => { if (HANGUL.test(v)) out.push({ s: v, ctx: 'css-string', src: 'html' }); return m; });
    css.replace(/'([^']*)'/g, (m, v) => { if (HANGUL.test(v)) out.push({ s: v, ctx: 'css-string', src: 'html' }); return m; });
  });
  return out;
}

// 从 JS 里抽候选串：字符串字面量（含模板串）
function jsCandidates(js) {
  const out = [];
  const re = /'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(js))) {
    const v = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3];
    if (v != null && HANGUL.test(v)) out.push({ s: v, ctx: 'js-string', src: 'js' });
  }
  return out;
}

const files = readdirSync(elDir).filter((f) => /^\d{3}-[a-z0-9-]+\.html$/.test(f)).sort();
const batchSize = +(process.argv[2] || 20);
const batches = [];
const stats = { elements: 0, strings: 0, demo: 0 };

for (const file of files) {
  const id = file.slice(0, 3);
  let src = readFileSync(join(elDir, file), 'utf8').replace(/\r\n/g, '\n');
  const metaMatch = src.match(/^\s*<!--\s*@meta\s*([\s\S]*?)-->/);
  if (!metaMatch) throw new Error(`${file}: no @meta`);
  const meta = JSON.parse(metaMatch[1]);
  src = src.slice(metaMatch[0].length).trim();
  let demo = [];
  const demoMatch = src.match(/^<!--\s*@demo\s*([\s\S]*?)-->/);
  if (demoMatch) { demo = JSON.parse(demoMatch[1]); src = src.slice(demoMatch[0].length).trim(); }
  let en = null;
  const enMatch = src.match(/^<!--\s*@en\s*([\s\S]*?)-->/);
  if (enMatch) { en = JSON.parse(enMatch[1]); src = src.slice(enMatch[0].length).trim(); }
  const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>\s*$/);
  if (!scriptMatch) throw new Error(`${file}: no script`);
  const jsRaw = scriptMatch[1].trim();
  const htmlRaw = src.slice(0, scriptMatch.index).trim();

  const html = stripComments(htmlRaw, 'html');
  const js = stripComments(jsRaw, 'js');
  const enPairs = new Map((en && Array.isArray(en.map) ? en.map : []).map((p) => [p[0], p[1]]));

  const seen = new Map();
  const add = (c) => {
    if (!c.s || !HANGUL.test(c.s)) return;
    const key = c.s;
    if (seen.has(key)) return;
    seen.set(key, { i: 0, s: c.s, ctx: c.ctx, src: c.src, en: enPairs.get(c.s) || '' });
  };
  htmlCandidates(html).forEach(add);
  jsCandidates(js).forEach(add);

  // 兜底：模拟替换后仍残留的韩文片段（多为跨标签/拼接的碎词），按词补进工作单
  let restHtml = html;
  let restJs = js;
  for (const s of seen.keys()) { restHtml = restHtml.split(s).join(''); restJs = restJs.split(s).join(''); }
  const leftovers = new Set();
  [['html', restHtml], ['js', restJs]].forEach(([kind, code]) => {
    const runs = code.match(HANGUL_RUN) || [];
    runs.forEach((r) => { if (r.length > 1) leftovers.add(r); });
  });
  leftovers.forEach((s) => add({ s, ctx: 'fragment', src: 'html+js' }));

  // 顺序：按在源码里第一次出现的位置，便于翻译时对照
  const order = [];
  const hay = html + '\n' + js;
  [...seen.values()].forEach((v) => { v.pos = hay.indexOf(v.s); });
  order.push(...[...seen.values()].sort((a, b) => (a.pos - b.pos) || (a.s.length - b.s.length)));
  order.forEach((v, i) => { v.i = i; delete v.pos; });

  const demoStrings = [];
  demo.forEach((st) => st.forEach((v) => {
    if (v && typeof v === 'object' && typeof v.ko === 'string' && HANGUL.test(v.ko) && !demoStrings.includes(v.ko)) demoStrings.push(v.ko);
  }));

  const item = {
    id, file,
    cat_ko: meta.category, cat_zh: CATEGORY_ZH[meta.category] || meta.category,
    shape: meta.shape || 'square',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    ko: { title: meta.title, summary: meta.summary, hint: meta.hint || '' },
    en: en ? { title: en.title || '', summary: en.summary || '', hint: en.hint || '' } : null,
    strings: order,
    demoStrings
  };
  stats.elements += 1;
  stats.strings += order.length;
  stats.demo += demoStrings.length;
  batches.push(item);
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(join(workDir, 'batch'), { recursive: true });
for (let b = 0; b < batches.length; b += batchSize) {
  const slice = batches.slice(b, b + batchSize);
  const no = String(b / batchSize + 1).padStart(2, '0');
  writeFileSync(join(workDir, 'batch', `batch-${no}.json`), JSON.stringify(slice, null, 1));
}
// 索引文件：翻译代理只需要读自己那一批
const index = batches.map((it, i) => ({ id: it.id, batch: String(Math.floor(i / batchSize) + 1).padStart(2, '0'), strings: it.strings.length }));
writeFileSync(join(workDir, 'index.json'), JSON.stringify(index, null, 0));
writeFileSync(join(workDir, 'stats.json'), JSON.stringify(stats, null, 2));
console.log(JSON.stringify({ ...stats, batches: Math.ceil(batches.length / batchSize), batchSize }, null, 2));
