// lib/prompt-builder-usr.js — User prompt construction for saju analysis
// Extracted from runSajuAnalysis() lines 2676-2974 of saju-engine.js
// This file builds the massive `usr` variable (the user prompt sent to AI).
'use strict';

var data = require('./saju-data');
var analysis = require('./saju-analysis');
var mbti = require('./mbti-data');
var patternEngine = require('./pattern-data');    // data + buildUserTags (legacy API still used in browser)
var patternMatcher = require('./pattern-matcher'); // new scoring engine (server-side authoritative)
var _mbtiTheory = require('./mbti-theory-server');
var _sjTheory = require('./saju-theory-server');
var _mbtsPoints = null;
try { _mbtsPoints = require('./mbts-points'); } catch(e) { /* graceful: 없어도 분석은 계속 */ }

var TGAN = data.TGAN;
var TGAN_KR = data.TGAN_KR;
var JIJI = data.JIJI;
var JIJI_KR = data.JIJI_KR;
var JIJANGGAN_DATA = data.JIJANGGAN_DATA;
var getSipsung = data.getSipsung;
var ILJU_DATA = data.ILJU_DATA;
var NAPEUM_STORY = data.NAPEUM_STORY;
var SS_CONTEXT = data.SS_CONTEXT;
var DM_AX = mbti.DM_AX;
var strLv = mbti.strLv;
var miAllParam = mbti.miAllParam;

