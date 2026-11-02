# 部署到 Cloudflare Pages

本站是纯静态单文件页面，不需要 Worker、数据库或任何付费服务。

## 构建产物

```sh
npm run site
```

生成 `dist/`：

| 文件 | 说明 |
|---|---|
| `index.html` | 单文件画廊（全部 400 个组件的 HTML/CSS/JS + 中文语言包内联） |
| `404.html` | 404 页面 |
| `robots.txt` / `sitemap.xml` | SEO |
| `_headers` | 缓存与安全响应头 |
| `og-cover.png` | 社交分享图 |

## 平台限制核对（2026-11 官方限制）

| 项目 | Cloudflare Pages 限制 | 本站实测 |
|---|---|---|
| 单文件大小 | 25 MiB | 约 3.7 MB（`index.html`） |
| 文件数量 | 20,000 个 | 6 个 |
| 单次部署大小 | 25 MiB | 约 4.1 MB |

构建脚本在 `--site` 模式下会打印文件数、最大文件与总大小。

## 首次部署（wrangler 直传）

```sh
export CLOUDFLARE_API_TOKEN=...      # 需要 Pages:Edit 权限
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler@4 pages create lucian-uxui-zh --production-branch main   # 已存在会报错，忽略即可
npx wrangler@4 pages deploy dist --project-name lucian-uxui-zh --branch main
```

默认域名：`https://lucian-uxui-zh.pages.dev/`
自定义域名：`https://uxui.skyagentai.xyz/`（同账号 `skyagentai.xyz` 下的子域，CNAME → `lucian-uxui-zh.pages.dev`，Proxied）

绑定命令（API）：

```sh
# 1) 在 Pages 项目上添加域名
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects/lucian-uxui-zh/domains" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"uxui.skyagentai.xyz"}'
# 2) 若未自动创建，手动加 CNAME（Proxied）
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"uxui","content":"lucian-uxui-zh.pages.dev","proxied":true}'
```

> 注意：该 zone 开启了 Cloudflare 托管 robots.txt（AI Crawl Control），会在 `robots.txt` 前追加一段内容，属于 zone 级设置，与本站无关。

## GitHub 自动部署

仓库自带 `.github/workflows/deploy.yml`：push 到 `main` 后自动构建并发布。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 里配置：

| 名称 | 类型 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | 建议单独创建，只授予 `Account → Cloudflare Pages → Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | 账号 ID |

之后每次 `git push origin main` 都会自动发布；也可以在 Actions 页面手动 `workflow_dispatch`。

## 自定义域名

已绑定 `uxui.skyagentai.xyz`（见上）。换域名时：Pages 项目 → Custom domains → 添加，然后把 `UX_SITE_URL` 传给构建（`UX_SITE_URL=https://新域名 npm run site`），canonical / sitemap / robots 会一起更新。
**不要**改动主站正在使用的根域 / 主域 DNS 记录。

## 回滚

Cloudflare Pages 控制台 → 项目 → Deployments，选中历史版本 → Rollback。
