// lib/fallback-gunghap.js — AI failure local fallback for gunghap analysis
// 패턴 참고: lib/fallback.js의 mkFB.
// 사용처: app/api/gunghap-v2/route.js의 processJob catch 블록 — AI 실패 시
//        간단한 사주×MBTI 교차 정보로 12개 소주제 채워서 fallback 결과 생성.
'use strict';

var ghPrompt = require('./gunghap-prompt');
var GH_REL_CONFIG = ghPrompt.GH_REL_CONFIG;
var GH_CATEGORIES = ghPrompt.GH_CATEGORIES;

// 카테고리별 sub 분할 (gunghap-prompt.js의 GH_CAT_RANGES와 동일)
var GH_CAT_RANGES = {
  ssom: [4, 3, 3, 2],
  lover: [4, 3, 2, 3],
  colleague: [4, 3, 3, 2],
  friend: [4, 3, 3, 2]
};

// 오행 상생/상극/비화 관계
var SAENG_NEXT = { '목':'화', '화':'토', '토':'금', '금':'수', '수':'목' };
var GEUK_NEXT  = { '목':'토', '화':'금', '토':'수', '금':'목', '수':'화' };

function ohengRelation(ohA, ohB) {
  if (!ohA || !ohB) return { type: 'unknown', desc: '두 사람의 에너지가 만나는 지점이 있어요' };
  if (ohA === ohB) return { type: 'biwha', desc: '같은 ' + ohA + ' 기운을 공유해서 처음부터 익숙하고 편안한 사이' };
  if (SAENG_NEXT[ohA] === ohB) return { type: 'saengAB', desc: 'A의 ' + ohA + '이 B의 ' + ohB + '을 키워주는 자연스러운 상생 흐름' };
  if (SAENG_NEXT[ohB] === ohA) return { type: 'saengBA', desc: 'B의 ' + ohB + '이 A의 ' + ohA + '을 키워주는 자연스러운 상생 흐름' };
  if (GEUK_NEXT[ohA] === ohB)  return { type: 'geukAB', desc: 'A의 ' + ohA + '이 B의 ' + ohB + '을 조이는 긴장 — 서로를 단단히 다듬는 관계' };
  if (GEUK_NEXT[ohB] === ohA)  return { type: 'geukBA', desc: 'B의 ' + ohB + '이 A의 ' + ohA + '을 조이는 긴장 — 서로를 단단히 다듬는 관계' };
  return { type: 'mixed', desc: ohA + '과 ' + ohB + '의 에너지가 만나 독특한 결을 만드는 사이' };
}

// MBTI 4축 비교 한 줄 요약
function mbtiNote(a, b) {
  if (!a || !b || a.length !== 4 || b.length !== 4) return '두 MBTI가 만나 서로의 시각을 넓혀줍니다.';
  var parts = [];
  parts.push(a[0] === b[0] ? '에너지 방향(' + a[0] + ')이 같아 함께 있는 리듬이 자연스러움'
                            : '한쪽이 ' + a[0] + ', 한쪽이 ' + b[0] + '이라 에너지 균형이 잡힘');
  parts.push(a[2] === b[2] ? '판단 기준(' + a[2] + ')이 같아 갈등이 적음'
                            : '한쪽은 ' + a[2] + ', 한쪽은 ' + b[2] + '라 서로의 관점을 배움');
  parts.push(a[3] === b[3] ? '생활 패턴(' + a[3] + ')이 닮아 일상 합이 좋음'
                            : '한쪽은 ' + a[3] + ', 한쪽은 ' + b[3] + '라 서로 보완');
  return parts.join('. ') + '.';
}

// 오행 보완 (서로 부족한 것을 채워주는가)
function supplementNote(sajuA, sajuB) {
  if (!sajuA || !sajuA.el || !sajuB || !sajuB.el) return '';
  var elNames = ['목','화','토','금','수'];
  var aLack = elNames.filter(function(e) { return (sajuA.el[e] || 0) <= 1; });
  var bLack = elNames.filter(function(e) { return (sajuB.el[e] || 0) <= 1; });
  var aSup = aLack.filter(function(e) { return (sajuB.el[e] || 0) >= 2; });
  var bSup = bLack.filter(function(e) { return (sajuA.el[e] || 0) >= 2; });
  var out = '';
  if (aSup.length > 0) out += 'B가 A에게 부족한 ' + aSup.join('·') + ' 기운을 채워줍니다. ';
  if (bSup.length > 0) out += 'A가 B에게 부족한 ' + bSup.join('·') + ' 기운을 채워줍니다. ';
  if (!out) out = '두 사람의 오행 분포가 비슷해서 공감대가 잘 형성됩니다. ';
  return out;
}