var TERM_REPLACE = {
  // ── 통변 조합 12개 ──
  '살인상생': '압박이 지혜로 바뀌는 흐름',
  '인수생비': '배움이 힘이 되는 흐름',
  '식신제살': '재능으로 위기를 넘기는 흐름',
  '관살혼잡': '명예와 압박이 뒤섞인 구조',
  '상관견관': '반항과 질서가 부딪히는 구조',
  '상관패인': '창의가 보호막을 깨는 흐름',
  '재생관살': '돈이 압박을 키우는 흐름',
  '인성태과': '보호 기운이 지나치게 강함',
  '식상태과': '표현 욕구가 지나치게 강함',
  '비겁태과': '자기 고집이 지나치게 강함',
  '재성태과': '물욕이 지나치게 강함',
  '관성태과': '외부 압박이 지나치게 강함',

  // ── 합충형해 6개 ──
  '천간합': '에너지가 자연스럽게 합쳐짐',
  '지지충': '에너지가 정면으로 부딪힘',
  '지지합': '깊은 인연으로 묶임',
  '지지형': '에너지끼리 마찰이 생김',
  '지지해': '은근히 서로 방해함',
  '지지파': '에너지가 흔들리고 깨짐',

  // ── 12운성 5개 ──
  '장생': '새로 태어나는 기운',
  '건록': '가장 안정된 전성기',
  '제왕': '정점에 선 기운',
  '관대': '한창 성장하는 기운',
  '목욕': '흔들리고 시행착오하는 시기',

  // ── 운 이름 10개 ──
  '비견운': '독립하고 나서는 시기',
  '겁재운': '경쟁하고 승부하는 시기',
  '식신운': '재능을 펼치는 시기',
  '상관운': '틀을 깨고 반항하는 시기',
  '편재운': '큰돈이 움직이는 시기',
  '정재운': '차곡차곡 쌓이는 시기',
  '편관운': '강한 압박이 오는 시기',
  '정관운': '안정되고 자리잡는 시기',
  '편인운': '영감이 찾아오는 시기',
  '정인운': '배우고 보호받는 시기',

  // ── 5신 복합어 6개 (긴 것 먼저) ──
  '파격조정용신': '깨진 균형을 맞추는 힘',
  '억부용신': '균형을 잡아주는 힘',
  '조후용신': '온도를 맞춰주는 힘',
  '종격용신': '흐름을 따라가는 힘',
  '병약용신': '약한 곳을 보완하는 힘',
  '통관용신': '막힌 곳을 뚫어주는 힘',

  // ── 5신 단독 5개 ──
  '용신': '가장 필요한 힘',
  '희신': '도움이 되는 힘',
  '기신': '방해가 되는 힘',
  '구신': '방해를 돕는 힘',
  '한신': '어느 쪽도 아닌 힘',

  // ── 신살 11개 (도화살/역마살/홍염살 제외 — 원어 유지) ──
  '화개살': '영적이고 예술적인 감수성',
  '천을귀인': '위기에 나타나는 귀인',
  '천의성': '아픈 곳을 치유하는 기운',
  '학당귀인': '공부에 도움을 주는 귀인',
  '문창귀인': '글과 학문에 도움을 주는 귀인',
  '양인살': '물러서지 않는 승부사 기질',
  '귀문관살': '보이지 않는 것을 느끼는 감수성',
  '원진살': '겉으론 괜찮은데 속으로 불편한 사이',
  '백호살': '갑작스러운 변화의 기운',
  '괴강살': '극단적으로 강한 기질',
  '삼형살': '여러 방향에서 오는 갈등',

  // ── 기타 ──
  '조후참고': '온도 균형 참고',
  '배우자궁': '배우자 자리',
  '격국': '에너지 구조',
  '세운': '올해 흐름',
  '월운': '이달 흐름',
  '납음': 'MBTS 형태',

  // ── 격국명 17개 ──
  '편재격': '큰돈을 움직이는 사업가 구조',
  '정재격': '꾸준히 쌓아가는 관리자 구조',
  '식신격': '재능이 자연스럽게 나오는 구조',
  '상관격': '기존 틀을 깨는 혁신가 구조',
  '편관격': '카리스마로 이끄는 리더 구조',
  '정관격': '원칙과 질서를 지키는 구조',
  '편인격': '남들과 다른 영감을 받는 구조',
  '정인격': '배움과 보호 속에서 빛나는 구조',
  '비견격': '스스로 길을 여는 개척자 구조',
  '겁재격': '누구에게도 지지 않는 승부사 구조',
  '양인격': '물러서지 않는 강한 개척자 구조',
  '건록격': '안정 속에서 전문성을 쌓는 구조',
  '화격': '완전히 새로운 모습으로 변신하는 구조',
  '종재격': '재물 한 방향으로 몰입하는 구조',
  '종살격': '명예 한 방향으로 몰입하는 구조',
  '종아격': '표현 한 방향으로 몰입하는 구조',
  '종강격': '자기 한 방향으로 몰입하는 구조',

  // ── 신강도 5개 ──
  '극신강': '자기 힘이 압도적으로 강함',
  '극신약': '자기 힘이 많이 부족함',
  '신강': '자기 힘이 넉넉한 편',
  '신약': '자기 힘이 부족한 편',
  '중화': '안과 밖의 힘이 균형 잡힌 상태',

  // ── 통변조합 5개 ──
  '재관쌍미': '돈과 명예를 동시에 잡을 수 있는 구조',
  '비겁탈재': '주변 경쟁이 재물을 빼앗아가는 흐름',
  '재다신약': '기회는 많은데 잡을 힘이 부족한 구조',
  '식상생재': '재능이 자연스럽게 돈이 되는 흐름',
  '관인상생': '명예와 배움이 서로 도와주는 흐름',

  // ── 기타 전문용어 ──
  '천간충': '겉으로 드러나는 에너지 충돌',
  '음양차착': '겉과 속이 반대인 구조',
  '무은지형': '은혜가 오히려 원수가 되는 구조',
  '탐합망충': '결합의 힘이 충돌을 무력화',
  '교운기': '인생의 큰 전환점',

  // ── 십성 단독 10개 ──
  '비견': '나와 같은 힘, 독립심',
  '겁재': '라이벌 기질, 승부욕',
  '식신': '타고난 재능, 여유',
  '상관': '날카로운 창의성, 반골 기질',
  '편재': '큰돈을 움직이는 감각',
  '정재': '꾸준히 모으는 성실함',
  '편관': '외부에서 오는 강한 압박',
  '정관': '안정적인 질서와 책임감',
  '편인': '남다른 영감과 직관',
  '정인': '배움과 보호의 힘',

  // ── 기타 ──
  '종격': '한쪽으로 완전히 쏠린 구조',
  '공망': '비어있지만 채우면 강해지는 자리',
  '득령': '계절의 도움을 타고남',
  '실령': '계절의 도움을 받지 못함',
  '암합': '겉으로 안 보이는 숨겨진 인연',

  // ── 십성 그룹명 5개 ──
  '비겁': '자기 힘',
  '식상': '표현력',
  '재성': '재물 운',
  '관성': '사회적 압박',
  '인성': '배움과 보호'
};
// ── AI 입력 번역 레이어: 지지명/천간명/한자 제거 ──
// 궁위 기반 의미 서술로 변환 (AI가 못 본 건 인용할 수 없음 원칙)
var GUNGWI_MEANING = {
  '연지':'외부환경/뿌리','년지':'외부환경/뿌리','월지':'직업/사회','일지':'배우자/내면','시지':'미래/결실',
  '연간':'외부환경','년간':'외부환경','월간':'직업/사회','일간':'나 자신','시간':'미래/표현'
};
var GUNGWI_SHORT = {
  '연지':'연주','년지':'연주','월지':'월주','일지':'일주','시지':'시주',
  '연간':'연주','년간':'연주','월간':'월주','일간':'일주','시간':'시주'
};
var SS_MEANING = {
  '비견':'동료·독립','겁재':'경쟁·승부','식신':'재능·여유','상관':'창의·반항',
  '편재':'큰 재물·사업','정재':'안정 재물·관리','편관':'강한 압박·카리스마','정관':'안정·질서',
  '편인':'영감·독창','정인':'학습·보호'
};
var SS_PERIOD = {
  '비견':'동료/독립의 시기','겁재':'경쟁/승부의 시기','식신':'재능/표현의 시기','상관':'창의/반항의 시기',
  '편재':'큰 재물/사업의 시기','정재':'안정 재물의 시기','편관':'강한 압박의 시기','정관':'안정/질서의 시기',
  '편인':'영감/독창의 시기','정인':'학습/보호의 시기'
};
var GROUP_HINT = {
  '비겁':'자기 에너지 강화, 독립·경쟁의 달',
  '식상':'표현·창작의 달, 새 아이디어',
  '재성':'재물·실리의 달, 수입 기회',
  '관성':'책임·압박의 달, 자기관리 필요',
  '인성':'학습·휴식의 달, 귀인 등장'
};

