#!/usr/bin/env node

/**
 * build-site.js
 * 
 * 静态报刊网站生成器（Luke的一手消息 · 复古报刊风格）：
 * 1. 扫描 data/digests/*.json 所有的结构化数据。
 * 2. 依据热度/讨论度智能排序，并精准归类到用户关注的四大板块：
 *    - 大模型与技术突破
 *    - 开源生产力工具
 *    - AI 投资与商业
 *    - 论文前沿
 * 3. 按照经典报刊优先级排版（1 条 Lead 头条整行、2 条 Important 重点半行、其余 Normal 小模块）。
 * 4. 编译输出到 public/（作为 GitHub Pages 线上部署发布目录）及同步更新 ai-daily-lite/data.json。
 */

import { readFile, writeFile, mkdir, readdir, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const DIGESTS_DIR = join(ROOT_DIR, 'data', 'digests');
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const ASSETS_SRC = join(ROOT_DIR, 'web', 'assets');
const ASSETS_DEST = join(PUBLIC_DIR, 'assets');
const SETTINGS_FILE = join(ROOT_DIR, 'config', 'settings.json');
const LITE_DATA_FILE = join(ROOT_DIR, 'ai-daily-lite', 'data.json');

// HTML 转义
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 格式化展示中文日期与星期
function formatDisplayDate(dateStr) {
  try {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekDay = weekDays[d.getDay()];
    return `${parts[0]}年${parts[1]}月${parts[2]}日 · ${weekDay}`;
  } catch {
    return dateStr;
  }
}

// 依据内容特征归类到四大领域
function detectCategory(title, summary, text = '') {
  const combined = `${title} ${summary} ${text}`.toLowerCase();

  // 1. 开源生产力工具
  if (/开源|github|mod|模组|插件|terminal|终端|微虚拟机|沙箱|ide|cli|工具|框架|sdk|扩展/.test(combined)) {
    return '开源生产力工具';
  }

  // 2. AI 投资与商业
  if (/投资|融资|商业|企业|成本|收入|市场|估值|yc|风投|roi|创投|商业化|交付/.test(combined)) {
    return 'AI 投资与商业';
  }

  // 3. 论文前沿
  if (/论文|arxiv|算法|理论|实验|数学|证明|强化学习|rlvr|推理模型|心智|苏格拉底/.test(combined)) {
    return '论文前沿';
  }

  // 4. 大模型与技术突破 (默认高频)
  return '大模型与技术突破';
}

// 计算热度分数
function calculateHeatScore(item) {
  let score = 0;
  if (item.rawTweets && Array.isArray(item.rawTweets)) {
    for (const t of item.rawTweets) {
      score += (t.likes || 0) + (t.retweets || 0) * 3 + (t.replies || 0) * 2;
    }
  }
  if (item.type === 'blog') score += 600;
  if (item.type === 'podcast') score += 400;
  return score || 100;
}

// 提取并结构化当天所有新闻条目
function extractAndRankNews(digest) {
  const rawList = [];

  // 1. 推文聚合
  for (const x of (digest.sections?.x || [])) {
    const heat = calculateHeatScore(x);
    // 生成精炼标题
    let title = x.summary.split('。')[0] || `${x.author} 最新前沿观察`;
    if (title.length > 40) title = title.slice(0, 38) + '...';

    rawList.push({
      id: `x-${x.handle || 'tweet'}-${rawList.length + 1}`,
      author: x.author,
      role: x.role,
      title: title,
      brief: x.recommendation ? `【为何关注】${x.recommendation}` : '',
      summary: x.summary,
      translation: x.translation,
      recommendation: x.recommendation,
      category: detectCategory(title, x.summary, x.translation),
      heat: heat,
      sourceName: `${x.author} (@${x.handle})`,
      sourceUrl: x.url
    });
  }

  // 2. 技术博客
  for (const b of (digest.sections?.blogs || [])) {
    rawList.push({
      id: `blog-${rawList.length + 1}`,
      author: b.sourceName,
      role: '官方技术博客',
      title: b.title || `${b.sourceName} 深度工程长文`,
      brief: b.recommendation ? `【推荐理由】${b.recommendation}` : '',
      summary: b.summary,
      translation: b.translation,
      recommendation: b.recommendation,
      category: detectCategory(b.title, b.summary, b.translation),
      heat: 800,
      sourceName: b.sourceName,
      sourceUrl: b.url
    });
  }

  // 3. 播客
  for (const p of (digest.sections?.podcasts || [])) {
    rawList.push({
      id: `podcast-${rawList.length + 1}`,
      author: p.sourceName,
      role: '深度 AI 播客',
      title: p.title || `${p.sourceName} 深度访谈`,
      brief: p.recommendation ? `【核心提炼】${p.recommendation}` : '',
      summary: p.summary,
      translation: p.translation,
      recommendation: p.recommendation,
      category: detectCategory(p.title, p.summary, p.translation),
      heat: 500,
      sourceName: p.sourceName,
      sourceUrl: p.url
    });
  }

  // 按热度排序
  rawList.sort((a, b) => b.heat - a.heat);

  // 赋予排版优先级：最多 1 条 lead、2 条 important，其余 normal
  return rawList.map((item, idx) => {
    let priority = 'normal';
    if (idx === 0) priority = 'lead';
    else if (idx === 1 || idx === 2) priority = 'important';

    return {
      ...item,
      priority
    };
  });
}

// 渲染单个复古报纸新闻模块
function renderNewsItem(item) {
  const heatBadge = item.heat > 100 ? `<span class="item-heat">🔥 热度 ${item.heat}</span>` : '';
  const authorInfo = item.author ? `
    <div class="item-author">
      <strong>${escapeHtml(item.author)}</strong>
      ${item.role ? `<span>· ${escapeHtml(item.role)}</span>` : ''}
    </div>
  ` : '';

  const expandHtml = item.translation ? `
    <div class="item-expand-box">
      <button class="expand-toggle" type="button">▼ 展开深度译文与细节</button>
      <div class="expand-content">${escapeHtml(item.translation)}</div>
    </div>
  ` : '';

  return `
    <article class="news-item priority-${item.priority}" id="${escapeHtml(item.id)}">
      <div class="item-category-wrap">
        <span class="item-category">${escapeHtml(item.category)}</span>
        ${heatBadge}
      </div>
      <h2 class="item-title">${escapeHtml(item.title)}</h2>
      ${authorInfo}
      ${item.brief ? `<p class="item-brief">${escapeHtml(item.brief)}</p>` : ''}
      <p class="item-summary">${escapeHtml(item.summary)}</p>
      ${expandHtml}
      <footer class="item-footer">
        <a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">
          一手信源 ↗
        </a>
        <button class="copy-btn" type="button">复制精要</button>
      </footer>
    </article>
  `;
}

// 渲染完整页面
function renderPage({ title, motto, digest, allDates, isArchive = false, relativeRoot = '' }) {
  const newsItems = extractAndRankNews(digest);
  const itemsHtml = newsItems.map(renderNewsItem).join('');

  // 往期日期下拉选项
  const dateOptions = allDates.map(d => {
    const isSelected = d === digest.date ? 'selected' : '';
    const href = d === allDates[0] ? `${relativeRoot}index.html` : `${relativeRoot}archive/${d}.html`;
    return `<option value="${href}" ${isSelected}>${d}</option>`;
  }).join('');

  const displayDate = formatDisplayDate(digest.date);
  const issueNumber = `第 ${allDates.length - allDates.indexOf(digest.date)} 期 · 晨报精编`;
  const ver = Date.now();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(digest.date)}</title>
  <meta name="description" content="${escapeHtml(title)}：${escapeHtml(motto)}。大模型突破、开源工具、AI商业与论文前沿。">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Mulish:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* 强力防御浏览器默认系统按钮样式污染 */
    button, select {
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      appearance: none !important;
      background: transparent !important;
      border: none;
      font-family: inherit;
    }
  </style>
  <script>
    (function() {
      try {
        var savedTheme = localStorage.getItem('luke_news_theme');
        if (savedTheme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch (e) {}
    })();
  </script>
  <link rel="stylesheet" href="${relativeRoot}assets/style.css?v=${ver}">
</head>
<body>
  <!-- 太阳耀斑环境光晕 (RedSun Signature Glow) -->
  <div class="sun-flare-wrapper">
    <div class="sun-flare-circle"></div>
  </div>

  <div class="newspaper-container">
    <!-- 顶部 RedSun 磨砂悬浮导航栏 -->
    <nav class="top-nav-bar">
      <div class="top-nav-left">
        <div class="whats-new-badge">RedSun AI</div>
        <button class="calendar-toggle-btn" id="open-calendar-btn" type="button" title="点击打开月度出版日历">
          <span>📅</span>
          <span>日历查阅</span>
        </button>
        <span class="nav-sep">|</span>
        <span class="nav-label">往期回顾：</span>
        <select class="vintage-select" onchange="if(this.value) location.href=this.value;">
          ${dateOptions}
        </select>
        <span class="nav-sep">|</span>
        <a class="vintage-link" href="${relativeRoot}archive/index.html">时间线总览</a>
      </div>
      <div class="top-nav-right">
        <button class="theme-toggle-btn" id="theme-toggle-btn" type="button" title="点击切换 亮色 / 暗黑 模式">
          <span class="theme-icon">☀️</span>
          <span class="theme-text">亮色模式</span>
        </button>
        <span class="nav-sep">|</span>
        <span class="nav-label">⚡ 每日自动更新 · 打开即读</span>
        <span class="nav-sep">|</span>
        <a class="vintage-link" href="https://github.com/LukeFlora/ai-daily-news" target="_blank" rel="noopener noreferrer">GitHub 仓库 ↗</a>
      </div>
    </nav>

    <!-- RedSun 旗舰主报头 -->
    <header class="newspaper-header">
      <div class="header-badge-holder">
        <span class="badge-pulse-dot"></span>
        <span>RedSun 智能动态汇编 · ${escapeHtml(issueNumber)}</span>
      </div>
      <h1 class="newspaper-title">${escapeHtml(title)}</h1>
      <p class="newspaper-subtitle">${escapeHtml(motto)} | 大模型突破 · 开源生产力工具 · AI 投资商业 · 论文前沿</p>
      <div class="header-meta-pills">
        <span class="meta-pill highlight">📅 ${escapeHtml(displayDate)}</span>
        <span class="meta-pill">🔥 全球高热前沿追踪</span>
        <span class="meta-pill">⚡ 真实一手信源可溯</span>
      </div>
    </header>

    <!-- 主版面 4 列网格 -->
    <main class="newspaper-grid">
      ${itemsHtml}
    </main>

    <!-- 报尾 -->
    <footer class="newspaper-footer">
      <div class="footer-divider"></div>
      <div class="footer-content">
        <p>《${escapeHtml(title)}》由 GitHub Actions 每日自动搜集、提炼、排版与部署发布。</p>
        <p>涵盖大模型与技术突破 · 开源生产力工具 · AI 投资与商业 · 论文前沿 | 纯净无依赖 · 打开即读</p>
      </div>
    </footer>

    <!-- 复古日历弹窗遮罩与容器 -->
    <div class="calendar-modal-backdrop" id="calendar-modal-backdrop">
      <div class="calendar-modal-card">
        <button class="calendar-close-btn" id="close-calendar-modal" type="button" title="关闭日历">✕</button>
        <div id="modal-calendar-container"></div>
      </div>
    </div>
  </div>

  <script>
    window.AVAILABLE_DATES = ${JSON.stringify(allDates)};
    window.CURRENT_DATE = "${digest.date}";
    window.RELATIVE_ROOT = "${relativeRoot}";
  </script>
  <script src="${relativeRoot}assets/app.js?v=${ver}"></script>
</body>
</html>`;
}

// 渲染归档总览页
function renderArchiveIndexPage({ title, motto, digests, relativeRoot = '' }) {
  const allDates = digests.map(d => d.date);
  const ver = Date.now();
  const rowsHtml = digests.map((d, idx) => {
    const href = idx === 0 ? `${relativeRoot}index.html` : `${relativeRoot}archive/${d.date}.html`;
    const count = (d.sections?.x?.length || 0) + (d.sections?.blogs?.length || 0) + (d.sections?.podcasts?.length || 0);
    return `
      <a class="archive-row" href="${href}">
        <div>
          <div class="archive-row-date">${escapeHtml(formatDisplayDate(d.date))}</div>
          <div class="archive-row-meta">第 ${digests.length - idx} 期 · 收录 ${count} 条一手要闻</div>
        </div>
        <span class="vintage-link">阅读本期报刊 ➔</span>
      </a>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>往期归档 - ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Mulish:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    button, select {
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      appearance: none !important;
      background: transparent !important;
      border: none;
      font-family: inherit;
    }
  </style>
  <script>
    (function() {
      try {
        var savedTheme = localStorage.getItem('luke_news_theme');
        if (savedTheme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch (e) {}
    })();
  </script>
  <link rel="stylesheet" href="${relativeRoot}assets/style.css?v=${ver}">
</head>
<body>
  <!-- 太阳耀斑环境光晕 -->
  <div class="sun-flare-wrapper">
    <div class="sun-flare-circle"></div>
  </div>

  <div class="newspaper-container archive-container">
    <nav class="top-nav-bar">
      <div class="top-nav-left">
        <a class="vintage-link" href="${relativeRoot}index.html">⬅ 返回今日最新日报</a>
      </div>
      <div class="top-nav-right">
        <button class="theme-toggle-btn" id="theme-toggle-btn" type="button" title="点击切换 亮色 / 暗黑 模式">
          <span class="theme-icon">☀️</span>
          <span class="theme-text">亮色模式</span>
        </button>
        <span class="nav-sep">|</span>
        <a class="vintage-link" href="https://github.com/LukeFlora/ai-daily-news" target="_blank" rel="noopener noreferrer">GitHub 仓库 ↗</a>
      </div>
    </nav>

    <header class="archive-header">
      <h1>《${escapeHtml(title)}》往期历史总览</h1>
      <p style="color: var(--text-muted);">${escapeHtml(motto)}</p>
    </header>

    <!-- 交互式月度日历 -->
    <section class="inline-calendar-section">
      <div class="inline-calendar-title">📅 月度出版日历 (点击对应日期直接查阅当天报刊)</div>
      <div id="inline-calendar-container"></div>
    </section>

    <div class="archive-list">
      <div class="inline-calendar-title" style="margin-top: 1rem;">📜 往期时间线列表</div>
      ${rowsHtml}
    </div>

    <footer class="newspaper-footer">
      <div class="footer-divider"></div>
      <div class="footer-content">
        <p>坚持关注具备第一手原创观点的 AI Builders · 历史沉淀与持续记录</p>
      </div>
    </footer>
  </div>

  <script>
    window.AVAILABLE_DATES = ${JSON.stringify(allDates)};
    window.CURRENT_DATE = "${digests[0]?.date || ''}";
    window.RELATIVE_ROOT = "${relativeRoot}";
  </script>
  <script src="${relativeRoot}assets/app.js?v=${ver}"></script>
</body>
</html>`;
}

// 主流程
async function main() {
  console.log(`\n========================================`);
  console.log(`[复古报刊生成器] 开始编译《Luke的一手消息》`);
  console.log(`========================================\n`);

  // 1. 读取配置
  let settings = {
    siteTitle: 'Luke的一手消息',
    motto: '追踪前沿突破 · 汇聚一手洞见'
  };
  if (existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'));
    } catch {}
  }

  // 2. 读取 digest 数据
  if (!existsSync(DIGESTS_DIR)) {
    console.error(`[Error] 未发现任何日报数据目录: ${DIGESTS_DIR}`);
    process.exit(1);
  }

  const files = (await readdir(DIGESTS_DIR)).filter(f => f.endsWith('.json')).sort().reverse();
  const digests = [];
  for (const f of files) {
    const raw = await readFile(join(DIGESTS_DIR, f), 'utf-8');
    try {
      digests.push(JSON.parse(raw));
    } catch {}
  }

  if (digests.length === 0) {
    console.error(`[Error] 暂无日报数据文件`);
    process.exit(1);
  }

  const allDates = digests.map(d => d.date);
  const latestDigest = digests[0];

  // 3. 输出目录准备
  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(join(PUBLIC_DIR, 'archive'), { recursive: true });
  await mkdir(ASSETS_DEST, { recursive: true });

  // 拷贝静态 assets
  if (existsSync(ASSETS_SRC)) {
    await cp(ASSETS_SRC, ASSETS_DEST, { recursive: true });
    console.log(`- 静态资源已同步至 public/assets/`);
  }

  // 4. 生成每一期归档页面 public/archive/YYYY-MM-DD.html
  for (const d of digests) {
    const pageHtml = renderPage({
      title: settings.siteTitle || 'Luke的一手消息',
      motto: settings.motto || '追踪前沿突破 · 汇聚一手洞见',
      digest: d,
      allDates,
      isArchive: true,
      relativeRoot: '../'
    });
    const destPath = join(PUBLIC_DIR, 'archive', `${d.date}.html`);
    await writeFile(destPath, pageHtml, 'utf-8');
  }
  console.log(`- 已生成 ${digests.length} 个历史归档报纸至 public/archive/`);

  // 5. 生成首页 public/index.html
  const indexHtml = renderPage({
    title: settings.siteTitle || 'Luke的一手消息',
    motto: settings.motto || '追踪前沿突破 · 汇聚一手洞见',
    digest: latestDigest,
    allDates,
    isArchive: false,
    relativeRoot: './'
  });
  await writeFile(join(PUBLIC_DIR, 'index.html'), indexHtml, 'utf-8');
  console.log(`- 《Luke的一手消息》最新首页已生成: public/index.html (${latestDigest.date})`);

  // 6. 生成往期索引 public/archive/index.html
  const archiveIndexHtml = renderArchiveIndexPage({
    title: settings.siteTitle || 'Luke的一手消息',
    motto: settings.motto || '追踪前沿突破 · 汇聚一手洞见',
    digests,
    relativeRoot: '../'
  });
  await writeFile(join(PUBLIC_DIR, 'archive', 'index.html'), archiveIndexHtml, 'utf-8');
  console.log(`- 往期历史时间线已生成: public/archive/index.html`);

  // 7. 同步导出当天 data.json 至 public/data.json 和 ai-daily-lite/data.json
  const rankedLatestNews = extractAndRankNews(latestDigest);
  const structuredData = {
    date: formatDisplayDate(latestDigest.date),
    items: rankedLatestNews.map(item => ({
      id: item.id,
      title: item.title,
      brief: item.brief,
      summary: item.summary,
      category: item.category,
      priority: item.priority,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl
    }))
  };

  await writeFile(join(PUBLIC_DIR, 'data.json'), JSON.stringify(structuredData, null, 2), 'utf-8');
  if (existsSync(join(ROOT_DIR, 'ai-daily-lite'))) {
    await writeFile(LITE_DATA_FILE, JSON.stringify(structuredData, null, 2), 'utf-8');
    const litePublicDir = join(PUBLIC_DIR, 'lite');
    await mkdir(litePublicDir, { recursive: true });
    await cp(join(ROOT_DIR, 'ai-daily-lite'), litePublicDir, { recursive: true });
    console.log(`- 同步更新 ai-daily-lite/ 及 public/lite/`);
  }

  console.log(`\n========================================`);
  console.log(`[完成] 《Luke的一手消息》复古报刊静态网站编译完成！`);
  console.log(`- 线上部署就绪: public/ 目录随时可发布至 GitHub Pages`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[Error] 网站生成异常:', err);
  process.exit(1);
});
