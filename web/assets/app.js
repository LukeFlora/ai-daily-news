// Luke的一手消息 · 报刊轻量交互脚本 (纯原生 JavaScript)

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
});
