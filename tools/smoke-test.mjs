// 真实浏览器验收：桌面 + 移动端，检查中文覆盖、搜索、收藏、复制、三语切换、组件挂载
// 用法: node tools/smoke-test.mjs [url]
//   默认 http://127.0.0.1:8788/（先 npm run site && npm run serve）
//   需要本机 Chrome；Playwright 模块可用 PW_MODULE 指定（默认从 node_modules 解析）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'test-output');
mkdirSync(outDir, { recursive: true });

const url = process.argv[2] || process.env.TEST_URL || 'http://127.0.0.1:8788/';
const pwSpec = process.env.PW_MODULE || 'playwright';
let chromium;
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  for (const spec of [pwSpec, 'playwright', 'playwright-core']) {
    try { ({ chromium } = req(spec)); break; } catch (e) { /* 继续尝试下一个 */ }
  }
  if (!chromium) {
    console.error('未找到 Playwright。请先 `npm i -D playwright`，或用 PW_MODULE 指向已安装的 playwright 目录。');
    process.exit(2);
  }
}

const results = [];
const add = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); if (!ok) console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); };
const log = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' ' + (r.failure() && r.failure().errorText)));
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url()); });

log(`\n▶ 打开 ${url}`);
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.UXG && window.UXG.ITEMS && window.UXG.ITEMS.length > 0, null, { timeout: 30000 });
const loadMs = Date.now() - t0;
const perf = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  return { dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), transfer: n.transferSize || 0, decoded: n.decodedBodySize || 0 };
});
log(`  加载 ${loadMs}ms · DCL ${perf.dcl}ms · load ${perf.load}ms · 传输 ${(perf.transfer / 1024).toFixed(0)} KB · 解码 ${(perf.decoded / 1024 / 1024).toFixed(2)} MB`);

/* ---------- 1. 默认语言 / SEO ---------- */
const head = await page.evaluate(() => ({
  lang: document.documentElement.lang,
  title: document.title,
  desc: (document.querySelector('meta[name="description"]') || {}).content || '',
  canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
  og: (document.querySelector('meta[property="og:title"]') || {}).content || '',
  ld: (document.querySelector('script[type="application/ld+json"]') || {}).textContent || '',
  tiles: document.querySelectorAll('.g-tile').length,
  cats: Array.from(document.querySelectorAll('.g-cat')).map((b) => b.textContent.replace(/\d+$/, '')),
  count: (document.querySelector('#count') || {}).textContent
}));
add('默认语言为简体中文', head.lang === 'zh-CN', head.lang);
add('标题为中文', /中文版/.test(head.title), head.title);
add('meta description 为中文', /400/.test(head.desc) && !/[\uAC00-\uD7A3]/.test(head.desc), head.desc.slice(0, 60));
add('canonical / og:title 存在', !!head.canonical && !!head.og, head.canonical);
add('JSON-LD 存在', /CollectionPage/.test(head.ld));
add('静态首屏有组件格子', head.tiles > 0, head.tiles + ' 个');
add('分类为中文', head.cats.length > 20 && head.cats.every((c) => !/[\uAC00-\uD7A3]/.test(c)), head.cats.slice(0, 6).join(' / '));