function tlSamhap(arr) {
  if (!arr || !arr.length) return '없음';
  return arr.map(function(h) {
    var pillars = (h.members||[]).map(function(m){return GUNGWI_SHORT[m.l]||m.l;});
    if ((h.members||[]).length === 3) {
      return pillars.join('·') + ' 에너지가 하나로 합쳐져 ' + h.oh + ' 에너지 폭발 (3/3 완성)';
    }
    return pillars.join('·') + '에 핵심 2/3 보유 → 특정 해에 채워지면 ' + h.oh + ' 에너지 폭발 (잠재력 큼)';
  }).join('; ');
}
function tlHap(cgArr, jjArr) {
  var out = [];
  (cgArr||[]).forEach(function(h){
    var pA=GUNGWI_SHORT[h.a.l]||h.a.l, pB=GUNGWI_SHORT[h.b.l]||h.b.l;
    out.push(pA+'↔'+pB+' 천간 에너지 자연 결합 → '+h.oh+' 에너지로 변환');
  });
  (jjArr||[]).forEach(function(h){
    var pA=GUNGWI_SHORT[h.a.l]||h.a.l, pB=GUNGWI_SHORT[h.b.l]||h.b.l;
    var gA=GUNGWI_MEANING[h.a.l]||'', gB=GUNGWI_MEANING[h.b.l]||'';
    out.push(pA+'('+gA+')↔'+pB+'('+gB+') 깊은 결합 → '+h.oh+' 에너지');
  });
  return out.length ? out.join(', ') : '없음';
}
function tlChung(arr) {
  if (!arr || !arr.length) return '없음';
  return arr.map(function(c){
    var pA=GUNGWI_SHORT[c.a.l]||c.a.l, pB=GUNGWI_SHORT[c.b.l]||c.b.l;
    var gA=GUNGWI_MEANING[c.a.l]||'', gB=GUNGWI_MEANING[c.b.l]||'';
    return pA+'('+gA+')↔'+pB+'('+gB+') 에너지 정면 대립';
  }).join(', ');
}
function tlCheonganChung(arr) {
  if (!arr || !arr.length) return '없음';
  return arr.map(function(c){
    var pA=GUNGWI_SHORT[c.a.l]||c.a.l, pB=GUNGWI_SHORT[c.b.l]||c.b.l;
    return pA+'↔'+pB+' 천간 에너지 방향 충돌';
  }).join(', ');
}
function tlHyung(arr) {
  if (!arr || !arr.length) return '없음';
  return arr.map(function(h){
    var pA=GUNGWI_SHORT[h.a.l]||h.a.l, pB=GUNGWI_SHORT[h.b.l]||h.b.l;
    return pA+'↔'+pB+' 에너지 마찰/갈등';
  }).join(', ');
}
function tlHae(arr) {
  if (!arr || !arr.length) return '없음';
  return arr.map(function(h){
    var pA=GUNGWI_SHORT[h.a.l]||h.a.l, pB=GUNGWI_SHORT[h.b.l]||h.b.l;
    return pA+'↔'+pB+' 은근한 방해/손해';
  }).join(', ');
}

function applyTermReplace(text) {
  if (!text) return text;
  var replaceKeys = Object.keys(TERM_REPLACE).sort(function(a, b) { return b.length - a.length; });
  replaceKeys.forEach(function(term) {
    var re = new RegExp(term + '(?!\\()(?![가-힣])', 'g');
    text = text.replace(re, TERM_REPLACE[term]);
  });
  return text;
}

function applyTermHints(text) {
  // 0단계: 신살 name(desc) → desc만 (TERM_REPLACE에 없는 신살용 fallback)
  text = text.replace(/([가-힣]{2,5}(?:살|귀인|성|록))\(([^)]+)\)/g, '$2');
  // 괄호 안 한자 + 본문 한자 strip (적천수/한자 표현 차단)
  text = text.replace(/\([一-鿿]+\)/g, '');
  text = text.replace(/[一-鿿]/g, '');
  // 1단계: TERM_REPLACE — 완전 치환 (term, 또는 term(괄호내용) 모두 자연어로)
  var replaceKeys = Object.keys(TERM_REPLACE).sort(function(a, b) { return b.length - a.length; });
  replaceKeys.forEach(function(term) {
    // term(...) 형태 — 괄호 포함 전체를 자연어로
    var reParen = new RegExp(term + '\\([^)]*\\)', 'g');
    text = text.replace(reParen, TERM_REPLACE[term]);
    // 단독 term — 뒤에 한국어가 안 붙는 경우만
    var reBare = new RegExp(term + '(?![가-힣])', 'g');
    text = text.replace(reBare, TERM_REPLACE[term]);
  });
  return text;
}

