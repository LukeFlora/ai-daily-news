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

// 格式化热度数值 (如 28820 -> 28.8k)
function formatHeatNumber(score) {
  if (score >= 10000) {
    return (score / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  if (score >= 1000) {
    return (score / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(score);
}

// 提炼并精简作者所属机构/角色，去除冗长杂乱 handle 尾巴
function cleanAuthorRole(role) {
  if (!role) return '';
  let clean = role.split('.')[0].trim();
  clean = clean.replace(/^(CEO|Founder|VP|Lead|Researcher|Engineer|Creator)\s*,\s*/i, '');
  if (clean.length > 26) clean = clean.slice(0, 24) + '...';
  return clean;
}

// 提取并结构化当天所有新闻条目
function extractAndRankNews(digest) {
  const rawList = [];

  // 1. 推文聚合
  for (const x of (digest.sections?.x || [])) {
    const heat = calculateHeatScore(x);
    // 生成精炼标题 (不再粗暴截断至 38 字，完整保留核心陈述交由 CSS line-clamp 自然断行)
    let title = (x.summary.split('。')[0] || `${x.author} 最新前沿观察`).trim();
    if (title.length > 80) title = title.slice(0, 78) + '...';

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
    let title = (b.title || `${b.sourceName} 深度工程长文`).trim();
    if (title.length > 80) title = title.slice(0, 78) + '...';

    rawList.push({
      id: `blog-${rawList.length + 1}`,
      author: b.sourceName,
      role: '官方技术博客',
      title: title,
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
    let title = (p.title || `${p.sourceName} 深度访谈`).trim();
    if (title.length > 80) title = title.slice(0, 78) + '...';

    rawList.push({
      id: `podcast-${rawList.length + 1}`,
      author: p.sourceName,
      role: '深度 AI 播客',
      title: title,
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

  // 按热度严格降序排序
  rawList.sort((a, b) => b.heat - a.heat);

  // 赋予排版优先级与位次：全量采用单列瀑布流卡片，同时标注热度名次 Rank
  return rawList.map((item, idx) => {
    return {
      ...item,
      rank: idx + 1
    };
  });
}

// 渲染单个复古报纸新闻卡片 (RedSun 瀑布流单列紧凑架构)
function renderNewsItem(item) {
  const heatFormatted = formatHeatNumber(item.heat);
  let heatBadge = '';
  if (item.rank === 1) {
    heatBadge = `
      <span class="heat-pill item-heat heat-rank-1" title="全网热度 TOP 1：${item.heat}">
        <span class="rank-crown">👑 TOP 1</span>
        <span class="heat-num">${heatFormatted}</span>
      </span>
    `;
  } else if (item.rank === 2) {
    heatBadge = `
      <span class="heat-pill item-heat heat-rank-2" title="全网热度 TOP 2：${item.heat}">
        <span class="rank-crown">🥈 TOP 2</span>
        <span class="heat-num">${heatFormatted}</span>
      </span>
    `;
  } else if (item.rank === 3) {
    heatBadge = `
      <span class="heat-pill item-heat heat-rank-3" title="全网热度 TOP 3：${item.heat}">
        <span class="rank-crown">🥉 TOP 3</span>
        <span class="heat-num">${heatFormatted}</span>
      </span>
    `;
  } else {
    heatBadge = `
      <span class="heat-pill item-heat" title="全网热度指数：${item.heat}">
        <span class="pulse-dot"></span>
        <span class="heat-num">#${item.rank} · ${heatFormatted}</span>
      </span>
    `;
  }

  const cleanedRole = cleanAuthorRole(item.role);
  const authorInfo = item.author ? `
    <span class="author-label item-author" title="${escapeHtml(item.author)}${cleanedRole ? ' · ' + escapeHtml(cleanedRole) : ''}">
      <strong>${escapeHtml(item.author)}</strong>${cleanedRole ? `<span> · ${escapeHtml(cleanedRole)}</span>` : ''}
    </span>
  ` : '';

  let briefText = item.brief || '';
  let cleanBrief = briefText.replace(/^【(?:为何关注|推荐理由|核心提炼)】\s*/, '').trim();
  const insightHtml = cleanBrief ? `
    <div class="insight-callout">
      <span class="insight-badge">✦ 洞察</span>
      <p class="insight-text item-brief">${escapeHtml(cleanBrief)}</p>
    </div>
  ` : '';

  const drawerHtml = `
    <div class="deep-dive-drawer item-expand-box">
      <button class="drawer-trigger expand-toggle card-modal-trigger" type="button" aria-expanded="false" title="点击悬浮放大卡片并查阅深度背景与原帖译文">
        <span class="trigger-icon">⤢</span>
        <span class="trigger-text">展开深度背景与细节</span>
      </button>
      <div class="drawer-panel expand-content" style="display: none;">
        <p class="drawer-summary item-summary">${escapeHtml(item.summary)}</p>
        ${item.translation ? `
          <div class="translation-block">
            <div class="translation-label">📜 原帖中文精译与推文细节</div>
            <div class="translation-body">${escapeHtml(item.translation)}</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  return `
    <article class="news-item news-card rank-${item.rank} ${item.rank <= 3 ? 'is-top-tier' : ''}" id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" data-rank="${item.rank}" data-heat="${item.heat}">
      <header class="card-meta-bar item-category-wrap">
        <div class="meta-left">
          <span class="category-chip item-category">${escapeHtml(item.category)}</span>
          ${heatBadge}
        </div>
        <div class="meta-right">
          ${authorInfo}
        </div>
      </header>

      <h3 class="card-headline item-title">${escapeHtml(item.title)}</h3>

      ${insightHtml}

      ${drawerHtml}

      <footer class="card-dock item-footer">
        <a class="source-action source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">
          <span>一手信源</span>
          <span class="arrow">↗</span>
        </a>
        <div class="dock-controls item-footer-actions">
          <button class="icon-tool-btn share-poster-btn" type="button" title="一键生成视觉分享海报" aria-label="生成海报">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </button>
          <button class="icon-tool-btn copy-btn" type="button" title="复制卡片精编" aria-label="复制精编">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
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

  // 计算预计阅读时长与字数 (按中文平均阅读速度 ~400 字/分钟)
  let totalChars = 0;
  for (const item of newsItems) {
    totalChars += (item.title || '').length + (item.summary || '').length + (item.brief || '').length + (item.translation || '').length;
  }
  const readingMinutes = Math.max(1, Math.ceil(totalChars / 400));

  // 计算四大板块实时条目数
  const countAll = newsItems.length;
  const countModel = newsItems.filter(i => i.category === '大模型与技术突破').length;
  const countTools = newsItems.filter(i => i.category === '开源生产力工具').length;
  const countBiz = newsItems.filter(i => i.category === 'AI 投资与商业').length;
  const countPaper = newsItems.filter(i => i.category === '论文前沿').length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(digest.date)}</title>
  <meta name="description" content="${escapeHtml(title)}：${escapeHtml(motto)}。大模型突破、开源工具、AI商业与论文前沿。">
  <!-- OpenGraph & Twitter 社交媒体分享大卡片优化 -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)} · ${escapeHtml(digest.date)}">
  <meta property="og:description" content="${escapeHtml(title)}：${escapeHtml(motto)}。大模型突破、开源工具、AI商业与论文前沿。">
  <meta property="og:url" content="https://lukeflora.github.io/ai-daily-news/">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} · ${escapeHtml(digest.date)}">
  <meta name="twitter:description" content="${escapeHtml(title)}：${escapeHtml(motto)}。追踪前沿突破，汇聚一手洞见。">
  <!-- PWA 与浏览器高清图标 (Phase 3 体验升级) -->
  <link rel="icon" type="image/svg+xml" href="${relativeRoot}assets/icon.svg">
  <link rel="apple-touch-icon" href="${relativeRoot}assets/icon.svg">
  <link rel="manifest" href="${relativeRoot}manifest.json">
  <meta name="theme-color" content="#060910">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Luke的一手消息">
  <!-- RSS 2.0 动态订阅源 (Phase 4 体验升级) -->
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(title)}" href="${relativeRoot}feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Mulish:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* 浏览器原生按钮外观安全重置 (允许类名覆盖 background 与 border) */
    button, select {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
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
        <a class="vintage-link rss-link" href="${relativeRoot}feed.xml" target="_blank" rel="noopener noreferrer" title="通过 RSS 阅读器订阅每日早报">📡 RSS</a>
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
        <span class="meta-pill">⏱️ 预计阅读 ${readingMinutes} 分钟 · 共 ${newsItems.length} 条一手精要</span>
        <span class="meta-pill">🔥 全球高热前沿追踪</span>
        <span class="meta-pill">⚡ 真实一手信源可溯</span>
      </div>
    </header>

    <!-- 交互控制中心：即时搜索与分类筛选 (Phase 2 体验升级) -->
    <section class="newspaper-action-bar" aria-label="要闻搜索与分类筛选">
      <div class="search-box-wrapper">
        <div class="search-input-group">
          <span class="search-icon" aria-hidden="true">🔍</span>
          <input 
            type="search" 
            id="news-search-input" 
            class="news-search-input" 
            placeholder="搜索今日要闻（按 / 快速聚焦，如 OpenAI、Claude、开源...）" 
            autocomplete="off"
            spellcheck="false"
            aria-label="搜索今日要闻"
          >
          <kbd class="search-kbd-hint" title="按 / 键快速聚焦搜索">/</kbd>
          <button type="button" id="search-clear-btn" class="search-clear-btn" title="清空搜索" aria-label="清空搜索">✕</button>
        </div>
        <div id="search-status-hint" class="search-status-hint" style="display: none;"></div>
      </div>

      <!-- 分类即时交互筛选导航条 -->
      <nav class="category-filter-bar" id="category-filter-bar" aria-label="要闻分类筛选">
        <button class="filter-pill active" data-category="all" type="button">
          <span>🔥 全部要闻</span>
          <span class="filter-count">${countAll}</span>
        </button>
        <button class="filter-pill" data-category="大模型与技术突破" type="button">
          <span>🤖 大模型突破</span>
          <span class="filter-count">${countModel}</span>
        </button>
        <button class="filter-pill" data-category="开源生产力工具" type="button">
          <span>🛠️ 开源工具</span>
          <span class="filter-count">${countTools}</span>
        </button>
        <button class="filter-pill" data-category="AI 投资与商业" type="button">
          <span>💰 商业投资</span>
          <span class="filter-count">${countBiz}</span>
        </button>
        <button class="filter-pill" data-category="论文前沿" type="button">
          <span>📑 论文前沿</span>
          <span class="filter-count">${countPaper}</span>
        </button>
      </nav>
    </section>

    <!-- 主版面 4 列网格 -->
    <main class="newspaper-grid" id="newspaper-grid">
      ${itemsHtml}
      <div class="empty-category-notice" id="empty-category-notice" style="display: none;">
        <div class="empty-notice-icon">🔍</div>
        <div class="empty-notice-title">未找到匹配的要闻动态</div>
        <p class="empty-notice-desc">换个关键词试试，或点击下方按钮重置筛选与搜索条件。</p>
        <button type="button" id="empty-reset-btn" class="empty-reset-btn">清空搜索与筛选</button>
      </div>
    </main>

    <!-- 报尾 -->
    <footer class="newspaper-footer">
      <div class="footer-divider"></div>
      <div class="footer-content">
        <p>《${escapeHtml(title)}》由 GitHub Actions 每日自动搜集、提炼、排版与部署发布。</p>
        <p>涵盖大模型与技术突破 · 开源生产力工具 · AI 投资与商业 · 论文前沿 | 纯净无依赖 · 打开即读</p>
      </div>
    </footer>

    <!-- 返回顶部悬浮微按键 (Phase 2 体验升级) -->
    <button id="back-to-top-btn" class="back-to-top-btn" type="button" aria-label="返回顶部" title="返回顶部">
      <span class="btt-icon">↑</span>
      <span class="btt-text">顶部</span>
    </button>

    <!-- 交互式日历弹窗遮罩与容器 -->
    <div class="calendar-modal-backdrop" id="calendar-modal-backdrop">
      <div class="calendar-modal-card">
        <div class="calendar-modal-top">
          <span class="modal-label">📅 《${escapeHtml(title)}》出版日历</span>
          <button class="calendar-close-btn" id="close-calendar-modal" type="button" title="关闭日历">✕</button>
        </div>
        <div id="modal-calendar-container"></div>
      </div>
    </div>

    <!-- 视觉海报分享弹窗 (Phase 4 体验升级) -->
    <div class="poster-modal-backdrop" id="poster-modal-backdrop" style="display: none;">
      <div class="poster-modal-card">
        <div class="poster-modal-top">
          <span class="modal-label">📸 要闻视觉分享海报</span>
          <button class="poster-close-btn" id="close-poster-modal" type="button" title="关闭海报弹窗">✕</button>
        </div>
        <div class="poster-preview-container">
          <canvas id="poster-canvas" width="750" height="980" style="display: none;"></canvas>
          <div class="poster-img-wrapper">
            <img id="poster-preview-img" alt="要闻视觉海报加载中...">
          </div>
        </div>
        <div class="poster-modal-actions">
          <a id="poster-download-btn" class="poster-act-btn primary" download="luke-ai-news.png" href="#">⬇ 保存海报图片</a>
          <button id="poster-copy-btn" class="poster-act-btn secondary" type="button">📋 复制海报图片</button>
        </div>
      </div>
    </div>

    <!-- 卡片深度解读悬浮放大弹窗 (Floating Card Modal) -->
    <div class="card-detail-modal-backdrop" id="card-detail-modal-backdrop" style="display: none;" aria-hidden="true">
      <div class="card-detail-modal-card" id="card-detail-modal-card" role="dialog" aria-modal="true" aria-labelledby="card-detail-title">
        <div class="card-detail-modal-top">
          <span class="modal-label">🔍 要闻深度解读与原帖精译</span>
          <button class="card-detail-close-btn" id="close-card-detail-modal" type="button" title="关闭弹窗 (Esc)" aria-label="关闭弹窗">✕</button>
        </div>
        <div class="card-detail-modal-body" id="card-detail-modal-body">
          <!-- 由 JS 动态填充卡片全部内容 -->
        </div>
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

  // 按月份对往期归档进行分组聚合 (Phase 4 体验升级)
  const monthGroups = {};
  digests.forEach((d, idx) => {
    const monthKey = d.date.slice(0, 7); // "YYYY-MM"
    if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
    const count = (d.sections?.x?.length || 0) + (d.sections?.blogs?.length || 0) + (d.sections?.podcasts?.length || 0);
    monthGroups[monthKey].push({
      date: d.date,
      displayDate: formatDisplayDate(d.date),
      issueNum: digests.length - idx,
      count,
      href: idx === 0 ? `${relativeRoot}index.html` : `${relativeRoot}archive/${d.date}.html`
    });
  });

  const monthBlocksHtml = Object.entries(monthGroups).map(([monthKey, list]) => {
    const [y, m] = monthKey.split('-');
    const totalNews = list.reduce((sum, item) => sum + item.count, 0);
    const rows = list.map(item => `
      <a class="archive-row" href="${item.href}" data-date="${item.date}">
        <div>
          <div class="archive-row-date">${escapeHtml(item.displayDate)}</div>
          <div class="archive-row-meta">第 ${item.issueNum} 期 · 收录 ${item.count} 条一手要闻</div>
        </div>
        <span class="vintage-link">阅读本期报刊 ➔</span>
      </a>
    `).join('');

    return `
      <div class="archive-month-group">
        <div class="archive-month-title">
          <span>📅 ${y} 年 ${m} 月</span>
          <span class="archive-month-count">共 ${list.length} 期出刊 · 聚合 ${totalNews} 条一手洞见</span>
        </div>
        <div class="archive-month-list">
          ${rows}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>往期归档 - ${escapeHtml(title)}</title>
  <meta name="description" content="《${escapeHtml(title)}》历史总览与归档：${escapeHtml(motto)}。">
  <meta property="og:type" content="website">
  <meta property="og:title" content="往期归档 · ${escapeHtml(title)}">
  <meta property="og:description" content="《${escapeHtml(title)}》历史总览与往期出版记录：${escapeHtml(motto)}。">
  <meta property="og:url" content="https://lukeflora.github.io/ai-daily-news/archive/index.html">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="往期归档 · ${escapeHtml(title)}">
  <meta name="twitter:description" content="《${escapeHtml(title)}》历史总览与往期出版记录。">
  <!-- PWA 与浏览器高清图标 (Phase 3 体验升级) -->
  <link rel="icon" type="image/svg+xml" href="${relativeRoot}assets/icon.svg">
  <link rel="apple-touch-icon" href="${relativeRoot}assets/icon.svg">
  <link rel="manifest" href="${relativeRoot}manifest.json">
  <meta name="theme-color" content="#060910">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Luke的一手消息">
  <!-- RSS 2.0 动态订阅源 (Phase 4 体验升级) -->
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(title)}" href="${relativeRoot}feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Mulish:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* 浏览器原生按钮外观安全重置 (允许类名覆盖 background 与 border) */
    button, select {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
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
        <a class="vintage-link rss-link" href="${relativeRoot}feed.xml" target="_blank" rel="noopener noreferrer" title="通过 RSS 阅读器订阅每日早报">📡 RSS</a>
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
      ${monthBlocksHtml}
    </div>

    <footer class="newspaper-footer">
      <div class="footer-divider"></div>
      <div class="footer-content">
        <p>坚持关注具备第一手原创观点的 AI Builders · 历史沉淀与持续记录</p>
      </div>
    </footer>

    <!-- 返回顶部悬浮微按键 (Phase 2 体验升级) -->
    <button id="back-to-top-btn" class="back-to-top-btn" type="button" aria-label="返回顶部" title="返回顶部">
      <span class="btt-icon">↑</span>
      <span class="btt-text">顶部</span>
    </button>
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

// 生成标准 RSS 2.0 动态订阅源 (Phase 4 体验升级)
function generateRssFeed({ title, motto, digests, siteUrl = 'https://lukeflora.github.io/ai-daily-news/' }) {
  const items = [];
  // 提取最近 15 期的所有高质要闻动态
  for (const d of digests.slice(0, 15)) {
    const newsItems = extractAndRankNews(d);
    for (const item of newsItems) {
      items.push({
        title: `[${item.category}] ${item.title}`,
        link: item.sourceUrl || `${siteUrl}archive/${d.date}.html#${item.id}`,
        guid: `${d.date}-${item.id}`,
        pubDate: new Date(d.date + 'T09:00:00+08:00').toUTCString(),
        category: item.category,
        author: item.author || 'Luke',
        description: `<![CDATA[
          <p><strong>板块：</strong>${item.category} ${item.author ? `| <strong>观点作者：</strong>${item.author}` : ''}</p>
          ${item.brief ? `<p><strong>核心提要：</strong>${item.brief}</p>` : ''}
          <p><strong>深入解读：</strong>${item.summary}</p>
          ${item.translation ? `<blockquote><strong>译文精要：</strong><pre style="white-space: pre-wrap;">${item.translation}</pre></blockquote>` : ''}
          <hr/>
          <p><a href="${item.sourceUrl}">查看一手信源 ↗</a> | <a href="${siteUrl}">《${title}》在线阅读</a></p>
        ]]>`
      });
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(title)}</title>
    <link>${siteUrl}</link>
    <description>${escapeHtml(motto)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}feed.xml" rel="self" type="application/rss+xml"/>
    ${items.map(i => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.link}</link>
      <guid isPermaLink="false">${i.guid}</guid>
      <pubDate>${i.pubDate}</pubDate>
      <category><![CDATA[${i.category}]]></category>
      <description>${i.description}</description>
    </item>`).join('')}
  </channel>
</rss>`;
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

  // 拷贝 PWA 文件 (manifest.json 与 sw.js) 至 public/ 根目录 (Phase 3 体验升级)
  const swSrc = join(ROOT_DIR, 'web', 'sw.js');
  const manifestSrc = join(ROOT_DIR, 'web', 'manifest.json');
  if (existsSync(swSrc)) {
    await cp(swSrc, join(PUBLIC_DIR, 'sw.js'));
    console.log(`- PWA Service Worker 已部署至 public/sw.js`);
  }
  if (existsSync(manifestSrc)) {
    await cp(manifestSrc, join(PUBLIC_DIR, 'manifest.json'));
    console.log(`- PWA Web App Manifest 已部署至 public/manifest.json`);
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

  // 6.5 生成 RSS 2.0 动态订阅源 public/feed.xml & public/rss.xml (Phase 4 体验升级)
  const rssXml = generateRssFeed({
    title: settings.siteTitle || 'Luke的一手消息',
    motto: settings.motto || '追踪前沿突破 · 汇聚一手洞见',
    digests
  });
  await writeFile(join(PUBLIC_DIR, 'feed.xml'), rssXml, 'utf-8');
  await writeFile(join(PUBLIC_DIR, 'rss.xml'), rssXml, 'utf-8');
  console.log(`- RSS 2.0 动态订阅源已生成: public/feed.xml & public/rss.xml`);

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
    // 单源真理自动化：编译时自动同步样式与矢量图标，杜绝版本漂移
    if (existsSync(join(ASSETS_SRC, 'style.css'))) {
      await cp(join(ASSETS_SRC, 'style.css'), join(ROOT_DIR, 'ai-daily-lite', 'style.css'));
    }
    if (existsSync(join(ASSETS_SRC, 'icon.svg'))) {
      await cp(join(ASSETS_SRC, 'icon.svg'), join(ROOT_DIR, 'ai-daily-lite', 'icon.svg'));
    }
    await writeFile(LITE_DATA_FILE, JSON.stringify(structuredData, null, 2), 'utf-8');
    const litePublicDir = join(PUBLIC_DIR, 'lite');
    await mkdir(litePublicDir, { recursive: true });
    await cp(join(ROOT_DIR, 'ai-daily-lite'), litePublicDir, { recursive: true });
    console.log(`- 同步更新 ai-daily-lite/ 及 public/lite/ (已同步最新样式与矢量图标)`);
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
