(() => {
  function evaluate(catalog, voterClass, selected) {
    if (voterClass === '訪客') return { valid: true, ownCount: 0, minimum: 0 };
    const works = new Set();
    for (const entry of catalog.entries) {
      if (entry.className !== voterClass || !selected.has(entry.id)) continue;
      works.add(entry.id);
    }
    const ownCount = works.size;
    return { valid: ownCount >= 10, ownCount, minimum: 10 };
  }
  globalThis.VoteRules = { evaluate };
})();