/* ---------- 2. 数据完整性：400 个组件的中文覆盖 ---------- */
const coverage = await page.evaluate(() => {
  const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
  const bad = { noZh: [], hangul: [], emptyTitle: [], prompt: [], code: [] };
  let n = 0;
  UXG.ITEMS.forEach((it) => {
    if (!it.zh) { bad.noZh.push(it.id); return; }
    const c = UXG.loc(it);
    if (HANGUL.test(c.title) || HANGUL.test(c.summary) || HANGUL.test(c.hint || '')) bad.hangul.push(it.id);
    if (HANGUL.test(c.html) || HANGUL.test(c.js)) bad.hangul.push(it.id + '(code)');
    if (!c.title.trim() || !c.summary.trim()) bad.emptyTitle.push(it.id);
    if (c.html.indexOf('class="ux u' + it.id) < 0) bad.emptyTitle.push(it.id + '(root)');
    n += 1;
  });
  // 提示词与代码（抽样全量生成会占内存，这里全部生成但只校验关键标记）
  UXG.ITEMS.forEach((it) => {
    const p = UXG.promptOf(it);
    if (p.indexOf('[组件]') !== 0 || p.indexOf('请把下面的 UI 组件应用到我的项目里') < 0 || p.indexOf('--- 代码开始') < 0) bad.prompt.push(it.id);
    if (HANGUL.test(p)) bad.prompt.push(it.id + '(hangul)');
    const code = UXG.codeOf(it);
    if (code.indexOf('MIT License') < 0 || code.indexOf('<style>') < 0) bad.code.push(it.id);
    if (HANGUL.test(code)) bad.code.push(it.id + '(hangul)');
  });
  return { n, total: UXG.ITEMS.length, bad };
});
add('400 个组件全部有中文', coverage.n === coverage.total && coverage.bad.noZh.length === 0, `${coverage.n}/${coverage.total} 缺 ${coverage.bad.noZh.join(',') || '无'}`);
add('中文标题/说明/代码无韩文残留', coverage.bad.hangul.length === 0, coverage.bad.hangul.slice(0, 8).join(','));
add('标题/说明/根节点结构完整', coverage.bad.emptyTitle.length === 0, coverage.bad.emptyTitle.slice(0, 8).join(','));
add('400 条中文提示词结构正确', coverage.bad.prompt.length === 0, coverage.bad.prompt.slice(0, 8).join(','));
add('400 份代码含 MIT 署名与 style', coverage.bad.code.length === 0, coverage.bad.code.slice(0, 8).join(','));

