# 同步上游新增组件

本仓库与上游 [Seokwoooo/lucian-uxui-prompt](https://github.com/Seokwoooo/lucian-uxui-prompt) 的关系：

- `src/elements/`、`src/gallery/`、`src/tokens.css`、`src/build.mjs`、`api/` 来自上游，**只做最小改动**（改动处均有中文注释标明）。
- 中文内容全部放在 `src/i18n/zh/` 与 `src/gallery/gallery.js` 的 `T.zh` / `CAT_ZH` / `ZH_ALIAS` / `GUIDE.zh` 里，**与上游源码分离**。
- 上游新增或修改组件时，不需要重新翻译整个网站，只需要补上新增组件的语言文件。

## 1. 拉取上游更新

```sh
git fetch upstream
git log --oneline HEAD..upstream/main        # 看看上游改了什么
git diff --stat HEAD..upstream/main -- src/elements src/tokens.css src/build.mjs
git merge upstream/main                       # 有冲突时优先保留上游源码 + 本地语言包
```

`upstream` 已配置为 `https://github.com/Seokwoooo/lucian-uxui-prompt.git`。
合并后先跑一次宽松构建，看看缺哪些中文：

```sh
node src/build.mjs            # 缺翻译只警告，不中断
```

构建输出里会列出 `缺少中文翻译 (src/i18n/zh/e/NNN.json)`。

## 2. 只给新增/改动的组件补翻译

```sh
node tools/extract-zh-work.mjs 20      # 重新生成工作单 work/batch/batch-NN.json
```

工作单里每个元素包含：`ko`（标题/说明/提示）、`en`（官方英文参考）、`strings`（代码里需要替换的韩文串，带索引 `i`、上下文 `ctx`、官方英译 `en`）、`demoStrings`（自动演示文案）。

翻译产出写到 `work/out/batch-NN.json`，格式：

```json
[
  {
    "id": "401",
    "title": "标题（简体中文）",
    "summary": "2～3 句中文说明。",
    "hint": "一句操作提示",
    "kw": ["搜索关键词", "同义词", "场景词"],
    "tr": { "0": "第 0 条字符串的译文", "1": "…" },
    "demo": { "韩文原文": "中文译文" }
  }
]
```

- `tr` 的键必须覆盖该元素 `strings` 里的全部 `i`。
- `demo` 的键必须覆盖 `demoStrings` 全部原文（没有就写 `{}`）。
- 统一术语见 `work/GLOSSARY.md`（本仓库自带，可直接给 AI 翻译代理当提示词）。
- 想让 AI 代理批量翻译时，可以把 `work/batch/batch-NN.json` + `work/GLOSSARY.md` 一起交给它，并要求按上面的 JSON 结构输出。

然后合并、校验、构建：

```sh
node tools/merge-zh.mjs               # 合并成 src/i18n/zh/e/NNN.json，缺条目会报错
node tools/merge-zh.mjs --check       # 只检查覆盖率
ZH_STRICT=1 node src/build.mjs        # 缺中文翻译会中断构建
```

## 3. 翻译校验规则（构建时自动执行）

`src/build.mjs` 会对每个组件检查：

1. `title` / `summary` / `hint` 不能为空、不能残留韩文。
2. 用 `map` 替换代码字符串后，HTML/JS 里不能残留韩文（否则报错并列出具体行）。
3. `map` 里没用到的条目会给出警告（通常是上游改了文案，需要同步更新）。
4. `@demo` 里的 `{ko,en}` 字符串必须有中文（`ZH_STRICT=1` 时缺失即报错）。

## 4. 界面文案与搜索词

- 新增分类：`src/build.mjs` 的 `CATEGORIES`（上游）＋ `src/gallery/gallery.js` 的 `CAT_EN` / `CAT_ZH`。
- 新增界面文案：`T.ko` / `T.en` / `T.zh` 三处同时补。
- 新增中文搜索同义词：`ZH_ALIAS`。
- 每个组件的中文关键词来自语言包的 `kw` 字段，会自动进入搜索索引。

## 5. 上游改了同一个组件

如果上游修改了某个组件的韩文文案，`src/i18n/zh/e/NNN.json` 里的 `map` 会失效，构建会报「中文版仍有韩文残留」并给出行号。
处理方式：重新跑 `tools/extract-zh-work.mjs`，对比新旧 `strings` 索引，补上变化的条目即可。