function buildUserPrompt(params, saju, gg, dw, mt, ti, strArr, mbtiObj) {
  var salTxt=saju.specialSals.map(function(s){return s.name+'('+s.desc+')';}).join(', ');
  var jjgTxt=saju.jjg.map(function(jj,i){return saju.P[i].l+': '+jj.map(function(j){return j.stem+'('+j.oh+')';}).join(' ');}).join(' | ');
  var ilju=saju.P[2].s+saju.P[2].b+'('+TGAN[saju.raw.dg]+JIJI[saju.raw.dj]+')';

  // Cognitive function names
  var cfArr=ti.cf.split('-');
  var cfN={Fi:'내면의 심판관(Fi)',Fe:'분위기 리더기(Fe)',Ne:'가능성 탐색기(Ne)',Ni:'미래 내비게이션(Ni)',Si:'추억 저장소(Si)',Se:'현장 체험러(Se)',Ti:'내장 논리회로(Ti)',Te:'실행력 엔진(Te)'};
  var strongCF=cfN[cfArr[0]]||cfArr[0];
  var weakCF=cfN[cfArr[3]]||cfArr[3];

  // Daewoon text — 지지/천간/한자 제거 (의미만)
  var dwTxt=dw.daewoons.map(function(d,i){
    var prefix=(dw.currentDWIdx===i?'\u2605현재 ':'  ');
    var jiJJG=JIJANGGAN_DATA[JIJI_KR.indexOf(d.ji)];
    var jiJeonggiSS=jiJJG?getSipsung(saju.raw.dg,jiJJG[jiJJG.length-1].g):'';
    var front=SS_PERIOD[d.ss]||(d.ss+'의 시기');
    var back=SS_PERIOD[jiJeonggiSS]||(jiJeonggiSS?jiJeonggiSS+'의 시기':'');
    return prefix+d.startAge+'~'+d.endAge+'세 — 전반('+d.startAge+'~'+(d.startAge+4)+'세): '+front+' / 후반('+(d.startAge+5)+'~'+d.endAge+'세): '+back;
  }).join('\n');
  var currentDW=dw.currentDWIdx>=0?dw.daewoons[dw.currentDWIdx]:null;
  var seTxt=dw.seun.map(function(s){return s.y+'년 '+(SS_MEANING[s.ss]||s.ss)+'의 해';}).join(', ');

  // Samjae (three calamities) calculation
  var samjaeTxt = buildSamjaeTxt(saju, dw);

  // Monthly fortune (wolun)
  var wolunResult = buildWolunData(saju, dw);
  var wolunTxt = wolunResult.wolunTxt;
  var wolunArr = wolunResult.wolunArr;
  var wolunYear = wolunResult.wolunYear;
  var wonJiArr = wolunResult.wonJiArr;

  // Relations (hap/chung/hyung)
  var rel=analysis.calcRelations(saju);
  var chungTxt=tlChung(rel.jijiChung);
  var hapTxt=tlHap(rel.cheonganHap, rel.jijiHap);
  var samhapTxt=tlSamhap(rel.jijiSamhap);
  var hyungTxt=tlHyung(rel.jijiHyung);
  var cheonganChungTxt=tlCheonganChung(rel.cheonganChung);
  var jijiHaeTxt=tlHae(rel.jijiHae);

  // Ilju data
  var iljuKey2=saju.P[2].s+saju.P[2].b;
  var iljuD=ILJU_DATA[iljuKey2]||{k:'독특한 기질',t:'',love:'',job:''};

  // Daewoon transition
  var nextDI=dw.currentDWIdx>=0?dw.currentDWIdx+1:-1;
  var nextDW=nextDI>=0&&nextDI<dw.daewoons.length?dw.daewoons[nextDI]:null;
  var transitionTxt='';
  if(nextDW){var transAge=nextDW.startAge;var transYr=(+params.y)+transAge-1;transitionTxt='\n다음 대운 전환: '+transAge+'세('+transYr+'년경) '+(SS_PERIOD[nextDW.ss]||nextDW.ss+'의 시기')+'로 전환';}
  var pastDWTxt='';
  if(dw.currentDWIdx>=1){pastDWTxt='\n과거 대운: ';for(var pi=0;pi<dw.currentDWIdx;pi++){var pd=dw.daewoons[pi];pastDWTxt+=pd.startAge+'~'+pd.endAge+'세 '+(SS_MEANING[pd.ss]||pd.ss)+', ';}pastDWTxt=pastDWTxt.replace(/, $/,'');}

  // Gongmang
  var gm=analysis.calcGongmang(saju);
  var gmTxt=gm.desc||'없음';

  // Jijanggan ratio
  var jjgRatio=analysis.calcJijangganRatio(saju);
  var jjgRatioTxt=jjgRatio.filter(function(r){return r;}).map(function(r){
    return r.pillar+' '+r.ji+'('+r.items.map(function(it){return it.role+'='+it.gan+it.oh+' '+it.ss+' '+it.pct+'%';}).join(', ')+')';
  }).join(' | ');

  // Enriched sinsal
  var salEnriched=analysis.enrichSinsal(saju);

  // Dynamic keywords
  var dynKW = analysis.generateDynamicKeywords(saju, gg, dw, gm, jjgRatio);
  var dynKWText = formatKeywordsForAI(dynKW);

  // Sinsal compact
  var salSimple = '';
  if (saju.specialSals && saju.specialSals.length > 0) {
    salSimple = saju.specialSals.map(function(s){ return s.name+'('+s.desc+')'; }).join(', ');
  }
  var extraSals = analysis.calcExtraSinsal(saju);
  if (extraSals.length > 0) {
    var existNames = salSimple.split(', ').map(function(s){return s.split('(')[0];});
    extraSals.forEach(function(es){
      if (existNames.indexOf(es.name) < 0) {
        salSimple += (salSimple ? ', ' : '') + es.name+'('+es.desc+')';
      }
    });
  }

  // Johu/yongshin text
  var johuTxt = '';
  if(gg.johuDesc) johuTxt = '\n- 조후: '+gg.seasonName+' · '+gg.johuDesc;
  else if(gg.seasonName) johuTxt = '\n- 계절: '+gg.seasonName+(gg.deukryeong?' · 일간이 월지에서 힘을 얻음(득령)':' · 일간이 월지에서 힘을 잃음(실령)');

  // DW/SE vs wonkuk analysis
  var dwSeAnalysis = analysis.analyzeDWSEvsWonkuk(saju, dw);
  var dwWonTxt = '';
  if(dwSeAnalysis.daewoon.length > 0){
    dwWonTxt = '\n\n## 대운 vs 원국 참고\n';
    dwSeAnalysis.daewoon.forEach(function(d){
      dwWonTxt += '- '+d.type+': '+d.desc+' (영향: '+d.impact+')\n';
    });
  }
  var seWonTxt = '';
  if(dwSeAnalysis.seun1.length > 0){
    seWonTxt = '\n## '+dw.seun[0].y+'년 세운 vs 원국 참고\n';
    dwSeAnalysis.seun1.forEach(function(d){
      seWonTxt += '- '+d.type+': '+d.desc+' (영향: '+(d.impact||'전반적')+')\n';
    });
  }
  if(dwSeAnalysis.seun2.length > 0){
    seWonTxt += '\n## '+dw.seun[1].y+'년 세운 vs 원국 관계 (내년)\n';
    dwSeAnalysis.seun2.forEach(function(d){
      seWonTxt += '- '+d.type+': '+d.desc+' (영향: '+(d.impact||'전반적')+')\n';
    });
  }
  if(dwSeAnalysis.dwSeConflict.length > 0){
    seWonTxt += '\n⚠️ '+dwSeAnalysis.dwSeConflict.join(', ')+'\n';
  }

  // Hap-chung priority
  var hapChungResolved = analysis.resolveHapChungPriority(rel);
  var hapChungTxt = '';
  if(hapChungResolved.summary){
    hapChungTxt = '\n- 합충우선순위: '+hapChungResolved.summary;
  }

  // Pagyeok info
  var pagyeokTxt = '';
  if(gg.pagyeokInfo){
    pagyeokTxt = '\n- ⚠️ 파격: '+gg.pagyeokInfo;
  }

  // True solar time info
  var trueSolarTxt = '';
  if(saju.trueSolarApplied){
    trueSolarTxt = ' (진태양시 보정: '+(saju.trueSolarMin>0?'+':'')+saju.trueSolarMin+'분, 출생지: '+params.city+')';
  }

  // Level A: interpretation context data
  var gungwiCtx = analysis.buildGungwiContext(saju, gg);
  var sinsalStory = analysis.buildSinsalStory(saju);
  var yearHL = analysis.buildYearHighlight(dwSeAnalysis, dw, wolunArr, wonJiArr);

  // Napeum story
  var napeumStory = '';
  if (gg.napeumText) {
    var napeumName = gg.napeumText.split('(')[0].trim();
    if (NAPEUM_STORY[napeumName]) {
      napeumStory = '\n납음 스토리: ' + gg.napeumText + ' → ' + NAPEUM_STORY[napeumName];
    }
  }

  // Persona (month-gan vs day-gan)
  var personaTxt = '';
  var monthGanSS = saju.ss[1] ? saju.ss[1].ss : '';
  if (monthGanSS && SS_CONTEXT[monthGanSS]) {
    personaTxt = '\n★사회적 페르소나(월간↔일간): 월간=' + saju.ss[1].stem +
      '(' + monthGanSS + ') → 세상에 보여주는 모습: ' + SS_CONTEXT[monthGanSS].general;
    if (monthGanSS === saju.ss[2].ss) {
      personaTxt += '\n  ⚡ 월간=일간 동일! 가면을 안 쓰는 사람. 겉과 속이 같음. 진정성이 강점이자 약점.';
    }
  }

  // Level A: context section assembly — DISABLED (테스트: 궁위/페르소나/납음/신살스토리/올해핵심 OFF)
  // var contextSection = '\n\n## 해석 맥락 (참고용)\n';
  // if (gungwiCtx.spouse) contextSection += gungwiCtx.spouse + '\n';
  // if (gungwiCtx.career) contextSection += gungwiCtx.career + '\n';
  // if (gungwiCtx.child) contextSection += gungwiCtx.child + '\n';
  // if (gungwiCtx.outer) contextSection += gungwiCtx.outer + '\n';
  // if (personaTxt) contextSection += personaTxt + '\n';
  // if (napeumStory) contextSection += napeumStory + '\n';
  // contextSection += '\n### 신살 참고\n';
  // contextSection += sinsalStory || '특별한 신살 없음';
  // contextSection += '\n\n### 올해 핵심 사건\n';
  // contextSection += yearHL.main;
  // if (yearHL.hotMonths) contextSection += '\n핵심 달:\n' + yearHL.hotMonths;

  // (0) Pattern text — 미리 생성
  var patternBlock = '';
  try {
    var userTags = patternEngine.buildUserTags(saju, gg, dw, mt, params.mbtiIntensities);
    var patternText = patternMatcher.buildPatternPrompt('premium', userTags, { showScores: true });
    if (patternText) {
      patternBlock = '\n\n## ★★ 교차 패턴 — 풀이의 뼈대 ★★\n' +
        '각 카드에서 아래 패턴 4개를 골라 _blueprint에서 "이 사람에게 왜 해당되는지" 한 줄로 변환하세요.\n' +
        '변환한 문장이 본문의 뼈대가 됩니다. 교차해설(cross)을 그대로 옮기지 말고 이 사람의 데이터에 맞게 바꾸세요.\n\n' +
        patternText;
    }
  } catch(e) { console.warn('[MBTS] 패턴 생성 실패:', e); }

  // ★★★ THE MASSIVE USR VARIABLE — copied exactly from runSajuAnalysis ★★★
  var usr='## 의뢰인\n- 생년월일시: '+params.y+'년 '+params.m+'월 '+params.d+'일 '+(params.h?params.h+'시':'시간미상')+trueSolarTxt+'\n- 성별: '+params.gender+' · 한국나이 '+dw.currentAge+'세\n- MBTI: '+mt+' ('+ti.n+')'+(params.h?'':'\n\n⚠️ 시간 미상 사주입니다. 시주(時柱) 기반 해석(자녀운, 말년운, 시지 궁위, 시지 합충)은 절대 하지 마세요. 년·월·일주만으로 풀이하세요. 항목 수는 10~12개로 조정하세요.')+'\n- 인지기능 스택: '+ti.cf+' (가장 강한: '+strongCF+' / 가장 약한: '+weakCF+')\n- 각 축: '+strArr.join(', ')+ patternBlock +'\n\n## MBTI 강도별 행동 프로파일\n'+(function(){var m=miAllParam(params.mbtiChoices, params.mbtiIntensities);var axes=['E/I','S/N','T/F','J/P'];var labels=[strArr[0],strArr[1],strArr[2],strArr[3]];return axes.map(function(a,i){return '- '+labels[i]+': '+m[i].trait+'\n  연애: '+m[i].love+'\n  직업: '+m[i].work+'\n  번아웃: '+m[i].burn;}).join('\n');})()+'\n\n## 사주 원국 (절기: '+saju.currentJeolgi+')\n- 사주: '+saju.P.map(function(p){return p.l+' '+p.s+p.b;}).join(' | ')+'\n- 일주: '+ilju+' · 일간: '+saju.dm+'('+saju.dmEl+')\n- 천간십성: '+saju.ss.map(function(s){return s.pillar+' '+s.stem+'('+s.ss+')';}).join(', ')+'\n- 궁위십성(지지정기 기준): '+saju.jiSS.map(function(j){return j.pillar+' '+j.branch+'='+j.ss+'('+j.gungwi+')';}).join(' | ')+'\n- 오행(표면 8자): 목='+saju.el['목']+' 화='+saju.el['화']+' 토='+saju.el['토']+' 금='+saju.el['금']+' 수='+saju.el['수']+'\n- 오행(지장간포함): 목='+saju.elFull['목']+' 화='+saju.elFull['화']+' 토='+saju.elFull['토']+' 금='+saju.elFull['금']+' 수='+saju.elFull['수']+(saju.hiddenOh.length>0?'\n  → 표면상 없지만 지장간에 숨어있는 오행: '+saju.hiddenOh.join(',')+' (겉으로 안 보이지만 속에 잠재력으로 존재)':'')+'\n- 12운성: '+saju.P.map(function(p,i){return p.l+'='+(saju.uns[i]||'미상');}).join(', ')+'\n- 합: '+hapTxt+' | 삼합: '+samhapTxt+'\n- 충: '+chungTxt+' | 천간충: '+cheonganChungTxt+'\n- 형: '+hyungTxt+' | 해: '+jijiHaeTxt+hapChungTxt+'\n'+(saju.amhap.length>0?'- 숨겨진 결합: '+saju.amhap.map(function(a){var gk=a.gungwi?a.gungwi+'지':'';var gm=GUNGWI_MEANING[gk]||a.gungwi||'';var gl=GUNGWI_SHORT[gk]||(a.gungwi?a.gungwi+'주':'');return (gl?gl+'('+gm+')':'')+' 보이지 않는 인연 → '+a.hapOh+' 에너지';}).join(', ')+'\n':'')+'\n※ 합과 충이 동시에 존재할 때: 인접한 합이 충을 해소하는지(탐합망충), 충이 합을 깨뜨리는지 판단하여 유기적으로 해석할 것\n\n## 격국 분석\n- 격국: '+gg.gyeokgukName+' ('+gg.gyeokgukBasis+')\n  → '+gg.gyeokgukDesc+'\n'+(gg.isJonggyeok?'  ⚠️ 종격(從格) 사주! 용신 방향이 일반 사주와 정반대입니다. 강한 쪽을 따라가야 합니다.\n':'')+(gg.isHwakyeok?'  ⚠️ 화격(化格) 사주! 일간이 본래 오행을 버리고 합화 오행으로 변함.\n':'')+pagyeokTxt+'\n- 납음: '+(gg.napeumText||'정보없음')+'\n- 십성비중: 비겁='+gg.cnt['비겁'].toFixed(1)+' 식상='+gg.cnt['식상'].toFixed(1)+' 재성='+gg.cnt['재성'].toFixed(1)+' 관성='+gg.cnt['관성'].toFixed(1)+' 인성='+gg.cnt['인성'].toFixed(1)+'\n- 일간 강도: '+gg.strengthGrade+' '+gg.strengthScore+'점 (자기편='+gg.selfStr.toFixed(1)+' vs 상대편='+gg.otherStr.toFixed(1)+')'+(gg.deukryeong?' [득령]':' [실령]')+johuTxt+'\n- 강한: '+gg.dominant[0]+'('+gg.dominant[1].toFixed(1)+') 약한: '+gg.weak[0]+'('+gg.weak[1].toFixed(1)+')\n- 부족오행: '+(saju.lackFull.length>0?saju.lackFull.join(','):'없음')+'\n- 용신: '+gg.yongshin+' ['+gg.yongshinType+'용신]'+(gg.johuYongshin&&gg.yongshinType!=='조후'?' · 조후참고: '+gg.johuYongshin:'')+'\n- 오행흐름: '+gg.flowSummary+'\n\n## 참고 힌트\n'+dynKWText+'\n\n## 대운 흐름 ('+dw.direction+', '+dw.daewoonAge+'세 시작)\n'+dwTxt+'\n현재 대운: '+(currentDW?(SS_PERIOD[currentDW.ss]||currentDW.ss+'의 시기')+' ('+currentDW.startAge+'~'+currentDW.endAge+'세)':'대운 전')+pastDWTxt+transitionTxt+'\n세운: '+seTxt+'\n- 삼재: '+(samjaeTxt||'계산불가')+dwWonTxt+seWonTxt+'\n\n## '+wolunYear+'년 월운 (월별 운세)\n'+wolunTxt+'\n\n## 신살 (참고만 할 것, 풀이에 직접 인용 금지)\n'+(salSimple||'없음')+'\n- 공망: '+gmTxt+'\n\nJSON으로 출력하세요.';

  // (1.5) 납음 스토리 단독 주입 — 인생 한줄 마무리 카드 전용
  if (napeumStory) usr = usr.replace('JSON으로 출력하세요.', '\n## 납음 (인생 한줄 마무리 전용)\n' + napeumStory + '\n\nJSON으로 출력하세요.');

  // (2) AI 해석 맥락 (contextSection) — DISABLED (테스트)
  // usr = usr.replace('JSON으로 출력하세요.',
  //   contextSection +
  //   '\n\nJSON으로 출력하세요.');

  // (3) MBTS 포인트 주입 — DISABLED (테스트)
  /*
  try {
    if (_mbtsPoints) {
      var _mbtsIlju = saju.P[2].s + saju.P[2].b;
      var _mbtsKey = _mbtsIlju + '_' + mt;
      var _mbtsEntry = _mbtsPoints[_mbtsKey];
      if (_mbtsEntry && _mbtsEntry.text) {
        var _mbtsBroken = _mbtsEntry.text.indexOf('�') >= 0;
        if (!_mbtsBroken && _mbtsEntry.tags) {
          for (var _mbtsTi = 0; _mbtsTi < _mbtsEntry.tags.length; _mbtsTi++) {
            if (_mbtsEntry.tags[_mbtsTi].indexOf('�') >= 0) { _mbtsBroken = true; break; }
          }
        }
        if (_mbtsBroken) {
          console.warn('[MBTS] 깨진 entry skip:', _mbtsKey);
        } else {
          var _mbtsTags = (_mbtsEntry.tags && _mbtsEntry.tags.length > 0) ? '\n\n태그: ' + _mbtsEntry.tags.join(', ') : '';
          usr = usr.replace('JSON으로 출력하세요.',
            '\n\n## MBTS 포인트 (' + _mbtsIlju + '일주 × ' + mt + ')\n' +
            _mbtsEntry.text +
            _mbtsTags +
            '\n\nJSON으로 출력하세요.');
        }
      }
    }
  } catch(e) { console.warn('[MBTS] MBTS 포인트 주입 실패:', e); }
  */

  // (4) Theory deep data injection — 마지막 (JSON 직전)
  try {
    var theoryMBTI = _mbtiTheory.MT_buildFullContext(mt, params.mbtiIntensities, dw.currentAge);
    var theorySaju = _sjTheory.SJ_buildFullContext(saju, gg, dw, (params.gender === '남성' || params.gender === '남') ? '남' : '여');
    if (theoryMBTI || theorySaju) {
      usr = usr.replace('JSON으로 출력하세요.',
        '\n\n## MBTI 이론 참고 (1군·2군으로 부족할 때만)\n' + theoryMBTI +
        '\n\n## 사주 이론 참고 (1군·2군으로 부족할 때만)\n' + theorySaju +
        '\n\nJSON으로 출력하세요.');
    }
  } catch(e) { console.warn('[MBTS] Theory 주입 실패:', e); }

  usr = applyTermHints(usr);
  return usr;
}

