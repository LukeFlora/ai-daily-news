/**
 * app.js - 客户端交互控制
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 主题切换与持久化
  const themeToggle = document.getElementById('theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
  
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    if (!themeToggle) return;
    themeToggle.innerHTML = theme === 'dark' ? '☀️ 浅色' : '🌙 深色';
  }

  // 2. 分类 Tab 切换过滤
  const tabs = document.querySelectorAll('.tab-btn');
  const cards = document.querySelectorAll('.item-card');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');
      filterCards(filter, getSearchQuery());
    });
  });

  // 3. 搜索框实时筛选
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const activeTab = document.querySelector('.tab-btn.active');
      const filter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
      filterCards(filter, searchInput.value.trim().toLowerCase());
    });
  }

  function getSearchQuery() {
    return searchInput ? searchInput.value.trim().toLowerCase() : '';
  }

  function filterCards(category, query) {
    cards.forEach(card => {
      const cardType = card.getAttribute('data-type');
      const cardText = card.textContent.toLowerCase();

      const matchCategory = category === 'all' || cardType === category;
      const matchQuery = !query || cardText.includes(query);

      if (matchCategory && matchQuery) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // 4. 全文翻译展开/折叠
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.translation-toggle');
    if (toggleBtn) {
      const box = toggleBtn.closest('.translation-box');
      if (box) {
        box.classList.toggle('open');
        const arrow = toggleBtn.querySelector('.arrow');
        if (arrow) {
          arrow.textContent = box.classList.contains('open') ? '▲ 收起' : '▼ 展开全文翻译';
        }
      }
    }
  });

  // 5. 复制卡片内容
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.btn-copy');
    if (copyBtn) {
      const card = copyBtn.closest('.item-card');
      if (!card) return;

      const title = card.querySelector('.author-name')?.textContent || '';
      const summary = card.querySelector('.summary-box')?.textContent || '';
      const rec = card.querySelector('.recommend-box')?.textContent || '';
      const url = card.querySelector('.source-link')?.href || '';

      const textToCopy = `【${title}】\n1) 中文总结：${summary}\n2) 推荐理由：${rec}\n3) 原文链接：${url}`;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ 已复制';
        setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
      } catch (err) {
        alert('复制失败，请手动选择复制');
      }
    }
  });
});
