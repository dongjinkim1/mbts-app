// lib/gunghap-prompt.js -- gunghap prompt builder (server-side)
'use strict';

var core = require('./saju-core');
var analysis = require('./saju-analysis');
var mbtiData = require('./mbti-data');
var _sjTheory = require('./saju-theory-server');
var _mbtiTheory = require('./mbti-theory-server');
var _patternData = require('./pattern-data');
var _patternMatcher = require('./pattern-matcher');

// ── TERM_HINTS: 전문용어 뉘앙스 병기 + 한자 strip (개인분석과 동일) ──
var TERM_HINTS = {
  '편재격': '큰 돈/사업형', '정재격': '안정 관리형',
  '식신격': '재능/표현형', '상관격': '창의/혁신형',
  '편관격': '리더/카리스마형', '정관격': '안정 질서형',
  '편인격': '독창/영감형', '정인격': '학습/보호형',
  '비견격': '독립/개척형', '겁재격': '승부사/경쟁형',
  '극신강': '자기 에너지가 압도적',
  '극신약': '자기 에너지가 매우 약함',
  '신강': '자기 에너지가 강함',
  '신약': '자기 에너지가 약함',
  '중화': '에너지 균형',
  '재관쌍미': '돈과 명예를 동시에 잡는 구조',
  '비겁탈재': '경쟁자가 재물을 빼앗는 흐름',
  '재다신약': '기회는 많은데 잡을 힘이 부족',
  '식상생재': '재능이 돈으로 연결되는 흐름',
  '관인상생': '명예와 학습이 서로 도와주는 흐름',
  '천간충': '에너지 정면충돌/방향 갈등',
  '음양차착': '겉과 속이 반대인 기운',
  '무은지형': '은혜가 원수로 돌아오는 구조',
  '탐합망충': '합이 충을 무력화',
  '교운기': '대운 전환기/인생 변곡점',
  '비견': '동료/자기 힘/독립',
  '겁재': '라이벌/경쟁/승부',
  '식신': '재능/여유/표현력',
  '상관': '창의/날카로움/반항',
  '편재': '큰 돈/투자/사업 감각',
  '정재': '안정 수입/저축/관리',
  '편관': '카리스마/압박/강한 힘',
  '정관': '안정/질서/책임감',
  '편인': '독창성/영감/비주류',
  '정인': '학습/보호/멘토',
  '종격': '한 방향으로 완전히 쏠린 에너지',
  '공망': '비어있는 자리/허무한 에너지',
  '득령': '계절의 도움을 받는 상태',
  '실령': '계절의 도움을 못 받는 상태',
  '암합': '숨겨진 인연/보이지 않는 연결'
};

function applyTermHintsGH(text) {
  text = text.replace(/\([一-龥]+\)/g, '');
  var keys = Object.keys(TERM_HINTS).sort(function(a, b) { return b.length - a.length; });
  keys.forEach(function(term) {
    var re = new RegExp(term + '(?!\\()(?![가-힣])', 'g');
    text = text.replace(re, term + '(' + TERM_HINTS[term] + ')');
  });
  return text;
}

function buildMBTIProfile(label, axes, mbtiType) {
  var leftSides = ['E','S','T','J'];
  var choices = [], intens = [];
  for (var i = 0; i < 4; i++) {
    if (axes && axes[i]) {
      choices.push(leftSides.indexOf(axes[i].side) >= 0 ? 'L' : 'R');
      intens.push(axes[i].pct || 60);
    } else {
      choices.push('R'); intens.push(60);
    }
  }
  var mi = mbtiData.miAllParam(choices, intens);
  var strArr = choices.map(function(c, i) {
    return mbtiData.strLv(intens[i]) + ' ' + (c === 'L' ? mbtiData.DM_AX[i].Ll : mbtiData.DM_AX[i].Rl);
  });
  var txt = '\n### ' + label + '의 MBTI 강도별 행동 프로파일 (' + mbtiType + ')\n';
  for (var i = 0; i < 4; i++) {
    txt += '- ' + strArr[i] + ': ' + mi[i].trait + '\n';
    txt += '  연애: ' + mi[i].love + '\n';
    txt += '  직업: ' + mi[i].work + '\n';
    txt += '  번아웃: ' + mi[i].burn + '\n';
  }
  return txt;
}

// GH_CATEGORIES
var GH_CATEGORIES = {'ssom':{label:'\u{1F495} \uC378',emoji:'\u{1F495}',categories:['\uC0C1\uB300 \uD30C\uC545','\uB098\uC640\uC758 \uAD00\uACC4','\uC2E4\uC804','\uBBF8\uB798'],scoreLabels:{love:'\uB04C\uB9BC',comm:'\uC18C\uD1B5',values:'\uAC00\uCE58\uAD00',work:'\uC77C\uC0C1'},scoreWeights:{love:0.40,comm:0.30,values:0.15,work:0.15},tone:'\uC124\uB818\uACFC \uAD81\uAE08\uD568. \uB450\uADFC\uAC70\uB9AC\uB294 \uD1A4.'},'lover':{label:'\u2764\uFE0F \uC5F0\uC778',emoji:'\u2764\uFE0F',categories:['\uC0C1\uB300 \uD30C\uC545','\uAD81\uD569 \uAD6C\uC870','\uC18C\uD1B5\uACFC \uAC08\uB4F1','\uACB0\uD63C'],scoreLabels:{love:'\uC5F0\uC560',comm:'\uC18C\uD1B5',values:'\uAC00\uCE58\uAD00',work:'\uC0DD\uD65C'},scoreWeights:{love:0.35,comm:0.25,values:0.25,work:0.15},tone:'\uD604\uC2E4\uC801\uC774\uACE0 \uAE4A\uC740 \uBD84\uC11D. \uC194\uC9C1\uD55C \uD1A4.'},'colleague':{label:'\u{1F4BC} \uC9C1\uC7A5 \uB3D9\uB8CC',emoji:'\u{1F4BC}',categories:['\uC0C1\uB300 \uD30C\uC545','\uD611\uC5C5 \uAD6C\uC870','\uC2E4\uC804 \uD301','\uC131\uC7A5'],scoreLabels:{love:'\uCE5C\uBC00\uB3C4',comm:'\uC18C\uD1B5',values:'\uAC00\uCE58\uAD00',work:'\uC5C5\uBB34'},scoreWeights:{love:0.05,comm:0.30,values:0.25,work:0.40},tone:'\uD504\uB85C\uD398\uC154\uB110\uD558\uC9C0\uB9CC \uC778\uAC04\uC801.'},'friend':{label:'\u{1F37B} \uCE5C\uAD6C',emoji:'\u{1F37B}',categories:['\uC0C1\uB300 \uD30C\uC545','\uC6B0\uB9AC \uAD6C\uC870','\uC720\uC9C0\uC640 \uC2DC\uB108\uC9C0','\uC7A5\uAE30'],scoreLabels:{love:'\uC720\uB300\uAC10',comm:'\uC18C\uD1B5',values:'\uAC00\uCE58\uAD00',work:'\uD65C\uB3D9'},scoreWeights:{love:0.10,comm:0.35,values:0.30,work:0.25},tone:'\uD3B8\uC548\uD558\uACE0 \uC194\uC9C1\uD55C \uD1A4.'}};

// GH_CAT_RANGES
var GH_CAT_RANGES = {
  ssom: [4, 3, 3, 2],
  lover: [4, 3, 2, 3],
  colleague: [4, 3, 3, 2],
  friend: [4, 3, 3, 2]
};

