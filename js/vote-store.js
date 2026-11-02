(() => {
  function create(storage) {
    const memory = new Map();
    const key = category => 'gallery-votes-v2:' + category.id;
    function clean(category, state) {
      const validClass = ['一儉', '一讓', '一禮', '一御', '一書', '訪客'].includes(state?.voterClass);
      const ids = new Set(category.ballot.entries.map(entry => entry.id));
      const chosen = Array.isArray(state?.selected) ? state.selected.filter(id => ids.has(id)) : [];
      return {
        exhibitionId: category.id, fingerprint: category.ballot.fingerprint,
        voterClass: validClass ? state.voterClass : '', selected: validClass ? [...new Set(chosen)] : [],
        enabled: validClass && state.enabled !== false,
        activeClass: category.classes.some(group => group.name === state?.activeClass) ? state.activeClass : validClass && state.voterClass !== '訪客' ? state.voterClass : category.classes[0].name,
        savedCode: validClass && chosen.length === state.selected?.length && state.fingerprint === category.ballot.fingerprint ? state.savedCode || '' : ''
      };
    }
    function save(category, state) {
      const value = clean(category, state); memory.set(category.id, value);
      try { storage.setItem(key(category), JSON.stringify(value)); return true; } catch { return false; }
    }
    function load(category) {
      let state = memory.get(category.id), storageReady = true;
      try {
        const raw = storage.getItem(key(category));
        if (raw !== null) {
          const stored = JSON.parse(raw);
          state = stored.exhibitionId === category.id ? stored : null;
        } else if (category.id === 'first') {
          const legacy = storage.getItem('gallery-votes-v1');
          if (legacy) { state = JSON.parse(legacy); storageReady = save(category, state); }
        }
      } catch { storageReady = false; }
      const result = clean(category, state); memory.set(category.id, result);
      return { ...result, storageReady };
    }
    return { load, save, storageKey: key };
  }
  globalThis.GalleryVoteStore = { create };
})();
