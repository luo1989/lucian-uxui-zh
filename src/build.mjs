// lucianLabs UI 요소 갤러리 빌드
// 실행: node prompt-uxui/src/build.mjs
// 입력: src/tokens.css, src/elements/NNN-slug.html (요소 400개: 001~200 인터페이스, 201~400 애니메이션), src/gallery/{index.html,gallery.css,gallery.js,i18n-core.js}
// 요소 파일 머리: <!-- @meta {...} --> 필수, <!-- @demo [...] --> 자동 재생 시연, <!-- @en {...} --> 영어 제목·설명·번역 목록
// 출력: prompt-uxui/prompt-uxui-lab/index.html (단일 파일, 모든 코드를 인라인으로 포함)
//
// [中文本地化分支] 汉化版在原版基础上增加简体中文语言包：
//   输入: src/i18n/zh/e/NNN.json（标题/说明/提示/关键词/代码字符串映射）
//   ZH_STRICT=1 时缺少中文翻译会中断构建（部署用），默认只警告（便于同步上游新增组件）
//   --site 参数会额外生成 dist/ 静态部署目录（index.html + robots.txt/sitemap.xml/404.html/_headers）
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const elDir = join(here, 'elements');
const galDir = join(here, 'gallery');
const zhDir = join(here, 'i18n', 'zh', 'e');
const siteAssets = join(here, 'site');
const siteBuild = process.argv.includes('--site');
const outDir = siteBuild ? join(here, '..', 'dist') : join(here, '..', 'prompt-uxui-lab');
const outFile = join(outDir, 'index.html');

// 분류와 기본 색(타일 빛 번짐). 요소 @meta의 hue, hue2가 있으면 그 값을 씁니다
const CATEGORIES = {
  '버튼': ['#7B61FF', '#3D8BFF'],
  '토글·선택': ['#14B8A6', '#7B61FF'],
  '입력·검색': ['#3D8BFF', '#22C3A6'],
  '메뉴·탭': ['#F59E0B', '#FF6B8B'],
  '카드·콘텐츠': ['#FF6B8B', '#7B61FF'],
  '로그인·가입': ['#6366F1', '#22C3A6'],
  '알림·피드백': ['#FB923C', '#7B61FF'],
  '로딩·진행': ['#06B6D4', '#7B61FF'],
  '빈·오류 상태': ['#10B981', '#3D8BFF'],
  '위젯·차트': ['#EAB308', '#FF6B8B'],
  '공간·일정·디자인 도구': ['#C16235', '#3D8BFF'],
  '문서·데이터 편집': ['#3D8BFF', '#22C3A6'],
  '분석·데이터': ['#EAB308', '#FF6B8B'],
  '작업·시스템': ['#6366F1', '#7B61FF'],
  // 201~400: 웹사이트를 만들 때 쓰는 애니메이션 컬렉션
  '텍스트 모션': ['#F43F5E', '#8B5CF6'],
  '히어로·배경': ['#6366F1', '#14B8A6'],
  '내비게이션': ['#0EA5E9', '#6366F1'],
  '스크롤 모션': ['#0EA5E9', '#A855F7'],
  '섹션·콘텐츠': ['#8B5CF6', '#EC4899'],
  '소셜 증명': ['#F59E0B', '#EC4899'],
  '커머스·가격': ['#F97316', '#EAB308'],
  '폼·입력': ['#22C55E', '#06B6D4'],
  '앱 화면': ['#6366F1', '#7B61FF'],
  '빌더 도구': ['#0891B2', '#22C55E'],
  '커서·호버': ['#E11D48', '#3D8BFF'],
  '프로모션·보상': ['#F59E0B', '#EF4444'],
  '데이터 모션': ['#10B981', '#6366F1'],
};
const ALIAS = { '메뉴·내비': '메뉴·탭', '탭': '메뉴·탭' };
const SHAPES = ['square', 'tall'];
const EXPECTED = 400;
// 컬렉션: 1은 처음 공개한 인터페이스 200개, 2는 새로 더한 애니메이션 200개입니다
const setOf = (id) => (+id > 200 ? 2 : 1);

