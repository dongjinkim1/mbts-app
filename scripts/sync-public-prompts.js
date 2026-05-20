// scripts/sync-public-prompts.js
// Build-time sync: lib/*.js (server source of truth) → public/*.js (client mirror)
// Invoked by prebuild.js on every `npm run build`.
//
// Sync targets:
//   1) lib/gunghap-prompt.js  → public/gunghap.js  (gunghap block — GUNGHAP_SYSTEM_V2 + GH_REL_CONFIG + GH_SUB_TONE + getGHSystemPrompt)
//   2) lib/prompt-system.js   → public/js/saju.js  (PREMIUM_SYSTEM exposed as window.PREMIUM_SYSTEM)
//
// Drift prevention: if a developer modifies lib/* but forgets to manually sync public/*,
// the next `npm run build` automatically regenerates public/* from lib/*.
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var LIB_GUNGHAP  = path.join(ROOT, 'lib', 'gunghap-prompt.js');
var LIB_PROMPT   = path.join(ROOT, 'lib', 'prompt-system.js');
var PUB_GUNGHAP  = path.join(ROOT, 'public', 'gunghap.js');
var PUB_SAJU_DBG = path.join(ROOT, 'public', 'js', 'saju.js');

// ── helpers ────────────────────────────────────────────
function extractTemplateLiteral(src, name) {
  var m = src.match(new RegExp('var\\s+' + name + '\\s*=\\s*`([\\s\\S]*?)`;'));
  if (!m) throw new Error(name + ' template literal not found');
  return m[1]; // raw source bytes between backticks
}

function extractObjectByName(src, name) {
  var startMatch = src.match(new RegExp('var\\s+' + name + '\\s*=\\s*\\{'));
  if (!startMatch) throw new Error(name + ' object not found');
  var startIdx = startMatch.index + startMatch[0].length - 1; // '{' position
  var depth = 0;
  for (var i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.substring(startIdx, i + 1);
    }
  }
  throw new Error('Closing brace not found for ' + name);
}

