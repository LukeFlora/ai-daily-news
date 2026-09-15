#!/usr/bin/env node

/**
 * build-site.js
 * 
 * 静态网站生成器：
 * 1. 扫描 data/digests/*.json 所有的结构化数据。
 * 2. 编译并输出：
 *    - public/index.html（全站首页，展示最新一期日报）
 *    - public/archive/YYYY-MM-DD.html（每一天的专属静态归档页）
 *    - public/archive/index.html（往期历史归档时间线导航）
 * 3. 拷贝静态资源到 public/assets/。
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
    return `${dateStr} · ${weekDay}`;
  } catch {
    return dateStr;
  }
}

// 渲染卡片：X / 推特
function renderXCard(item) {
  const avatar = item.avatar ? `<img class="author-avatar" src="${escapeHtml(item.avatar)}" alt="${escapeHtml(item.author)}" onerror="this.style.display='none'">` : `<div class="author-avatar"></div>`;
  const role = item.role ? `<span class="author-role">${escapeHtml(item.role)}</span>` : '';

  return `
    <article class="item-card" data-type="x">
      <div class="card-header">
        <div class="author-info">
          ${avatar}
          <div class="author-details">
            <span class="author-name">${escapeHtml(item.author)}</span>
            ${role}
          </div>
        </div>
        <span class="source-badge badge-x">X / 推特</span>
      </div>

      <!-- 1. 中文总结 -->
      <div class="section-block">
        <div class="section-label label-summary">💡 中文总结</div>
        <div class="summary-box">${escapeHtml(item.summary)}</div>
      </div>

      <!-- 2. 中文全文翻译（支持折叠展开） -->
      <div class="section-block">
        <div class="translation-box">
          <button class="translation-toggle" type="button">
            <span>📄 中文全文翻译</span>
            <span class="arrow">▼ 展开全文翻译</span>
          </button>
          <div class="translation-content">${escapeHtml(item.translation)}</div>
        </div>
      </div>

      <!-- 3. 推荐理由 -->
      <div class="section-block">
        <div class="section-label label-rec">🎯 为什么值得看</div>
        <div class="recommend-box">${escapeHtml(item.recommendation)}</div>
      </div>

      <!-- 4. 原文链接与工具 -->
      <div class="card-footer">
        <a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          🔗 查看推文原文 ↗
        </a>
        <div class="action-tools">
          <button class="tool-btn btn-copy" type="button">复制精要</button>
        </div>
      </div>
    </article>
  `;
}

// 渲染卡片：官方技术博客
function renderBlogCard(item) {
  return `
    <article class="item-card" data-type="blog">
      <div class="card-header">
        <div class="author-info">
          <div class="author-avatar" style="background: linear-gradient(135deg, #a855f7, #6366f1); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:1.2rem;">B</div>
          <div class="author-details">
            <span class="author-name">${escapeHtml(item.sourceName)}</span>
            <span class="author-role">${escapeHtml(item.title)}</span>
          </div>
        </div>
        <span class="source-badge badge-blog">技术博客</span>
      </div>

      <div class="section-block">
        <div class="section-label label-summary">💡 核心要点</div>
        <div class="summary-box">${escapeHtml(item.summary)}</div>
      </div>

      <div class="section-block">
        <div class="translation-box">
          <button class="translation-toggle" type="button">
            <span>📄 核心内容译文</span>
            <span class="arrow">▼ 展开译文</span>
          </button>
          <div class="translation-content">${escapeHtml(item.translation)}</div>
        </div>
      </div>

      <div class="section-block">
        <div class="section-label label-rec">🎯 为什么值得看</div>
        <div class="recommend-box">${escapeHtml(item.recommendation)}</div>
      </div>

      <div class="card-footer">
        <a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          🔗 查阅官方博客全文 ↗
        </a>
        <div class="action-tools">
          <button class="tool-btn btn-copy" type="button">复制精要</button>
        </div>
      </div>
    </article>
  `;
}

// 渲染卡片：深度播客
function renderPodcastCard(item) {
  const appendixHtml = item.fullTranscript ? `
    <div class="section-block" style="margin-top: 1rem;">
      <div class="translation-box">
        <button class="translation-toggle" type="button">
          <span>📼 播客单集听力文稿与完整译本（附录）</span>
          <span class="arrow">▼ 展开完整文稿</span>
        </button>
        <div class="translation-content" style="max-height: 400px; overflow-y: auto;">${escapeHtml(item.fullTranscript)}</div>
      </div>
    </div>
  ` : '';

  return `
    <article class="item-card" data-type="podcast">
      <div class="card-header">
        <div class="author-info">
          <div class="author-avatar" style="background: linear-gradient(135deg, #10b981, #059669); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:1.2rem;">🎙️</div>
          <div class="author-details">
            <span class="author-name">${escapeHtml(item.showName)}</span>
            <span class="author-role">${escapeHtml(item.title)}</span>
          </div>
        </div>
        <span class="source-badge badge-podcast">深度播客</span>
      </div>

      <div class="section-block">
        <div class="section-label label-summary">💡 核心观点与金句</div>
        <div class="summary-box">${escapeHtml(item.summary)}</div>
      </div>

      <div class="section-block">
        <div class="section-label label-rec">🎯 为什么值得看</div>
        <div class="recommend-box">${escapeHtml(item.recommendation)}</div>
      </div>

      ${appendixHtml}

      <div class="card-footer">
        <a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          🔗 收听或观看本期播客 ↗
        </a>
        <div class="action-tools">
          <button class="tool-btn btn-copy" type="button">复制精要</button>
        </div>
      </div>
    </article>
  `;
}

// 组装完整页面 HTML
function renderPage({ title, digest, allDates, isArchive = false, relativeRoot = '' }) {
  const xCards = (digest.sections?.x || []).map(renderXCard).join('');
  const blogCards = (digest.sections?.blogs || []).map(renderBlogCard).join('');
  const podcastCards = (digest.sections?.podcasts || []).map(renderPodcastCard).join('');

  const weekendBadge = digest.isMondayLookback ? `
    <span class="weekend-badge">🌟 包含周末 72 小时汇总 (周五至周日)</span>
  ` : '';

  // 往期日期链接下拉选项
  const dateOptions = allDates.map(d => {
    const isSelected = d === digest.date ? 'selected' : '';
    const href = d === allDates[0] ? `${relativeRoot}index.html` : `${relativeRoot}archive/${d}.html`;
    return `<option value="${href}" ${isSelected}>${d}</option>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(digest.date)}</title>
  <meta name="description" content="AI Builders 中文日报，追踪顶尖 AI 创业者、技术博客与播客一手动态。">
  <link rel="stylesheet" href="${relativeRoot}assets/style.css">
</head>
<body>

  <!-- 顶部导航 -->
  <header class="navbar">
    <div class="nav-container">
      <a class="brand" href="${relativeRoot}index.html">
        <div class="brand-icon">AI</div>
        <span>AI Builders 日报</span>
      </a>

      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input class="search-input" id="search-input" type="text" placeholder="搜索作者、观点、产品...">
      </div>

      <div class="nav-actions">
        <select class="nav-btn" onchange="if(this.value) location.href=this.value;" style="cursor: pointer;">
          ${dateOptions}
        </select>
        <a class="nav-btn" href="${relativeRoot}archive/index.html">📅 往期归档</a>
        <button class="nav-btn" id="theme-toggle" type="button">☀️ 浅色</button>
      </div>
    </div>
  </header>

  <!-- 主体区域 -->
  <main class="main-content">
    <div class="hero-header">
      <div class="hero-meta">
        <span class="date-badge">${formatDisplayDate(digest.date)}</span>
        ${weekendBadge}
      </div>
      <h1 class="hero-title">AI Builders 中文日报</h1>
      <p class="hero-desc">追踪下场干活的开发者与创始人一手动态，沉淀高信噪比中文每日洞察与独立网站归档。</p>
    </div>

    <!-- 数据仪表盘 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-val">${digest.stats?.buildersCount || 0}</span>
        <span class="stat-lbl">AI Builders</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">${digest.stats?.totalTweets || 0}</span>
        <span class="stat-lbl">推特要闻</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">${digest.stats?.blogCount || 0}</span>
        <span class="stat-lbl">官方博客</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">${digest.stats?.podcastCount || 0}</span>
        <span class="stat-lbl">深度播客</span>
      </div>
    </div>

    <!-- 分类 Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button class="tab-btn active" data-filter="all">全部动态 (${(digest.stats?.buildersCount || 0) + (digest.stats?.blogCount || 0) + (digest.stats?.podcastCount || 0)})</button>
        <button class="tab-btn" data-filter="x">X / 推特 (${digest.stats?.buildersCount || 0})</button>
        <button class="tab-btn" data-filter="blog">官方博客 (${digest.stats?.blogCount || 0})</button>
        <button class="tab-btn" data-filter="podcast">深度播客 (${digest.stats?.podcastCount || 0})</button>
      </div>
    </div>

    <!-- 内容流列表 -->
    <div class="digest-grid">
      ${xCards}
      ${blogCards}
      ${podcastCards}
    </div>
  </main>

  <footer class="footer">
    <p>AI Builders 日报 · 坚持关注拥有原创观点的 Builders · 每日自动更新与归档维护</p>
    <p style="margin-top: 0.5rem; opacity: 0.7;">数据由 GitHub 上游开源仓库定时聚合 · 纯静态生成部署</p>
  </footer>

  <script src="${relativeRoot}assets/app.js"></script>
</body>
</html>
`;
}

// 渲染往期归档时间线页面
function renderArchiveIndexPage({ title, digests, relativeRoot = '' }) {
  const itemsHtml = digests.map(d => {
    return `
      <a class="archive-card" href="${relativeRoot}archive/${d.date}.html">
        <div class="archive-meta">
          <span class="archive-date">${formatDisplayDate(d.date)}</span>
          ${d.isMondayLookback ? '<span class="weekend-badge" style="font-size:0.75rem;">🌟 含周末汇总</span>' : ''}
        </div>
        <div class="archive-stats">
          ${d.stats?.buildersCount || 0} 位人物 · ${d.stats?.totalTweets || 0} 条推特 · ${d.stats?.blogCount || 0} 篇博客 · ${d.stats?.podcastCount || 0} 期播客 ↗
        </div>
      </a>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>往期归档 - ${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${relativeRoot}assets/style.css">
</head>
<body>
  <header class="navbar">
    <div class="nav-container">
      <a class="brand" href="${relativeRoot}index.html">
        <div class="brand-icon">AI</div>
        <span>AI Builders 日报</span>
      </a>
      <div class="nav-actions">
        <a class="nav-btn" href="${relativeRoot}index.html">🏠 返回最新日报</a>
        <button class="nav-btn" id="theme-toggle" type="button">☀️ 浅色</button>
      </div>
    </div>
  </header>

  <main class="main-content">
    <div class="hero-header">
      <h1 class="hero-title">📅 往期日报历史归档</h1>
      <p class="hero-desc">按日期查看所有历史发布的 AI Builders 每日要闻与深度洞见。</p>
    </div>

    <div class="archive-list">
      ${itemsHtml}
    </div>
  </main>

  <footer class="footer">
    <p>AI Builders 日报 · 坚持关注拥有原创观点的 Builders</p>
  </footer>
  <script src="${relativeRoot}assets/app.js"></script>
</body>
</html>`;
}

// 主构建流程
async function main() {
  console.log(`\n========================================`);
  console.log(`[静态站点生成器] 开始编译网站 HTML`);
  console.log(`========================================\n`);

  // 1. 读取配置
  let settings = { siteTitle: 'AI Builders 中文日报' };
  if (existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'));
    } catch {}
  }

  // 2. 扫描 data/digests/*.json
  if (!existsSync(DIGESTS_DIR)) {
    console.error(`[Error] 未发现任何日报数据目录: ${DIGESTS_DIR}`);
    process.exit(1);
  }

  const files = (await readdir(DIGESTS_DIR)).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) {
    console.error(`[Error] 目录中无 JSON 数据文件，请先执行 npm run generate`);
    process.exit(1);
  }

  const digests = [];
  for (const f of files) {
    const raw = await readFile(join(DIGESTS_DIR, f), 'utf-8');
    try {
      digests.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`[Warn] 解析 JSON 失败: ${f}`);
    }
  }

  const allDates = digests.map(d => d.date);
  const latestDigest = digests[0];

  // 3. 准备输出目录
  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(join(PUBLIC_DIR, 'archive'), { recursive: true });
  await mkdir(ASSETS_DEST, { recursive: true });

  // 拷贝 assets
  if (existsSync(ASSETS_SRC)) {
    await cp(ASSETS_SRC, ASSETS_DEST, { recursive: true });
    console.log(`- 静态资源已同步至 public/assets/`);
  }

  // 4. 生成每一期的专属静态页面 public/archive/YYYY-MM-DD.html
  for (const d of digests) {
    const pageHtml = renderPage({
      title: settings.siteTitle,
      digest: d,
      allDates,
      isArchive: true,
      relativeRoot: '../'
    });
    const destPath = join(PUBLIC_DIR, 'archive', `${d.date}.html`);
    await writeFile(destPath, pageHtml, 'utf-8');
  }
  console.log(`- 已生成 ${digests.length} 个历史归档静态页面至 public/archive/`);

  // 5. 生成首页 public/index.html (展示最新一期)
  const indexHtml = renderPage({
    title: settings.siteTitle,
    digest: latestDigest,
    allDates,
    isArchive: false,
    relativeRoot: './'
  });
  await writeFile(join(PUBLIC_DIR, 'index.html'), indexHtml, 'utf-8');
  console.log(`- 最新日报首页已生成: public/index.html (${latestDigest.date})`);

  // 6. 生成归档索引页 public/archive/index.html
  const archiveIndexHtml = renderArchiveIndexPage({
    title: settings.siteTitle,
    digests,
    relativeRoot: '../'
  });
  await writeFile(join(PUBLIC_DIR, 'archive', 'index.html'), archiveIndexHtml, 'utf-8');
  console.log(`- 归档时间线导航已生成: public/archive/index.html`);

  console.log(`\n========================================`);
  console.log(`[完成] 静态网站编译完成！`);
  console.log(`- 输出目录: ${PUBLIC_DIR}`);
  console.log(`- 可运行 npm run preview 在浏览器中预览网站。`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[Error] 网站生成异常:', err);
  process.exit(1);
});