/* ---------- 3. 中文搜索 ---------- */
const QUERIES = ['思考动画', '聊天输入框', '卡片', '侧边栏', '底部弹窗', '加载动画', '液态玻璃', '页面切换'];
const searchOut = [];
for (const q of QUERIES) {
  const r = await page.evaluate(async (query) => {
    const input = document.querySelector('#q');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 320));
    const count = +(document.querySelector('#count').textContent || 0);
    const titles = Array.from(document.querySelectorAll('.g-tile .g-cap span')).slice(0, 5).map((s) => s.textContent);
    const ids = Array.from(document.querySelectorAll('.g-tile')).slice(0, 5).map((t) => t.querySelector('.g-cap b').textContent);
    return { count, titles, ids };
  }, q);
  searchOut.push({ q, ...r });
  add(`中文搜索「${q}」有结果`, r.count > 0, `${r.count} 个 · ${r.ids.join(' ')} ${r.titles.slice(0, 3).join(' / ')}`);
}
await page.evaluate(() => { const i = document.querySelector('#q'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(400);
const afterClear = await page.evaluate(() => +document.querySelector('#count').textContent);
add('清空搜索后恢复 400 个', afterClear === 400, afterClear);

/* ---------- 4. 收藏（localStorage + 筛选 + 刷新保留） ---------- */
await page.evaluate(() => { try { localStorage.removeItem('ux-gallery-favs'); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.UXG && UXG.ITEMS.length === 400);
const fav1 = await page.evaluate(async () => {
  const tile = document.querySelector('.g-tile');
  const btn = tile.querySelector('.g-fav');
  btn.click();
  await new Promise((r) => setTimeout(r, 250));
  return { pressed: btn.getAttribute('aria-pressed'), stored: JSON.parse(localStorage.getItem('ux-gallery-favs') || '[]'), toast: document.querySelector('#toast').textContent };
});
add('点星标收藏并写入 localStorage', fav1.pressed === 'true' && fav1.stored.length === 1, JSON.stringify(fav1.stored) + ' toast=' + fav1.toast);
add('收藏提示文案为中文', /收藏/.test(fav1.toast), fav1.toast);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.UXG && UXG.ITEMS.length === 400);
const fav2 = await page.evaluate(async () => {
  const btn = document.querySelector('#fav-only');
  btn.click();
  await new Promise((r) => setTimeout(r, 400));
  return { count: +document.querySelector('#count').textContent, favs: UXG.favs(), only: UXG.favOnly(), onStars: document.querySelectorAll('.g-fav.is-on').length };
});
add('刷新后收藏仍在，只看收藏筛选生效', fav2.count === 1 && fav2.only === true && fav2.favs.length === 1, JSON.stringify(fav2));
await page.evaluate(async () => { document.querySelector('#fav-only').click(); await new Promise((r) => setTimeout(r, 300)); });
await page.evaluate(async () => { document.querySelector('.g-tile .g-fav').click(); await new Promise((r) => setTimeout(r, 200)); });
const favEmpty = await page.evaluate(async () => {
  document.querySelector('#fav-only').click();
  await new Promise((r) => setTimeout(r, 300));
  return { hidden: document.querySelector('#empty').hidden, t: document.querySelector('#empty-t').textContent, b: document.querySelector('#empty-b').textContent, favs: UXG.favs().length };
});
add('无收藏时的空状态为中文', favEmpty.hidden === false && /收藏/.test(favEmpty.t), favEmpty.t + ' / ' + favEmpty.b);
await page.evaluate(() => { document.querySelector('#empty-reset').click(); });
await sleep(300);

/* ---------- 5. 提示词 / 代码复制、下载、弹层 ---------- */
const dlg = await page.evaluate(async () => {
  const idx = UXG.ITEMS.findIndex((it) => it.id === '001');
  UXG.openPrompt(idx);
  await new Promise((r) => setTimeout(r, 350));
  const prompt = document.querySelector('#pr-text').value;
  const title = document.querySelector('#pr-title').textContent;
  const cat = document.querySelector('#pr-cat').textContent;
  const hint = document.querySelector('#pr-hint').textContent;
  return { prompt, title, cat, hint, num: document.querySelector('#pr-num').textContent };
});
add('打开 001 提示词弹层，标题/分类为中文', dlg.title === '液态玻璃按钮' && dlg.cat === '按钮' && dlg.num === '001', `${dlg.num} ${dlg.title} · ${dlg.cat} · ${dlg.hint}`);
add('提示词含中文说明 + 完整代码 + 许可证', /\[组件\] 液态玻璃按钮/.test(dlg.prompt) && /请把下面的 UI 组件应用/.test(dlg.prompt) && /MIT License/.test(dlg.prompt) && /<style>/.test(dlg.prompt), dlg.prompt.slice(0, 80).replace(/\n/g, ' '));
const copyRes = await page.evaluate(async () => {
  document.querySelector('#pr-copy').click();
  await new Promise((r) => setTimeout(r, 400));
  let clip = '';
  try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'ERR:' + e.message; }
  return { len: clip.length, head: clip.slice(0, 60), toast: document.querySelector('#toast').textContent };
});
add('复制提示词到剪贴板', copyRes.len > 3000 && /\[组件\]/.test(copyRes.head), `长度 ${copyRes.len} · toast=${copyRes.toast}`);
const codeRes = await page.evaluate(async () => {
  document.querySelector('#tab-code').click();
  await new Promise((r) => setTimeout(r, 250));
  const code = document.querySelector('#pr-text').value;
  document.querySelector('#pr-copy').click();
  await new Promise((r) => setTimeout(r, 350));
  let clip = '';
  try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'ERR'; }
  return { codeHead: code.slice(0, 90), clipHead: clip.slice(0, 90), toast: document.querySelector('#toast').textContent, hasZh: /继续/.test(code) };
});
add('代码页签内容为可运行代码（含中文文案与署名）', /MIT License/.test(codeRes.codeHead) && codeRes.hasZh, codeRes.codeHead.replace(/\n/g, ' '));
add('复制代码到剪贴板', /MIT License/.test(codeRes.clipHead), codeRes.toast);
const standalone = await page.evaluate(() => {
  const idx = UXG.ITEMS.findIndex((it) => it.id === '001');
  const html = UXG.standaloneOf(UXG.ITEMS[idx]);
  return { ok: html.indexOf('<!doctype html>') === 0 && html.indexOf('ux-theme-btn') > 0 && html.indexOf('继续') > 0, len: html.length };
});
add('下载用的单文件 HTML 生成正确', standalone.ok, standalone.len + ' 字符');
await page.evaluate(() => { document.querySelector('#dlg-prompt [data-close]').click(); });
await sleep(250);
await page.screenshot({ path: join(outDir, 'desktop-home.png'), fullPage: false });

/* ---------- 6. 三语切换 ---------- */
const langRes = await page.evaluate(async () => {
  const out = {};
  UXG.setLang('en');
  await new Promise((r) => setTimeout(r, 400));
  out.en = { lang: document.documentElement.lang, cat: document.querySelector('.g-cat').textContent, cap: document.querySelector('.g-tile .g-cap span').textContent, guide: document.querySelector('#guide-btn') ? '' : document.querySelector('#to-guide').textContent };
  const idx = UXG.ITEMS.findIndex((it) => it.id === '001');
  UXG.openPrompt(idx);
  await new Promise((r) => setTimeout(r, 250));
  out.enPrompt = document.querySelector('#pr-text').value.slice(0, 60);
  out.enTitle = document.querySelector('#pr-title').textContent;
  UXG.setLang('ko');
  await new Promise((r) => setTimeout(r, 400));
  out.ko = { lang: document.documentElement.lang, cat: document.querySelector('.g-cat').textContent, cap: document.querySelector('.g-tile .g-cap span').textContent };
  out.koTitle = document.querySelector('#pr-title').textContent;
  UXG.setLang('zh');
  await new Promise((r) => setTimeout(r, 400));
  out.zh = { lang: document.documentElement.lang, cat: document.querySelector('.g-cat').textContent, title: document.querySelector('#pr-title').textContent };
  document.querySelector('#dlg-prompt [data-close]').click();
  return out;
});
add('切换到英文：界面/标题/提示词变英文', langRes.en.lang === 'en' && /^All/.test(langRes.en.cat) && /Liquid glass button/.test(langRes.enTitle) && /\[Element\]/.test(langRes.enPrompt), `${langRes.en.cat} · ${langRes.enTitle}`);
add('切换到韩文：恢复原版韩文', langRes.ko.lang === 'ko' && /전체/.test(langRes.ko.cat) && /Liquid Glass 버튼/.test(langRes.koTitle), `${langRes.ko.cat} · ${langRes.koTitle}`);
add('切回中文正常', langRes.zh.lang === 'zh-CN' && /全部/.test(langRes.zh.cat) && /液态玻璃按钮/.test(langRes.zh.title), `${langRes.zh.cat} · ${langRes.zh.title}`);

/* ---------- 7. 随机抽查 25 个组件：用编号搜索定位 → 网格里真实挂载 ---------- */
const SAMPLE_IDS = ['001', '003', '005', '012', '018', '026', '033', '041', '056', '063', '072', '088', '095', '101', '120', '137', '150', '166', '188', '201', '230', '267', '300', '355', '399'];
const mounted = [];
for (const id of SAMPLE_IDS) {
  const r = await page.evaluate(async (sid) => {
    const input = document.querySelector('#q');
    input.value = sid;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 420));
    const tile = document.querySelector('.g-tile');
    if (!tile) return { id: sid, err: 'no tile' };
    for (let k = 0; k < 50; k++) {
      await new Promise((res) => setTimeout(res, 80));
      if (tile.querySelector('.g-stage .ux')) break;
    }
    const root = tile.querySelector('.g-stage .ux');
    const cap = tile.querySelector('.g-cap span');
    // 在组件里点一下可交互控件，确认汉化后的脚本没有失效（不会抛异常、不会跳转）
    let clicked = '';
    const hit = root && root.querySelector('button, [role="button"], input, [role="switch"], [role="tab"]');
    if (hit) { clicked = (hit.className || hit.tagName).toString().slice(0, 40); try { hit.click(); } catch (e) { clicked += ' ERR:' + e.message; } }
    await new Promise((res) => setTimeout(res, 220));
    return {
      id: sid, hasRoot: !!root, cls: root ? root.className : '', children: root ? root.childElementCount : 0,
      title: cap ? cap.textContent : '', count: +document.querySelector('#count').textContent,
      clicked, stillThere: !!document.querySelector('.g-stage .ux'),
      hangul: /[\uAC00-\uD7A3]/.test(tile.innerText || '')
    };
  }, id);
  mounted.push(r);
  add(`抽查 ${id} 挂载 + 交互`, r.hasRoot && r.children > 0 && /ux u\d{3}/.test(r.cls) && r.stillThere && !/ERR:/.test(r.clicked || '') && !r.hangul, `${r.title} · 子节点 ${r.children} · 点击 ${r.clicked || '无可点控件'}`);
}
await page.evaluate(async () => {
  const input = document.querySelector('#q');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((res) => setTimeout(res, 400));
});

