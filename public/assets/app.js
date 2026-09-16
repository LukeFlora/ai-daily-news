// Luke的一手消息 · 报刊轻量交互与日历查阅脚本 (纯原生 JavaScript)

document.addEventListener('DOMContentLoaded', () => {
  // 1. 折叠/展开全文译文
  document.querySelectorAll('.expand-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (!content) return;
      const isOpen = content.classList.contains('active');
      if (isOpen) {
        content.classList.remove('active');
        btn.textContent = '▼ 展开深度译文与细节';
      } else {
        content.classList.add('active');
        btn.textContent = '▲ 收起深度译文';
      }
    });
  });

  // 2. 复制精要按钮
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.news-item');
      if (!card) return;
      const title = card.querySelector('.item-title')?.textContent?.trim() || '';
      const summary = card.querySelector('.item-summary')?.textContent?.trim() || '';
      const source = card.querySelector('.source-link')?.href || '';

      const textToCopy = `【${title}】\n${summary}\n信源：${source}`;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.textContent;
        btn.textContent = '✓ 已复制';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1800);
      } catch (err) {
        console.error('复制失败:', err);
      }
    });
  });

  // 3. 交互式复古日历查阅功能
  initCalendarWidget();

  // 4. 一键换肤功能 (亮色 / 暗黑模式)
  initThemeToggle();

  // 5. 关键词即时搜索与分类筛选协同联动 (Phase 2 体验升级)
  initSearchAndFilter();

  // 6. 返回顶部悬浮微按键 (Phase 2 体验升级)
  initBackToTop();
});

