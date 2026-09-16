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

// 交互式日历组件
function initCalendarWidget() {
  const currentDate = new Date().toISOString().slice(0, 10);
  const parts = currentDate.split('-').map(Number);
  let viewYear = parts[0];
  let viewMonth = parts[1] - 1;

  function renderCalendar(container) {
    if (!container) return;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    let html = `
      <div class="vintage-calendar-box">
        <div class="calendar-ctrl-header">
          <button class="cal-nav-btn btn-prev" type="button" title="上一月">◀ 上月</button>
          <div class="cal-month-title">${viewYear} 年 ${viewMonth + 1} 月</div>
          <button class="cal-nav-btn btn-next" type="button" title="下一月">下月 ▶</button>
        </div>

        <div class="cal-weekdays">
          <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
        </div>

        <div class="cal-days-grid">
    `;

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      html += `<div class="cal-cell cal-other-month">${prevMonthDays - i}</div>`;
    }

    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const fullDate = `${viewYear}-${mStr}-${dStr}`;
      const isToday = (fullDate === currentDate);

      // 本地单日演示，高亮今日出刊
      const hasNews = isToday;

      html += `
        <div class="cal-cell ${hasNews ? 'cal-has-news' : ''} ${isToday ? 'cal-current-active' : ''}">
          <span class="cal-day-num">${d}</span>
          ${hasNews ? '<span class="cal-news-dot">📰</span>' : ''}
        </div>
      `;
    }

    const filledCells = startDayOfWeek + totalDays;
    const tailCells = (7 - (filledCells % 7)) % 7;
    for (let d = 1; d <= tailCells; d++) {
      html += `<div class="cal-cell cal-other-month">${d}</div>`;
    }

    html += `
        </div>
        <div class="cal-legend">
          <span class="legend-item"><span class="legend-badge">📰</span> 有报纸出刊</span>
          <span class="legend-item"><span class="legend-badge active"></span> 当前阅读日期</span>
        </div>
      </div>
    `;

    container.innerHTML = html;

    container.querySelector('.btn-prev')?.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderCalendar(container);
    });

    container.querySelector('.btn-next')?.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderCalendar(container);
    });
  }

  const modalBackdrop = document.getElementById('calendar-modal-backdrop');
  const modalContainer = document.getElementById('modal-calendar-container');
  const openBtn = document.getElementById('open-calendar-btn');
  const closeBtn = document.getElementById('close-calendar-modal');

  if (openBtn && modalBackdrop && modalContainer) {
    openBtn.addEventListener('click', () => {
      renderCalendar(modalContainer);
      modalBackdrop.classList.add('open');
    });

    closeBtn?.addEventListener('click', () => {
      modalBackdrop.classList.remove('open');
    });

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) {
        modalBackdrop.classList.remove('open');
      }
    });
  }
}

// 页面加载完成立即初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initCalendarWidget();
  });
} else {
  init();
  initCalendarWidget();
}