/* ---------- 7b. 复制/下载出来的中文代码单独运行：脚本不能因为汉化失效 ---------- */
const standaloneIds = ['001', '092', '129', '253', '399'];
const standaloneDocs = await page.evaluate((ids) => ids.map((id) => {
  const it = UXG.ITEMS.find((x) => x.id === id);
  return { id, html: UXG.standaloneOf(it) };
}), standaloneIds);
const sp = await ctx.newPage();
const standaloneErrors = [];
sp.on('pageerror', (e) => standaloneErrors.push(String(e.message).slice(0, 200)));
for (const doc of standaloneDocs) {
  await sp.setContent(doc.html, { waitUntil: 'load' });
  await sp.waitForTimeout(500);
  const st = await sp.evaluate(() => {
    const r = document.querySelector('.ux');
    return { has: !!r, children: r ? r.childElementCount : 0, text: (r && r.innerText || '').replace(/\s+/g, ' ').slice(0, 40), themeBtn: !!document.querySelector('#ux-theme-btn') };
  });
  add(`单独运行 ${doc.id} 的中文代码`, st.has && st.children > 0 && st.themeBtn, `${st.children} 个子节点 · ${st.text}`);
}
add('单独运行无脚本异常', standaloneErrors.length === 0, standaloneErrors.slice(0, 3).join(' | '));
await sp.close();

