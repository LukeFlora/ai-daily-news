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

  // 2. 复制精要按钮 (格式化海报级文案输出)
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.news-item');
      if (!card) return;
      const title = card.querySelector('.item-title')?.textContent?.trim() || '';
      const brief = card.querySelector('.item-brief')?.textContent?.trim() || '';
      const summary = card.querySelector('.item-summary')?.textContent?.trim() || '';
      const author = card.querySelector('.item-author strong')?.textContent?.trim() || '';
      const source = card.querySelector('.source-link')?.href || '';

      let textToCopy = `📰 《Luke的一手消息》精编\n【${title}】`;
      if (author) textToCopy += `\n👤 观点作者：${author}`;
      if (brief) textToCopy += `\n💡 核心提要：${brief}`;
      textToCopy += `\n📌 深入解读：${summary}\n🔗 一手信源：${source}`;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.textContent;
        btn.textContent = '✓ 已复制精编';
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

  // 7. PWA 极速离线阅读与主屏幕支持 (Phase 3 体验升级)
  initPWA();

  // 8. 单条要闻视觉海报生成与分享 (Phase 4 体验升级)
  initPosterShare();
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

// 7. PWA 极速离线阅读与主屏幕支持 (Phase 3 体验升级)
function initPWA() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      const swPath = `${window.RELATIVE_ROOT || './'}sw.js`;
      navigator.serviceWorker.register(swPath).then((reg) => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] 《Luke的一手消息》新一期缓存更新就绪。');
              }
            };
          }
        };
      }).catch((err) => {
        console.warn('[PWA] Service Worker 激活受限:', err);
      });
    });
  }
}

