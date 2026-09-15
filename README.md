# AI Builders 中文日报与静态归档网站系统

一套专注于追踪顶尖 AI Builders、官方博客与深度播客一手动态的自动化系统。
严格按照**四段式**（中文总结 + 中文全文翻译 + 推荐理由 + 原文链接）标准生成日报，支持工作日自动化调度与**周一自动回溯周末内容**，并以现代化静态网站进行沉淀与历史归档。

## 🌐 线上正式访问地址

🎉 网站已成功发布至 GitHub Pages，无需本地开启任何服务，手机与电脑随时可访问：
👉 **[https://lukeflora.github.io/ai-daily-news/](https://lukeflora.github.io/ai-daily-news/)**
👉 历史归档列表：**[https://lukeflora.github.io/ai-daily-news/archive/index.html](https://lukeflora.github.io/ai-daily-news/archive/index.html)**

---

## 🌟 核心特性

1. **高信噪比四段式排版**：
   - 💡 **中文总结**：2~4 句精要提炼，直击核心亮点；
   - 📄 **中文全文翻译**：原汁原味地道译本（保留 AI 行业通用英文术语），支持卡片内一键折叠/展开；
   - 🎯 **推荐理由**：点明对技术与产品从业者的一线启发，回答“为什么值得你看”；
   - 🔗 **原文链接**：直达推特、官方博客、播客单集视频。
2. **工作日定时与周末追溯机制**：
   - **周二至周五**：抓取最新 24 小时动态；
   - **周一特别处理**：自动通过 GitHub API 追溯周五至周日（72小时内）的历史提交快照，合并多天推文并按 ID 全局去重，彻底解决周末内容漏掉的问题。
3. **现代化静态归档网站**：
   - 包含今日最新日报首页（`public/index.html`）、每一天的专属独立页面（`public/archive/YYYY-MM-DD.html`）以及时间线归档索引（`public/archive/index.html`）；
   - 支持**深浅色主题切换**、**实时关键词搜索**、**分类 Tab 过滤**、**一键复制**；
   - 纯静态零复杂依赖，既可在本地秒级预览，也可直接推送到 GitHub Pages / Vercel 免费上线。
4. **零门槛与零 API Key 依赖**：
   - 数据由上游集中处理并在 GitHub 托管，无需用户自备昂贵的 Twitter 或 YouTube 爬虫凭证；
   - 内置智能解析引擎，开箱即用；也支持配置 `GEMINI_API_KEY` 获得更高级别的全自动大模型润色。

---

## 🚀 快速上手与命令

在项目根目录下，你可以使用以下命令：

```bash
# 1. 一键执行今日完整工作流（抓取 -> 生成四段式数据 -> 编译网站）
npm run daily

# 2. 启动本地轻量静态网站预览（在浏览器中查看）
npm run preview
# 启动后在浏览器打开: http://localhost:3000

# 3. 单独执行各阶段任务
npm run fetch          # 仅抓取今日数据 (保存至 data/raw/YYYY-MM-DD.json)
npm run fetch:monday   # 强制以周一模式追溯抓取周末 72 小时数据
npm run generate       # 仅根据 raw 数据生成四段式日报 (保存至 data/digests/YYYY-MM-DD.json)
npm run build          # 仅将所有历史 JSON 编译成静态 HTML 网页 (输出至 public/)
```

---

## ⏰ 配置工作日定时调度 (周一至周五 09:00)

针对 macOS 系统，本项目提供了系统原生后台服务配置（`launchd`），无论终端是否打开，都会在工作日早晨定时唤醒执行：

```bash
# 一键安装工作日定时服务 (周一至周五 09:00 自动运行)
bash scripts/setup-schedule.sh
```

如需使用标准 `crontab`，也可在终端输入 `crontab -e` 并添加：
```bash
0 9 * * 1-5 cd "/Users/design/Documents/Antigravity/每日AI新闻收集" && node scripts/run-daily.js >> data/daily.log 2>&1
```

---

## 📂 项目目录结构

```text
├── config/
│   ├── feeds.json                # 上游 GitHub feed 订阅地址
│   ├── sources.json              # 关注的人物、播客与博客清单
│   └── settings.json             # 网站标题、调度时间等全局配置
├── data/
│   ├── raw/                      # 原始抓取的 JSON 备份（按日期归档）
│   └── digests/                  # 已处理生成的结构化四段式日报（YYYY-MM-DD.json）
├── prompts/                      # 提示词模板体系
├── scripts/
│   ├── fetch-feeds.js            # 数据采集：支持工作日检测与周一自动追溯周末提交
│   ├── generate-digest.js        # 结构化提炼与翻译生成（四段式）
│   ├── build-site.js             # 静态网站生成器：编译生成全套 HTML 网页
│   ├── server.js                 # 零依赖本地轻量预览 HTTP 服务
│   ├── run-daily.js              # 每日全流程一键调度入口
│   ├── setup-schedule.sh         # macOS 工作日定时任务安装脚本
│   └── com.aibuilders.digest.plist # launchd 定时配置模板
├── web/
│   └── assets/                   # 前端样式表与交互逻辑 (style.css, app.js)
├── public/                       # 最终编译输出的网站目录（可直接部署）
│   ├── index.html                # 最新日报首页
│   ├── archive/                  # 往期归档目录 (YYYY-MM-DD.html, index.html)
│   └── assets/
└── package.json
```

---

## 🌐 部署至公网（可选）

生成的 `public/` 目录为标准纯静态文件：
- **GitHub Pages**：将 `public/` 内容推送到仓库的 `gh-pages` 分支即可；
- **Vercel / Cloudflare Pages**：直接将输出目录设置为 `public/` 即可实现全球 CDN 免费托管。
