// lib/pattern-matcher.js — pattern matching engine (NEW, per MBTS 최종 공식)
// Philosophy: "유저한테 맞는 게 왕, 우리 등급은 참고"
//
// This module is the authoritative matching engine. pattern-data.js still exports
// its legacy matchPatterns/buildPatternPrompt for backward compat (window.* in the
// browser), but all SERVER-side prompt construction now flows through this file.
'use strict';

var patternData = require('./pattern-data');
var MBTS_PATTERNS = patternData.MBTS_PATTERNS;

// ══════════════════════════════════════════════
// SUB_ALIAS — GH_REL_CONFIG의 긴 sub 이름을
// pattern-data.js의 짧은 sub 이름으로 매핑.
// 매칭 시 lookup, 출력 시 긴 이름 그대로 사용.
// ══════════════════════════════════════════════
var SUB_ALIAS = {
  ssom: {
    '이 사람의 연애 스타일': '연애 스타일',
    '이 사람이 좋아하는 타입': '좋아하는 타입',
    '이 사람이 싫어하는 타입': '싫어하는 타입',
    '우리 사이의 끌림': '끌림',
    '서로 맞춰가야 할 부분': '맞춰가야 할 부분',
    '역효과 나는 행동': '역효과 행동',
    '이 사람과 사귀려면': '사귀려면',
    '사귀면 어떤 커플이 되는지': '어떤 커플'
  },
  lover: {
    '이 사람의 연애 스타일': '연애 스타일',
    '이 사람이 연인에게 바라는 것': '바라는 것',
    '이 사람이 연인에게 민감한 부분': '민감한 부분',
    '서로 맞춰가야 할 부분': '맞춰가야 할 부분',
    '싸웠을 때 화해법': '화해법',
    '우리에게 맞는 소통법': '소통법',
    '결혼하면 어떤 부부가 되는지': '결혼하면'
  },
  colleague: {
    '이 사람의 업무 스타일': '업무 스타일',
    '이 사람이 선호하는 업무 방식': '선호 방식',
    '이 사람이 싫어하는 업무 방식': '싫어하는 방식',
    '같이 일할 때 시너지': '시너지',
    '같이 일할 때 맞춰가야 할 부분': '맞춰가야 할 부분',
    '이 사람과 대화할 때 팁': '대화 팁',
    '이 사람에게 인정받는 법': '인정받는 법',
    '트러블 났을 때 대처법': '트러블 대처',
    '이 사람과 같이 성장하려면': '같이 성장'
  },
  friend: {
    '이 사람의 우정 스타일': '우정 스타일',
    '이 사람이 친구에게 바라는 것': '바라는 것',
    '이 사람이 친구에게 서운해하는 것': '서운해하는 것',
    '서로 맞춰가야 할 부분': '맞춰가야 할 부분',
    '이 사람의 감정 표현 방식': '감정 표현',
    '이 사람과 같이 하면 잘 되는 것': '같이 잘 되는 것',
    '멀어졌을 때 회복법': '회복법',
    '이 사람과 같이 성장하려면': '같이 성장'
  }
};

// ══════════════════════════════════════════════
// SUPER_GROUP — 의미 단위로 묶인 sub 그룹.
// 같은 그룹 내 sub는 매칭 시 통합 풀로 검색.
// ══════════════════════════════════════════════
var SUPER_GROUP = {
  '1_성격':           ['나의 성격','이 사람의 성격'],
  '2A_연애우정스타일': ['연애 스타일','우정 스타일'],
  '2B_업무스타일':    ['업무 스타일'],
  '3_바라는것':       ['잘 맞는 타입','좋아하는 타입','바라는 것','선호 방식'],
  '4_싫어하는것':     ['연애 지뢰','싫어하는 타입','민감한 부분','싫어하는 방식','서운해하는 것'],
  '5_상대눈에비친나': ['남들이 보는 나','상대 눈에 비친 나'],
  '6_끌림시너지':     ['나의 장점','끌림','잘 맞는 부분','시너지','같이 잘 되는 것'],
  '7_맞춰가야할부분': ['고쳐야 할 점','맞춰가야 할 부분'],
  '8_소통접근화해':   ['통하는 접근법','역효과 행동','소통법','화해법','대화 팁','인정받는 법','트러블 대처','감정 표현','회복법'],
  '9A_타이밍미래':    ['기회의 시기','대운 흐름','올해 조언','올해 키워드','사귀려면','어떤 커플','결혼까지 가려면','결혼하면'],
  '9B_성장적성':      ['맞춤 재물 쌓는 법','직장 적성','같이 성장'],
  '10_한줄요약':      ['인생 한줄 마무리','한 줄 요약']
};

var SUB_TO_GROUP = {};
(function() {
  for (var g in SUPER_GROUP) {
    for (var i = 0; i < SUPER_GROUP[g].length; i++) {
      SUB_TO_GROUP[SUPER_GROUP[g][i]] = g;
    }
  }
})();