// 8. 单条要闻视觉卡片海报生成器 (Phase 4 体验升级 - 纯原生 Canvas 绘制，0 外部依赖)
function initPosterShare() {
  const modalBackdrop = document.getElementById('poster-modal-backdrop');
  const closeBtn = document.getElementById('close-poster-modal');
  const previewImg = document.getElementById('poster-preview-img');
  const downloadBtn = document.getElementById('poster-download-btn');
  const copyBtn = document.getElementById('poster-copy-btn');
  const canvas = document.getElementById('poster-canvas') || document.createElement('canvas');

  if (!modalBackdrop || !previewImg) return;

  function closeModal() {
    modalBackdrop.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  closeBtn?.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop.style.display === 'flex') {
      closeModal();
    }
  });

  // 工具函数：文本自动折行计算与绘制
  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      if (!para) {
        lines.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const testLine = currentLine + para[i];
        if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = para[i];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  }

  // 绘制圆角矩形
  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  document.querySelectorAll('.share-poster-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.news-item');
      if (!card) return;

      const title = card.querySelector('.item-title')?.textContent?.trim() || '';
      const category = card.querySelector('.item-category')?.textContent?.trim() || '前沿快讯';
      const author = card.querySelector('.item-author strong')?.textContent?.trim() || '';
      const authorRole = card.querySelector('.item-author span')?.textContent?.trim() || '';
      const brief = card.querySelector('.item-brief')?.textContent?.trim() || '';
      const summary = card.querySelector('.item-summary')?.textContent?.trim() || '';
      const pageDate = document.querySelector('.meta-pill.highlight')?.textContent?.trim() || '每日早报';

      // 画布尺寸基准 (宽 750px 高清视网膜规范)
      const width = 750;
      const padding = 52;
      const contentWidth = width - padding * 2;
      const ctx = canvas.getContext('2d');

      // 1. 预计算内容排版高度
      ctx.font = 'bold 32px "Mulish", "PingFang SC", sans-serif';
      const titleLines = wrapLines(ctx, title, contentWidth);
      const titleHeight = titleLines.length * 46;

      ctx.font = '21px "Inter", "PingFang SC", sans-serif';
      const briefLines = brief ? wrapLines(ctx, brief, contentWidth - 44) : [];
      const briefHeight = brief ? (briefLines.length * 34 + 32) : 0;

      ctx.font = '20px "Inter", "PingFang SC", sans-serif';
      const summaryLines = wrapLines(ctx, summary, contentWidth);
      const summaryHeight = summaryLines.length * 34;

      // 总高度计算
      const headerHeight = 110;
      const catBadgeHeight = 44;
      const authorHeight = author ? 40 : 0;
      const footerHeight = 110;
      const totalHeight = padding + headerHeight + catBadgeHeight + titleHeight + (authorHeight ? authorHeight + 16 : 0) + (briefHeight ? briefHeight + 20 : 0) + 24 + summaryHeight + 40 + footerHeight + padding;

      canvas.width = width;
      canvas.height = totalHeight;

      // 2. 绘制深渊背景与 RedSun 光晕
      const bgGradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
      bgGradient.addColorStop(0, '#0c111e');
      bgGradient.addColorStop(1, '#05070c');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, totalHeight);

      // 右上角太阳耀斑环境光晕
      const flareGlow = ctx.createRadialGradient(width - 80, 100, 10, width - 80, 100, 320);
      flareGlow.addColorStop(0, 'rgba(246, 111, 20, 0.28)');
      flareGlow.addColorStop(0.5, 'rgba(246, 111, 20, 0.08)');
      flareGlow.addColorStop(1, 'rgba(6, 9, 16, 0)');
      ctx.fillStyle = flareGlow;
      ctx.fillRect(0, 0, width, totalHeight);

      // 卡片高雅细边框
      ctx.strokeStyle = 'rgba(247, 114, 24, 0.3)';
      ctx.lineWidth = 2;
      roundRect(ctx, 16, 16, width - 32, totalHeight - 32, 24, false, true);

      let currentY = padding + 20;

      // 3. 报头区域 (Brand Header)
      // 品牌胶囊
      ctx.fillStyle = 'rgba(246, 111, 20, 0.15)';
      ctx.strokeStyle = 'rgba(246, 111, 20, 0.4)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, padding, currentY, 215, 36, 18, true, true);
      ctx.font = 'bold 16px "Mulish", sans-serif';
      ctx.fillStyle = '#ffad75';
      ctx.fillText('✦ Luke的一手消息 ✦', padding + 18, currentY + 24);

      // 日期指示
      ctx.font = '16px "Inter", sans-serif';
      ctx.fillStyle = '#828c9e';
      ctx.textAlign = 'right';
      ctx.fillText(pageDate, width - padding, currentY + 24);
      ctx.textAlign = 'left';

      currentY += 56;

      // 分割细线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, currentY);
      ctx.lineTo(width - padding, currentY);
      ctx.stroke();

      currentY += 36;

      // 4. 分类标签胶囊
      ctx.fillStyle = 'rgba(246, 111, 20, 0.2)';
      ctx.strokeStyle = '#f66f14';
      ctx.lineWidth = 1.5;
      ctx.font = 'bold 16px "Inter", sans-serif';
      const catWidth = ctx.measureText(category).width + 32;
      roundRect(ctx, padding, currentY, catWidth, 34, 17, true, true);
      ctx.fillStyle = '#f66f14';
      ctx.fillText(category, padding + 16, currentY + 23);

      currentY += 54;

      // 5. 标题绘制
      ctx.font = 'bold 32px "Mulish", "PingFang SC", sans-serif';
      ctx.fillStyle = '#ffffff';
      for (const line of titleLines) {
        ctx.fillText(line, padding, currentY);
        currentY += 46;
      }

      currentY += 6;

      // 6. 作者信息 (如果存在)
      if (author) {
        ctx.font = 'bold 18px "Inter", "PingFang SC", sans-serif';
        ctx.fillStyle = '#ffad75';
        ctx.fillText(`👤 ${author} ${authorRole}`, padding, currentY);
        currentY += 36;
      }

      // 7. 观点提要引言块 (如果存在)
      if (brief) {
        currentY += 10;
        ctx.fillStyle = 'rgba(246, 111, 20, 0.08)';
        ctx.strokeStyle = 'rgba(247, 114, 24, 0.2)';
        ctx.lineWidth = 1;
        roundRect(ctx, padding, currentY, contentWidth, briefHeight, 12, true, true);

        // 左侧品牌橙条
        ctx.fillStyle = '#f66f14';
        roundRect(ctx, padding, currentY, 4, briefHeight, 2, true, false);

        ctx.font = '20px "Inter", "PingFang SC", sans-serif';
        ctx.fillStyle = '#cac4da';
        let bY = currentY + 30;
        for (const line of briefLines) {
          ctx.fillText(line, padding + 22, bY);
          bY += 34;
        }
        currentY += briefHeight + 20;
      }

      // 8. 详细解读正文
      currentY += 12;
      ctx.font = '20px "Inter", "PingFang SC", sans-serif';
      ctx.fillStyle = '#d0d5e2';
      for (const line of summaryLines) {
        ctx.fillText(line, padding, currentY);
        currentY += 34;
      }

      // 9. 底部签名栏
      const footY = totalHeight - padding - 36;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, footY);
      ctx.lineTo(width - padding, footY);
      ctx.stroke();

      ctx.font = '16px "Inter", sans-serif';
      ctx.fillStyle = '#828c9e';
      ctx.fillText('⚡ 追踪前沿突破 · 真实一手信源', padding, footY + 30);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffad75';
      ctx.fillText('lukeflora.github.io/ai-daily-news ↗', width - padding, footY + 30);
      ctx.textAlign = 'left';

      // 10. 导出并呈现在预览弹窗中
      const dataUrl = canvas.toDataURL('image/png');
      previewImg.src = dataUrl;
      if (downloadBtn) {
        downloadBtn.href = dataUrl;
        downloadBtn.download = `luke-news-poster-${Date.now()}.png`;
      }

      // 复制到剪贴板
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            canvas.toBlob(async (blob) => {
              if (!blob) return;
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                const orig = copyBtn.textContent;
                copyBtn.textContent = '✓ 已复制海报图片';
                setTimeout(() => { copyBtn.textContent = orig; }, 2000);
              } else {
                window.open(dataUrl, '_blank');
              }
            }, 'image/png');
          } catch (err) {
            console.error('复制图片异常:', err);
            window.open(dataUrl, '_blank');
          }
        };
      }

      modalBackdrop.style.display = 'flex';
      document.body.classList.add('modal-open');
    });
  });
}



