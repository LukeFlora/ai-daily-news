// AI 日报前端渲染脚本 (原生 JavaScript，零第三方库)

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function init() {
  try {
    // 并行获取主题配置和日报数据
    const [themeRes, dataRes] = await Promise.all([
      fetch('theme.json').then(r => r.ok ? r.json() : {}),
      fetch('data.json').then(r => r.ok ? r.json() : { items: [] })
    ]);

    applyTheme(themeRes);
    renderContent(dataRes);
  } catch (err) {
    console.error('加载日报失败:', err);
    const grid = document.getElementById('content-grid');
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: #888;">日报数据加载中，请稍后刷新重试...</div>`;
    }
  }
}

function applyTheme(theme) {
  if (!theme) return;

  const root = document.documentElement;

  // 1. 报头文本自定义
  if (theme.newspaperName) {
    const titleEl = document.getElementById('newspaper-name');
    if (titleEl) titleEl.textContent = theme.newspaperName;
    document.title = `${theme.newspaperName} - 今日精选`;
  }
  if (theme.issueNumber) {
    const issueEl = document.getElementById('issue-number');
    if (issueEl) issueEl.textContent = theme.issueNumber;
  }
  if (theme.motto) {
    const mottoEl = document.getElementById('paper-motto');
    if (mottoEl) mottoEl.textContent = theme.motto;
  }

  // 2. 配色变量
  if (theme.backgroundColor) {
    root.style.setProperty('--bg-color', theme.backgroundColor);
  }
  if (theme.textColor) {
    root.style.setProperty('--text-color', theme.textColor);
  }
  if (theme.accentColor) {
    root.style.setProperty('--accent-color', theme.accentColor);
  }

  // 3. 字体风格
  if (theme.fontStyle === 'sans') {
    root.style.setProperty('--serif-font', 'var(--sans-font)');
  }

  // 4. 排版密度
  if (theme.density === 'compact') {
    root.style.setProperty('--grid-gap', '1.25rem');
  } else if (theme.density === 'relaxed') {
    root.style.setProperty('--grid-gap', '2.5rem');
  }
}

function renderContent(data) {
  // 更新日期
  if (data.date) {
    const dateEl = document.getElementById('paper-date');
    if (dateEl) dateEl.textContent = data.date;
  }

  const grid = document.getElementById('content-grid');
  if (!grid) return;

  const items = data.items || [];
  if (items.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: #888;">今日暂无最新资讯。</div>`;
    return;
  }

  // 按照 data.json 顺序依次生成新闻模块，优先级类名控制网格跨列
  const html = items.map(item => {
    const priorityClass = item.priority ? `priority-${item.priority}` : 'priority-normal';
    const sourceHtml = item.sourceUrl
      ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceName || '查看原文')} ↗</a>`
      : `<span>${escapeHtml(item.sourceName || '一手信源')}</span>`;

    return `
      <article class="news-item ${priorityClass}" id="${escapeHtml(item.id || '')}">
        <div class="item-category">${escapeHtml(item.category || '资讯')}</div>
        <h2 class="item-title">${escapeHtml(item.title || '')}</h2>
        ${item.brief ? `<p class="item-brief">${escapeHtml(item.brief)}</p>` : ''}
        ${item.summary ? `<p class="item-summary">${escapeHtml(item.summary)}</p>` : ''}
        <footer class="item-footer">
          <span class="item-source">信源：${sourceHtml}</span>
        </footer>
      </article>
    `;
  }).join('');

  grid.innerHTML = html;
}

// 页面加载完成立即初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
