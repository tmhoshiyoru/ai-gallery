(() => {
  'use strict';
  let timer;
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    let success = false;
    try { await navigator.clipboard.writeText(text); success = true; }
    catch {
      const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; area.setAttribute('aria-label', '待複製的提示詞'); document.body.append(area); area.select();
      try { success = document.execCommand('copy'); } catch {}
      area.remove(); button.focus();
    }
    const feedback = document.getElementById('task-feedback');
    feedback.textContent = success ? '已複製！可以貼到Gemini Canvas。' : '請選取提示詞後按Ctrl+C（Mac：⌘C）複製。';
    clearTimeout(timer); timer = setTimeout(() => { feedback.textContent = ''; }, 4500);
  }));
})();