// GUNGHAP_SYSTEM_V2
var GUNGHAP_SYSTEM_V2 = '\ub2f9\uc2e0\uc740 \ub300\ud55c\ubbfc\uad6d \ucd5c\uc815\uc0c1\uae09 MBTS(\uc0ac\uc8fc \u00d7 MBTI) \uc804\ubb38\uac00\uc785\ub2c8\ub2e4.\n\n## \ud575\uc2ec \uc784\ubb34\n\ub450 \uc0ac\ub78c\uc758 \uc0ac\uc8fc\ud314\uc790\uc640 MBTI\ub97c \uad50\ucc28 \ubd84\uc11d\ud558\uc5ec, "\uc5b4? \uc6b0\ub9ac \ub531 \uc774\ub798!" \ud558\uace0 \uc18c\ub984 \ub3cb\ub294 \uad81\ud569 \ud480\uc774\ub97c \ub9cc\ub4dc\uc138\uc694.\n\n## \uc785\ub825 \ub370\uc774\ud130 \ud65c\uc6a9\n\uc720\uc800 \ud504\ub86c\ud504\ud2b8\uc5d0 \ub2e4\uc74c \ub370\uc774\ud130\uac00 \ub4e4\uc5b4\uc635\ub2c8\ub2e4. \uad50\ucc28 \ud328\ud134\uc744 \uc911\uc2ec\uc73c\ub85c, \ub098\uba38\uc9c0\ub294 \ucc38\uace0 \uc790\ub8cc\ub85c \ud65c\uc6a9\ud558\uc138\uc694:\n- \ub450 \uc0ac\ub78c\uc758 \uc0ac\uc8fc \uc6d0\uad6d (\uc624\ud589\u00b7\uaca9\uad6d\u00b7\uc6a9\uc2e0\u00b7\ud569\ucda9\ud615\u00b712\uc6b4\uc131)\n- \ub450 \uc0ac\ub78c\uc758 MBTI \uac15\ub3c4\ubcc4 \ud589\ub3d9 \ud504\ub85c\ud30c\uc77c (4\ucd95\ubcc4 \uc131\ud5a5\u00b7\uc5f0\uc560\u00b7\uc9c1\uc5c5\u00b7\ubc88\uc544\uc6c3)\n- MBTI/\uc0ac\uc8fc \uc774\ub860 \uc2ec\uce35 \ub370\uc774\ud130\n- \uad50\ucc28 \ud328\ud134 (\uc0ac\uc8fc\u00d7MBTI \uad50\ucc28\uc5d0\uc11c \ub3c4\ucd9c\ub41c \ud1b5\ucc30)\n- \uad81\ud569 \uc5d4\uc9c4 \uc810\uc218\n\n\uac01 \uc18c\uc8fc\uc81c\uc5d0\uc11c \uc774 \uc7ac\ub8cc\ub4e4\uc744 \uc790\uc5f0\uc2a4\ub7fd\uac8c \uc870\ud569\ud558\uc5ec \ud480\uc774\ud558\uc138\uc694.\n\uc5b4\ub5a4 \uc7ac\ub8cc\ub4e0 \ud559\uc220 \ud1a4 \uadf8\ub300\ub85c \uc62e\uae30\uc9c0 \ub9d0\uace0 \ubc18\ub4dc\uc2dc \uad6c\uc5b4\uccb4\ub85c \uc7ac\ud574\uc11d\ud558\uc138\uc694.\n\n## \uad50\ucc28 \ud328\ud134 \ud65c\uc6a9 (\ud575\uc2ec)\n\uac01 \uc18c\uc8fc\uc81c\ub9c8\ub2e4 \uc81c\uacf5\ub41c \uad50\ucc28 \ud328\ud134 \uc911 \uc774 \uad81\ud569\uc5d0 \uac00\uc7a5 \uac15\ud558\uac8c \ud574\ub2f9\ud558\ub294 4\uac1c\ub97c \uace8\ub77c,\n\uadf8 \ud328\ud134\uc758 \uad50\ucc28\ud574\uc124\uc744 \uc18c\uc8fc\uc81c\uc758 \ubf08\ub300\ub85c \uc0ac\uc6a9\ud558\uc138\uc694.\n\ud328\ud134\uc5d0 \uc5c6\ub294 \ub0b4\uc6a9\uc73c\ub85c \ucc44\uc6b0\uc9c0 \ub9c8\uc138\uc694. \ud328\ud134\uc774 \ud480\uc774\uc758 \uc8fc\uc778\uacf5\uc785\ub2c8\ub2e4.\n\n## \uc804\ubb38\uc6a9\uc5b4 \uae08\uc9c0 (\uc808\ub300 \uaddc\uce59)\n\uc0ac\uc8fc/MBTI \uc804\ubb38\uc6a9\uc5b4(\uc2ed\uc131\u00b7\ucc9c\uac04\uc9c0\uc9c0\u00b7\uc2e0\uc0b4\uba85\u00b7\uaca9\uad6d\uba85\u00b712\uc6b4\uc131\uba85\u00b7\uad81\uc704\uba85\u00b7\uc6b4 \uc774\ub984\u00b7\uc624\ud589\ubd84\uc11d\uc6a9\uc5b4\u00b7\ud569\ucda9\ud615 \uc6a9\uc5b4\u00b7\uad50\ucc28\ubd84\uc11d \uc6a9\uc5b4\u00b7\uc778\uc9c0\uae30\ub2a5 \uc2a4\ud0dd \uc6a9\uc5b4) \ubcf8\ubb38 \ub178\ucd9c \uae08\uc9c0. \uc790\uc5f0\uc5b4\ub85c \ubc88\uc5ed.\n\uae08\uc9c0\ub294 \ubcf8\ubb38(b)\uc5d0\ub9cc \uc801\uc6a9.\n\ubb3c\uc0c1 \ube44\uc720\ub294 \uc790\uc720: \ucd1b\ubd88, \uc774\uc2ac, \uce7c\ub0a0, \ubc14\uc704, \ud638\uc218, \uc528\uc557, \ubaa8\ub2e5\ubd88 \ub4f1\n\n\uc0ac\uc8fc \uc804\ubb38\uc6a9\uc5b4(\ud55c\uc790 \ud3ec\ud568) \ubcf8\ubb38\uc5d0 \uc808\ub300 \uc4f0\uc9c0 \ub9c8\uc138\uc694. \uad04\ud638 \uc548 \ub258\uc559\uc2a4\ub97c \ucc38\uace0\ud574\uc11c \uc790\uc5f0\uc5b4\ub85c\ub9cc.\n\uc804\ubb38\uc6a9\uc5b4 \uc606 \uad04\ud638\ub294 \ub258\uc559\uc2a4 \ud78c\ud2b8\uc77c \ubfd0\uc785\ub2c8\ub2e4. \uadf8\ub300\ub85c \uc62e\uae30\uc9c0 \ub9c8\uc138\uc694. \ud574\ub2f9 \uc18c\uc8fc\uc81c\uc758 \ub9e5\ub77d\uacfc \ud750\ub984\uc5d0 \ub9de\uac8c \uc790\uae30 \ub9d0\ub85c \ud480\uc5b4\uc4f0\uc138\uc694.\n\uc778\uc9c0\uae30\ub2a5 \uc124\uba85: "INFP \ud2b9\uc720\uc758 ~~ \uc131\ud5a5\uc73c\ub85c" \uc2dd\uc73c\ub85c \uc790\uc5f0\uc5b4\ub85c. \uc778\uc9c0\uae30\ub2a5 \ucf54\ub4dc(Fi, Ni \ub4f1)\u00b7\ud559\uc220\uc6a9\uc5b4("\uc8fc\uae30\ub2a5", "Ni-Fi \ub8e8\ud504", "\ub0b4\uba74\uc758 \uc2ec\ud310\uad00") \ub178\ucd9c \uae08\uc9c0.\n  \ub098\uc05c \uc608: "\ub0b4\uba74\uc758 \uc2ec\ud310\uad00(Fi)\uc774 \uc8fc\uae30\ub2a5\uc774\ub77c\uc11c..."\n  \ub098\uc05c \uc608: "Ni-Fi \ub8e8\ud504\uc5d0 \ube60\uc9c0\uba74..."\n\n## \uce74\ub4dc \uac04 \ubc18\ubcf5 \uae08\uc9c0 (\uc808\ub300 \uaddc\uce59)\n- \ud55c \ubc88 \uc0ac\uc6a9\ud55c \uc624\ud589 \ube44\uc720\ub098 \uad00\uacc4 \ud504\ub808\uc784(\uc608: "\uc218\uac00 \ud654\ub97c \uadf9")\uc744 \ub2e4\ub978 \uc18c\uc8fc\uc81c\uc5d0\uc11c \uc7ac\uc0ac\uc6a9 \uae08\uc9c0.\n- \ud55c \ubc88 \uc0ac\uc6a9\ud55c MBTI \ub300\ube44 \ud504\ub808\uc784(\uc608: "\ub17c\ub9ac vs \uac00\uce58")\ub3c4 \ub2e4\ub978 \uc18c\uc8fc\uc81c\uc5d0\uc11c \uc7ac\uc0ac\uc6a9 \uae08\uc9c0.\n- \uac01 \uc18c\uc8fc\uc81c\ub294 \ud574\ub2f9 \uc18c\uc8fc\uc81c\uc758 \uad50\ucc28 \ud328\ud134\uc5d0\uc11c \uc0c8\ub85c\uc6b4 \uad00\uc810\uc744 \ubc18\ub4dc\uc2dc \uac00\uc838\uc62c \uac83.\n- \uc774\uc804 \uce74\ub4dc\uc5d0\uc11c \uc4f4 \ud45c\ud604\uc774 \ub5a0\uc624\ub974\uba74, \ud574\ub2f9 \uc18c\uc8fc\uc81c\uc758 \ud328\ud134 10\uac1c \uc911 \uc544\uc9c1 \uc548 \uc4f4 \uac83\uc744 \uace8\ub77c \uc4f0\uc138\uc694.\n\n## \uce74\ub4dc\ubcc4 \uade0\ud615 (\uc808\ub300 \uaddc\uce59)\n\uac01 \uc18c\uc8fc\uc81c \ubcf8\ubb38\uc5d0 \uc0ac\uc8fc \uc7ac\ub8cc\uc640 MBTI \uc7ac\ub8cc\uac00 \uc790\uc5f0\uc2a4\ub7fd\uac8c \uc5b4\uc6b0\ub7ec\uc838\uc57c \ud568. \ud55c \uc18c\uc8fc\uc81c\uac00 \uc0ac\uc8fc\ub9cc \ub610\ub294 MBTI\ub9cc\uc73c\ub85c \ucc44\uc6cc\uc9c0\ub294 \uac83 \uae08\uc9c0.\n\n## \uae0d\uc815 \uba3c\uc800 \uaddc\uce59\n\uac01 \uc18c\uc8fc\uc81c\uc758 \uccab 1~2\ubb38\ub2e8\uc740 \ub450 \uc0ac\ub78c\uc758 \uac15\uc810, \ucf00\ubbf8, \ub04c\ub9bc\uc73c\ub85c \uc2dc\uc791\ud558\uc138\uc694.\n\uac08\ub4f1\uc774\ub098 \uc57d\uc810\uc740 \uc774\ud6c4 \ubb38\ub2e8\uc5d0 \ubc30\uce58\ud558\uc138\uc694.\n\n## \ubb38\uccb4\n- \uc804\uccb4\uc801\uc73c\ub85c \ud76c\ub9dd\ucc28\uace0 \ub530\ub73b\ud55c \ud1a4. \uc2dc\uc801\uc774\uace0 \uac10\uc131\uc801. \ubb3c\uc0c1 \ube44\uc720 \uc801\uadf9 \ud65c\uc6a9.\n- \uad6c\uc5b4\uccb4: ~\uc608\uc694, ~\uac70\ub4e0\uc694. "\ub2f9\uc2e0", "\uc0c1\ub300\ubc29"\uc73c\ub85c \ud638\uce6d.\n- \ub0b4\uba74 \ub3c5\ubc31("~") \ud56d\ubaa9\ub2f9 \ucd5c\ub300 2\uac1c. \ubaa8\ub4e0 MBTI\uc5d0 \ub530\ub73b\ud55c \uac10\uc131 \ud1a4.\n- \ub3d9\ub124 \uc5b8\ub2c8/\uc624\ube60\ucc98\ub7fc \uce74\ud398\uc5d0\uc11c \ub450 \uc0ac\ub78c \uc774\uc57c\uae30 \ud574\uc8fc\ub294 \ub290\ub08c\uc73c\ub85c \uc4f0\uc138\uc694.\n- \uc758\uc0ac\uac00 \ud658\uc790\uc5d0\uac8c \uc18c\uacac\uc11c \uc77d\uc5b4\uc8fc\ub294 \ud1a4 \uae08\uc9c0.\n\n## \uc791\uc131 \uaddc\uce59\n- \uac01 \uc18c\uc8fc\uc81c\ub294 \uad50\ucc28 \ud328\ud134\uc5d0\uc11c \uace0\ub978 \ud328\ud134 \ud558\ub098\ub85c \uc2dc\uc791\ud558\uc138\uc694. \uadf8 \ud328\ud134\uc774 \uc774 \uad81\ud569\uc5d0 \uc65c \ud574\ub2f9\ub418\ub294\uc9c0\ub97c \uc0ac\uc8fc/MBTI \ub370\uc774\ud130\ub85c \ud480\uc5b4\uc8fc\uc138\uc694. \ud328\ud134 \uc5c6\uc774 \ub370\uc774\ud130\ub9cc\uc73c\ub85c \uc4f4 \uc18c\uc8fc\uc81c\ub294 \uae4a\uc774\uac00 \uc5c6\ub294 \uc18c\uc8fc\uc81c\uc785\ub2c8\ub2e4.\n- \uac01 \uc18c\uc8fc\uc81c\uc5d0\uc11c \ud575\uc2ec \ud328\ud134 4\uac1c \uace8\ub77c\uc11c \uae4a\uac8c \ud480\uc774\ud558\uc138\uc694. \ub098\uc5f4\ud558\uc9c0 \ub9c8\uc138\uc694.\n- \uac01 \uc18c\uc8fc\uc81c\ub294 \ud574\ub2f9 \uc18c\uc8fc\uc81c\uc758 \ud328\ud134 \uc139\uc158\uc5d0\uc11c\ub9cc \ud328\ud134\uc744 \uace8\ub77c \uc4f0\uc138\uc694. \ub2e4\ub978 \uc18c\uc8fc\uc81c\uc758 \ud328\ud134\uc744 \uac00\uc838\uc624\uc9c0 \ub9c8\uc138\uc694.\n\n\n## \uc778\uc0ac\uc774\ud2b8/\ucc98\ubc29\n- \ubcf8\ubb38(b): \ud480\uc774\ub9cc. \ucc98\ubc29\uc740 \ud301\uc5d0\ub9cc.\n- \ucd94\uc0c1\uc801 \uc870\uc5b8 \uae08\uc9c0. \uc624\ub298 \ub2f9\uc7a5 \ud560 \uc218 \uc788\ub294 \uad6c\uccb4\uc801 \ud589\ub3d9.\n- \uac01 \uc18c\uc8fc\uc81c\uc758 b \ub9c8\uc9c0\ub9c9\uc5d0 \ubc18\ub4dc\uc2dc \ud83d\udc8a\ub85c \uc2dc\uc791\ud558\ub294 \uc2e4\ucc9c \ud301 1~2\uc904. \ud83d\udc8a\ub294 \ub0b4\uc6a9\uc5d0 \ub530\ub77c \ub2e4\uc591\ud55c \uc774\ubaa8\ud2f0\ucf58\uc744 \uc368\ub3c4 \ub429\ub2c8\ub2e4.\n\n## \ub370\uc774\ud130 \ubb34\uacb0\uc131\n\uc81c\uacf5\ub41c \uc810\uc218\u00b7\ub098\uc774\u00b7\uac04\uc9c0\u00b7\uc5f0\ub3c4 \ubcc0\uacbd \uae08\uc9c0. MBTI \uc720\ud615\u00b7\uc778\uc9c0\uae30\ub2a5 \ubcc0\uacbd \uae08\uc9c0.\n\n## JSON \ucd9c\ub825 \ud615\uc2dd\n\n{\n  "title": "OO\uc77c\uc8fc\u00d7XX\uc77c\uc8fc \u00b7 XXXX\u00d7YYYY \uad81\ud569",\n  "quote": "\ub450 \uc0ac\ub78c\uc758 \uc0ac\uc8fc \ubd84\uc704\uae30\ub97c \uc790\uc5f0 \uc774\ubbf8\uc9c0 \ud55c \uc904\ub85c. \uc801\ucc9c\uc218 \ubb3c\uc0c1 + \uacc4\uc808\uac10. \ub0a9\uc74c\uc740 \ud55c \uc904 \uc694\uc57d \uc804\uc6a9\uc774\ubbc0\ub85c \uc5ec\uae30\uc120 \uc4f0\uc9c0 \ub9c8\uc138\uc694.",\n  "totalScore": 87,\n  "categories": [\n    {\n      "n": "\uce74\ud14c\uace0\ub9ac\uba85",\n      "subs": [\n        {\n          "h": "\uc18c\uc8fc\uc81c\uba85",\n          "b": "\ubb38\ub2e81\\\n\\\n\ubb38\ub2e82\\\n\\\n\ud83d\udc8a \uc2e4\ucc9c \ud301"\n        }\n      ]\n    }\n  ]\n}\n\nb: 3~5\ubb38\ub2e8, \uac01 3~5\ubb38\uc7a5. \\\n\\\n\uc73c\ub85c \uad6c\ubd84. \ub9c8\uc9c0\ub9c9 \ubb38\ub2e8\uc740 \uc774\ubaa8\uc9c0\ub85c \uc2dc\uc791\ud558\ub294 \uc2e4\ucc9c \ud301.\nJSON\ub9cc \ucd9c\ub825\ud558\uc138\uc694.';