/* ---------- 8. Reels 全屏与键盘 ---------- */
const reelRes = await page.evaluate(async () => {
  UXG.openReel(0);
  await new Promise((r) => setTimeout(r, 500));
  const out = { view: document.body.dataset.view, aria: document.querySelector('#reel').getAttribute('aria-hidden'), slideTitle: document.querySelector('.g-slide.is-on .g-slide-t').textContent, rail: document.querySelectorAll('.g-slide.is-on .g-rb').length, hud: document.querySelector('#hud').textContent.trim().slice(0, 20) };
  UXG.closeReel();
  await new Promise((r) => setTimeout(r, 300));
  out.after = document.body.dataset.view;
  return out;
});
add('Reels 全屏可用（含收藏/提示词/复制/代码 4 个按钮）', reelRes.view === 'reel' && reelRes.aria === 'false' && reelRes.rail >= 4, `${reelRes.slideTitle} · 按钮 ${reelRes.rail}`);
add('退出 Reels 回到网格', reelRes.after === 'grid', reelRes.after);
await page.screenshot({ path: join(outDir, 'desktop-grid.png') });

/* ---------- 9. 深色主题 ---------- */
const themeRes = await page.evaluate(async () => {
  UXG.toggleTheme(document.querySelector('#theme'));
  await new Promise((r) => setTimeout(r, 500));
  const dark = UXG.isDark();
  const bg = getComputedStyle(document.body).backgroundColor;
  UXG.toggleTheme(document.querySelector('#theme'));
  await new Promise((r) => setTimeout(r, 300));
  return { dark, bg };
});
add('深色/浅色主题切换正常', themeRes.dark === true, themeRes.bg);

