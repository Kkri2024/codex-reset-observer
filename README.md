# Codex 重置观察站

中文公共 Codex 重置追踪网页。展示第三方历史、原始公告链接、重置间隔及各来源独立预测。与 OpenAI 无隶属关系，不读取个人额度或私人文档。

## 本地运行

需要 Node.js 22.12+。

```sh
npm ci
npm run dev
```

生产构建与验证：

```sh
npm test
npm run build
npm run preview
```

## 数据来源和边界

| 来源 | 接口 | 用途 |
| --- | --- | --- |
| [Codex Reset dev](https://codexreset.dev/api/) | `/api/status?lang=zh`、`/api/history?lang=zh`、`/api/forecast?lang=zh` | 最新事件、历史、预测 |
| [Codex Reset ai](https://codexreset.ai/api/v1/forecast.json) | `/api/v1/forecast.json` | whenreset.app 上游历史频率估算 |
| [Codex Reset app](https://codexreset.app/api/signal) | `/api/signal` | 启发式预测、来源记录与公开信号 |

接口直接从访问者浏览器读取，需上游允许 CORS。无数据库、代理、后台采集或付费服务。首次访问加载，页面可见期间每 5 分钟刷新，手动刷新限每分钟一次。页面关闭后不会采集；未来打开时可读取上游历史。

最后成功响应保存于浏览器 localStorage，失败保留缓存并显示状态。清除网站存储会删除本机缓存。缓存不代表本站建立了独立永久档案。上游可以变更、失效或限制访问；客户端无法绕过来源防护。

公共额度重置与赠送重置次数分开。原始 X 公告链接相同才跨来源去重；同一公告的时间或分类冲突保留多个版本并标记。原始链接缺失时不臆造公告。来源可能共用上游，多个来源不是多次独立验证。

间隔统计排除赠送次数、待确认、仅日期和冲突记录。统计基于上游公告或观察时间，并非每个账户的生效时间。所有预测保留原始来源和方法，不做平均或混合。空概率不等于 0%，旧数据不等于最新估算。

## 更换失效来源

1. 在 `src/data.ts` 的 `SOURCES` 中修改公开 HTTPS 接口及来源主页。
2. 更新同文件 `normalize` 适配器，用真实 JSON 核对时间、类型、概率单位和空值。不要将生成时间冒充上游更新时间。
3. 如域名变更，同步更新 `public/_headers` 中 CSP 的 `connect-src`。
4. 为新格式补充 `tests/data.test.ts`，运行测试及构建，在真实浏览器确认 CORS 和无缓存／有缓存故障场景后发布。

## 发布

GitHub `main` → Cloudflare Pages 原生 Git 集成。构建命令 `npm test && npm run build`，输出目录 `dist`。GitHub Actions 另行执行同一组质量检查。

不需要 OpenAI API Key。前端仓库和构建中禁止添加 GitHub 或 Cloudflare 凭据。