function escForTemplate(s) {
  return s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

// ── 1. public/gunghap.js sync ──────────────────────────
function syncGunghap() {
  var libSrc = fs.readFileSync(LIB_GUNGHAP, 'utf8');
  var sysBody    = extractTemplateLiteral(libSrc, 'GUNGHAP_SYSTEM_V2');
  var relCfgBody = extractObjectByName(libSrc, 'GH_REL_CONFIG');
  var subToneBody= extractObjectByName(libSrc, 'GH_SUB_TONE');

  var newBlock = [
    '  // ══════════════════════════════════════════════════',
    '  // ★ 궁합 시스템 프롬프트 V2 — lib/gunghap-prompt.js와 자동 동기화',
    '  // ⚠️ 이 블록은 scripts/sync-public-prompts.js가 매 빌드마다 재생성합니다.',
    '  //    직접 수정 금지. 변경하려면 lib/gunghap-prompt.js를 수정하고 npm run build.',
    '  // ══════════════════════════════════════════════════',
    '',
    '  var GUNGHAP_SYSTEM_V2 = `' + escForTemplate(sysBody) + '`;',
    '',
    '  var GH_REL_CONFIG = ' + relCfgBody + ';',
    '  window.GH_REL_CONFIG = GH_REL_CONFIG;',
    '',
    '  var GH_SUB_TONE = ' + subToneBody + ';',
    '  window.GH_SUB_TONE = GH_SUB_TONE;',
    '',
    '  // ── getGHSystemPrompt (lib/gunghap-prompt.js와 동일 로직) ──',
    '  window.getGHSystemPrompt = function(rel) {',
    '    var base = GUNGHAP_SYSTEM_V2;',
    '    var cfg = GH_REL_CONFIG[rel];',
    '    if (!cfg) return base;',
    '    var cat = (typeof GH_CATEGORIES !== \'undefined\') ? GH_CATEGORIES[rel] : null;',
    '    var label = cat ? cat.label : (cfg.title || rel);',
    '    if (cfg.subs && cfg.subs.length > 0) {',
    '      var catNames = (cat && cat.categories) || [\'전체\'];',
    '      var ranges = (typeof GH_CAT_RANGES !== \'undefined\' && GH_CAT_RANGES[rel]) ? GH_CAT_RANGES[rel] : [cfg.subs.length];',
    '      var section = \'\\n## 관계: \' + label + \'\\n부제: \' + (cfg.subtitle || \'\') + \'\\n\\n## categories (\' + catNames.length + \'개 고정, \' + cfg.subs.length + \'개 subs)\\n\\n\';',
    '      var idx = 0;',
    '      for (var c = 0; c < catNames.length; c++) {',
    '        var subNames = [];',
    '        for (var s = 0; s < (ranges[c] || 0); s++) {',
    '          if (idx < cfg.subs.length) { subNames.push(cfg.subs[idx].h); idx++; }',
    '        }',
    '        section += (c + 1) + \'. \' + catNames[c] + \': \' + subNames.join(\' / \') + \'\\n\';',
    '      }',
    '      var toneMap = GH_SUB_TONE[rel] || {};',
    '      section += \'\\n## 소주제별 톤 가이드\\n\';',
    '      for (var ti = 0; ti < cfg.subs.length; ti++) {',
    '        var subH = cfg.subs[ti].h;',
    '        var subTone = toneMap[subH] || \'담백한 톤.\';',
    '        section += (ti + 1) + \'. \' + subH + \' — 톤: "\' + subTone + \'"\\n\';',
    '        section += \'   앵커: 해당 소주제 패턴 섹션에서 4개 선택\\n\';',
    '      }',
    '      section += \'\\n★ 각 카테고리 안에 subs 배열, 각 sub는 {"h":"소제목","b":"본문"} 객체. 카테고리를 통째로 하나의 글로 쓰면 불합격.\\n\';',
    '      section += \'반드시 위 카테고리와 소주제 전부를 빠짐없이 순서대로 작성하세요.\\n\';',
    '      section += \'h는 위에 정의된 소주제명을 정확히 그대로 사용하세요.\\n\';',
    '      return base + section;',
    '    }',
    '    return base;',
    '  };',
    ''
  ].join('\n');

  // Replace L965-region in public/gunghap.js
  // Boundary: comment containing "★ 궁합 시스템 프롬프트 V2" ... up to line BEFORE `console.log('[gunghap] V2 ...')`
  var pubSrc = fs.readFileSync(PUB_GUNGHAP, 'utf8');
  var lines = pubSrc.split('\n');
  var startIdx = -1, endIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (startIdx < 0 && /^\s*\/\/ ★ 궁합 시스템 프롬프트 V2/.test(lines[i])) startIdx = i - 1;
    if (startIdx >= 0 && endIdx < 0 && /^\s*console\.log\('\[gunghap\] V2/.test(lines[i])) endIdx = i - 1;
  }
  if (startIdx < 0 || endIdx < 0) throw new Error('public/gunghap.js boundary markers not found');

  var before = lines.slice(0, startIdx).join('\n');
  var after  = lines.slice(endIdx + 1).join('\n');
  var result = before + '\n' + newBlock + '\n' + after;

  if (result === pubSrc) {
    console.log('[sync-prompts] public/gunghap.js — no changes');
  } else {
    fs.writeFileSync(PUB_GUNGHAP, result, 'utf8');
    console.log('[sync-prompts] public/gunghap.js — synced');
  }
}

// ── 2. public/js/saju.js sync ──────────────────────────
function syncPremium() {
  var libSrc = fs.readFileSync(LIB_PROMPT, 'utf8');
  var sysBody = extractTemplateLiteral(libSrc, 'PREMIUM_SYSTEM');

  var newContent = [
    '// public/js/saju.js — PREMIUM_SYSTEM debug exposure',
    '// ⚠️ scripts/sync-public-prompts.js가 매 빌드마다 재생성합니다. 직접 수정 금지.',
    '// 콘솔에서 PREMIUM_SYSTEM 또는 window.PREMIUM_SYSTEM 으로 개인분석 시스템 프롬프트 확인.',
    '(function() {',
    '  \'use strict\';',
    '  window.PREMIUM_SYSTEM = `' + escForTemplate(sysBody) + '`;',
    '})();',
    ''
  ].join('\n');

  var existed = fs.existsSync(PUB_SAJU_DBG);
  var prev = existed ? fs.readFileSync(PUB_SAJU_DBG, 'utf8') : '';
  if (prev === newContent) {
    console.log('[sync-prompts] public/js/saju.js — no changes');
  } else {
    fs.writeFileSync(PUB_SAJU_DBG, newContent, 'utf8');
    console.log('[sync-prompts] public/js/saju.js — ' + (existed ? 'updated' : 'created'));
  }
}

// ── run ────────────────────────────────────────────────
try {
  syncGunghap();
  syncPremium();
} catch (e) {
  console.error('[sync-prompts] FAILED:', e.message);
  process.exit(1);
}