// --- Helper: Samjae calculation ---
function buildSamjaeTxt(saju, dw) {
  var samjaeGroups = [
    {group:[8,0,4], disaster:[2,3,4]},
    {group:[2,6,10], disaster:[5,6,7]},
    {group:[5,9,1], disaster:[11,0,1]},
    {group:[11,3,7], disaster:[8,9,10]}
  ];
  var birthJi = saju.raw.yj;
  var currentYear = new Date().getFullYear();
  var currentYearJi = ((currentYear + 8) % 12);
  var samjaeTxt = '';
  for (var si = 0; si < samjaeGroups.length; si++) {
    var sg = samjaeGroups[si];
    if (sg.group.indexOf(birthJi) >= 0) {
      var disasterJis = sg.disaster;
      for (var syr = 0; syr < 3; syr++) {
        var checkYearJi = ((currentYear + syr + 8) % 12);
        var disIdx = disasterJis.indexOf(checkYearJi);
        if (disIdx >= 0) {
          var samjaeNames = ['들삼재(시작)','눌삼재(절정)','날삼재(마무리)'];
          if (syr === 0) {
            var samjaeStatus = samjaeNames[disIdx];
            samjaeTxt = currentYear + '년 ' + samjaeStatus + ' — ' + JIJI_KR[disasterJis[0]]+JIJI_KR[disasterJis[1]]+JIJI_KR[disasterJis[2]]+'년 삼재 구간';
          } else if (syr === 1 && !samjaeTxt) {
            samjaeTxt = (currentYear+1) + '년부터 삼재 시작 예정 ('+JIJI_KR[disasterJis[0]]+JIJI_KR[disasterJis[1]]+JIJI_KR[disasterJis[2]]+'년)';
          }
        }
      }
      if (!samjaeTxt) {
        var nextSamjaeStart = disasterJis[0];
        var yearsUntil = ((nextSamjaeStart - currentYearJi) + 12) % 12;
        if (yearsUntil === 0) yearsUntil = 12;
        samjaeTxt = '현재 삼재 아님. 다음 삼재: ' + (currentYear + yearsUntil) + '년 시작';
      }
      break;
    }
  }
  return samjaeTxt;
}

