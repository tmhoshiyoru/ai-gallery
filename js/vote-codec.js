/* AV1: version/rule, class, count, catalog fingerprint, receipt nonce, bitset, CRC32. */
(() => {
  const classNames = ['一儉', '一讓', '一禮', '一御', '一書', '訪客'];
  const maxWorks = 1280;
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function validateCatalog(catalog) {
    if (!catalog || !/^[a-f0-9]{16}$/.test(catalog.fingerprint) || !Array.isArray(catalog.entries) || catalog.entries.length > maxWorks)
      throw new Error('作品數量或清單格式不支援目前的識別碼版本。');
    if (new Set(catalog.entries.map(entry => entry.id)).size !== catalog.entries.length) throw new Error('作品代碼重複。');
    if (catalog.codeVersion === 2 && (!catalog.exhibitionId || !Number.isInteger(catalog.voteId) || catalog.voteId < 1 || catalog.voteId > 0xffffffff)) throw new Error('展覽投票設定不正確。');
    if (catalog.exhibitionId && catalog.exhibitionId !== 'first' && (catalog.codeVersion !== 2 || !Number.isInteger(catalog.voteId) || catalog.voteId < 2 || catalog.voteId > 0xffffffff)) throw new Error('展覽投票設定不正確。');
  }
  function encode(catalog, voterClass, selected) {
    validateCatalog(catalog);
    const classIndex = classNames.indexOf(voterClass);
    if (classIndex < 0) throw new Error('請先選擇班級。');
    if (!selected.size) throw new Error('請至少勾選一件作品。');
    const ids = new Set(catalog.entries.map(entry => entry.id));
    if ([...selected].some(id => !ids.has(id))) throw new Error('作品清單已變更，請重新確認投票。');
    const version = catalog.codeVersion || 1;
    if (![1, 2].includes(version)) throw new Error('不支援的識別碼版本。');
    const bitOffset = version === 2 ? 24 : 20;
    const nonceOffset = version === 2 ? 16 : 12;
    const bytes = new Uint8Array(bitOffset + 4 + Math.ceil(catalog.entries.length / 8));
    bytes[0] = version; bytes[1] = classIndex;
    const view = new DataView(bytes.buffer);
    view.setUint16(2, catalog.entries.length);
    for (let i = 0; i < 8; i++) bytes[4 + i] = parseInt(catalog.fingerprint.slice(i * 2, i * 2 + 2), 16);
    if (version === 2) view.setUint32(12, catalog.voteId);
    crypto.getRandomValues(bytes.subarray(nonceOffset, nonceOffset + 8));
    catalog.entries.forEach((entry, index) => { if (selected.has(entry.id)) bytes[bitOffset + (index >> 3)] |= 1 << (index & 7); });
    view.setUint32(bytes.length - 4, crc32(bytes.subarray(0, -4)));
    const code = `AV${version}.` + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    if (code.length > 256) throw new Error('識別碼超過長度限制。');
    return code;
  }
  function decode(code, catalog) {
    validateCatalog(catalog);
    if (code.length > 256 || !/^AV[12]\.[A-Za-z0-9_-]+$/.test(code)) throw new Error('識別碼格式錯誤。');
    const version = Number(code[2]);
    const bitOffset = version === 2 ? 24 : 20;
    const nonceOffset = version === 2 ? 16 : 12;
    const raw = code.slice(4).replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
    if (bytes.length < bitOffset + 4) throw new Error('識別碼不完整。');
    const view = new DataView(bytes.buffer);
    const count = view.getUint16(2);
    const fingerprint = [...bytes.slice(4, 12)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (version !== (catalog.codeVersion || 1) || (version === 1 && catalog.exhibitionId && catalog.exhibitionId !== 'first') || (version === 2 && view.getUint32(12) !== catalog.voteId)) throw new Error('這張票單屬於其他展覽，請使用對應展覽的清單。');
    if (bytes[0] !== version || bytes[1] >= classNames.length || count !== catalog.entries.length || fingerprint !== catalog.fingerprint)
      throw new Error('請使用這張票單對應版本的作品清單還原。');
    if (bytes.length !== bitOffset + 4 + Math.ceil(count / 8) || view.getUint32(bytes.length - 4) !== crc32(bytes.subarray(0, -4)))
      throw new Error('識別碼有遺漏或輸入錯誤。');
    if (count % 8 && (bytes[bytes.length - 5] >> (count % 8))) throw new Error('識別碼資料無效。');
    const voterClass = classNames[bytes[1]];
    const rows = catalog.entries.flatMap((entry, index) => {
      if (!(bytes[bitOffset + (index >> 3)] & (1 << (index & 7)))) return [];
      const sameClass = voterClass !== '訪客' && entry.className === voterClass;
      return [{ ...entry, sameClass, points: sameClass ? 2 : 1 }];
    });
    if (!rows.length) throw new Error('這張票單沒有勾選作品。');
    return { version, exhibitionId: catalog.exhibitionId || 'first', exhibitionName: catalog.exhibitionName || '', fingerprint, voterClass, receipt: [...bytes.slice(nonceOffset, nonceOffset + 8)].map(byte => byte.toString(16).padStart(2, '0')).join(''), rows };
  }
  globalThis.VoteCodec = { encode, decode, maxWorks, classNames };
})();