// 소주제별 본문 생성 (3~4문장 + 💊 팁)
function buildSubBody(h, idx, ctx) {
  var p1 = '두 사람은 ' + ctx.iljuA + '일주(' + ctx.ohA + ')와 ' + ctx.iljuB + '일주(' + ctx.ohB + ')의 만남이에요. ' + ctx.rel.desc + '.';
  var p2 = 'MBTI로 보면 ' + ctx.mtA + '와 ' + ctx.mtB + '의 조합. ' + ctx.mbtiText;
  var p3 = ctx.supplementText;

  var p4;
  if (h.indexOf('한 줄') >= 0) {
    p4 = ctx.ohA + '과 ' + ctx.ohB + ', 두 빛이 만나 새로운 결을 만들어가는 두 사람이에요.';
  } else if (h.indexOf('맞춰') >= 0 || h.indexOf('역효과') >= 0 || h.indexOf('싫어') >= 0 || h.indexOf('민감') >= 0) {
    p4 = '서로 다른 점은 약점이 아니라 서로를 다듬는 자극이 될 수 있어요. 차이를 인정하는 데서 안정감이 옵니다.';
  } else if (h.indexOf('성장') >= 0 || h.indexOf('미래') >= 0 || h.indexOf('결혼') >= 0 || h.indexOf('사귀려면') >= 0) {
    p4 = '오래 함께할수록 서로의 결이 자연스럽게 맞춰져요. 지금의 작은 차이가 시간 속에서 깊이로 바뀝니다.';
  } else if (h.indexOf('끌림') >= 0 || h.indexOf('시너지') >= 0 || h.indexOf('잘 맞') >= 0) {
    p4 = '서로에게 끌리는 이유는 바로 이 부분 — 자기 안에 없는 결을 상대가 가지고 있기 때문이에요.';
  } else if (h.indexOf('성격') >= 0 || h.indexOf('스타일') >= 0) {
    p4 = '겉으로 드러나는 모습과 속의 깊은 결이 함께 작동해서, 시간이 갈수록 입체적으로 보이는 사람이에요.';
  } else {
    p4 = '두 사람의 이 부분은 시간이 지나면서 더 선명하게 드러날 거예요.';
  }

  var tips = [
    '💊 오늘 상대에게 짧은 안부 메시지 한 줄 보내보세요.',
    '💡 일주일에 한 번은 둘만의 시간을 만들어보세요.',
    '🌿 서로의 차이를 인정하는 한마디 — "그렇구나"부터 시작해보세요.',
    '☕ 같은 공간에서 각자의 일을 하는 시간도 관계를 키웁니다.',
    '🌸 작은 약속을 하나 만들어 매주 지켜보세요. 신뢰는 거기서 자랍니다.'
  ];
  var tip = tips[idx % tips.length];

  return p1 + '\n\n' + p2 + '\n\n' + p3 + p4 + '\n\n' + tip;
}

// 메인 함수
function mkGunghapFB(sajuA, sajuB, mtA, mtB, ggA, ggB, relType) {
  relType = relType || 'lover';
  var cfg = GH_REL_CONFIG[relType];
  if (!cfg || !cfg.subs || cfg.subs.length === 0) return null;

  var catInfo = GH_CATEGORIES[relType] || { label: '궁합', categories: ['전체'] };
  var ranges = GH_CAT_RANGES[relType] || [cfg.subs.length];
  var catNames = catInfo.categories || ['전체'];

  var iljuA = sajuA && sajuA.P && sajuA.P[2] ? (sajuA.P[2].s + sajuA.P[2].b) : '?일주';
  var iljuB = sajuB && sajuB.P && sajuB.P[2] ? (sajuB.P[2].s + sajuB.P[2].b) : '?일주';
  var ohA = (sajuA && sajuA.dmEl) || '';
  var ohB = (sajuB && sajuB.dmEl) || '';
  var rel = ohengRelation(ohA, ohB);
  var mbtiText = mbtiNote(mtA, mtB);
  var supplementText = supplementNote(sajuA, sajuB);

  var ctx = {
    iljuA: iljuA, iljuB: iljuB, ohA: ohA, ohB: ohB,
    rel: rel, mbtiText: mbtiText, supplementText: supplementText,
    mtA: mtA, mtB: mtB
  };

  // 카테고리별 sub 분할
  var categories = [];
  var idx = 0;
  for (var c = 0; c < catNames.length; c++) {
    var subsInCat = [];
    var count = ranges[c] || 0;
    for (var s = 0; s < count; s++) {
      if (idx >= cfg.subs.length) break;
      var subDef = cfg.subs[idx];
      subsInCat.push({ h: subDef.h, b: buildSubBody(subDef.h, idx, ctx) });
      idx++;
    }
    if (subsInCat.length > 0) {
      categories.push({ n: catNames[c], subs: subsInCat });
    }
  }

  // 남은 sub가 있으면 마지막 카테고리에 합치기
  while (idx < cfg.subs.length) {
    var subDef2 = cfg.subs[idx];
    categories[categories.length - 1].subs.push({
      h: subDef2.h, b: buildSubBody(subDef2.h, idx, ctx)
    });
    idx++;
  }

  // totalScore: ggA/ggB 점수 기반 추정 (없으면 70)
  var totalScore = 70;
  // 단순 추정: 비화면 75, 상생이면 78, 상극이면 65
  if (rel.type === 'biwha') totalScore = 75;
  else if (rel.type === 'saengAB' || rel.type === 'saengBA') totalScore = 78;
  else if (rel.type === 'geukAB' || rel.type === 'geukBA') totalScore = 65;

  var quote = ohA && ohB
    ? ohA + '과 ' + ohB + '의 기운이 만나 ' + (rel.type === 'biwha' ? '잔잔한 호수처럼 닮은 풍경'
        : rel.type.indexOf('saeng') >= 0 ? '서로를 키우는 흐름'
        : rel.type.indexOf('geuk') >= 0 ? '서로를 다듬는 긴장 속의 균형'
        : '독특한 결의 풍경') + '을 그려냅니다'
    : '두 사람의 사주 분위기가 만나는 풍경';

  return {
    title: iljuA + '일주×' + iljuB + '일주 · ' + (mtA || '?') + '×' + (mtB || '?') + ' 궁합',
    quote: quote,
    totalScore: totalScore,
    categories: categories
  };
}

module.exports = { mkGunghapFB: mkGunghapFB };