/* ---------- 10. 控制台与网络 ---------- */
add('无 JavaScript 运行时异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
add('无控制台 error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
add('无资源加载失败', failedRequests.length === 0 && badResponses.length === 0, failedRequests.concat(badResponses).slice(0, 3).join(' | '));

/* ---------- 11. 移动端 ---------- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', permissions: ['clipboard-read', 'clipboard-write'] });
const mp = await mctx.newPage();
mp.on('pageerror', (e) => pageErrors.push('mobile: ' + e.message));
mp.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('mobile: ' + m.text().slice(0, 200)); });
await mp.goto(url, { waitUntil: 'load' });
await mp.waitForFunction(() => window.UXG && UXG.ITEMS.length === 400);
const m = await mp.evaluate(() => {
  const de = document.documentElement;
  return {
    overflow: de.scrollWidth - window.innerWidth,
    cols: getComputedStyle(document.querySelector('.g-grid')).gridTemplateColumns.split(' ').length,
    tools: document.querySelectorAll('.g-tools .g-tool').length,
    langBtns: document.querySelectorAll('.g-lang-b').length,
    favVisible: (() => { const b = document.querySelector('.g-tile .g-fav'); return b ? getComputedStyle(b).opacity : 'none'; })(),
    title: document.querySelector('.g-tile .g-cap span').textContent
  };
});
add('移动端无横向溢出', m.overflow <= 1, '溢出 ' + m.overflow + 'px');
add('移动端两列网格 + 5 个工具按钮 + 三语按钮', m.cols === 2 && m.tools === 5 && m.langBtns === 3, `${m.cols} 列 / ${m.tools} 按钮 / ${m.langBtns} 语言`);
add('移动端收藏星标可见', m.favVisible !== '0', m.favVisible);
await mp.screenshot({ path: join(outDir, 'mobile-home.png') });
// 移动端：搜索
const mSearch = await mp.evaluate(async () => {
  document.querySelector('#search-btn').click();
  await new Promise((r) => setTimeout(r, 400));
  const input = document.querySelector('#q');
  input.value = '液态玻璃';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  return { open: document.querySelector('#search').classList.contains('is-open'), count: +document.querySelector('#count').textContent, first: document.querySelector('.g-tile .g-cap span').textContent };
});
add('移动端搜索可用', mSearch.open && mSearch.count > 0, `${mSearch.count} 个 · ${mSearch.first}`);
// 移动端：点开组件 → 弹层 → 复制
const mReel = await mp.evaluate(async () => {
  const idx = UXG.ITEMS.findIndex((it) => it.id === '001');
  UXG.openReel(idx);
  await new Promise((r) => setTimeout(r, 600));
  const slide = document.querySelector('.g-slide.is-on');
  const out = { view: document.body.dataset.view, title: slide.querySelector('.g-slide-t').textContent, summary: slide.querySelector('.g-slide-s').textContent, root: !!slide.querySelector('.ux'), rail: slide.querySelectorAll('.g-rb').length };
  slide.querySelector('[data-act="prompt"]').click();
  await new Promise((r) => setTimeout(r, 500));
  out.dlgOpen = document.querySelector('#dlg-prompt').open;
  out.dlgTitle = document.querySelector('#pr-title').textContent;
  out.promptLen = document.querySelector('#pr-text').value.length;
  return out;
});
add('移动端组件详情弹层正常', mReel.view === 'reel' && mReel.root && mReel.dlgOpen && mReel.promptLen > 3000, `${mReel.title} · ${mReel.promptLen} 字符`);
await mp.screenshot({ path: join(outDir, 'mobile-reel.png') });
const mCopy = await mp.evaluate(async () => {
  const btn = document.querySelector('#pr-copy');
  btn.click();
  await new Promise((r) => setTimeout(r, 400));
  let clip = '';
  try { clip = await navigator.clipboard.readText(); } catch (e) { clip = ''; }
  return { toast: document.querySelector('#toast').textContent, len: clip.length };
});
add('移动端复制提示词', mCopy.len > 3000 || /已复制/.test(mCopy.toast), `${mCopy.len} 字符 · ${mCopy.toast}`);
add('移动端无 JS 异常', pageErrors.filter((e) => e.startsWith('mobile:')).length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();

/* ---------- 汇总 ---------- */
const failed = results.filter((r) => !r.ok);
const summary = {
  url, loadMs, perf, passed: results.length - failed.length, failed: failed.length,
  failures: failed.map((f) => f.name + ' — ' + f.detail),
  search: searchOut.map((s) => ({ q: s.q, count: s.count, top: s.ids.join(',') })),
  sample: mounted.map((x) => ({ id: x.id, title: x.title, children: x.children })),
  consoleErrors, pageErrors, failedRequests, badResponses
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(summary, null, 2));
console.log(`\n结果: ${summary.passed} 项通过 / ${summary.failed} 项失败`);
if (failed.length) {
  console.log('失败项:');
  failed.forEach((f) => console.log('  - ' + f.name + ' — ' + f.detail));
  process.exit(1);
}
console.log('截图: test-output/desktop-home.png, desktop-grid.png, mobile-home.png, mobile-reel.png');
