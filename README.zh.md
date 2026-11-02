# Lucian UX/UI Prompt · 简体中文版

> 400 个可以直接上手试的 UX/UI 组件：200 个界面组件，加上 200 个做网站时随手就能用的动画。
> 每个组件都能现场试玩，然后作为 **AI 提示词** 或 **可运行代码** 带走。
> 本仓库是基于 [Seokwoooo/lucian-uxui-prompt](https://github.com/Seokwoooo/lucian-uxui-prompt)（MIT）构建的**简体中文版**，默认中文，保留英文 / 韩文切换。

**线上地址：<https://lucian-uxui-zh.pages.dev/>**

---

## 这个版本做了什么

| 项目 | 说明 |
|---|---|
| 完整汉化 | 400 个组件的名称、说明、操作提示、界面文案、AI 提示词全部为简体中文 |
| 中文搜索 | 支持中文名称、说明、分类、标签、关键词映射与同义词（如「思考动画」「液态玻璃」「底部弹窗」） |
| 收藏 | 浏览器本地存储（localStorage），无需账号；可按收藏筛选 |
| 复制 | 一键复制中文提示词 / 原始代码；中文提示词内嵌完整可运行代码 |
| 三语切换 | 中文（默认）/ English / 한국어，选择会记住 |
| 静态部署 | 单文件静态站，Cloudflare Pages 直接托管，无后端、无数据库、无 Worker |
| 上游同步 | 语言包与上游源码分离（`src/i18n/zh/`），新增组件只需补一个 JSON |

## 技术栈与构建

与上游保持一致：**纯 Node.js，零依赖**。组件是一个个自包含的 HTML 文件，构建脚本把它们内联成一个静态页面。

```sh
node src/build.mjs          # 开发构建 → prompt-uxui-lab/index.html
npm run build               # 正式构建（ZH_STRICT=1，缺中文翻译会中断）
npm run site                # 生成 Cloudflare Pages 部署目录 dist/
npm run serve               # 本地预览 dist/
```

- 源码：`src/elements/NNN-slug.html`（400 个组件，编号与上游一致）
- 中文语言包：`src/i18n/zh/e/NNN.json`（标题/说明/提示/关键词/代码字符串映射）
- 界面文案：`src/gallery/gallery.js` 的 `T.zh`、`CAT_ZH`、`ZH_ALIAS`、`GUIDE.zh`
- 构建产物：`dist/index.html`（单文件，约 3.7 MB，gzip 后约 1 MB）

## 目录结构

```
src/
  elements/            400 个组件源码（与上游一致，未改动）
  gallery/             画廊外壳：index.html / gallery.css / gallery.js / i18n-core.js
  i18n/zh/e/           简体中文语言包（每个组件一个 JSON）
  tokens.css           主题令牌（--ux-*）
  site/                robots.txt / sitemap.xml / 404.html / _headers / og-cover.png
  build.mjs            构建脚本
tools/
  extract-zh-work.mjs  从组件源码抽取待翻译韩文串，生成工作单
  merge-zh.mjs         合并翻译结果 → 语言包，并做覆盖率校验
  smoke-test.mjs       本地/线上浏览器自动化验收
  serve.mjs            本地静态服务器
docs/
  SYNC-UPSTREAM.md     同步上游新增组件的方法
  DEPLOY.md            Cloudflare Pages 部署说明
```

## 汉化工作流（可复用）

```sh
node tools/extract-zh-work.mjs        # 1. 扫描组件，生成 work/batch/batch-NN.json 工作单
# 2. 翻译（可交给任意 AI/人工），把结果写到 work/out/batch-NN.json
node tools/merge-zh.mjs               # 3. 合并成 src/i18n/zh/e/NNN.json
node tools/merge-zh.mjs --check       #    只检查覆盖率
ZH_STRICT=1 node src/build.mjs        # 4. 构建（缺翻译会报错）
```

详细说明见 [docs/SYNC-UPSTREAM.md](docs/SYNC-UPSTREAM.md)。

## 验收

```sh
npm run site
npm test                     # 需要本机安装 Google Chrome；会跑桌面 + 移动端真实浏览器测试
```

`tools/smoke-test.mjs` 会检查：默认中文、400 个组件的中文覆盖、中文搜索关键词、收藏持久化、
复制提示词/代码、三语切换、随机抽查组件的挂载与动画、移动端布局、控制台异常与资源 404。

## 版权与署名

- 原项目：[Seokwoooo/lucian-uxui-prompt](https://github.com/Seokwoooo/lucian-uxui-prompt)，MIT License，Copyright (c) 2026 Seokwoooo
- 本仓库：中文本地化版本，同样以 MIT License 发布，保留原始 LICENSE 与版权声明
- 页脚、复制出的代码与提示词均保留原作者署名与许可说明，请勿移除

上游新增组件会持续同步，欢迎提 issue / PR。
