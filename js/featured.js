(() => {
  const frame = document.getElementById('featured-frame');
  const viewport = document.getElementById('featured-viewport');
  const stage = document.getElementById('featured-stage');
  const next = document.getElementById('featured-next');
  const vote = document.getElementById('featured-vote');
  let work, entries = [], naturalHeight = 800, request = 0, resizeTimer, lastWidth = -1, exhibitionId;
  function fit() {
    if (!work) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 4);
    const width = Math.max(280, availableWidth, work.displayMinWidth || 0);
    const scale = Math.min(1, availableWidth / width);
    frame.style.width = width + 'px'; frame.style.height = naturalHeight + 'px'; frame.style.transform = `scale(${scale})`;
    stage.style.width = width * scale + 'px'; stage.style.height = naturalHeight * scale + 'px';
  }
  function measure() {
    if (!work) return;
    fit(); frame.contentWindow.postMessage({ type: 'gallery-measure', request: 'featured-' + ++request }, '*');
  }
  function change() {
    const pool = entries.filter(entry => entry.id !== work?.id);
    if (!pool.length) return;
    work = pool[Math.floor(Math.random() * pool.length)];
    request++; delete frame.dataset.measured; naturalHeight = Math.max(540, Math.min(1000, window.innerHeight));
    document.getElementById('featured-label').textContent = `${work.className} · ${work.title} · ${work.tag || '其他'}`;
    vote.disabled = false;
    document.getElementById('featured-status').textContent = '';
    frame.title = work.title + '，隨機遊玩'; frame.src = work.url;
    frame.dataset.workId = work.id; fit(); viewport.scrollTop = 0;
    next.disabled = entries.length < 2;
  }
  window.FeaturedGallery = {
    refreshSize: measure,
    update(category) {
      if (exhibitionId !== category.id) { work = null; exhibitionId = category.id; }
      entries = category.classes.flatMap(group => group.works.filter(entry => entry.thumbnailStatus !== 'skipped-conversation').map(entry => ({ ...entry, className: group.name })));
      if (!entries.length) {
        work = null; frame.src = 'about:blank'; next.disabled = true; vote.disabled = true;
        document.getElementById('featured-label').textContent = '等待作品上架';
        document.getElementById('featured-status').textContent = '作品上架後，這裡就能隨機遊玩。'; return;
      }
      if (!work || !entries.some(entry => entry.id === work.id)) change();
      next.disabled = entries.length < 2;
    }
  };
  next.addEventListener('click', change);
  vote.addEventListener('click', () => { if (work) window.dispatchEvent(new CustomEvent('featured-vote', { detail: { id: work.id } })); });
  frame.addEventListener('load', measure);
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'gallery-size' || event.data.request !== 'featured-' + request || !Number.isFinite(event.data.height)) return;
    naturalHeight = Math.max(540, Math.min(6000, event.data.height)); frame.dataset.measured = String(request); fit();
  });
  new ResizeObserver(() => {
    if (viewport.clientWidth === lastWidth) return;
    lastWidth = viewport.clientWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      naturalHeight = Math.max(540, Math.min(1000, window.innerHeight));
      measure();
    }, 150);
  }).observe(viewport);
})();
