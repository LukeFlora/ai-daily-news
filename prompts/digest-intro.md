# Digest Intro Prompt

You are assembling the final AI Builders 日报. The reader is Chinese-speaking and wants
everything in Chinese — **no English original text is shown**.

## 全局格式（务必严格遵守）

顶部标题（用今天日期替换 [Date]）：

AI Builders 日报 — [Date]

然后按以下顺序组织内容：
1. X / 推特 板块 — 列出每位发了新动态的 builder
2. 官方博客 板块 — 列出 AI 公司官方博客的新文章
3. 播客 板块 — 列出本期播客单集

## 每个内容块 = 四段（顺序固定，缺一不可）

对每一条有内容的来源，都按以下四段输出，顺序为：

### 1) 中文总结
你的中文改写总结（按对应类型的 summarize 提示写）。推文 2-4 句；播客 200-400 字；
博客 100-300 字。要点突出、口语化、像朋友在跟你讲重点。

### 2) 中文全文翻译
把该来源的【原始英文全文】**完整**翻译成中文（不是总结，是逐段翻译全文），按
`prompts.translate_original` 的要求。
- 推文：每条覆盖到的推文的 `text` 全文翻译。
- 博客：文章 `content` 全文翻译。
- 播客：整段 `transcript` 全文翻译（见下方「播客长度处理」放附录）。
技术术语、专有名词、URL 保留英文。

### 3) 推荐理由
1-3 句话，说明：为什么这条值得你花时间看？你能从中得到什么？和 AI 从业者/爱好者
有什么相关性？按 `prompts.recommend` 写，真诚、具体、不浮夸。

### 4) 原文链接
单独一行给出原始来源链接（来自 JSON 的 `url` 字段）：
原文链接：<url>

---

## 具体样例（严格照这个格式写）

### X / 推特

**Box CEO Aaron Levie**
1) 中文总结：Aaron 认为 AI agent 正在把「软件采购」从一次性买断变成持续的服务关系，企业软件的销售逻辑会被重写。
2) 中文全文翻译：我们和 agent 协作的方式，会越来越像在带一个下属，而不是在问一个聊天机器人。你不会把一份 80 页的 PRD 丢给下属然后消失，你会持续地对齐目标、看中间产出……
3) 推荐理由：企业软件怎么被 agent 颠覆，是今年最值得跟的趋势之一；Aaron 作为 Box CEO 的一线观察很实在，不是纸上谈兵。
4) 原文链接：https://x.com/levie/status/1234567890

### 官方博客

**Anthropic Engineering：在长任务应用里用 Harness 管理 agent**
1) 中文总结：Anthropic 介绍了一套 Harness 机制，用来给长时间运行的 agent 做状态与上下文管理，避免任务跑久了丢失进度。
2) 中文全文翻译：Long-running agentic applications need a way to manage state and context across many steps……
3) 推荐理由：如果你在做多步 agent 产品，这篇的工程范式能帮你少踩很多坑，直接可复用。
4) 原文链接：https://www.anthropic.com/engineering/xxx

## 播客长度处理

播客 transcript 很长，所以播客的「中文全文翻译」放到文末独立的
「📼 播客全文翻译（附录）」板块。播客主板块只放：中文总结 + 推荐理由 + 原文链接
（具体视频 URL），保持简短可扫读；翻译全文在附录。

## 规则

- 只纳入有新增内容的来源；没有新动态的跳过。
- 播客链接：用 JSON `url` 字段的具体视频 URL，绝不给频道页；标题用 JSON `title`。
- 作者署名：用全名+职务/公司，不要只写姓；digest 里不要带 @ 的推特 handle（Telegram 里 @xxx 会变成可点击用户）。
- 强制链接：每条内容都必须有「原文链接」；没有链接的一律不写。
- 禁止编造：只写 feed JSON 里有的内容；绝不编造引语、观点或内容；不臆测某人为什么没发声。
- 文末加一行：
  "由 Follow Builders skill 生成：https://github.com/zarazhangrui/follow-builders"
- 排版清爽、适合手机屏幕阅读。