const errors = [];
const warns = [];
const coreSrc = readFileSync(join(galDir, 'i18n-core.js'), 'utf8');
const uxLocalize = new Function(coreSrc + '\nreturn uxLocalize;')();
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
// 자동 재생 시연 단계: [동작, 대상 선택자, 순번, ...값]
const DEMO_OPS = { wait: 1, tap: 1, hold: 1, hover: 1, leave: 1, glide: 1, drag: 1, key: 1, type: 1, erase: 1, set: 1, js: 1, reset: 1, scroll: 1 };
const STRICT = !process.env.UX_PARTIAL;
const ZH_STRICT = !!process.env.ZH_STRICT;

// 简体中文语言包：src/i18n/zh/e/NNN.json（与上游元素文件分开存放，方便同步上游新增组件）
// 每个文件: {"id":"001","title":"…","summary":"…","hint":"…","kw":["…"],"map":[["韩文","中文"]],"demo":{"韩文":"中文"}}
const zhPack = new Map();
if (existsSync(zhDir)) {
  for (const f of readdirSync(zhDir).filter((n) => /^\d{3}\.json$/.test(n)).sort()) {
    const id = f.slice(0, 3);
    try {
      const z = JSON.parse(readFileSync(join(zhDir, f), 'utf8'));
      if (z.id && z.id !== id) errors.push(`i18n/zh/e/${f}: id "${z.id}"가 파일 이름과 다릅니다`);
      zhPack.set(id, z);
    } catch (e) {
      errors.push(`i18n/zh/e/${f}: JSON 오류 ${e.message}`);
    }
  }
}
const zhMissing = [];
const zhStale = [];
const files = readdirSync(elDir).filter((f) => /^\d{3}-[a-z0-9-]+\.html$/.test(f)).sort();
const items = [];
const seenSlug = new Set();

