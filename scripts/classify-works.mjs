import { inspectWork } from './work-inspection.mjs';

export const coreTags = ['打磚塊', '貪食蛇', '太空射擊', '離線小恐龍'];
const overrides = {
  '一讓02.html': ['打磚塊', '底板、磚塊與彈球機制'],
  '一讓13.html': ['太空射擊', '操作說明標示 SPACE SHOOTER，含玩家與敵方子彈'],
  '一書23.html': ['離線小恐龍', '跳躍、蹲下與障礙物的恐龍跑酷變體'],
  '一御34.html': ['吞噬成長', '以星球吞噬與成長為核心'],
  '一御33.html': ['網球對戰', '雙方擊球對戰'],
  '一御12.html': ['打磚塊', '底板反彈投射物並擊破磚塊，農場只是視覺主題'],
  '一禮36.html': ['角色格鬥', '雙人角色與技能對決'],
  '一禮37.html': ['隨機抽選', '由自訂項目池隨機決定讀書計畫'],
  '一禮28.html': ['隨機抽選', '隨機選擇晚餐'],
  '一禮21.html': ['經營養成', '種植、收穫與商店交易'],
  '一儉25.html': ['經營養成', '小鎮生活、釣魚與資源累積'],
  '一儉31.html': ['經營養成', '烘焙製作、收集與經驗成長'],
  '一御24.html': ['跑酷冒險', '平台跳躍與關卡機關'],
  '一禮29.html': ['飛行避障', '3D太空巡航與避障，非射擊遊戲']
};
function propose(record) {
  const html = record.html;
  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  if (inspectWork(html).isConversation) return ['對話紀錄', 'Gemini對話頁面，非遊戲作品'];
  const filename = decodeURIComponent(record.source).split('/').at(-1);
  if ((!record.exhibitionId || record.exhibitionId === 'first') && overrides[filename]) return overrides[filename];
  if (/打磚塊|breakout|brick\s*breaker|ブロック崩/i.test(title)) return ['打磚塊', '標題與遊戲機制為打磚塊'];
  if (/貪[食吃]|snake/i.test(title)) return ['貪食蛇', '蛇身移動、進食與碰撞機制'];
  if (/恐龍|dino|t[- ]?rex/i.test(title)) return ['離線小恐龍', '恐龍跳躍／障礙跑酷'];
  if (/網球|tennis/i.test(title)) return ['網球對戰', '雙方擊球對戰'];
  if (/生存射擊|俯視槍戰|奶龍大作戰|三國無雙|物理老師與作業|假偷刀|霓虹戰線|100分學霸|生化考難關|飛刀大作戰/i.test(title)) return ['動作生存', '角色攻擊、閃避、戰鬥或生存挑戰'];
  if (/跑酷|runner|cookie run|跑跑|mario|奶蛙大逃亡/i.test(title)) return ['跑酷冒險', '移動、跳躍、避障或平台闖關'];
  if (/輪盤|轉盤/i.test(title)) return ['隨機抽選', '隨機抽選項目'];
  if (/農場|farm|餐廳|cafe|寵物養成/i.test(title)) return ['經營養成', '資源管理、經營或角色養成'];
  if (/翻牌|配對|memory|記憶大冒險/i.test(title)) return ['翻牌配對', '翻牌記憶與配對'];
  if (/太空|space|星際守護者|星際征途|cosmic defender|飛機大戰|太空獵手|戰機/i.test(title)) return ['太空射擊', '太空／飛機縱向射擊'];
  if (/考驗|測驗|quiz|sorting ceremony|算術/i.test(title)) return ['問答測驗', '題目作答或問卷結果'];
  if (/塔羅|星座|星盤|星象/i.test(title)) return ['占卜星象', '占卜或星座解析'];
  if (/minesweeper|踩地雷/i.test(title)) return ['踩地雷', '踩地雷盤面推理'];
  if (/tetris|俄羅斯/i.test(title)) return ['俄羅斯方塊', '方塊堆疊與消行'];
  return ['其他', '獨立玩法或工具，未達獨立類型門檻'];
}
export function classifyWorks(records) {
  const proposed = records.map(record => ({ record, result: propose(record) }));
  const candidates = {};
  for (const { result: [tag] } of proposed) candidates[tag] = (candidates[tag] || 0) + 1;
  const works = {}, counts = {};
  for (const { record, result: [candidate, evidence] } of proposed) {
    const tag = coreTags.includes(candidate) || (candidate !== '其他' && candidates[candidate] >= 5) ? candidate : '其他';
    works[record.id] = { tag, candidate, evidence, sourceHash: record.sourceHash, source: record.source, className: record.className };
    counts[tag] = (counts[tag] || 0) + 1;
  }
  return { schemaVersion: 1, extraTagMinimum: 5, coreTags, counts, candidateCounts: candidates, works };
}
