const $ = (id) => document.getElementById(id);
let data, activeClass = '一儉', currentWork, activeExhibitionId = null;
let browserStorage;
try { browserStorage = localStorage; } catch {}
const voteStore = GalleryVoteStore.create(browserStorage);
function currentCategory() { return data?.categories.find(category => category.id === activeExhibitionId); }
const selectedTags = new Set();
const displayOrders = new Map();
let renderedClass = null;
const viewer = $('viewer'), frame = $('work-frame');
$('vote-mode').disabled = true;
let fitWork = true, naturalHeight = 960, baseHeight = 960, sizingRequest = 0, sizingTimer;
function fitCurrentWork() {
  if (!viewer.open) return;
  const area = document.querySelector('.work-scroll');
  const availableWidth = Math.max(1, area.clientWidth - 4);
  const width = Math.max(280, availableWidth, currentWork?.displayMinWidth || 0);
  const scale = fitWork ? Math.min(availableWidth / width, Math.max(0.4, Math.min(1, (area.clientHeight - 4) / naturalHeight))) : 1;
  frame.style.width = width + 'px'; frame.style.height = naturalHeight + 'px';
  frame.style.transform = `scale(${scale})`;
  const stage = document.querySelector('.work-stage');
  stage.style.width = width * scale + 'px'; stage.style.height = naturalHeight * scale + 'px';
  $('fit-work').textContent = fitWork ? `原尺寸（目前 ${Math.round(scale * 100)}%）` : '符合視窗';
  $('fit-work').setAttribute('aria-pressed', String(fitWork));
}
function measureCurrentWork() {
  if (!viewer.open || frame.src === 'about:blank') return;
  if (naturalHeight <= baseHeight + 4) {
    baseHeight = Math.max(540, document.querySelector('.work-scroll').clientHeight - 4);
    naturalHeight = baseHeight;
  }
  delete frame.dataset.measured; fitCurrentWork();
  frame.contentWindow.postMessage({ type: 'gallery-measure', request: ++sizingRequest }, '*');
}
frame.addEventListener('load', measureCurrentWork);
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.type !== 'gallery-size' || event.data.request !== sizingRequest || !Number.isFinite(event.data.height)) return;
  naturalHeight = Math.max(baseHeight, Math.min(6000, event.data.height)); frame.dataset.measured = String(sizingRequest); fitCurrentWork();
});
new ResizeObserver(() => { clearTimeout(sizingTimer); sizingTimer = setTimeout(measureCurrentWork, 150); }).observe(document.querySelector('.work-scroll'));
$('fit-work').addEventListener('click', () => { fitWork = !fitWork; fitCurrentWork(); });
let voting = false, voterClass = '', selected = new Set(), savedCode = '', storageReady = true, pendingFeaturedVote = null;
function saveVotes(invalidateCode = true) {
  if (invalidateCode) savedCode = '';
  const category = currentCategory();
  if (category) storageReady = voteStore.save(category, { voterClass, selected: [...selected], enabled: voting, activeClass, savedCode, fingerprint: category.ballot.fingerprint });
}
function activateExhibition(id, saveCurrent = true) {
  if (saveCurrent && currentCategory()) saveVotes(false);
  const category = data.categories.find(category => category.id === id && category.visible !== false);
  if (!category) return;
  if (viewer.open) viewer.close();
  pendingFeaturedVote = null;
  for (const id of ['voter-dialog', 'code-dialog', 'browse-class-dialog']) if ($(id).open) $(id).close();
  activeExhibitionId = id; $('category').value = id;
  const state = voteStore.load(category);
  voterClass = state.voterClass; voting = state.enabled; selected = new Set(state.selected);
  activeClass = state.activeClass; savedCode = state.savedCode; storageReady = state.storageReady;
  selectedTags.clear(); renderedClass = null; currentWork = null;
  $('exhibition-title').textContent = category.name;
  document.title = 'AI 創作放映室｜' + category.name;
  render(); FeaturedGallery.update(category);
}
function voteLabel(work) { return selected.has(work.id) ? '✓ 已投票' : '投給這件作品'; }
function currentGroup() {
  return currentCategory().classes.find(group => group.name === activeClass);
}
function visibleWorks() {
  const group = currentGroup();
  const works = displayOrders.get($('category').value + '/' + group.name) || group.works;
  return works.filter(work => selectedTags.size === 0 || selectedTags.has(work.tag || '其他'));
}
function shuffleDisplayOrders() {
  displayOrders.clear();
  for (const category of data.categories) for (const group of category.classes) {
    const works = [...group.works];
    for (let index = works.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [works[index], works[target]] = [works[target], works[index]];
    }
    displayOrders.set(category.id + '/' + group.name, works);
  }
}
function openWork(work) {
  sizingRequest++;
  currentWork = work;
  $('viewer-title').textContent = work.title;
  $('viewer-class').textContent = activeClass + ' · ' + currentCategory().name + ' · ' + (work.tag || '其他');
  frame.title = work.title; frame.src = work.url;
  if (!viewer.open) viewer.showModal();
  baseHeight = Math.max(540, document.querySelector('.work-scroll').clientHeight - 4);
  naturalHeight = baseHeight; fitCurrentWork();
  document.querySelector('.work-scroll').scrollTop = 0;
  const works = visibleWorks(), index = works.findIndex(item => item.id === work.id);
  $('previous-work').textContent = index > 0 ? '← 前一個' : '← 返回班級';
  $('next-work').textContent = index < works.length - 1 ? '後一個 →' : '返回班級 →';
  $('work-position').textContent = `${index + 1} / ${works.length}`;
  updateVoting();
}
function returnToClass() {
  if (viewer.open) viewer.close();
  $('gallery').scrollIntoView({ block: 'start' });
}
function chooseClass() {
  const groups = currentCategory().classes;
  $('browse-class-options').replaceChildren(...groups.map(group => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${group.name}（${group.works.length} 件）`;
    button.addEventListener('click', () => {
      $('browse-class-dialog').close();
      if (viewer.open) viewer.close();
      activeClass = group.name; render(); returnToClass();
    });
    return button;
  }));
  $('browse-class-dialog').showModal();
}
function voteCheckbox(work) {
  const label = document.createElement('label'); label.className = 'vote-choice';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(work.id);
  const text = document.createElement('span'); text.textContent = voteLabel(work);
  input.addEventListener('change', () => {
    if (input.checked) selected.add(work.id); else selected.delete(work.id);
    saveVotes(); render();
  });
  label.append(input, text); return label;
}
function updateVoting() {
  $('vote-mode').checked = voting;
  $('change-voter').hidden = !voting;
  $('voter-label').textContent = voting ? `${voterClass} · 同班 2 分／其他班 1 分` : '挑選讓你眼睛一亮的作品';
  $('vote-dock').hidden = !voting;
  document.body.classList.toggle('voting', voting);
  const ownRule = currentCategory() ? VoteRules.evaluate(currentCategory().ballot, voterClass, selected) : { ownCount: 0 };
  const ownProgress = voterClass && voterClass !== '訪客' ? ` · 同班 ${ownRule.ownCount} 件${ownRule.ownCount < 10 ? '／至少10件' : ''}` : '';
  const summary = `${voterClass} · 已勾選 ${selected.size} 件${ownProgress}${storageReady ? '' : '（本次頁面暫存）'}`;
  $('vote-summary').textContent = summary;
  $('viewer-vote-bar').replaceChildren();
  if (voting && currentWork && viewer.open) {
    const info = document.createElement('span'); info.textContent = summary;
    const generate = document.createElement('button'); generate.type = 'button'; generate.textContent = '產出投票識別碼'; generate.addEventListener('click', generateCode);
    const browse = document.createElement('button'); browse.type = 'button'; browse.textContent = '前往其他班'; browse.addEventListener('click', chooseClass);
    const actions = document.createElement('div'); actions.className = 'vote-dock-actions'; actions.append(generate, browse);
    $('viewer-vote-bar').append(voteCheckbox(currentWork), info, actions);
  }
}
function render() {
  if (renderedClass !== activeClass) { selectedTags.clear(); renderedClass = activeClass; }
  const category = currentCategory();
  $('classes').replaceChildren(...category.classes.map(group => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = group.name;
    button.setAttribute('aria-pressed', String(group.name === activeClass));
    button.addEventListener('click', () => { activeClass = group.name; render(); });
    return button;
  }));
  const group = category.classes.find(item => item.name === activeClass);
  const tagCounts = new Map();
  for (const work of group.works) { const tag = work.tag || '其他'; tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1); }
  for (const tag of selectedTags) if (!tagCounts.has(tag)) selectedTags.delete(tag);
  const makeFilter = (tag, label) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.tag = tag;
    button.setAttribute('aria-pressed', String(tag ? selectedTags.has(tag) : selectedTags.size === 0));
    button.addEventListener('click', () => {
      if (!tag) selectedTags.clear(); else if (selectedTags.has(tag)) selectedTags.delete(tag); else selectedTags.add(tag);
      render();
    });
    return button;
  };
  const hint = document.createElement('span'); hint.textContent = '類型（可複選）';
  $('tag-filters').replaceChildren(hint, makeFilter('', `全部（${group.works.length}）`), ...[...tagCounts].map(([tag, count]) => makeFilter(tag, `${tag}（${count}）`)));
  const works = visibleWorks();
  $('class-heading').textContent = `${group.name}的創作手帳`;
  $('count').textContent = selectedTags.size ? `${works.length} / ${group.works.length} 件作品` : `${group.works.length} 件作品`;
  $('status').textContent = group.works.length ? '' : '這一頁，正等待新的靈感。班級作品上架後，就會出現在這裡。';
  $('cards').replaceChildren(...works.map((work, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'work-card';
    const art = document.createElement('div'); art.className = 'card-art'; art.textContent = ['⌘', '✳', '⌁'][index % 3]; art.setAttribute('aria-hidden', 'true');
    if (work.thumbnail) {
      const image = document.createElement('img'); image.src = work.thumbnail; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.width = 550; image.height = 450;
      art.classList.add('has-thumbnail'); art.replaceChildren(image);
      image.addEventListener('error', () => { art.classList.remove('has-thumbnail'); art.textContent = '預覽暫不可用'; }, { once: true });
    } else if (work.thumbnailStatus === 'skipped-conversation') {
      art.classList.add('preview-unavailable'); art.textContent = '未提供預覽';
    }
    const text = document.createElement('div'); text.className = 'card-text';
    const label = document.createElement('div'), title = document.createElement('b'), subtitle = document.createElement('small'), arrow = document.createElement('span');
    title.textContent = work.title; subtitle.textContent = '打開這個小宇宙'; arrow.textContent = '↗';
    const tag = document.createElement('span'); tag.className = 'work-tag'; tag.textContent = work.tag || '其他';
    label.append(title, tag, subtitle); text.append(label, arrow); button.append(art, text);
    button.addEventListener('click', () => openWork(work));
    const card = document.createElement('div'); card.className = 'work-card-shell';
    if (selected.has(work.id) && voting) card.classList.add('is-voted');
    card.append(button);
    if (voting) card.append(voteCheckbox(work));
    return card;
  }));
  updateVoting();
}
async function refresh() {
  $('refresh').disabled = true;
  if (currentCategory()) saveVotes(false);
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `data/catalog.js?v=${Date.now()}`;
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error('讀取失敗')); };
      document.head.append(script);
    });
    const next = window.GALLERY_CATALOG;
    data = next;
    const categories = data.categories.filter(category => category.visible !== false);
    $('category').replaceChildren(...categories.map(category => { const option = document.createElement('option'); option.value = category.id; option.textContent = category.name; return option; }));
    shuffleDisplayOrders(); $('vote-mode').disabled = false;
    activateExhibition(categories.some(category => category.id === activeExhibitionId) ? activeExhibitionId : categories[0].id, false);
  } catch {
    $('status').textContent = '暫時無法取得作品清單，請確認 data/catalog.js 已一併上傳。';
    $('class-heading').textContent = '尚未連上作品資料夾';
  } finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
$('category').addEventListener('change', () => activateExhibition($('category').value));
$('close').addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => {
  frame.src = 'about:blank';
  viewer.classList.remove('expanded');
  $('fullscreen').textContent = '放大展示';
  $('fullscreen').setAttribute('aria-pressed', 'false');
});
$('reload').addEventListener('click', () => { if (currentWork) frame.src = frame.src; });
$('fullscreen').addEventListener('click', () => {
  const expanded = viewer.classList.toggle('expanded');
  $('fullscreen').textContent = expanded ? '還原大小' : '放大展示';
  $('fullscreen').setAttribute('aria-pressed', String(expanded));
});
function generateCode() {
  try {
    const ballot = currentCategory().ballot;
    const rule = VoteRules.evaluate(ballot, voterClass, selected);
    if (!rule.valid) {
      alert(`投票數尚不足：你目前選了自己班 ${rule.ownCount} 件作品，至少需要 10 件，還差 ${10 - rule.ownCount} 件。同一人的不同作品各算一票；其他班的作品可自由加投，不能取代自己班的10件。訪客不受此門檻限制。`);
      return;
    }
    if (!savedCode) { savedCode = VoteCodec.encode(ballot, voterClass, selected); saveVotes(false); }
    $('vote-code').value = savedCode;
    const decoded = VoteCodec.decode(savedCode, ballot);
    const bonus = decoded.rows.filter(row => row.sameClass).length;
    $('code-summary').textContent = `${currentCategory().name} · ${voterClass} · ${selected.size} 件作品，其中 ${bonus} 件同班作品計 2 分，其餘計 1 分。`;
    $('code-length').textContent = `識別碼長度：${savedCode.length}／256 字元`;
    $('copy-status').textContent = '';
    $('code-dialog').showModal();
  } catch (error) { alert(error.message); }
}
$('vote-mode').addEventListener('change', () => {
  if ($('vote-mode').checked) { $('voter-dialog').showModal(); }
  else { voting = false; saveVotes(); render(); }
});
$('change-voter').addEventListener('click', () => $('voter-dialog').showModal());
VoteCodec.classNames.forEach(name => {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
  button.addEventListener('click', () => {
    voterClass = name; voting = true;
    const target = pendingFeaturedVote; pendingFeaturedVote = null;
    if (target) {
      selectedTags.clear();
      activeClass = target.className; saveVotes(); $('voter-dialog').close(); render(); openWork(target.work); return;
    }
    const groups = currentCategory().classes;
    const available = groups.filter(group => group.works.length);
    const randomGroups = available.length ? available : groups;
    activeClass = name === '訪客' ? randomGroups[Math.floor(Math.random() * randomGroups.length)].name : name;
    saveVotes(); $('voter-dialog').close(); render(); returnToClass();
  });
  $('voter-options').append(button);
});
$('cancel-voter').addEventListener('click', () => $('voter-dialog').close());
$('voter-dialog').addEventListener('close', () => { pendingFeaturedVote = null; updateVoting(); });
window.addEventListener('featured-vote', event => {
  if (!data) return;
  const category = currentCategory();
  const group = category.classes.find(group => group.works.some(work => work.id === event.detail?.id));
  if (!group) return;
  const work = group.works.find(work => work.id === event.detail.id);
  if (!voterClass) { pendingFeaturedVote = { work, className: group.name }; $('voter-dialog').showModal(); return; }
  voting = true; activeClass = group.name; selectedTags.clear(); render(); openWork(work);
});
$('browse-other-class').addEventListener('click', chooseClass);
$('cancel-browse-class').addEventListener('click', () => $('browse-class-dialog').close());
function stepWork(direction) {
  const works = visibleWorks();
  const index = works.findIndex(work => work.id === currentWork.id);
  const next = works[index + direction];
  if (next) openWork(next); else returnToClass();
}
$('previous-work').addEventListener('click', () => stepWork(-1));
$('next-work').addEventListener('click', () => stepWork(1));
document.querySelectorAll('.generate-vote').forEach(button => button.addEventListener('click', generateCode));
$('close-code').addEventListener('click', () => $('code-dialog').close());
$('copy-code').addEventListener('click', async () => {
  $('vote-code').select();
  try { await navigator.clipboard.writeText($('vote-code').value); $('copy-status').textContent = '已複製，請交給老師。'; }
  catch { $('copy-status').textContent = '已選取識別碼，請按 Ctrl+C 或長按文字複製。'; }
});
refresh();