for (const file of files) {
  const id = file.slice(0, 3);
  const slug = file.slice(4, -5);
  let src = readFileSync(join(elDir, file), 'utf8').replace(/\r\n/g, '\n');

  const metaMatch = src.match(/^\s*<!--\s*@meta\s*([\s\S]*?)-->/);
  if (!metaMatch) { errors.push(`${file}: @meta 주석 없음`); continue; }
  let meta;
  try { meta = JSON.parse(metaMatch[1]); } catch (e) { errors.push(`${file}: @meta JSON 오류 ${e.message}`); continue; }
  src = src.slice(metaMatch[0].length).trim();
  let demo = [];
  const demoMatch = src.match(/^<!--\s*@demo\s*([\s\S]*?)-->/);
  if (demoMatch) {
    try { demo = JSON.parse(demoMatch[1]); } catch (e) { errors.push(`${file}: @demo JSON 오류 ${e.message}`); }
    src = src.slice(demoMatch[0].length).trim();
  }
  let en = null;
  const enMatch = src.match(/^<!--\s*@en\s*([\s\S]*?)-->/);
  if (enMatch) {
    try { en = JSON.parse(enMatch[1]); } catch (e) { errors.push(`${file}: @en JSON 오류 ${e.message}`); }
    src = src.slice(enMatch[0].length).trim();
  }
  if (!Array.isArray(demo)) { errors.push(`${file}: @demo는 배열이어야 합니다`); demo = []; }
  demo.forEach((st, k) => {
    if (!Array.isArray(st) || !DEMO_OPS[st[0]]) errors.push(`${file}: @demo ${k}번째 단계 "${JSON.stringify(st).slice(0, 40)}" 알 수 없음`);
  });
  if (!demo.length) (STRICT ? errors : warns).push(`${file}: @demo 없음`);

  const category = ALIAS[meta.category] || meta.category;
  if (!meta.title || !meta.summary) errors.push(`${file}: title/summary 필요`);
  if (!CATEGORIES[category]) errors.push(`${file}: 알 수 없는 분류 "${meta.category}"`);
  const shape = meta.shape || 'square';
  if (!SHAPES.includes(shape)) errors.push(`${file}: shape는 square 또는 tall`);
  if (seenSlug.has(slug)) errors.push(`${file}: slug 중복`);
  seenSlug.add(slug);

  const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>\s*$/);
  if (!scriptMatch) { errors.push(`${file}: 끝에 <script>가 필요합니다`); continue; }
  const js = scriptMatch[1].trim();
  const html = src.slice(0, scriptMatch.index).trim();

  if ((src.match(/<script[\s>]/g) || []).length !== 1) errors.push(`${file}: <script>은 하나여야 합니다`);
  // 루트는 class="ux uNNN" 으로 시작하며, 상태 클래스가 뒤에 붙을 수 있습니다
  if (!new RegExp(`class="ux u${id}[" ]`).test(html)) errors.push(`${file}: 루트 class="ux u${id}" 누락`);
  if (!html.includes('<style>')) errors.push(`${file}: <style> 누락`);
  if (!js.includes('document.currentScript.previousElementSibling')) errors.push(`${file}: 루트 찾기(currentScript)가 필요합니다`);
  // 요소 CSS가 다른 요소에 새지 않도록 선택자 접두사를 확인합니다
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const bad = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)
    .filter((sel) => !sel.startsWith('@'))
    .flatMap((sel) => sel.split(','))
    .map((s) => s.trim())
    .filter((s) => s && !s.includes(`.u${id}`) && !/^(from|to|\d+%)$/.test(s));
  if (bad.length) errors.push(`${file}: 접두사 없는 선택자 ${bad.slice(0, 3).join(' | ')}`);
  // @property는 문서 전체에 등록되므로, 이름이 겹치면 다른 요소의 같은 변수까지 타입이 바뀝니다(예: --a를 각도로 등록하면 색 변수 --a가 깨짐)
  const props = (css.match(/@property\s+--[\w-]+/g) || []).filter((p) => !p.includes(`--u${id}-`));
  if (props.length) errors.push(`${file}: @property 이름은 --u${id}- 로 시작해야 합니다: ${props.join(', ')}`);

  // 영어판: 주석을 지우고 번역 목록을 적용한 결과에 한글이 남으면 안 됩니다
  if (!en) (STRICT ? errors : warns).push(`${file}: @en 없음`);
  else {
    const pairs = Array.isArray(en.map) ? en.map : [];
    if (!en.title || !en.summary) errors.push(`${file}: @en title/summary 필요`);
    pairs.forEach((p) => { if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') errors.push(`${file}: @en map 항목 형식 ${JSON.stringify(p).slice(0, 50)}`); });
    const eh = uxLocalize(html, 'html', pairs), ej = uxLocalize(js, 'js', pairs);
    const left = [];
    for (const [part, code] of [['html', eh], ['js', ej]]) {
      // keep: 영어판에도 그대로 두는 말(예: 언어 선택 목록의 '한국어'처럼 자기 언어로 쓰는 이름)
      const keep = Array.isArray(en.keep) ? en.keep : [];
      code.split('\n').forEach((line, n) => { const l2 = keep.reduce((acc, w) => acc.split(w).join(''), line); if (HANGUL.test(l2)) left.push(`${part}:${n + 1} ${line.trim().slice(0, 110)}`); });
    }
    if (left.length) errors.push(`${file}: 영어판에 한글이 남았습니다\n      ` + left.slice(0, 14).join('\n      ') + (left.length > 14 ? `\n      …외 ${left.length - 14}줄` : ''));
    const unused = pairs.filter((p) => !html.includes(p[0]) && !js.includes(p[0]));
    if (unused.length) warns.push(`${file}: 쓰이지 않는 번역 ${unused.map((p) => JSON.stringify(p[0])).slice(0, 4).join(', ')}`);
    for (const k of ['title', 'summary', 'hint']) if (en[k] && HANGUL.test(en[k])) errors.push(`${file}: @en ${k}에 한글`);
    demo.forEach((st) => st.forEach((v) => {
      if (typeof v === 'string' && HANGUL.test(v) && st[0] !== 'js') errors.push(`${file}: @demo 문자열에 한글이 있으면 {"ko","en"}로 나눠 주세요: ${v.slice(0, 30)}`);
    }));
  }

  // 简体中文版：与英文版相同的替换机制，替换后同样不能残留韩文
  let zh = null;
  const zp = zhPack.get(id);
  if (!zp) {
    (ZH_STRICT ? errors : warns).push(`${file}: 缺少中文翻译 (src/i18n/zh/e/${id}.json)`);
    zhMissing.push(id);
  } else {
    const pairs = Array.isArray(zp.map) ? zp.map : [];
    if (!zp.title || !zp.summary) errors.push(`i18n/zh/e/${id}.json: 需要 title/summary`);
    ['title', 'summary', 'hint'].forEach((k) => { if (zp[k] && HANGUL.test(zp[k])) errors.push(`i18n/zh/e/${id}.json: ${k} 里还有韩文`); });
    if (zp.kw != null && !Array.isArray(zp.kw)) errors.push(`i18n/zh/e/${id}.json: kw 必须是数组`);
    const kw = (Array.isArray(zp.kw) ? zp.kw : []).filter((w) => typeof w === 'string' && w.trim());
    kw.forEach((w) => { if (HANGUL.test(w)) errors.push(`i18n/zh/e/${id}.json: kw 里还有韩文 "${w}"`); });
    pairs.forEach((p) => {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') errors.push(`i18n/zh/e/${id}.json: map 项格式 ${JSON.stringify(p).slice(0, 50)}`);
      else if (HANGUL.test(p[1])) errors.push(`i18n/zh/e/${id}.json: 译文里还有韩文 "${p[1]}"`);
    });
    const zhHtml = uxLocalize(html, 'html', pairs), zhJs = uxLocalize(js, 'js', pairs);
    const left = [];
    for (const [part, code] of [['html', zhHtml], ['js', zhJs]]) {
      code.split('\n').forEach((line, n) => { if (HANGUL.test(line)) left.push(`${part}:${n + 1} ${line.trim().slice(0, 110)}`); });
    }
    if (left.length) errors.push(`i18n/zh/e/${id}.json: 中文版仍有韩文残留\n      ` + left.slice(0, 10).join('\n      ') + (left.length > 10 ? `\n      …另外 ${left.length - 10} 行` : ''));
    const unused = pairs.filter((p) => !html.includes(p[0]) && !js.includes(p[0]));
    if (unused.length) warns.push(`i18n/zh/e/${id}.json: 未使用的翻译 ${unused.map((p) => JSON.stringify(p[0])).slice(0, 4).join(', ')}`);
    // 自动演示里的 {ko,en} 字符串补上 zh
    const demoZh = zp.demo && typeof zp.demo === 'object' ? zp.demo : {};
    demo.forEach((st, si) => st.forEach((v, vi) => {
      if (v && typeof v === 'object' && typeof v.ko === 'string') {
        const zhv = demoZh[v.ko];
        if (zhv) demo[si][vi] = Object.assign({}, v, { zh: zhv });
        else if (ZH_STRICT) errors.push(`i18n/zh/e/${id}.json: @demo 字符串缺少中文翻译 ${JSON.stringify(v.ko)}`);
      }
    }));
    if (zp.id && zp.id !== id) zhStale.push(id);
    zh = { title: zp.title, summary: zp.summary, hint: zp.hint || '', kw, map: pairs };
  }

  const [h1, h2] = CATEGORIES[category] || ['#7B61FF', '#3D8BFF'];
  items.push({
    id, slug,
    set: setOf(id),
    title: meta.title,
    category,
    // 분류 칩을 늘어놓는 순서(CATEGORIES에 적은 차례)
    ci: Object.keys(CATEGORIES).indexOf(category),
    summary: meta.summary,
    hint: meta.hint || '',
    shape,
    // 폭이 컨테이너를 따르는 요소: 갤러리는 정해진 폭의 상자 안에 놓고, 크기가 바뀌면 배율을 다시 맞춥니다
    ...(meta.fluid ? { fluid: true } : {}),
    hue: meta.hue || h1,
    hue2: meta.hue2 || h2,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    html,
    js,
    demo,
    en: en ? { title: en.title, summary: en.summary, hint: en.hint || '', map: en.map || [], keep: Array.isArray(en.keep) ? en.keep : [] } : null,
    zh,
  });
}

// 컬렉션 안에서 보여 줄 순서(order.json): 완성도가 높은 요소를 먼저 놓습니다. 목록에 없는 요소는 번호순으로 뒤에 붙습니다
const orderSrc = JSON.parse(readFileSync(join(here, 'order.json'), 'utf8'));
for (const [set, list] of Object.entries(orderSrc)) {
  if (set.startsWith('_')) continue;
  const seen = new Set();
  list.forEach((id, n) => {
    if (seen.has(id)) errors.push(`order.json: ${id}가 두 번 있습니다`);
    seen.add(id);
    const it = items.find((x) => x.id === id);
    if (!it) { if (!process.env.UX_PARTIAL) errors.push(`order.json: 없는 요소 ${id}`); return; }
    if (String(it.set) !== set) errors.push(`order.json: ${id}는 컬렉션 ${it.set}입니다`);
    it.rank = n;
  });
  if (!process.env.UX_PARTIAL) items.filter((x) => String(x.set) === set && !seen.has(x.id)).forEach((x) => errors.push(`order.json: ${x.id}가 순서에 빠졌습니다`));
}

// UX_PARTIAL=1 이면 작성 중인 부분 빌드를 허용합니다. 최종 빌드에서는 반드시 400개여야 합니다.
if (!process.env.UX_PARTIAL && items.length !== EXPECTED) errors.push(`요소 ${items.length}개 (목표 ${EXPECTED})`);
if (warns.length) console.warn('참고:\n' + warns.map((w) => ' - ' + w).join('\n'));
if (errors.length) {
  console.error('빌드 중단:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}

const tokens = readFileSync(join(here, 'tokens.css'), 'utf8');
const galleryHtml = readFileSync(join(galDir, 'index.html'), 'utf8');
const galleryCss = readFileSync(join(galDir, 'gallery.css'), 'utf8');
const galleryJs = readFileSync(join(galDir, 'gallery.js'), 'utf8').replace('/*@I18N_CORE@*/', () => coreSrc);

// JSON을 <script> 안에 넣을 때 </script> 종료 방지
const data = JSON.stringify({ tokens, items }).replace(/<\//g, '<\\/');

// 스크립트가 꺼져도 목록이 보이도록 타일의 제목 구조를 미리 HTML로 넣습니다. 스크립트가 켜지면 다시 그립니다
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byShow = (a, b) => (b.set - a.set) || ((a.rank ?? 1e9) - (b.rank ?? 1e9)) || a.id.localeCompare(b.id);
// 首屏默认语言是简体中文，静态标题也用中文（无脚本时和 SEO 抓取时同样是中文）
const staticTiles = items.slice().sort(byShow).map((it) =>
  `<article class="g-tile" style="--h:${it.hue};--h2:${it.hue2}"><p class="g-cap"><b>${it.id}</b><span>${escH((it.zh && it.zh.title) || it.title)}</span></p></article>`).join('');

const page = galleryHtml
  .replace('<!--@GRID_TILES@-->', () => staticTiles)
  .replace('/*@GALLERY_CSS@*/', () => galleryCss)
  .replace('/*@GALLERY_JS@*/', () => galleryJs)
  .replace('/*@TOKENS@*/', () => tokens)
  .replace('__UX_DATA__', () => data);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
const zhDone = items.filter((x) => x.zh).length;
console.log(`OK: 元素 ${items.length} 个 → ${outFile} (${kb} KB)`);
console.log(`中文本地化覆盖: ${zhDone}/${items.length} 个元素 (${(zhDone / items.length * 100).toFixed(1)}%)` + (zhMissing.length ? ` · 缺失 ${zhMissing.length} 个: ${zhMissing.slice(0, 12).join(', ')}${zhMissing.length > 12 ? ' …' : ''}` : ''));

// --site: 组装 Cloudflare Pages 静态部署目录
if (siteBuild) {
  if (existsSync(siteAssets)) {
    for (const f of readdirSync(siteAssets)) copyFileSync(join(siteAssets, f), join(outDir, f));
  }
  // 线上地址写进 robots/sitemap/页面（可用 UX_SITE_URL 覆盖）
  const siteUrl = (process.env.UX_SITE_URL || 'https://lucian-uxui-zh.pages.dev').replace(/\/$/, '');
  for (const f of ['robots.txt', 'sitemap.xml', 'index.html']) {
    const fp = join(outDir, f);
    if (existsSync(fp)) writeFileSync(fp, readFileSync(fp, 'utf8').replace(/__SITE_URL__/g, siteUrl));
  }
  const files = readdirSync(outDir);
  const sizes = files.map((f) => [f, Buffer.byteLength(readFileSync(join(outDir, f)))]);
  sizes.sort((a, b) => b[1] - a[1]);
  console.log(`dist: ${files.length} 个文件, 最大 ${sizes[0][0]} ${(sizes[0][1] / 1024).toFixed(1)} KB, 合计 ${(sizes.reduce((s, x) => s + x[1], 0) / 1024).toFixed(1)} KB`);
}