var CAT_COMPAT = {
  ssom:      ['ssom','lover','friend'],
  lover:     ['ssom','lover','friend'],
  colleague: ['colleague','friend'],
  friend:    ['ssom','lover','colleague','friend']
};

function resolveSubAlias(category, subject) {
  if (SUB_ALIAS[category] && SUB_ALIAS[category][subject]) {
    return SUB_ALIAS[category][subject];
  }
  return subject;
}

// ══════════════════════════════════════════════
// Constants (per spec)
// ══════════════════════════════════════════════

var TIER_BONUS = { S: 2.0, A: 1.5, B: 1.0, C: 0.8 };
var PRECISION_BONUS = { 1: 0.6, 2: 0.8 }; // 3+ defaults to 1.0
var GENERIC_RELEVANCE = 20;
var DEFAULT_IMPACT = 3;
var TIER_ORDER = { S: 4, A: 3, B: 2, C: 1 };

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

// Generic tags (uses:*, ref:*) have no discriminative power and are excluded from
// relevance calculations.
function isSpecificTag(tag) {
  if (typeof tag !== 'string') return false;
  return tag.indexOf('uses:') !== 0 && tag.indexOf('ref:') !== 0 && tag.indexOf('pillar:') !== 0;
}

// Tag classification helper — splits a pattern's tags into specific vs generic.
function classifyTags(tags) {
  var specific = [];
  if (!tags) return specific;
  for (var i = 0; i < tags.length; i++) {
    if (isSpecificTag(tags[i])) specific.push(tags[i]);
  }
  return specific;
}

// ══════════════════════════════════════════════
// scorePattern — finalScore per spec
// ══════════════════════════════════════════════
//
// Returns:
//   -1  if pattern is TRASH (must be excluded)
//    0  if specific-tagged pattern has zero overlap (fails prerequisite)
//   >0  otherwise — finalScore = relevance × (1 + impact × tierBonus × 0.1)
function scorePattern(p, userSet) {
  if (!p) return 0;
  if (p.tier === 'TRASH') return -1;

  var impact = (typeof p.impact === 'number' && p.impact > 0) ? p.impact : DEFAULT_IMPACT;
  var tierBonus = TIER_BONUS[p.tier] || 1.0;

  var specificTags = classifyTags(p.tags);
  var relevance;

  if (specificTags.length === 0) {
    // Generic pattern — fixed relevance
    relevance = GENERIC_RELEVANCE;
  } else {
    var overlap = 0;
    for (var j = 0; j < specificTags.length; j++) {
      if (userSet[specificTags[j]]) overlap++;
    }
    if (overlap === 0) return 0;

    var rawRelevance = (overlap / specificTags.length) * 100;
    var precision = PRECISION_BONUS[specificTags.length] || 1.0;
    relevance = rawRelevance * precision;
  }

  return relevance * (1 + impact * tierBonus * 0.1);
}

// ══════════════════════════════════════════════
// matchPatterns — finalScore-sorted top N for a subject
// ══════════════════════════════════════════════
//
// Returns: Array<{ pattern, score, source }>
//   score  = finalScore from scorePattern
//   source = 'subject' (primary match) | 'generic' (fallback fill)
//
// Fallback: if the subject yields < limit patterns, fill from GENERIC patterns
// in the SAME category only — never invade other subjects' patterns.
function matchPatterns(category, subject, userTags, limit) {
  limit = limit || 5;

  var userSet = {};
  if (userTags) {
    for (var i = 0; i < userTags.length; i++) {
      if (isSpecificTag(userTags[i])) userSet[userTags[i]] = true;
    }
  }

  var results = [];

  // ── 궁합 카테고리: 그룹 기반 통합 검색 + CAT_COMPAT 필터 ──
  var isGunghap = (category === 'ssom' || category === 'lover' || category === 'colleague' || category === 'friend');
  if (isGunghap) {
    var aliasedSub = resolveSubAlias(category, subject);
    var groupName = SUB_TO_GROUP[aliasedSub];
    if (groupName && SUPER_GROUP[groupName]) {
      var groupSubs = SUPER_GROUP[groupName];
      var compatCats = CAT_COMPAT[category] || [category];
      for (var ci = 0; ci < compatCats.length; ci++) {
        var cat = compatCats[ci];
        if (cat === 'premium') continue;
        if (!MBTS_PATTERNS[cat]) continue;
        for (var gi = 0; gi < groupSubs.length; gi++) {
          var gsub = groupSubs[gi];
          if (!MBTS_PATTERNS[cat][gsub]) continue;
          var glist = MBTS_PATTERNS[cat][gsub];
          for (var gpi = 0; gpi < glist.length; gpi++) {
            var gp = glist[gpi];
            var gs = scorePattern(gp, userSet);
            if (gs > 0) results.push({ pattern: gp, score: gs, source: 'group' });
          }
        }
      }
      results.sort(compareMatchResults);
      results = dedupeById(results);
      return results.slice(0, limit);
    }
    // 그룹을 못 찾으면 fallback: 기존 단일 서랍 로직
  }

  // Primary pass: the requested subject
  if (MBTS_PATTERNS[category] && MBTS_PATTERNS[category][resolveSubAlias(category, subject)]) {
    var list = MBTS_PATTERNS[category][resolveSubAlias(category, subject)];
    for (var pi = 0; pi < list.length; pi++) {
      var p = list[pi];
      var s = scorePattern(p, userSet);
      if (s > 0) results.push({ pattern: p, score: s, source: 'subject' });
    }
  }

  // Sort by finalScore (spec tiebreaker: tier → impact)
  results.sort(compareMatchResults);

  // Dedupe by id (defensive — shouldn't happen in single subject, but guard)
  results = dedupeById(results);

  // Fallback: if fewer than `limit`, fill from generic patterns in same category.
  // "다른 소주제 패턴 침범 안 함" — we only pull GENERIC (zero specific tags) patterns.
  if (results.length < limit && MBTS_PATTERNS[category]) {
    var genericPool = [];
    var subs = Object.keys(MBTS_PATTERNS[category]);
    var seen = {};
    for (var ri = 0; ri < results.length; ri++) seen[results[ri].pattern.id] = true;

    for (var si = 0; si < subs.length; si++) {
      var pats = MBTS_PATTERNS[category][subs[si]];
      for (var xi = 0; xi < pats.length; xi++) {
        var gp2 = pats[xi];
        if (seen[gp2.id]) continue;
        if (classifyTags(gp2.tags).length !== 0) continue; // generic only
        var gs2 = scorePattern(gp2, userSet);
        if (gs2 > 0) genericPool.push({ pattern: gp2, score: gs2, source: 'generic' });
      }
    }
    genericPool.sort(compareMatchResults);
    while (results.length < limit && genericPool.length > 0) {
      results.push(genericPool.shift());
    }
  }

  return results.slice(0, limit);
}

