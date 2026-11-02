(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('lesson-frame');
  const examples = {
    euclid: {title:'輾轉相除法',focus:'版面觀察：左欄逐步計算，右欄從最後一步倒推。'},
    bases: {title:'進制轉換',focus:'版面觀察：上方同步進位表、可收合側欄與轉換過程。'},
    'loop-if': {title:'for × if',focus:'版面觀察：動畫追蹤 i，單步模式可暫停並手動前進。'}
  };
  $('prompt-title').textContent = 'C++ 累加求和的起手式';
  $('example-prompt').textContent = "請扮演互動教材設計師，為C++只學到迴圈的高中生製作「1加到n：累加求和」單檔HTML。CSS、JavaScript全部內嵌，不使用外部套件或檔案，可離線開啟。\n\n【學習目標】\n理解變數i、累加器sum、sum += i與迴圈停止條件。只用變數、運算、條件與單層迴圈，不使用陣列、函式教學或進階語法。\n\n【版面】\n桌面左側約1/3放n的輸入與控制鈕，右側約2/3放C++程式與變數追蹤表，下方放原理解釋；手機改成上設定、下結果，不固定整頁高度。\n\n【互動規則】\nn是1～100的整數。起始sum = 0，for (int i = 1; i <= n; i++)逐次執行sum += i。按「套用並播放」逐步動畫，不可直接顯示最終答案。每步更新目前i、加之前的sum與加之後的sum，標記執行中的程式行。\n按「單步執行」立刻暫停動畫並保留進度，再按「下一步」只前進一次。提供「重設」，會停止動畫、將sum歸零並回到尚未執行。走到結束時停用下一步。動畫與手動操作不可同時推進。\n\n【驗證】\nn=1得到1；n=5得到15；n=10得到55；n=100得到5050。空白、0、負數、小數和超過100時，顯示清楚提示並停止計算。反覆播放、切換單步及重設，不可有重複計時器或殘留sum。";
  const tabs = [...document.querySelectorAll('[data-example]')];
  function activate(tab, focus = false) {
    const id = tab.dataset.example, example = examples[id];
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
    $('example-panel').setAttribute('aria-labelledby', tab.id);
    $('example-focus').textContent = example.focus;
    $('example-open').href = $('example-download').href = `examples/${id}.html`;
    frame.title = example.title + '互動範例'; frame.style.height = '850px'; frame.src = `examples/${id}.html`;
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target !== undefined) { event.preventDefault(); activate(tabs[target], true); }
    });
  });
  addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'task-example-size') return;
    const height = event.data.height;
    if (Number.isFinite(height) && height > 0 && height < 20000) frame.style.height = Math.ceil(height + 4) + 'px';
  });
  activate(tabs[0]);

  let feedbackTimer;
  function announce(text) { $('task-feedback').textContent = text; clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { $('task-feedback').textContent = ''; }, 4500); }
  async function copy(text) {
    try {
      try { if (!navigator.clipboard?.writeText) throw Error(); await navigator.clipboard.writeText(text); }
      catch {
        const previous = document.activeElement;
        const area = document.createElement('textarea'); area.value = text; area.setAttribute('aria-label', '待複製的提示詞'); area.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.append(area); area.select();
        const success = document.execCommand('copy'); area.remove(); previous?.focus(); if (!success) throw Error();
      }
      announce('已複製！可以貼到 Gemini Canvas。');
    } catch { announce('瀏覽器無法自動複製，請選取提示詞後按 Ctrl+C（Mac：⌘C）。'); }
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copy($(button.dataset.copy).textContent)));

  const topics = {
  "it": [
    {
      "label": "資訊安全",
      "chapters": [
        {"title":"可疑附件與下載陷阱","direction":"製作『安全下載偵探』小遊戲：用虛構郵件與檔名卡片，讓玩家找出可疑附件、雙重副檔名及催促下載的線索，答題後解釋。所有附件都只是畫面示意，不下載或執行任何檔案。"},
        {"title":"個資分享與隱私設定","direction":"製作『個資守門員』分類遊戲：使用虛構貼文與資料卡，讓玩家判斷哪些內容不宜公開，再比較公開、限好友與不分享的情境；不要求輸入真實個資。"},
        {"title":"更新與備份","direction":"製作『救回作業大挑戰』情境遊戲：讓玩家選擇定期更新、另存副本與備份等行動，再用虛構的檔案損毀或遺失事件比較結果。說明備份與同步的差別，所有操作都在模擬介面中進行。"}
      ]
    },
    {
      "label": "網路防詐",
      "chapters": [
        {"title":"防詐訊息闖關","direction":"製作防詐小遊戲：逐關呈現虛構的中獎、包裹異常或帳號停權訊息，讓玩家圈出催促、索取資料與可疑網址等線索。每關顯示得分、正確理由及查證方法，不用單一線索就斷定真假。"},
        {"title":"假網拍與交易陷阱","direction":"製作『網購安全選擇題』小遊戲：用虛構賣場與聊天對話，讓玩家選擇留在平台查證、拒絕私下轉帳等行動，逐步顯示後果與解析；不串接真實付款或交易。"},
        {"title":"假冒親友與客服","direction":"製作分支對話防詐遊戲：遇到虛構親友急借錢、假客服要求提供驗證碼或操作付款時，讓玩家選擇如何回應。鼓勵暫停、透過原本知道的聯絡管道查證，並解釋每個選項；不要求真實帳密或驗證碼。"},
        {"title":"遊戲點數與免費獎勵陷阱","direction":"製作『免費獎勵是真是假』闖關小遊戲：以虛構的遊戲點數、免費造型和抽獎訊息，讓玩家辨識要求先付款、交出帳密或轉交驗證碼的風險，提供得分與理由。所有網站與帳號均為虛構示意。"}
      ]
    },
    {
      "label": "C++",
      "chapters": [
        {
          "title": "變數與指定",
          "direction": "讓使用者改變 a、b 的初值，逐行執行 a = b、b = a，觀察變數內容，理解指定不是交換。"
        },
        {
          "title": "輸入與輸出",
          "direction": "輸入姓名代稱與數值，用 cin、cout 對照輸入框、變數與畫面輸出；只用虛構資料。"
        },
        {
          "title": "整數除法與餘數",
          "direction": "輸入兩個小整數，同時顯示整數商與餘數，使用分組圖解釋；除數為0要提示。"
        },
        {
          "title": "if／else 條件判斷",
          "direction": "調整分數與及格門檻，標記執行的是哪個分支，並測試剛好等於門檻的情況。"
        },
        {
          "title": "for 迴圈累加求和",
          "direction": "指定 n，逐步計算1加到n，同步顯示 i 與 sum，解釋 sum += i 的意思。"
        },
        {
          "title": "while 迴圈倒數",
          "direction": "指定起始值，逐步顯示 while 判斷、目前數值與減1過程，展示0時為何停止。"
        }
      ]
    },
    {
      "label": "檔案管理",
      "chapters": [
        {
          "title": "資料夾與路徑",
          "direction": "用虛構資料夾樹讓使用者找到檔案，對照桌面、下載資料夾與檔案位置。"
        },
        {
          "title": "複製、移動與刪除",
          "direction": "提供安全的虛擬檔案區，操作後比較原位置與新位置，理解複製和移動的差別。"
        },
        {
          "title": "檔名與副檔名",
          "direction": "讓使用者辨識報告.docx、作品.html、作品.html.txt，說明改副檔名不等於轉換格式。"
        }
      ]
    },
    {
      "label": "檔案格式",
      "chapters": [
        {
          "title": "網頁檔與對話紀錄",
          "direction": "比較虛構的作品HTML、網址捷徑與對話另存檔，練習判斷哪份才是可獨立開啟的作品。"
        },
        {
          "title": "圖片格式與透明背景",
          "direction": "切換示意圖片的JPEG、PNG選項，比較透明背景的支援與適合用途。"
        },
        {
          "title": "檔案大小與壓縮",
          "direction": "拖放虛擬檔案到ZIP資料夾，呈現打包前後的差別，說明壓縮不是刪除內容，也未必大幅變小。"
        }
      ]
    },
    {
      "label": "鍵盤操作",
      "chapters": [
        {
          "title": "複製、貼上與復原",
          "direction": "在模擬文字編輯區練習Ctrl+C、Ctrl+V、Ctrl+Z，對照選取內容與操作前後變化。"
        },
        {
          "title": "文字選取與游標",
          "direction": "以可操作的文字區示範游標、Shift選取、Ctrl+A全選，解釋選取和刪除的影響。"
        },
        {
          "title": "Tab與表單操作",
          "direction": "用Tab、Shift+Tab與Enter完成虛擬表單，標記焦點，練習不用滑鼠也能操作。"
        }
      ]
    },
    {
      "label": "瀏覽器",
      "chapters": [
        {
          "title": "網址列與搜尋框",
          "direction": "提供虛擬瀏覽器介面，比較輸入完整網址與輸入搜尋關鍵字後的結果。"
        },
        {
          "title": "分頁、返回與重新整理",
          "direction": "以模擬頁面練習開分頁、返回、重新整理，顯示各操作如何影響瀏覽狀態。"
        },
        {
          "title": "下載的檔案在哪裡",
          "direction": "模擬下載清單與下載資料夾，讓使用者找出作品並核對檔名與副檔名。"
        }
      ]
    },
    {
      "label": "帳號安全",
      "chapters": [
        {
          "title": "辨識可疑連結",
          "direction": "用虛構網址與通知讓使用者找出可疑線索，點選後說明；不連到真實可疑網站。"
        },
        {
          "title": "密碼重複使用",
          "direction": "用虛構帳號卡片模擬一組密碼外洩的影響，對照各站使用不同密碼的差別；不輸入真實密碼。"
        },
        {
          "title": "兩步驟驗證",
          "direction": "用虛構登入流程展示密碼與第二項驗證的差別，讓使用者判斷何時不應交出驗證碼。"
        }
      ]
    },
    {
      "label": "網路查證",
      "chapters": [
        {
          "title": "消息的來源與日期",
          "direction": "比較虛構貼文，讓使用者找作者、出處、發布日期，再判斷是否還需要查證。"
        },
        {
          "title": "截圖是不是完整證據",
          "direction": "逐步揭露虛構截圖的前後文與時間，觀察判斷如何改變，練習不要只看一張圖就下結論。"
        },
        {
          "title": "引用與圖片授權",
          "direction": "提供簡化的來源與授權卡片，練習標示出處、作者和授權條件，說明網路找到不等於可任意使用。"
        }
      ]
    },
    {
      "label": "電腦基礎",
      "chapters": [
        {
          "title": "記憶體與儲存空間",
          "direction": "用工作桌與櫃子的互動比喻，比較RAM與SSD，模擬開程式及存檔的不同用途。"
        },
        {
          "title": "網路與離線檔案",
          "direction": "切換模擬的連線狀態，判斷哪些本機檔案仍能開啟、哪些網路服務需要連線。"
        },
        {
          "title": "視窗與螢幕縮放",
          "direction": "在模擬桌面練習視窗最大化、調整大小與文字縮放，比較三種操作對版面的不同影響。"
        }
      ]
    }
  ],
  "subject": [
    {
      "label": "國文",
      "chapters": [
        {
          "title": "修辭入門",
          "direction": "使用自寫短句辨識譬喻、擬人、排比，作答後標示線索並解釋。"
        },
        {
          "title": "文言詞義判讀",
          "direction": "用自寫的簡短文言例句比較同一字在不同語境的意思，選答案後顯示判斷線索。"
        },
        {
          "title": "記敘與抒情",
          "direction": "用自寫短文切換事件、景物與感受的段落標記，觀察作者如何從敘事轉入抒情。"
        }
      ]
    },
    {
      "label": "英文",
      "chapters": [
        {
          "title": "現在式與過去式",
          "direction": "切換時間線與時間提示詞，改寫簡短句子的動詞，解釋習慣和過去事件的差別。"
        },
        {
          "title": "主詞與動詞一致",
          "direction": "切換單數、複數主詞，同步更新簡單現在式的動詞形式，提供練習與回饋。"
        },
        {
          "title": "基本句構",
          "direction": "將主詞、動詞、受詞卡片排成簡單句，顯示句構與中文語意。"
        }
      ]
    },
    {
      "label": "數學",
      "chapters": [
        {
          "title": "實數與數線",
          "direction": "將整數、分數與根號數放上數線，比較大小並辨識有理數與無理數。"
        },
        {
          "title": "絕對值與距離",
          "direction": "拖動數線上的兩點，同步顯示距離與絕對值式子，解釋距離不會是負數。"
        },
        {
          "title": "指數律",
          "direction": "調整正整數底數與整數指數，對照同底數乘除和次方的運算規則及展開式。"
        },
        {
          "title": "常用對數入門",
          "direction": "切換10的次方與常用對數，觀察乘法對應到對數加法；輸入必須是正數。"
        }
      ]
    },
    {
      "label": "歷史",
      "chapters": [
        {
          "title": "史料與歷史解釋",
          "direction": "用虛構或明確標示來源的史料片段，辨識作者、立場與證據，對照不同解讀。"
        },
        {
          "title": "臺灣原住民族與外來者互動",
          "direction": "用事件卡與地圖呈現近代早期臺灣族群接觸，點選顯示互動方式及多方觀點。"
        },
        {
          "title": "近代臺灣政權變遷",
          "direction": "用可切換時間軸整理臺灣史的重要政權與制度變化，標示年代、背景與影響。"
        }
      ]
    },
    {
      "label": "地理",
      "chapters": [
        {
          "title": "經緯度與位置",
          "direction": "在簡化地球網格上選取位置，同步顯示經緯度、南北半球與東西方向。"
        },
        {
          "title": "地圖比例尺",
          "direction": "改變比例尺與圖上距離，計算實際距離，對照大比例尺和小比例尺的涵蓋範圍。"
        },
        {
          "title": "地理資訊圖層",
          "direction": "開關道路、河流、學校等虛構圖層，示範疊圖如何協助選址與判讀。"
        }
      ]
    },
    {
      "label": "公民",
      "chapters": [
        {
          "title": "人性尊嚴與人權",
          "direction": "以虛構生活情境辨識應被尊重的權利，作答後解釋，不要求個人經歷。"
        },
        {
          "title": "性別平等與刻板印象",
          "direction": "比較虛構分工與對話，讓使用者找出刻板印象並選擇更公平的做法。"
        },
        {
          "title": "民主社會的公共參與",
          "direction": "模擬校園公共議題，讓使用者選擇提案、討論與表達意見的方式並理解差異。"
        }
      ]
    },
    {
      "label": "物理",
      "chapters": [
        {
          "title": "物理量與單位",
          "direction": "將長度、時間、質量的量測值配對正確單位，呈現選錯單位會造成的差別。"
        },
        {
          "title": "科學記號與量級",
          "direction": "拖動10的次方，對照生活尺度和科學記號，練習比較大小。"
        },
        {
          "title": "路程與位移",
          "direction": "控制物體沿直線來回移動，同時累計路程與顯示位移，理解兩者的不同。"
        }
      ]
    },
    {
      "label": "化學",
      "chapters": [
        {
          "title": "純物質與混合物",
          "direction": "將生活中常見物質的卡片分類，作答後解釋元素、化合物和混合物的差別。"
        },
        {
          "title": "原子與離子",
          "direction": "調整簡化模型的質子、中子、電子數，呈現元素身分與電荷；說明模型限制。"
        },
        {
          "title": "元素週期表入門",
          "direction": "點選前20號元素，顯示原子序、族與週期，練習從位置找規律。"
        }
      ]
    },
    {
      "label": "生物",
      "chapters": [
        {
          "title": "細胞的基本構造",
          "direction": "切換植物與動物細胞，點選構造看功能並做配對練習。"
        },
        {
          "title": "細胞膜與物質進出",
          "direction": "調整簡化模型的內外濃度，觀察擴散與滲透方向，說明膜的選擇性。"
        },
        {
          "title": "生命的組成層次",
          "direction": "將細胞、組織、器官、器官系統與個體卡片排序，點選生活例子說明層次關係。"
        }
      ]
    },
    {
      "label": "地球科學",
      "chapters": [
        {
          "title": "地球的內部構造",
          "direction": "調整剖面圖或點選地殼、地函、地核，對照深度和基本性質。"
        },
        {
          "title": "板塊邊界",
          "direction": "切換聚合、張裂、錯動示意，觀察運動方向與可能地質現象。"
        },
        {
          "title": "月相變化",
          "direction": "調整月球位置，同時呈現太陽光照與地球觀察者的視角，區分月相和月食。"
        }
      ]
    }
  ]
};
  const palettes = ['#fad77b', '#a4d4ec', '#c2dfb6', '#f4b3a6', '#e4d6ed', '#f3e6ba', '#bbdeda', '#f1cfda', '#c7d1f0', '#d7e5b7'];
  const wheelState = {};
  for (const [key, list] of Object.entries(topics)) {
    const wheel = $('wheel-' + key), segment = 360 / list.length;
    wheel.style.background = 'conic-gradient(' + list.map((_, i) => `${palettes[i % palettes.length]} ${i * segment}deg ${(i + 1) * segment}deg`).join(',') + ')';
    list.forEach(({label, chapters}, i) => {
      const labelElement = document.createElement('span'); labelElement.className = 'wheel-label'; labelElement.textContent = label; labelElement.style.setProperty('--angle', (i + .5) * segment + 'deg'); wheel.append(labelElement);
      const item = document.createElement('li'); item.textContent = label + '：' + chapters.map(chapter=>chapter.title).join('、'); $('topics-' + key).append(item);
    });
    wheelState[key] = { rotation: 0, selection: null, spinning: false };
  }
  document.querySelectorAll('[data-spin]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.spin, state = wheelState[key], list = topics[key]; if (state.spinning) return;
    const index = Math.floor(Math.random() * list.length), group = list[index], chapter = group.chapters[Math.floor(Math.random() * group.chapters.length)], angle = 360 - (index + .5) * 360 / list.length;
    state.spinning = true; button.disabled = true; button.textContent = '正在挑選…';
    state.rotation += 360 * 4 + ((angle - state.rotation % 360 + 360) % 360);
    $('wheel-' + key).style.transform = `rotate(${state.rotation}deg)`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      state.selection = [group.label, group.label + '｜' + chapter.title, chapter.direction]; state.spinning = false; button.disabled = false; button.textContent = '再幫我決定 ↻';
      const result = $('result-' + key); result.replaceChildren();
      const label = document.createElement('span'); label.className = 'small-label'; label.textContent = '抽中' + group.label + ' → 再從' + group.chapters.length + '個單元抽一題';
      const title = document.createElement('h4'); title.textContent = state.selection[1];
      const detail = document.createElement('p'); detail.textContent = state.selection[2]; result.append(label, title, detail);
      document.querySelector(`[data-topic-copy="${key}"]`).hidden = false;
    }, reduced ? 20 : 2650);
  }));
  document.querySelectorAll('[data-topic-copy]').forEach(button => button.addEventListener('click', () => {
    const topic = wheelState[button.dataset.topicCopy].selection; if (!topic) return;
    copy(`請扮演互動教材設計師，為高中生製作「${topic[1]}」單檔 HTML，CSS、JavaScript 全部內嵌，不使用外部檔案、套件或服務，可離線獨立開啟。
學習目標：用操作來理解這個概念，而非只顯示靜態文字。
互動方向：${topic[2]}
版面：桌面左側放操作設定，右側呈現即時結果，下方放原理解釋與一題練習；手機改為上下排列，不要固定整頁高度。
請加上操作說明、重設、輸入檢查、作答回饋與正確的概念解說。先完成基本可用版，列出三個可以用課本知識驗證的測試案例與預期結果；我會親自檢查後再追加功能。`);
  }));
})();