function initCalendarWidget() {
  const availableDates = window.AVAILABLE_DATES || [];
  const currentDate = window.CURRENT_DATE || (availableDates[0] || new Date().toISOString().slice(0, 10));
  const relativeRoot = window.RELATIVE_ROOT || './';

  // 解析初始展示年份与月份 (默认以当前页面日报的日期为准)
  const parts = currentDate.split('-').map(Number);
  let viewYear = parts[0] || new Date().getFullYear();
  let viewMonth = (parts[1] ? parts[1] - 1 : new Date().getMonth());

  // 构建日期到 URL 的映射
  const dateMap = {};
  availableDates.forEach((d, idx) => {
    // 第一条为最新一期 (index.html)，其余为归档页
    const isLatest = (idx === 0);
    dateMap[d] = isLatest ? `${relativeRoot}index.html` : `${relativeRoot}archive/${d}.html`;
  });

  function renderCalendarGrid(container) {
    if (!container) return;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDay.getDate();

    // 周一作为每周第一天 (0:周日 -> 6; 1:周一 -> 0)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    // 上个月最后一天
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

    // 填补上个月末尾的灰色日期
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      html += `<div class="cal-cell cal-other-month">${dNum}</div>`;
    }

    // 渲染当月每一天
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const fullDate = `${viewYear}-${mStr}-${dStr}`;

      const hasNews = !!dateMap[fullDate];
      const isCurrent = (fullDate === currentDate);

      const classes = ['cal-cell'];
      let attr = '';

      if (hasNews) {
        classes.push('cal-has-news');
        attr = `data-url="${dateMap[fullDate]}" title="${fullDate}：点击查阅该日《Luke的一手消息》"`;
      }
      if (isCurrent) {
        classes.push('cal-current-active');
      }

      html += `
        <div class="${classes.join(' ')}" ${attr}>
          <span class="cal-day-num">${d}</span>
          ${hasNews ? '<span class="cal-news-dot">📰</span>' : ''}
        </div>
      `;
    }

    // 补齐下月开头的灰色日期
    const filledCells = startDayOfWeek + totalDays;
    const tailCells = (7 - (filledCells % 7)) % 7;
    for (let d = 1; d <= tailCells; d++) {
      html += `<div class="cal-cell cal-other-month">${d}</div>`;
    }

    html += `
        </div>
        <div class="cal-legend">
          <span class="legend-item"><span class="legend-badge">📰</span> 有报纸出刊 (可点击查阅)</span>
          <span class="legend-item"><span class="legend-badge active"></span> 当前阅读日期</span>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // 绑定月份切换事件
    container.querySelector('.btn-prev')?.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderCalendarGrid(container);
    });

    container.querySelector('.btn-next')?.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderCalendarGrid(container);
    });

    // 绑定有报纸的日期点击跳转
    container.querySelectorAll('.cal-has-news').forEach(cell => {
      cell.addEventListener('click', () => {
        const target = cell.getAttribute('data-url');
        if (target) {
          window.location.href = target;
        }
      });
    });
  }

  // 1) 弹窗日历交互
  const modalBackdrop = document.getElementById('calendar-modal-backdrop');
  const modalContainer = document.getElementById('modal-calendar-container');
  const openBtn = document.getElementById('open-calendar-btn');
  const closeBtn = document.getElementById('close-calendar-modal');

  if (openBtn && modalBackdrop && modalContainer) {
    function openModal() {
      renderCalendarGrid(modalContainer);
      modalBackdrop.classList.add('open');
      document.body.classList.add('modal-open');
    }

    function closeModal() {
      modalBackdrop.classList.remove('open');
      document.body.classList.remove('modal-open');
    }

    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });

    closeBtn?.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });

    // 支持 ESC 键关闭日历
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) {
        closeModal();
      }
    });
  }

  // 2) 归档页面的内嵌日历展示
  const inlineContainer = document.getElementById('inline-calendar-container');
  if (inlineContainer) {
    renderCalendarGrid(inlineContainer);
  }
}

// 4. 一键换肤功能 (亮色 / 暗黑双模即时切换与持久化)
function initThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (!toggleBtn) return;

  const iconEl = toggleBtn.querySelector('.theme-icon');
  const textEl = toggleBtn.querySelector('.theme-text');

  function updateButtonUI(theme) {
    if (theme === 'light') {
      if (iconEl) iconEl.textContent = '🌙';
      if (textEl) textEl.textContent = '暗黑模式';
      toggleBtn.setAttribute('title', '点击切换为暗黑模式');
      toggleBtn.setAttribute('aria-label', '当前为亮色模式，点击切换为暗黑模式');
    } else {
      if (iconEl) iconEl.textContent = '☀️';
      if (textEl) textEl.textContent = '亮色模式';
      toggleBtn.setAttribute('title', '点击切换为亮色模式');
      toggleBtn.setAttribute('aria-label', '当前为暗黑模式，点击切换为亮色模式');
    }
  }

  // 初始化根据当前 html 标签上的 data-theme 更新按钮状态
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateButtonUI(activeTheme);

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('luke_news_theme', nextTheme);
    } catch (err) {
      console.warn('无法持久化主题偏好:', err);
    }

    updateButtonUI(nextTheme);
  });
}

// 5. 关键词即时搜索与分类筛选协同联动 (Phase 2 体验升级)
function initSearchAndFilter() {
  const filterBar = document.getElementById('category-filter-bar');
  const searchInput = document.getElementById('news-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const statusHint = document.getElementById('search-status-hint');
  const emptyNotice = document.getElementById('empty-category-notice');
  const emptyResetBtn = document.getElementById('empty-reset-btn');
  const items = document.querySelectorAll('.news-item');

  // 若当前页面没有要闻卡片（如纯归档总览页），直接退出
  if (items.length === 0) return;

  let activeCategory = 'all';
  let activeQuery = '';

  const pills = filterBar ? filterBar.querySelectorAll('.filter-pill') : [];

  function filterCards() {
    const query = activeQuery.trim().toLowerCase();
    const queryWords = query ? query.split(/\s+/).filter(Boolean) : [];
    let matchCount = 0;

    items.forEach(card => {
      const itemCat = card.getAttribute('data-category');
      const catMatches = (activeCategory === 'all' || itemCat === activeCategory);

      let searchMatches = true;
      if (queryWords.length > 0) {
        // 全文快速检索：包含标题、简述、详细总结、作者与分类
        const textContent = (card.textContent || '').toLowerCase();
        searchMatches = queryWords.every(word => textContent.includes(word));
      }

      if (catMatches && searchMatches) {
        const wasHidden = (card.style.display === 'none');
        card.style.display = '';
        if (wasHidden) {
          card.classList.remove('animate-fade-in');
          void card.offsetWidth; // 触发 reflow 重置动画
          card.classList.add('animate-fade-in');
        }
        matchCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // 搜索状态与提示文案
    if (statusHint) {
      if (query) {
        statusHint.textContent = `⚡ 关键词 “${query}” · 共匹配到 ${matchCount} 条相关要闻`;
        statusHint.style.display = 'block';
      } else {
        statusHint.textContent = '';
        statusHint.style.display = 'none';
      }
    }

    // 清除按钮状态
    if (clearBtn) {
      clearBtn.style.display = query ? 'inline-flex' : 'none';
    }

    // 无匹配结果空状态
    if (emptyNotice) {
      emptyNotice.style.display = (matchCount === 0) ? 'block' : 'none';
    }
  }

  // 1) 分类胶囊点击事件
  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      activeCategory = pill.getAttribute('data-category') || 'all';

      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      filterCards();
    });
  });

  // 2) 搜索输入监听
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeQuery = searchInput.value || '';
      filterCards();
    });

    // 清除按钮点击
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        activeQuery = '';
        filterCards();
        searchInput.focus();
      });
    }

    // 键盘全局快捷键：按 '/' 聚焦搜索，在输入框中按 'Escape' 清空或失焦
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName;
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);

      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape' && document.activeElement === searchInput) {
        if (searchInput.value) {
          searchInput.value = '';
          activeQuery = '';
          filterCards();
        } else {
          searchInput.blur();
        }
      }
    });
  }

  // 3) 空状态重置按钮
  if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      activeCategory = 'all';
      pills.forEach(p => {
        if (p.getAttribute('data-category') === 'all') {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });

      if (searchInput) {
        searchInput.value = '';
        activeQuery = '';
      }
      filterCards();
    });
  }
}

// 6. 返回顶部悬浮微按键 (Back to Top)
function initBackToTop() {
  const bttBtn = document.getElementById('back-to-top-btn');
  if (!bttBtn) return;

  let isTicking = false;

  function updateVisibility() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollY > 380) {
      bttBtn.classList.add('visible');
    } else {
      bttBtn.classList.remove('visible');
    }
    isTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!isTicking) {
      window.requestAnimationFrame(updateVisibility);
      isTicking = true;
    }
  }, { passive: true });

  bttBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}