// Comparator implementing spec tiebreakers: finalScore → tier → impact
function compareMatchResults(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  var tierDiff = (TIER_ORDER[b.pattern.tier] || 0) - (TIER_ORDER[a.pattern.tier] || 0);
  if (tierDiff !== 0) return tierDiff;
  var ai = (typeof a.pattern.impact === 'number') ? a.pattern.impact : DEFAULT_IMPACT;
  var bi = (typeof b.pattern.impact === 'number') ? b.pattern.impact : DEFAULT_IMPACT;
  return bi - ai;
}

function dedupeById(results) {
  var seen = {};
  var out = [];
  for (var i = 0; i < results.length; i++) {
    var id = results[i].pattern.id;
    if (seen[id]) continue;
    seen[id] = true;
    out.push(results[i]);
  }
  return out;
}

// ══════════════════════════════════════════════
// buildPatternPrompt — top 3 per subject (per spec) with optional debug scores
// ══════════════════════════════════════════════
//
// options.showScores — include (score: N) alongside each pattern name (debug)
function buildPatternPrompt(category, userTags, options) {
  options = options || {};
  var perSubject = options.limit || 10;
  var showScores = !!options.showScores;

  if (!MBTS_PATTERNS[category]) return '';

  var sections = [];
  var subs = options.subjects || Object.keys(MBTS_PATTERNS[category]);

  for (var si = 0; si < subs.length; si++) {
    var sub = subs[si];
    var matched = matchPatterns(category, sub, userTags, perSubject);
    if (matched.length === 0) continue;

    var lines = [];
    lines.push('### [' + sub + '] (' + matched.length + '개)');
    for (var p = 0; p < matched.length; p++) {
      var pat = matched[p].pattern;
      var scoreTag = showScores ? ' (score: ' + Math.round(matched[p].score) + ')' : '';
      lines.push('- ' + pat.name + scoreTag);
      // [REMOVED] pat.saju — 코드 레퍼런스, AI에 불필요
      // [REMOVED] pat.mbti — 코드 레퍼런스, AI에 불필요
      if (pat.cross) lines.push('  교차해설: ' + pat.cross);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// ══════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════
module.exports = {
  // Primary API
  matchPatterns: matchPatterns,
  buildPatternPrompt: buildPatternPrompt,
  scorePattern: scorePattern,
  SUB_ALIAS: SUB_ALIAS,
  resolveSubAlias: resolveSubAlias,
  SUPER_GROUP: SUPER_GROUP,
  SUB_TO_GROUP: SUB_TO_GROUP,
  CAT_COMPAT: CAT_COMPAT,

  // Helpers (exposed for tests)
  isSpecificTag: isSpecificTag,
  classifyTags: classifyTags,

  // Constants (exposed for tests)
  TIER_BONUS: TIER_BONUS,
  PRECISION_BONUS: PRECISION_BONUS,
  GENERIC_RELEVANCE: GENERIC_RELEVANCE,
  DEFAULT_IMPACT: DEFAULT_IMPACT,

  // Re-export for convenience
  MBTS_PATTERNS: MBTS_PATTERNS,
  buildUserTags: patternData.buildUserTags
};