// --- Helper: Monthly fortune (wolun) data ---
function buildWolunData(saju, dw) {
  var currentYear = new Date().getFullYear();
  var wolunYear = currentYear;
  var wolunYearGan = ((wolunYear + 6) % 10);
  var monthStartStem = ((wolunYearGan % 5) * 2 + 2) % 10;
  var monthNames = ['1월(인월)','2월(묘월)','3월(진월)','4월(사월)','5월(오월)','6월(미월)','7월(신월)','8월(유월)','9월(술월)','10월(해월)','11월(자월)','12월(축월)'];
  var monthBranches = [2,3,4,5,6,7,8,9,10,11,0,1];
  var dg = saju.raw.dg;
  var wolunArr = [];
  for (var wi = 0; wi < 12; wi++) {
    var wGan = (monthStartStem + wi) % 10;
    var wJi = monthBranches[wi];
    var wGanSS = getSipsung(dg, wGan);
    var wJiJJG = JIJANGGAN_DATA[wJi];
    var wJiJeonggi = wJiJJG[wJiJJG.length - 1].g;
    var wJiSS = getSipsung(dg, wJiJeonggi);
    var ssGroup = {'비견':'비겁','겁재':'비겁','식신':'식상','상관':'식상','편재':'재성','정재':'재성','편관':'관성','정관':'관성','편인':'인성','정인':'인성'};
    var wGroup = ssGroup[wGanSS] || wGanSS;
    var wolunHint = {
      '비겁':'자기에너지강화, 독립·경쟁의달, 주변과힘겨루기',
      '식상':'표현·창작의달, 말과글이잘풀림, 새아이디어',
      '재성':'재물·실리의달, 수입기회, 현실적성과',
      '관성':'책임·압박의달, 직장변화, 자기관리필요',
      '인성':'학습·휴식의달, 귀인등장, 내면성장'
    };
    wolunArr.push({
      month: monthNames[wi],
      gan: TGAN_KR[wGan], ji: JIJI_KR[wJi],
      ganSS: wGanSS, jiSS: wJiSS,
      group: wGroup,
      hint: wolunHint[wGroup] || ''
    });
  }
  // Wolun with wonkuk hap/chung analysis
  var WOLUN_CHUNG=[[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]];
  var WOLUN_YUKHAP=[[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]];
  var wonJiArr=[{v:saju.raw.yj,l:'년지'},{v:saju.raw.mj,l:'월지'},{v:saju.raw.dj,l:'일지'}];
  if(saju.raw.hj!=null)wonJiArr.push({v:saju.raw.hj,l:'시지'});
  var wGungwi={'년지':'외부환경','월지':'직업','일지':'배우자·건강','시지':'자녀'};
  var wolunTxt = wolunArr.map(function(w){
    var wJiIdx=JIJI_KR.indexOf(w.ji);
    var rels=[];
    wonJiArr.forEach(function(wj){
      var pillar=GUNGWI_SHORT[wj.l]||wj.l, gung=wGungwi[wj.l]||wj.l;
      WOLUN_CHUNG.forEach(function(cp){if((wJiIdx===cp[0]&&wj.v===cp[1])||(wJiIdx===cp[1]&&wj.v===cp[0]))rels.push(pillar+'('+gung+')과 에너지 충돌');});
      WOLUN_YUKHAP.forEach(function(yh){if((wJiIdx===yh[0]&&wj.v===yh[1])||(wJiIdx===yh[1]&&wj.v===yh[0]))rels.push(pillar+'('+gung+')과 에너지 결합');});
    });
    var relStr=rels.length>0?' | '+rels.join(', '):'';
    var groupHint = (typeof GROUP_HINT!=='undefined' && GROUP_HINT[w.group]) ? ' — '+GROUP_HINT[w.group] : '';
    var monthClean = w.month.replace(/\([^)]*\)/,'');
    return monthClean + ' → ' + (SS_MEANING[w.ganSS]||w.ganSS) + ' + ' + (SS_MEANING[w.jiSS]||w.jiSS) + ' ('+w.group+groupHint+')' + relStr;
  }).join('\n');
  return { wolunTxt: wolunTxt, wolunArr: wolunArr, wolunYear: wolunYear, wonJiArr: wonJiArr };
}

// --- Helper: format keywords for AI ---
function formatKeywordsForAI(kwObj) {
  if (!kwObj || typeof kwObj !== 'object') return '';
  var lines = [];
  Object.keys(kwObj).forEach(function(key) {
    var val = kwObj[key];
    if (Array.isArray(val)) {
      lines.push('- ' + key + ': ' + val.join(', '));
    } else if (typeof val === 'string') {
      lines.push('- ' + key + ': ' + val);
    }
  });
  return lines.join('\n');
}

module.exports = {
  buildUserPrompt: buildUserPrompt,
  buildSamjaeTxt: buildSamjaeTxt,
  buildWolunData: buildWolunData,
  formatKeywordsForAI: formatKeywordsForAI,
  applyTermReplace: applyTermReplace
};