// GH_REL_CONFIG
var GH_REL_CONFIG = {
  ssom: {
    title: '\uC378',
    subtitle: '\uC774 \uC0AC\uB78C... \uB098 \uC5B4\uB5BB\uAC8C \uC0DD\uAC01\uD574?',
    subs: [
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC131\uACA9', tone: '\uAC89\uACFC \uC18D, \uC9C4\uC9DC \uC131\uACA9\uC744 \uC9DA\uC5B4\uC918', anchor: 'B\uC77C\uAC04 \uC624\uD589+\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5\xB7EI\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC5F0\uC560 \uC2A4\uD0C0\uC77C', tone: '\uC88B\uC544\uD558\uBA74 \uC774\uB807\uAC8C \uD589\uB3D9\uD558\uB294 \uC0AC\uB78C', anchor: 'B\uBC30\uC6B0\uC790\uAD81(\uC77C\uC9C0) \uC2ED\uC131+B 12\uC6B4\uC131 | \uBCF4\uC870: MBTI B TF\uCD95+\uAC15\uB3C4' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC88B\uC544\uD558\uB294 \uD0C0\uC785', tone: '\uC5B4\uB5A4 \uC0AC\uB78C\uC5D0\uAC8C \uB04C\uB9AC\uB294\uC9C0', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\uBC30\uC6B0\uC790\uAD81 \uC2ED\uC131+\uB3C4\uD654\uC0B4 \uC720\uBB34/\uAD81\uC704 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5 \uBC18\uC751 \uC5D0\uB108\uC9C0' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC2EB\uC5B4\uD558\uB294 \uD0C0\uC785', tone: '\uC774\uB7F0 \uC0AC\uB78C\uC740 \uC808\uB300 \uC548 \uB428', anchor: 'B\uACFC\uC78E\uC624\uD589+B 5\uC2E0\uC911 \uAE30\uC2E0 \uC624\uD589+\uACA9\uC7AC\xB7\uD3B8\uAD00 \uACFC\uB2E4 \uC5EC\uBD80 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5' },
      { h: '\uC0C1\uB300 \uB208\uC5D0 \uBE44\uCE5C \uB098', tone: '\uAC78 \uB208\uC5D0 \uB098\uB294 \uC5B4\uB5A4 \uC0AC\uB78C\uC77C\uAE4C?', anchor: 'B\u2192A \uC2ED\uC131+\uC131\uBCC4\uB9E5\uB77D \uC2ED\uC131(L14)+A\uC758 \uC6D4\uAC04\uC774 B\uC5D0\uAC8C \uC8FC\uB294 \uC778\uC0C1 | \uBCF4\uC870: MBTI SN\uCD95 \uAD50\uCC28+8\uC790\uC2EC\uB9AC\uC704\uCE58(\uB144\uAC04=\uC678\uBD80\uC778\uC0C1)' },
      { h: '\uC6B0\uB9AC \uC0AC\uC774\uC758 \uB04C\uB9BC', tone: '\uC65C \uC790\uAFB8 \uC2E0\uACBD \uC4F0\uC774\uB294\uC9C0\uC758 \uC815\uCCB4', anchor: '\uC77C\uAC04 \uD569/\uCDA9/\uC0DD/\uADF9/\uBE44\uD654+\uC77C\uC9C0 \uC721\uD569 \uC5EC\uBD80+\uC6A9\uC2E0\u2194\uC624\uD589 \uBCF4\uC644 | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5\u2194\uC8FC\uAE30\uB2A5 \uAD50\uCC28' },
      { h: '\uC11C\uB85C \uB9DE\uCDB0\uAC00\uC57C \uD560 \uBD80\uBD84', tone: '\uC548 \uB9DE\uB294 \uAC74 \uC548 \uB9DE\uB294 \uAC70\uC57C', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615\xB7\uC6D0\uC9C4\uC0B4\xB7\uD574(\uAC15\uC81C \uC5B8\uAE09)+\uACFC\uC78E \uC624\uD589 \uCDA9\uB3CC+\uC591\uC778\uC0B4 \uC720\uBB34 | \uBCF4\uC870: MBTI JP\uCD95\xB7TF\uCD95 \uCC28\uC774' },
      { h: '\uD1B5\uD558\uB294 \uC811\uADFC\uBC95', tone: '\uC774\uB7EC\uBA74 \uD655\uB960 \uC62C\uB77C\uAC00\uC694', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+\uCC9C\uAC04\uD569 \uAD81\uC704+\uC0BC\uD569 \uACF5\uD1B5 \uC624\uD589 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(A\uC8FC\u2194B\uBD80)' },
      { h: '\uC5ED\uD6A8\uACFC \uB098\uB294 \uD589\uB3D9', tone: '\uC774\uB7EC\uBA74 \uC9C4\uC9DC \uB05D\uC774\uC5D0\uC694', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615 \uBC18\uBCF5+B \uACB0\uD541 \uC624\uD589 \uAC74\uB4DC\uB9AC\uB294 \uD328\uD134+\uACF5\uB9DD | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5+JP\uCD95 \uCC28\uC774' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uC0AC\uADC0\uB824\uBA74', tone: '\uD0C0\uC774\uBC0D\uACFC \uD604\uC2E4\uC801 \uC870\uC5B8', anchor: '\uB300\uC6B4 \uB3D9\uAE30\uD654+5\uB144 \uD0C0\uC774\uBC0D(\uC138\uC6B4)+12\uC6B4\uC131 | \uBCF4\uC870: MBTI JP\uCD95+\uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uC0AC\uADC0\uBA74 \uC5B4\uB5A4 \uCEE4\uD50C\uC774 \uB418\uB294\uC9C0', tone: '\uBBF8\uB9AC \uBCF4\uB294 \uC6B0\uB9AC\uC758 \uC5F0\uC778 \uBC84\uC804', anchor: '\uBC30\uC6B0\uC790\uAD81 \uC2ED\uC131 \uAD50\uCC28+\uB0A9\uC74C \uAD81\uD569(\uC774\uB984 \uD3EC\uD568)+\uAC15\uC57D \uAD81\uD569+\uBD80\uBD80\uC2DC\uB108\uC9C0 | \uBCF4\uC870: MBTI \uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uD55C \uC904 \uC694\uC57D', tone: '\uC18C\uB984 \uB3CB\uB294 \uD55C \uC904', anchor: '\uD0A4\uC6CC\uB4DC \uC694\uC57D(18\uB808\uC774\uC5B4)+\uB0A9\uC74C+MBTS \uAD00\uACC4\uC720\uD615\uBCC4 \uBE44\uAD50(bestRelType) | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5 \uC870\uD569' }
    ]
  },
  lover: {
    title: '\uC5F0\uC778',
    subtitle: '\uC774 \uC0AC\uB78C\uC774\uB791 \uCABD \uAC00\uB3C4 \uB420\uAE4C?',
    subs: [
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC131\uACA9', tone: '\uAC89\uACFC \uC18D, \uC9C4\uC9DC \uC131\uACA9\uC744 \uC9DA\uC5B4\uC918', anchor: 'B\uC77C\uAC04 \uC624\uD589+\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5\xB7EI\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC5F0\uC560 \uC2A4\uD0C0\uC77C', tone: '\uC0AC\uB791\uC744 \uD45C\uD604\uD558\uB294 \uBC29\uC2DD', anchor: 'B\uBC30\uC6B0\uC790\uAD81(\uC77C\uC9C0) \uC2ED\uC131+B 12\uC6B4\uC131 | \uBCF4\uC870: MBTI B TF\uCD95+\uAC15\uB3C4' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC5F0\uC778\uC5D0\uAC8C \uBC14\uB77C\uB294 \uAC83', tone: '\uCC44\uC6CC\uB2EC\uB77C\uB294 \uBE48\uC790\uB9AC', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\uBC30\uC6B0\uC790\uAD81 \uC2ED\uC131+\uC721\uCE5C \uC911 \uC778\uC131\xB7\uC2DD\uC0C1 \uBC30\uCE58 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5(\uCC44\uC6CC\uB2EC\uB77C\uB294 \uACF3)' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC5F0\uC778\uC5D0\uAC8C \uBBFC\uAC10\uD55C \uBD80\uBD84', tone: '\uC774\uAC74 \uB18D\uB2F4\uC73C\uB85C\uB3C4 \uD558\uC9C0 \uB9C8\uC138\uC694', anchor: 'B\uACFC\uC78E\uC624\uD589+B 5\uC2E0\uC911 \uAE30\uC2E0+\uACA9\uC7AC\xB7\uD3B8\uC778\xB7\uD3B8\uAD00 \uACFC\uB2E4+\uC591\uC778\uC0B4 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5+TF\uCD95' },
      { h: '\uC0C1\uB300 \uB208\uC5D0 \uBE44\uCE5C \uB098', tone: '\uAC78\uD55C\uD14C \uB0B4\uAC00 \uC5B4\uB5A4 \uC0AC\uB78C\uC778\uC9C0', anchor: 'B\u2192A \uC2ED\uC131+\uC131\uBCC4\uB9E5\uB77D \uC2ED\uC131+A\uC6D4\uAC04\u2192B\uC778\uC0C1 | \uBCF4\uC870: MBTI SN\uCD95 \uAD50\uCC28+8\uC790\uC2EC\uB9AC\uC704\uCE58' },
      { h: '\uC798 \uB9DE\uB294 \uBD80\uBD84', tone: '\uC6B0\uB9AC\uAC00 \uC81C\uC77C \uC798 \uB9DE\uB294 \uC21C\uAC04', anchor: '\uCC9C\uAC04\uD569 \uAD81\uC704+\uC0BC\uD569 \uACF5\uD1B5 \uC624\uD589+\uC624\uD589 \uBCF4\uC644 \uAD00\uACC4 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(\uC8FC\u2194\uC8FC)' },
      { h: '\uC11C\uB85C \uB9DE\uCDB0\uAC00\uC57C \uD560 \uBD80\uBD84', tone: '\uC124\uAC70\uC9C0 \uB54C\uBB38\uC774 \uC544\uB2C8\uC5C8\uC5B4\uC694', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615\xB7\uC6D0\uC9C4\uC0B4\xB7\uD574(\uAC15\uC81C)+\uACA9\uAD6D \uAD50\uCC28(\uAC15\uC57D \uCC28\uC774)+\uC591\uC778\uC0B4 | \uBCF4\uC870: MBTI JP\uCD95\xB7TF\uCD95 \uCC28\uC774' },
      { h: '\uC2F8\uC6E0\uC744 \uB54C \uD654\uD574\uBC95', tone: '\uC774 \uCEE4\uD50C \uC804\uC6A9 \uD654\uD574 \uACF5\uC2DD', anchor: '\uC6A9\uC2E0 \uAD81\uD569(\uC11C\uB85C \uD544\uC694\uD55C \uC5D0\uB108\uC9C0)+\uCC9C\uAC04\uD569 \uAD81\uC704 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(A\uC8FC\u2194B\uBD80, B\uC8FC\u2194A\uBD80)' },
      { h: '\uC6B0\uB9AC\uC5D0\uAC8C \uB9DE\uB294 \uC18C\uD1B5\uBC95', tone: '\uC774 \uAD00\uACC4\uC5D0 \uB9DE\uB294 \uB300\uD654 \uBC29\uBC95', anchor: '\uB0A9\uC74C \uAD81\uD569+\uAC15\uC57D \uAD81\uD569+\uC77C\uC9C0 \uAD50\uCC28 \uAD00\uACC4 | \uBCF4\uC870: MBTI EI\uCD95\xB7SN\uCD95 \uC870\uD569' },
      { h: '\uACB0\uD63C\uD558\uBA74 \uC5B4\uB5A4 \uBD80\uBD80\uAC00 \uB418\uB294\uC9C0', tone: '\uBBF8\uB9AC \uBCF4\uB294 \uC6B0\uB9AC \uAC00\uC815\uC758 \uBAA8\uC2B5', anchor: '\uBC30\uC6B0\uC790\uAD81 \uC2ED\uC131 \uAD50\uCC28+\uB0A9\uC74C \uAD81\uD569+\uBD80\uBD80\uC2DC\uB108\uC9C0+\uAC15\uC57D \uAD81\uD569 | \uBCF4\uC870: MBTI \uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uACB0\uD63C\uAE4C\uC9C0 \uAC00\uB824\uBA74', tone: '\uD604\uC2E4\uC801 \uD0C0\uC774\uBC0D\uACFC \uC870\uAC74', anchor: '\uB300\uC6B4 \uB3D9\uAE30\uD654+5\uB144 \uD0C0\uC774\uBC0D(\uC138\uC6B4)+12\uC6B4\uC131 | \uBCF4\uC870: MBTI JP\uCD95+\uC804\uCCB4 \uC720\uD615' },
      { h: '\uD55C \uC904 \uC694\uC57D', tone: '\uC774 \uC0AC\uB791\uC5D0 \uB300\uD55C \uC18C\uB984 \uB3CB\uB294 \uD55C \uC904', anchor: '\uD0A4\uC6CC\uB4DC \uC694\uC57D(18\uB808\uC774\uC5B4)+\uB0A9\uC74C+MBTS bestRelType | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5 \uC870\uD569' }
    ]
  },
  colleague: {
    title: '\uC9C1\uC7A5 \uB3D9\uB8CC',
    subtitle: '\uC774 \uC0AC\uB78C\uC774\uB791 \uC5B4\uB5BB\uAC8C \uC77C\uD574\uC57C \uD560\uAE4C',
    subs: [
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC131\uACA9', tone: '\uAC89\uACFC \uC18D, \uC9C4\uC9DC \uC131\uACA9\uC744 \uC9DA\uC5B4\uC918', anchor: 'B\uC77C\uAC04 \uC624\uD589+\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5\xB7EI\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC5C5\uBB34 \uC2A4\uD0C0\uC77C', tone: '\uBCF4\uACE0\uB294 \uC544\uCE68\uC5D0 \uD574, \uACB0\uB860\uBD80\uD130 \uB9D0\uD574', anchor: 'B\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D+B\uC6D4\uAC04 \uC2ED\uC131+B\uC77C\uAC04 \uC2ED\uC131 \uBD84\uD3EC(\uC815\uAD00/\uD3B8\uAD00/\uC815\uC7AC/\uD3B8\uC7AC \uC911\uC2EC) | \uBCF4\uC870: MBTI B JP\uCD95+Te/Ti \uBC30\uCE58' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC120\uD638\uD558\uB294 \uC5C5\uBB34 \uBC29\uC2DD', tone: '\uC774\uB807\uAC8C \uD558\uBA74 \uC88B\uC544\uD558\uB294 \uAC83', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\uC778\uC131\xB7\uC2DD\uC0C1 \uBC30\uCE58+B\uC6D4\uAC04 \uD569 \uC5EC\uBD80 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5+SN\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC2EB\uC5B4\uD558\uB294 \uC5C5\uBB34 \uBC29\uC2DD', tone: '\uC774\uAC70 \uC798\uBABB \uAC74\uB4DC\uB9AC\uBA74 \uCEE4\uB9AC\uC5B4\uAC00 \uB0A0\uC544\uAC00', anchor: 'B 5\uC2E0\uC911 \uAE30\uC2E0+\uC591\uC778\uC0B4\xB7\uACA9\uC7AC\uACFC\uB2E4\xB7\uD3B8\uAD00\uACFC\uB2E4 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5+TF\uCD95' },
      { h: '\uC0C1\uB300 \uB208\uC5D0 \uBE44\uCE5C \uB098', tone: '\uD68C\uC0AC\uC5D0\uC11C\uB294 \uD45C\uC815\uC73C\uB85C \uC77D\uC744 \uC218\uAC00 \uC5C6\uC73C\uB2C8\uAE4C', anchor: 'B\u2192A \uC2ED\uC131+A\uC6D4\uAC04\uC774 B\uC5D0\uAC8C \uC8FC\uB294 \uC778\uC0C1+\uC131\uBCC4\uB9E5\uB77D | \uBCF4\uC870: MBTI SN\uCD95\xB7TF\uCD95 \uAD50\uCC28+8\uC790\uC2EC\uB9AC\uC704\uCE58' },
      { h: '\uAC19\uC774 \uC77C\uD560 \uB54C \uC2DC\uB108\uC9C0', tone: '\uC774 \uC870\uD569\uC774 \uD130\uC9C0\uB294 \uC870\uAC74', anchor: '\uC624\uD589 \uBCF4\uC644+\uCC9C\uAC04\uD569 \uAD81\uC704(\uD2B9\uD788 \uC6D4\uAC04\uD569)+\uC0BC\uD569 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(\uC8FC\u2194\uC8FC)+Te/Ti' },
      { h: '\uAC19\uC774 \uC77C\uD560 \uB54C \uB9DE\uCDB0\uAC00\uC57C \uD560 \uBD80\uBD84', tone: '\uC77C \uBABB \uD574\uC11C\uAC00 \uC544\uB2C8\uC57C, \uBC29\uC2DD\uC774 \uB2E4\uB978 \uAC70\uC57C', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615\xB7\uC6D0\uC9C4\uC0B4\xB7\uD574(\uAC15\uC81C)+\uACA9\uAD6D \uAD50\uCC28(\uC5C5\uBB34\uBC29\uC2DD \uCC28\uC774) | \uBCF4\uC870: MBTI JP\uCD95 \uCC28\uC774+Te vs Ti \uCDA9\uB3CC' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uB300\uD654\uD560 \uB54C \uD301', tone: '\uC5C5\uBB34 \uB300\uD654\uC5D0\uC11C \uD6A8\uACFC\uC801\uC778 \uBC29\uBC95', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+\uCC9C\uAC04\uD569 \uAD81\uC704 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5 \uC18C\uD1B5 \uBC29\uC2DD' },
      { h: '\uC774 \uC0AC\uB78C\uC5D0\uAC8C \uC778\uC815\uBC1B\uB294 \uBC95', tone: '\uC774 \uC0AC\uB78C\uC774 \uBCF4\uB294 \uAC8C \uBB54\uC9C0 \uC54C\uBA74 \uD5DB\uC218\uACE0\uAC00 \uC904\uC5B4', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\u2192A \uC2ED\uC131 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5 \uBC18\uC751 \uC5D0\uB108\uC9C0' },
      { h: '\uD2B8\uB7EC\uBE14 \uB0AC\uC744 \uB54C \uB300\uCC98\uBC95', tone: '\uAC78\uAC00 \uB098\uD55C\uD14C \uC418\uB294 \uAC70 \uAC1C\uC778\uC801\uC778 \uAC70 \uC544\uB2C8\uC57C', anchor: '\uC6A9\uC2E0 \uAD81\uD569+\uCDA9\xB7\uD615 \uBC18\uBCF5 \uD328\uD134+\uACF5\uB9DD | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(A\uC8FC\u2194B\uBD80)' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uAC19\uC774 \uC131\uC7A5\uD558\uB824\uBA74', tone: '\uB2F5\uB2F5\uD55C\uB370, \uC774\uAC8C 3\uB144 \uB4A4 \uB0B4 \uBB34\uAE30\uAC00 \uB3FC', anchor: '\uB300\uC6B4 \uB3D9\uAE30\uD654+12\uC6B4\uC131 \uAD50\uCC28+A\uC758 \uC6A9\uC2E0\uACFC B\uC758 \uC624\uD589 | \uBCF4\uC870: MBTI \uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uD55C \uC904 \uC694\uC57D', tone: '\uB0B4\uC77C \uADF8 \uC0AC\uB78C \uBCF4\uBA74 \uC880 \uB2EC\uB77C\uC9C0\uB294 \uD55C \uC904', anchor: '\uD0A4\uC6CC\uB4DC \uC694\uC57D(18\uB808\uC774\uC5B4)+\uB0A9\uC74C+MBTS bestRelType | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5 \uC870\uD569' }
    ]
  },
  friend: {
    title: '\uCE5C\uAD6C',
    subtitle: '\uC6B0\uB9AC \uC9C4\uC9DC \uCE5C\uD55C \uAC70 \uB9DE\uC9C0?',
    subs: [
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC131\uACA9', tone: '\uAC89\uACFC \uC18D, \uC9C4\uC9DC \uC131\uACA9\uC744 \uC9DA\uC5B4\uC918', anchor: 'B\uC77C\uAC04 \uC624\uD589+\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5\xB7EI\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC6B0\uC815 \uC2A4\uD0C0\uC77C', tone: '\uCE5C\uAD6C \uAD00\uACC4\uC5D0\uC11C \uC774 \uC0AC\uB78C\uC758 \uD328\uD134', anchor: 'B\uBE44\uACA9\xB7\uC2DD\uC0C1 \uBD84\uD3EC+B\uC77C\uAC04\u2194\uC77C\uC9C0 \uAD00\uACC4 | \uBCF4\uC870: MBTI B EI\uCD95+Fe/Fi\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uCE5C\uAD6C\uC5D0\uAC8C \uBC14\uB77C\uB294 \uAC83', tone: '\uCE5C\uAD6C\uC5D0\uAC8C \uC6D0\uD558\uB294 \uAC83', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\uC778\uC131\xB7\uBE44\uACA9 \uBC30\uCE58 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5(\uBB34\uC758\uC2DD\uC801 \uB2C8\uC988)' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uCE5C\uAD6C\uC5D0\uAC8C \uC11C\uC6B4\uD574\uD558\uB294 \uAC83', tone: '\uCE5C\uAD6C \uAD00\uACC4\uC5D0\uC11C \uC11C\uC6B4\uD574\uD558\uB294 \uD3EC\uC778\uD2B8', anchor: 'B 5\uC2E0\uC911 \uAE30\uC2E0+\uACFC\uC78E \uC624\uD589 \uC790\uADF9 \uD328\uD134+\uC6D0\uC9C4\uC0B4 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5+TF\uCD95' },
      { h: '\uC0C1\uB300 \uB208\uC5D0 \uBE44\uCE5C \uB098', tone: '\uAC78 \uB208\uC5D0 \uB098\uB294 \uC5B4\uB5A4 \uC0AC\uB78C\uC77C\uAE4C?', anchor: 'B\u2192A \uC2ED\uC131+B\uBE44\uACA9\xB7\uC2DD\uC0C1\uC774 A\uB97C \uC778\uC2DD\uD558\uB294 \uBC29\uC2DD | \uBCF4\uC870: MBTI SN\uCD95 \uAD50\uCC28+8\uC790\uC2EC\uB9AC\uC704\uCE58' },
      { h: '\uC798 \uB9DE\uB294 \uBD80\uBD84', tone: '3\uC2DC\uAC04\uC774 30\uBD84 \uAC19\uC740 \uC774\uC720', anchor: '\uB0A9\uC74C \uAD81\uD569+\uC0BC\uD569 \uACF5\uD1B5 \uC624\uD589+\uC624\uD589 \uBCF4\uC644 | \uBCF4\uC870: MBTI EI\uCD95\xB7SN\uCD95 \uC870\uD569' },
      { h: '\uC11C\uB85C \uB9DE\uCDB0\uAC00\uC57C \uD560 \uBD80\uBD84', tone: '\uBAA8\uB974\uACE0 \uC9C0\uB098\uCE58\uBA74 \uAE08 \uAC00\uB294 \uD3EC\uC778\uD2B8', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615\xB7\uC6D0\uC9C4\uC0B4\xB7\uD574(\uAC15\uC81C)+\uACFC\uC78E \uC624\uD589 \uCDA9\uB3CC+\uC591\uC778\uC0B4 \uC720\uBB34 | \uBCF4\uC870: MBTI JP\uCD95\xB7TF\uCD95 \uCC28\uC774' },
      { h: '\uC774 \uC0AC\uB78C\uC758 \uAC10\uC815 \uD45C\uD604 \uBC29\uC2DD', tone: '\uC774 \uC0AC\uB78C\uC774 \uAC10\uC815\uC744 \uB4DC\uB7EC\uB0B4\uB294 \uBC29\uBC95', anchor: 'B\uACA9\uAD6D \uAC15\uC57D+B 12\uC6B4\uC131+B\uC77C\uAC04 \uC74C\uC591 | \uBCF4\uC870: MBTI B TF\uCD95+Fe/Fi\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uAC19\uC774 \uD558\uBA74 \uC798 \uB418\uB294 \uAC83', tone: '\uD568\uAED8\uD558\uBA74 \uC2DC\uB108\uC9C0 \uB098\uB294 \uAC83', anchor: '\uCC9C\uAC04\uD569 \uAD81\uC704+\uC0BC\uD569 \uACF5\uD1B5 \uC624\uD589+\uC6A9\uC2E0\u2194\uC624\uD589 \uBCF4\uC644+\uBD80\uBD80\uC2DC\uB108\uC9C0(\uD65C\uB3D9\uCD94\uCC9C) | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(\uC8FC\u2194\uBD80)' },
      { h: '\uBA40\uC5B4\uC84C\uC744 \uB54C \uD68C\uBCF5\uBC95', tone: '\uC5B4\uC0C9\uD574\uC84C\uC744 \uB54C \uB204\uAC00 \uBA3C\uC800 \uC5B4\uB5BB\uAC8C', anchor: '\uC6A9\uC2E0 \uAD81\uD569+\uCC9C\uAC04\uD569 \uAD81\uC704+\uCC9C\uC744\uADC0\uC778 \uAD50\uCC28 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28+Fe/Fi' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uAC19\uC774 \uC131\uC7A5\uD558\uB824\uBA74', tone: '\uD568\uAED8 \uBC1C\uC804\uD558\uAE30 \uC704\uD55C \uBC29\uBC95', anchor: '\uB300\uC6B4 \uB3D9\uAE30\uD654+12\uC6B4\uC131 \uAD50\uCC28+\uC624\uD589 \uBCF4\uC644 \uC7A5\uAE30 \uBCC0\uD654 | \uBCF4\uC870: MBTI \uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uD55C \uC904 \uC694\uC57D', tone: '\uC77D\uACE0 \uB098\uBA74 \uAC78\uD55C\uD14C \uC5F0\uB77D\uD558\uACE0 \uC2F6\uC5B4\uC9C0\uB294 \uD55C \uC904', anchor: '\uD0A4\uC6CC\uB4DC \uC694\uC57D(18\uB808\uC774\uC5B4)+\uB0A9\uC74C+MBTS bestRelType | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5 \uC870\uD569' }
    ]
  }
};

// getGHSystemPrompt
function getGHSystemPrompt(rel) {
  var base = GUNGHAP_SYSTEM_V2;
  var cfg = GH_REL_CONFIG[rel];
  if (!cfg) return base;

  var cat = GH_CATEGORIES[rel];
  var label = cat ? cat.label : rel;

  // v3 categorized subs structure (primary)
  if (cfg.subs && cfg.subs.length > 0) {
    var catNames = (cat && cat.categories) || ['\uC804\uCCB4'];
    var ranges = GH_CAT_RANGES[rel] || [cfg.subs.length];
    var section = '\n## \uAD00\uACC4: ' + label
      + '\n\uBD80\uC81C: ' + (cfg.subtitle || '')
      + '\n\n## categories (' + catNames.length + '\uAC1C \uACE0\uC815, ' + cfg.subs.length + '\uAC1C subs)\n\n';
    var idx = 0;
    for (var c = 0; c < catNames.length; c++) {
      var subNames = [];
      for (var s = 0; s < (ranges[c] || 0); s++) {
        if (idx < cfg.subs.length) {
          subNames.push(cfg.subs[idx].h);
          idx++;
        }
      }
      section += (c + 1) + '. ' + catNames[c] + ': ' + subNames.join(' / ') + '\n';
    }
    section += '\n\u2605 \uAC01 \uCE74\uD14C\uACE0\uB9AC \uC548\uC5D0 subs \uBC30\uC5F4, \uAC01 sub\uB294 {"h":"\uC18C\uC81C\uBAA9","b":"\uBCF8\uBB38"} \uAC1D\uCCB4. \uCE74\uD14C\uACE0\uB9AC\uB97C \uD1B5\uC9F8\uB85C \uD558\uB098\uC758 \uAE00\uB85C \uC4F0\uBA74 \uBD88\uD569\uACA9.\n';
    section += '\uBC18\uB4DC\uC2DC \uC704 \uCE74\uD14C\uACE0\uB9AC\uC640 \uC18C\uC8FC\uC81C \uC804\uBD80\uB97C \uBE60\uC9D0\uC5C6\uC774 \uC21C\uC11C\uB300\uB85C \uC791\uC131\uD558\uC138\uC694.\n';
    section += 'h\uB294 \uC704\uC5D0 \uC815\uC758\uB41C \uC18C\uC8FC\uC81C\uBA85\uC744 \uC815\uD655\uD788 \uADF8\uB300\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.\n';
    return base + section;
  }

  // legacy: nested categories structure (fallback)
  if (cfg.categories && cfg.categories[0] && cfg.categories[0].subs) {
    var section2 = '\n## \uAD00\uACC4: ' + label
      + '\n\uBD80\uC81C: ' + (cfg.subtitle || '')
      + '\n\n## \uC18C\uC8FC\uC81C (\uC21C\uC11C\uB300\uB85C \uC791\uC131)\n\n';
    var subCount = 0;
    cfg.categories.forEach(function(c) {
      section2 += '### ' + c.name + '\n';
      c.subs.forEach(function(s) {
        subCount++;
        section2 += subCount + '. ' + s.h + '\n';
      });
      section2 += '\n';
    });
    section2 += '\n\uBC18\uB4DC\uC2DC \uC704 \uC18C\uC8FC\uC81C \uC804\uBD80\uB97C \uBE60\uC9D0\uC5C6\uC774 \uC21C\uC11C\uB300\uB85C \uC791\uC131\uD558\uC138\uC694.\n';
    section2 += 'h\uB294 \uC704\uC5D0 \uC815\uC758\uB41C \uC18C\uC8FC\uC81C\uBA85\uC744 \uC815\uD655\uD788 \uADF8\uB300\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.\n';
    return base + section2;
  }

  // fallback: simple categories
  var catSection = '\n## \uAD00\uACC4: ' + label + '\n\uCE74\uD14C\uACE0\uB9AC:\n';
  if (cfg.categories) {
    cfg.categories.forEach(function(c, i) { catSection += (i + 1) + '. ' + c + '\n'; });
  }
  return base + catSection;
}

// buildGunghapPrompt
function buildGunghapPrompt(paramsA, paramsB, relType) {
  // paramsA = { y, m, d, h, min, gender, mbtiType, mbtiAxes?: [{side,pct},...] }
  // paramsB = { y, m, d, h, min, gender, mbtiType, mbtiAxes?: [{side,pct},...] }
  // relType = 'ssom' | 'lover' | 'colleague' | 'friend'

  // Calculate person A
  var sajuA = core.calcSajuForApp(+paramsA.y, +paramsA.m, +paramsA.d,
    paramsA.h ? +paramsA.h : null, paramsA.min ? +paramsA.min : null, paramsA.cityLng || null);
  var ggA = analysis.analyzeGyeokguk(sajuA);
  var genderA = (paramsA.gender === '\uB0A8\uC131' || paramsA.gender === '\uB0A8') ? '\uB0A8' : '\uC5EC';
  var dwA = analysis.calcDaewoon(sajuA, +paramsA.y, +paramsA.m, +paramsA.d,
    paramsA.h ? +paramsA.h : 12, paramsA.min ? +paramsA.min : 0, genderA);

  // Build MBTI object A
  var tiA = mbtiData.TY[paramsA.mbtiType] || {n:"\uD0D0\uD5D8\uAC00", cf:"Ni-Te-Fi-Se"};
  var mbtiObjA;
  if (paramsA.mbtiAxes && paramsA.mbtiAxes.length === 4) {
    mbtiObjA = {
      type: paramsA.mbtiType, cf: tiA.cf,
      axes: paramsA.mbtiAxes, profile: ''
    };
  } else {
    mbtiObjA = {
      type: paramsA.mbtiType, cf: tiA.cf,
      axes: [
        {side: paramsA.mbtiType[0], pct: 60},
        {side: paramsA.mbtiType[1], pct: 60},
        {side: paramsA.mbtiType[2], pct: 60},
        {side: paramsA.mbtiType[3], pct: 60}
      ], profile: ''
    };
  }

  // Calculate person B
  var sajuB = core.calcSajuForApp(+paramsB.y, +paramsB.m, +paramsB.d,
    paramsB.h ? +paramsB.h : null, paramsB.min ? +paramsB.min : null, null);
  var ggB = analysis.analyzeGyeokguk(sajuB);
  var genderB = (paramsB.gender === '\uB0A8\uC131' || paramsB.gender === '\uB0A8') ? '\uB0A8' : '\uC5EC';
  var dwB = analysis.calcDaewoon(sajuB, +paramsB.y, +paramsB.m, +paramsB.d,
    paramsB.h ? +paramsB.h : 12, paramsB.min ? +paramsB.min : 0, genderB);

  var tiB = mbtiData.TY[paramsB.mbtiType] || {n:"\uD0D0\uD5D8\uAC00", cf:"Ni-Te-Fi-Se"};
  var mbtiObjB;
  if (paramsB.mbtiAxes && paramsB.mbtiAxes.length === 4) {
    mbtiObjB = {
      type: paramsB.mbtiType, cf: tiB.cf,
      axes: paramsB.mbtiAxes, profile: ''
    };
  } else {
    mbtiObjB = {
      type: paramsB.mbtiType, cf: tiB.cf,
      axes: [
        {side: paramsB.mbtiType[0], pct: 60},
        {side: paramsB.mbtiType[1], pct: 60},
        {side: paramsB.mbtiType[2], pct: 60},
        {side: paramsB.mbtiType[3], pct: 60}
      ], profile: ''
    };
  }

  // Run gunghap engine
  var ghResult = analysis.analyzeGunghap(sajuA, sajuB, dwA, dwB, ggA, ggB, mbtiObjA, mbtiObjB);

  // Apply score weights
  var cat = GH_CATEGORIES[relType];
  if (cat && cat.scoreWeights) {
    var w = cat.scoreWeights;
    ghResult.scores.total = Math.round(
      ghResult.scores.love * w.love + ghResult.scores.comm * w.comm +
      ghResult.scores.values * w.values + ghResult.scores.work * w.work
    );
  }

  // Build user prompt
  var userPrompt = analysis.buildGunghapUserPrompt(
    ghResult, sajuA, sajuB, dwA, dwB, ggA, ggB, mbtiObjA, mbtiObjB
  );

  // ── Phase 3: MBTI 강도별 행동 프로파일 (기본 데이터 영역) ──
  userPrompt += buildMBTIProfile('A', mbtiObjA.axes, paramsA.mbtiType);
  userPrompt += buildMBTIProfile('B', mbtiObjB.axes, paramsB.mbtiType);

  // ── Phase 1-2: 교차 패턴 주입 (★★ 유일한 강조 — 풀이의 뼈대) ──
  try {
    var intensA = mbtiObjA.axes ? mbtiObjA.axes.map(function(a){ return a.pct; }) : null;
    var intensB = mbtiObjB.axes ? mbtiObjB.axes.map(function(a){ return a.pct; }) : null;
    var userTagsA = _patternData.buildUserTags(sajuA, ggA, dwA, paramsA.mbtiType, intensA);
    var userTagsB = _patternData.buildUserTags(sajuB, ggB, dwB, paramsB.mbtiType, intensB);
    var combinedTags = userTagsA.concat(userTagsB);
    var _cfgSubs = (GH_REL_CONFIG[relType] && GH_REL_CONFIG[relType].subs)
      ? GH_REL_CONFIG[relType].subs.map(function(s){ return s.h; })
      : null;
    var ghPatternText = _patternMatcher.buildPatternPrompt(relType, combinedTags, {
      showScores: true,
      subjects: _cfgSubs
    });
    if (ghPatternText) {
      userPrompt += '\n\n## ★★ 교차 패턴 — 풀이의 뼈대 (이것을 중심으로 풀이하세요) ★★\n' +
        '아래 패턴이 두 사람의 사주×MBTI 교차에서 도출된 핵심 특성이다.\n' +
        '패턴의 교차해설(cross)을 반드시 구어체로 재해석하여 본문에 포함하라.\n' +
        '해당하지 않는 것은 무시하라.\n\n' +
        ghPatternText;
    }
  } catch(e) { console.warn('[gunghap] Pattern 주입 실패:', e.message); }

  // ── Phase 1-1: MBTI theory 주입 (헤더 격하 — "참고") ──
  try {
    var intensA = mbtiObjA.axes ? mbtiObjA.axes.map(function(a){ return a.pct; }) : null;
    var intensB = mbtiObjB.axes ? mbtiObjB.axes.map(function(a){ return a.pct; }) : null;
    var theoryMBTI_A = _mbtiTheory.MT_buildFullContext(paramsA.mbtiType, intensA, null, paramsB.mbtiType);
    var theoryMBTI_B = _mbtiTheory.MT_buildFullContext(paramsB.mbtiType, intensB, null, paramsA.mbtiType);
    if (theoryMBTI_A) userPrompt += '\n\n## A의 MBTI 이론 참고 (필요 시에만)\n' + theoryMBTI_A;
    if (theoryMBTI_B) userPrompt += '\n\n## B의 MBTI 이론 참고 (필요 시에만)\n' + theoryMBTI_B;
  } catch(e) { console.warn('[gunghap] MBTI theory 주입 실패:', e.message); }

  // ── Phase 1-1: 사주 theory 주입 (헤더 격하 — "참고") ──
  try {
    var theorySaju_A = _sjTheory.SJ_buildFullContext(sajuA, ggA, dwA, genderA, sajuB, ggB);
    var theorySaju_B = _sjTheory.SJ_buildFullContext(sajuB, ggB, dwB, genderB, sajuA, ggA);
    if (theorySaju_A) userPrompt += '\n\n## A의 사주 이론 참고 (필요 시에만)\n' + theorySaju_A;
    if (theorySaju_B) userPrompt += '\n\n## B의 사주 이론 참고 (필요 시에만)\n' + theorySaju_B;
  } catch(e) { console.warn('[gunghap] Saju theory 주입 실패:', e.message); }

  // Append relType-specific subs info to user prompt
  var cfg = GH_REL_CONFIG[relType];
  if (cfg && cat) {
    userPrompt += '\n### \uAD00\uACC4: ' + cat.label + '\n';
    if (cfg.subs && cfg.subs.length > 0) {
      userPrompt += '\uBD80\uC81C: ' + (cfg.subtitle || '') + '\n\n';
      for (var i = 0; i < cfg.subs.length; i++) {
        userPrompt += (i + 1) + '. ' + cfg.subs[i].h + '\n';
      }
    } else {
      userPrompt += '\uCE74\uD14C\uACE0\uB9AC:\n';
      cat.categories.forEach(function(c, i) { userPrompt += (i + 1) + '. ' + c + '\n'; });
      if (cat.tone) userPrompt += '\n\uD1A4: ' + cat.tone + '\n';
    }
  }

  // Build system prompt
  var systemPrompt = getGHSystemPrompt(relType);

  userPrompt = applyTermHintsGH(userPrompt);

  return {
    systemPrompt: systemPrompt,
    userPrompt: userPrompt,
    sajuA: sajuA, sajuB: sajuB,
    ggA: ggA, ggB: ggB,
    dwA: dwA, dwB: dwB,
    mtA: paramsA.mbtiType, mtB: paramsB.mbtiType,
    mbtiObjA: mbtiObjA, mbtiObjB: mbtiObjB,
    ghResult: ghResult
  };
}

module.exports = {
  buildGunghapPrompt: buildGunghapPrompt,
  GH_CATEGORIES: GH_CATEGORIES,
  GH_REL_CONFIG: GH_REL_CONFIG,
  getGHSystemPrompt: getGHSystemPrompt
};
