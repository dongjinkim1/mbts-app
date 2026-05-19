// lib/gunghap-prompt.js -- gunghap prompt builder (server-side)
'use strict';

var core = require('./saju-core');
var analysis = require('./saju-analysis');
var data = require('./saju-data');
var mbtiData = require('./mbti-data');
var _sjTheory = require('./saju-theory-server');
var _mbtiTheory = require('./mbti-theory-server');
var _patternData = require('./pattern-data');
var _patternMatcher = require('./pattern-matcher');
var termUtils = require('./term-utils');

// TERM_REPLACE / TERM_HINTS / applyTermHintsGH
// → lib/term-utils.js 로 분리됨. termUtils.applyTermHints 로 접근.

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
var GUNGHAP_SYSTEM_V2 = `당신은 대한민국 최정상급 MBTS(사주 × MBTI) 전문가입니다.

## 핵심 임무
두 사람의 사주팔자와 MBTI를 교차 분석하여, "어? 우리 딱 이래!" 하고 소름 돋는 궁합 풀이를 만드세요.

## 입력 데이터 활용
유저 프롬프트에 다음 데이터가 들어옵니다. 교차 패턴을 중심으로, 나머지는 참고 자료로 활용하세요:
- 두 사람의 사주 원국 (오행·격국·용신·합충형·12운성)
- 두 사람의 MBTI 강도별 행동 프로파일 (4축별 성향·연애·직업·번아웃)
- MBTI/사주 이론 심층 데이터
- 교차 패턴 (사주×MBTI 교차에서 도출된 통찰)
- 궁합 엔진 점수

각 소주제에서 이 재료들을 자연스럽게 조합하여 풀이하세요.
어떤 재료든 학술 톤 그대로 옮기지 말고 반드시 구어체로 재해석하세요.

## 재료 계층 (★ 중요)
유저 프롬프트의 데이터는 3계층으로 나뉩니다.

【1군 — 반드시 사용】 풀이의 뼈대. 각 소주제의 핵심 재료.
- ★★ 교차 패턴 (사주×MBTI 교차에서 도출된 통찰)
- 두 사람의 핵심 교차점: 일간 관계, 합충형해, 용신 궁합

【2군 — 보조】 1군을 풍성하게 만드는 살. 필요한 만큼 사용.
- A/B 각각의 MBTI 강도별 행동 프로파일
- A/B 원국 데이터 (십성·궁위·12운성·오행)
- 대운 동기화, 궁합 엔진 점수

【3군 — 필요할 때만】 특정 소주제에서 근거가 부족할 때만 참고.
- MBTI 이론 심층, 사주 이론 심층 데이터

3군 재료로 소주제를 시작하지 마세요. 1군 패턴으로 시작하고, 2군으로 뒷받침하세요.

## 교차 패턴 활용 (핵심)
각 소주제마다 제공된 교차 패턴 중 이 궁합에 가장 강하게 해당하는 4개를 골라,
그 패턴의 교차해설을 소주제의 뼈대로 사용하세요.
패턴에 없는 내용으로 채우지 마세요. 패턴이 풀이의 주인공입니다.

## 전문용어 금지 (절대 규칙)
사주/MBTI 전문용어(십성·천간지지·신살명·격국명·12운성명·궁위명·운 이름·오행분석용어·합충형 용어·교차분석 용어·인지기능 스택 용어) 본문 노출 금지. 자연어로 번역.
금지는 본문(b)에만 적용.
물상 비유는 자유: 촛불, 이슬, 칼날, 바위, 호수, 씨앗, 모닥불 등

사주 전문용어(한자 포함) 본문에 절대 쓰지 마세요. 괄호 안 뉘앙스를 참고해서 자연어로만.
전문용어 옆 괄호는 뉘앙스 힌트일 뿐입니다. 그대로 옮기지 마세요. 해당 소주제의 맥락과 흐름에 맞게 자기 말로 풀어쓰세요.
인지기능 설명: "INFP 특유의 ~~ 성향으로" 식으로 자연어로. 인지기능 코드(Fi, Ni 등)·학술용어("주기능", "Ni-Fi 루프", "내면의 심판관") 노출 금지.
  나쁜 예: "내면의 심판관(Fi)이 주기능이라서..."
  나쁜 예: "Ni-Fi 루프에 빠지면..."

## 카드 간 반복 금지 (절대 규칙)
- 한 번 사용한 오행 비유나 관계 프레임(예: "수가 화를 극")을 다른 소주제에서 재사용 금지.
- 한 번 사용한 MBTI 대비 프레임(예: "논리 vs 가치")도 다른 소주제에서 재사용 금지.
- 각 소주제는 해당 소주제의 교차 패턴에서 새로운 관점을 반드시 가져올 것.
- 이전 카드에서 쓴 표현이 떠오르면, 해당 소주제의 패턴 10개 중 아직 안 쓴 것을 골라 쓰세요.

## 카드별 균형 (절대 규칙)
각 소주제 본문에 사주 재료와 MBTI 재료가 자연스럽게 어우러져야 함. 한 소주제가 사주만 또는 MBTI만으로 채워지는 것 금지.

## 신강도 쿼터제 (절대 규칙)
신강도·에너지 강약(신강/신약/극신강/극신약 등)을 소주제의 주요 논점으로 삼는 것은 12개 중 최대 2개까지.
나머지 10개는 다른 사주 요소(일주 물상, 오행 밸런스, 합충, 용신 등) × MBTI 교차점에서 이야기를 시작하세요.

## 긍정 먼저 규칙
각 소주제의 첫 1~2문단은 두 사람의 강점, 케미, 끌림으로 시작하세요.
갈등이나 약점은 이후 문단에 배치하세요.

## 문체
- 전체적으로 희망차고 따뜻한 톤. 시적이고 감성적. 물상 비유 적극 활용.
- 구어체: ~예요, ~거든요. "당신", "상대방"으로 호칭.
- 내면 독백("~") 항목당 최대 2개. 모든 MBTI에 따뜻한 감성 톤.
- 동네 언니/오빠처럼 카페에서 두 사람 이야기 해주는 느낌으로 쓰세요.
- 의사가 환자에게 소견서 읽어주는 톤 금지.

## _blueprint (풀이 전 메모 — 사용자에게 표시 안 됨)

본문을 쓰기 전에 _blueprint를 먼저 작성하세요. 세 단계입니다:

STEP 1: 각 소주제마다 교차 패턴 중 이 궁합에 가장 해당하는 4개의 패턴 이름만 적으세요.

STEP 2: 12개 소주제 전체를 훑어보고, 같은 테마의 패턴이 2개 이상의 소주제에 등장하면
한 소주제에만 남기고 나머지에서는 다른 패턴으로 교체하세요.

STEP 3: 각 소주제마다 다음을 적으세요:
- keyword: 그 소주제의 핵심 메시지 한 단어 (12개 중 의미 겹침 금지)
- cross_axis: 두 사람 각각의 사주×MBTI 교차점을 한 줄로 (같은 축 조합 반복 금지)
  예: "A(화일간×직관형) ↔ B(수용신×감정형)"
      "A(배우자궁 편관×J성향) ↔ B(식상과다×P성향)"
      "A↔B 일지충 × A(내향)↔B(외향) 소통 차이"

"_blueprint": {
  "소주제1": {"patterns": ["패턴A","패턴B","패턴C","패턴D"], "keyword": "한단어", "cross_axis": "A(사주×MBTI) ↔ B(사주×MBTI)"},
  "소주제2": {"patterns": [...], "keyword": "...", "cross_axis": "..."},
  ...위 categories에 정의된 소주제 전부
}

_blueprint를 완성한 후에만 categories 본문을 쓰세요.
각 소주제의 첫 문단에서 선택한 cross_axis가 이 궁합에 왜 해당되는지를 풀어쓰세요.

## 작성 규칙
- 각 소주제는 교차 패턴에서 고른 패턴 하나로 시작하세요. 그 패턴이 이 궁합에 왜 해당되는지를 사주/MBTI 데이터로 풀어주세요. 패턴 없이 데이터만으로 쓴 소주제는 깊이가 없는 소주제입니다.
- 각 소주제에서 핵심 패턴 4개 골라서 깊게 풀이하세요. 나열하지 마세요.
- 각 소주제는 해당 소주제의 패턴 섹션에서만 패턴을 골라 쓰세요. 다른 소주제의 패턴을 가져오지 마세요.


## 인사이트/처방
- 본문(b): 풀이만. 처방은 팁에만.
- 추상적 조언 금지. 오늘 당장 할 수 있는 구체적 행동.
- 각 소주제의 b 마지막에 반드시 💊로 시작하는 실천 팁 1~2줄. 💊는 내용에 따라 다양한 이모티콘을 써도 됩니다.

## 데이터 무결성
제공된 점수·나이·간지·연도 변경 금지. MBTI 유형·인지기능 변경 금지.

## JSON 출력 형식

{
  "title": "OO일주×XX일주 · XXXX×YYYY 궁합",
  "quote": "두 사람의 사주 분위기를 자연 이미지 한 줄로. 적천수 물상 + 계절감. 납음은 한 줄 요약 전용이므로 여기선 쓰지 마세요.",
  "totalScore": 87,
  "categories": [
    {
      "n": "카테고리명",
      "subs": [
        {
          "h": "소주제명",
          "b": "문단1\\
\\
문단2\\
\\
💊 실천 팁"
        }
      ]
    }
  ]
}

b: 3~5문단, 각 3~5문장. \\
\\
으로 구분. 마지막 문단은 이모지로 시작하는 실천 팁.
JSON만 출력하세요.`;

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
      { h: '\uC774 \uC0AC\uB78C\uC758 \uC5C5\uBB34 \uC2A4\uD0C0\uC77C', tone: '\uC774 \uC0AC\uB78C\uC774 \uC77C\uD560 \uB54C \uC6C0\uC9C1\uC774\uB294 \uBC29\uC2DD', anchor: 'B\uACA9\uAD6D \uC720\uD615+\uAC15\uC57D+B\uC6D4\uAC04 \uC2ED\uC131+B\uC77C\uAC04 \uC2ED\uC131 \uBD84\uD3EC(\uC815\uAD00/\uD3B8\uAD00/\uC815\uC7AC/\uD3B8\uC7AC \uC911\uC2EC) | \uBCF4\uC870: MBTI B JP\uCD95+Te/Ti \uBC30\uCE58' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC120\uD638\uD558\uB294 \uC5C5\uBB34 \uBC29\uC2DD', tone: '\uC774\uB807\uAC8C \uD558\uBA74 \uAE30\uBD84 \uC88B\uC544\uC9C0\uB294 \uC0AC\uB78C', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\uC778\uC131\xB7\uC2DD\uC0C1 \uBC30\uCE58+B\uC6D4\uAC04 \uD569 \uC5EC\uBD80 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5+SN\uCD95' },
      { h: '\uC774 \uC0AC\uB78C\uC774 \uC2EB\uC5B4\uD558\uB294 \uC5C5\uBB34 \uBC29\uC2DD', tone: '\uC774\uAC83\uB9CC\uC740 \uAC74\uB4DC\uB9AC\uC9C0 \uB9C8\uC138\uC694', anchor: 'B 5\uC2E0\uC911 \uAE30\uC2E0+\uC591\uC778\uC0B4\xB7\uACA9\uC7AC\uACFC\uB2E4\xB7\uD3B8\uAD00\uACFC\uB2E4 | \uBCF4\uC870: MBTI B\uC5F4\uB4F1\uAE30\uB2A5+TF\uCD95' },
      { h: '\uC0C1\uB300 \uB208\uC5D0 \uBE44\uCE5C \uB098', tone: '\uAC54 \uB208\uC5D0 \uB098\uB294 \uC5B4\uB5A4 \uB3D9\uB8CC\uC77C\uAE4C', anchor: 'B\u2192A \uC2ED\uC131+A\uC6D4\uAC04\uC774 B\uC5D0\uAC8C \uC8FC\uB294 \uC778\uC0C1+\uC131\uBCC4\uB9E5\uB77D | \uBCF4\uC870: MBTI SN\uCD95\xB7TF\uCD95 \uAD50\uCC28+8\uC790\uC2EC\uB9AC\uC704\uCE58' },
      { h: '\uAC19\uC774 \uC77C\uD560 \uB54C \uC2DC\uB108\uC9C0', tone: '\uC6B0\uB9AC\uAC00 \uAC19\uC774 \uD558\uBA74 \uD130\uC9C0\uB294 \uC21C\uAC04', anchor: '\uC624\uD589 \uBCF4\uC644+\uCC9C\uAC04\uD569 \uAD81\uC704(\uD2B9\uD788 \uC6D4\uAC04\uD569)+\uC0BC\uD569 | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(\uC8FC\u2194\uC8FC)+Te/Ti' },
      { h: '\uAC19\uC774 \uC77C\uD560 \uB54C \uB9DE\uCDB0\uAC00\uC57C \uD560 \uBD80\uBD84', tone: '\uC548 \uB9DE\uB294 \uAC74 \uC2E4\uB825 \uBB38\uC81C\uAC00 \uC544\uB2C8\uC5D0\uC694', anchor: '\u26A0\uFE0F \uCDA9\xB7\uD615\xB7\uC6D0\uC9C4\uC0B4\xB7\uD574(\uAC15\uC81C)+\uACA9\uAD6D \uAD50\uCC28(\uC5C5\uBB34\uBC29\uC2DD \uCC28\uC774) | \uBCF4\uC870: MBTI JP\uCD95 \uCC28\uC774+Te vs Ti \uCDA9\uB3CC' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uB300\uD654\uD560 \uB54C \uD301', tone: '\uC774 \uC0AC\uB78C\uD55C\uD14C \uB9D0\uC774 \uD1B5\uD558\uB294 \uBC29\uBC95', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+\uCC9C\uAC04\uD569 \uAD81\uC704 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5 \uC18C\uD1B5 \uBC29\uC2DD' },
      { h: '\uC774 \uC0AC\uB78C\uC5D0\uAC8C \uC778\uC815\uBC1B\uB294 \uBC95', tone: '\uC774 \uC0AC\uB78C\uC774 \uC9C4\uC9DC \uC54C\uC544\uC8FC\uB294 \uD3EC\uC778\uD2B8', anchor: 'B\uC6A9\uC2E0 \uBC29\uD5A5+B\u2192A \uC2ED\uC131 | \uBCF4\uC870: MBTI B\uC8FC\uAE30\uB2A5 \uBC18\uC751 \uC5D0\uB108\uC9C0' },
      { h: '\uD2B8\uB7EC\uBE14 \uB0AC\uC744 \uB54C \uB300\uCC98\uBC95', tone: '\uC774 \uAD00\uACC4\uC5D0\uC11C \uD2B8\uB7EC\uBE14\uC774 \uC0DD\uAE30\uB294 \uC9C4\uC9DC \uC774\uC720', anchor: '\uC6A9\uC2E0 \uAD81\uD569+\uCDA9\xB7\uD615 \uBC18\uBCF5 \uD328\uD134+\uACF5\uB9DD | \uBCF4\uC870: MBTI \uC778\uC9C0\uAE30\uB2A5 \uAD50\uCC28(A\uC8FC\u2194B\uBD80)' },
      { h: '\uC774 \uC0AC\uB78C\uACFC \uAC19\uC774 \uC131\uC7A5\uD558\uB824\uBA74', tone: '\uC774 \uC0AC\uB78C\uC774\uB791 \uC624\uB798\uAC00\uB824\uBA74', anchor: '\uB300\uC6B4 \uB3D9\uAE30\uD654+12\uC6B4\uC131 \uAD50\uCC28+A\uC758 \uC6A9\uC2E0\uACFC B\uC758 \uC624\uD589 | \uBCF4\uC870: MBTI \uC804\uCCB4 \uC720\uD615 \uC870\uD569' },
      { h: '\uD55C \uC904 \uC694\uC57D', tone: '\uB0B4\uC77C \uCD9C\uADFC\uD558\uBA74 \uC880 \uB2EC\uB77C\uC9C0\uB294 \uD55C \uC904', anchor: '\uD0A4\uC6CC\uB4DC \uC694\uC57D(18\uB808\uC774\uC5B4)+\uB0A9\uC74C+MBTS bestRelType | \uBCF4\uC870: MBTI \uC8FC\uAE30\uB2A5 \uC870\uD569' }
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

  // ── A/B 원국 상세 데이터 주입 ──
  var TGAN_KR = data.TGAN_KR;
  var JIJI_KR = data.JIJI_KR;
  var ILJU_DATA = data.ILJU_DATA;

  function buildWonkukDetail(label, saju, gg) {
    var txt = '\n### ' + label + '의 원국 상세\n';
    // 천간십성
    txt += '- 천간십성: ' + saju.ss.map(function(s){ return s.pillar+' '+s.stem+'('+s.ss+')'; }).join(', ') + '\n';
    // 궁위십성 (지지정기 기준)
    txt += '- 궁위십성: ' + saju.jiSS.map(function(j){ return j.pillar+' '+j.branch+'='+j.ss+'('+j.gungwi+')'; }).join(' | ') + '\n';
    // 오행 지장간 포함
    txt += '- 오행(표면): 목='+saju.el['목']+' 화='+saju.el['화']+' 토='+saju.el['토']+' 금='+saju.el['금']+' 수='+saju.el['수']+'\n';
    if (saju.elFull) {
      txt += '- 오행(지장간포함): 목='+saju.elFull['목']+' 화='+saju.elFull['화']+' 토='+saju.elFull['토']+' 금='+saju.elFull['금']+' 수='+saju.elFull['수']+'\n';
    }
    if (saju.hiddenOh && saju.hiddenOh.length > 0) {
      txt += '  → 숨은 오행: ' + saju.hiddenOh.join(',') + '\n';
    }
    // 12운성
    txt += '- 12운성: ' + saju.P.map(function(p,i){ return p.l+'='+(saju.uns[i]||'미상'); }).join(', ') + '\n';
    // 격국 상세
    txt += '- 격국: ' + gg.gyeokgukName + ' (' + gg.gyeokgukBasis + ')\n';
    txt += '  → ' + gg.gyeokgukDesc + '\n';
    if (gg.isJonggyeok) txt += '  ⚠️ 종격 사주\n';
    if (gg.isHwakyeok) txt += '  ⚠️ 화격 사주\n';
    // 십성비중
    txt += '- 십성비중: 비겁='+gg.cnt['비겁'].toFixed(1)+' 식상='+gg.cnt['식상'].toFixed(1)+' 재성='+gg.cnt['재성'].toFixed(1)+' 관성='+gg.cnt['관성'].toFixed(1)+' 인성='+gg.cnt['인성'].toFixed(1)+'\n';
    // 일간강도
    txt += '- 일간강도: '+gg.strengthGrade+' '+gg.strengthScore+'점 (자기편='+gg.selfStr.toFixed(1)+' vs 상대편='+gg.otherStr.toFixed(1)+')'+(gg.deukryeong?' [득령]':' [실령]')+'\n';
    // 강/약 오행
    txt += '- 강한: '+gg.dominant[0]+'('+gg.dominant[1].toFixed(1)+') 약한: '+gg.weak[0]+'('+gg.weak[1].toFixed(1)+')\n';
    // 부족오행
    txt += '- 부족오행: '+(saju.lackFull && saju.lackFull.length>0 ? saju.lackFull.join(',') : '없음')+'\n';
    // 용신
    txt += '- 용신: '+gg.yongshin+' ['+gg.yongshinType+'용신]'+(gg.johuYongshin&&gg.yongshinType!=='조후'?' · 조후참고: '+gg.johuYongshin:'')+'\n';
    // 오행흐름
    txt += '- 오행흐름: '+gg.flowSummary+'\n';
    // 원국 내 합충형해
    var rel = analysis.calcRelations(saju);
    var hapTxt = rel.cheonganHap.map(function(h){return h.desc;}).concat(rel.jijiHap.map(function(h){return h.desc;})).join(', ') || '없음';
    var samhapTxt = rel.jijiSamhap.map(function(h){return h.desc;}).join(', ') || '없음';
    var chungTxt = rel.jijiChung.map(function(c){return c.desc;}).join(', ') || '없음';
    var hyungTxt = rel.jijiHyung.map(function(h){return h.desc;}).join(', ') || '없음';
    txt += '- 합: '+hapTxt+' | 삼합: '+samhapTxt+'\n';
    txt += '- 충: '+chungTxt+' | 형: '+hyungTxt+'\n';
    // 암합
    if (saju.amhap && saju.amhap.length > 0) {
      txt += '- 암합: '+saju.amhap.map(function(a){return a.from+'↔'+a.to+'=합화'+a.hapOh;}).join(', ')+'\n';
    }
    return txt;
  }

  userPrompt += buildWonkukDetail('A', sajuA, ggA);
  userPrompt += buildWonkukDetail('B', sajuB, ggB);

  // ── 카드별 출발 힌트 (궁합 버전) ──
  try {
    var iljuKeyA = sajuA.P[2].s + sajuA.P[2].b;
    var iljuKeyB = sajuB.P[2].s + sajuB.P[2].b;
    var iljuDA = ILJU_DATA[iljuKeyA] || {k:'독특한 기질',t:'',love:'',job:''};
    var iljuDB = ILJU_DATA[iljuKeyB] || {k:'독특한 기질',t:'',love:'',job:''};
    var gungwiA = analysis.buildGungwiContext(sajuA, ggA);
    var gungwiB = analysis.buildGungwiContext(sajuB, ggB);

    var cardHints = '\n\n## ★ 카드별 출발 힌트 (1군 재료 — 각 소주제의 앵커)\n';
    cardHints += '아래 힌트는 각 소주제의 첫 문단 출발점일 뿐입니다. 풀이의 본체는 반드시 ★★교차 패턴★★ 4개로 채우세요.\n';
    cardHints += '같은 힌트를 여러 소주제에서 반복하지 마세요.\n\n';

    cardHints += '【A 일주 물상】 → 이 사람의 성격 소주제의 출발점\n';
    cardHints += '- A 물상 이미지: ' + iljuDA.k + '\n';
    if (iljuDA.t) cardHints += '- A 기질: ' + iljuDA.t + '\n';

    cardHints += '\n【B 일주 물상】 → 이 사람의 성격 소주제의 출발점\n';
    cardHints += '- B 물상 이미지: ' + iljuDB.k + '\n';
    if (iljuDB.t) cardHints += '- B 기질: ' + iljuDB.t + '\n';

    if (gungwiA.spouse || iljuDA.love) {
      cardHints += '\n【A 연애궁】 → 연애 스타일·끌림 소주제의 출발점\n';
      if (gungwiA.spouse) cardHints += '- ' + gungwiA.spouse + '\n';
      if (iljuDA.love) cardHints += '- A 일주 연애 기질: ' + iljuDA.love + '\n';
    }
    if (gungwiB.spouse || iljuDB.love) {
      cardHints += '\n【B 연애궁】 → 상대방의 연애 패턴 참고\n';
      if (gungwiB.spouse) cardHints += '- ' + gungwiB.spouse + '\n';
      if (iljuDB.love) cardHints += '- B 일주 연애 기질: ' + iljuDB.love + '\n';
    }

    if (gungwiA.career || gungwiB.career) {
      cardHints += '\n【직업궁 교차】 → 업무 시너지·직장동료 소주제의 출발점\n';
      if (gungwiA.career) cardHints += '- A: ' + gungwiA.career + '\n';
      if (gungwiB.career) cardHints += '- B: ' + gungwiB.career + '\n';
    }

    cardHints += '\n【용신 궁합】 → 서로에게 필요한 에너지\n';
    cardHints += '- A 용신: ' + ggA.yongshin + ' [' + ggA.yongshinType + ']\n';
    cardHints += '- B 용신: ' + ggB.yongshin + ' [' + ggB.yongshinType + ']\n';
    var aYongOh = ggA.yongshin.replace(/[^목화토금수]/g,'');
    var bYongOh = ggB.yongshin.replace(/[^목화토금수]/g,'');
    if (aYongOh && sajuB.el[aYongOh] >= 2) cardHints += '- ★ B가 A의 용신(' + aYongOh + ') 보완 가능!\n';
    if (bYongOh && sajuA.el[bYongOh] >= 2) cardHints += '- ★ A가 B의 용신(' + bYongOh + ') 보완 가능!\n';

    cardHints += '\n※ 위 힌트의 전문용어는 뉘앙스 참고용. 본문에 그대로 옮기지 마세요.\n';
    userPrompt += cardHints;
  } catch(e) { console.warn('[gunghap] 카드별 출발 힌트 실패:', e.message); }

  // ── A/B 대운 상세 + 세운 교차 ──
  try {
    var JIJANGGAN_DATA = data.JIJANGGAN_DATA;
    var getSipsung = data.getSipsung;

    function buildDWDetail(label, saju, dw) {
      var txt = '\n### ' + label + '의 대운 상세\n';
      txt += '대운 흐름 (' + dw.direction + ', ' + dw.daewoonAge + '세 시작):\n';
      dw.daewoons.forEach(function(d, i) {
        var prefix = (dw.currentDWIdx === i ? '★현재 ' : '  ');
        var jiJJG = JIJANGGAN_DATA[data.JIJI_KR.indexOf(d.ji)];
        var jiSS = jiJJG ? getSipsung(saju.raw.dg, jiJJG[jiJJG.length-1].g) : '';
        txt += prefix + d.startAge + '~' + d.endAge + '세 ' + d.gan + d.ji + '(' + d.ganH + d.jiH + ') — 전반: ' + d.ss + '운 / 후반: ' + (jiSS || '미상') + '운\n';
      });
      var cdw = dw.currentDWIdx >= 0 ? dw.daewoons[dw.currentDWIdx] : null;
      if (cdw) txt += '현재: ' + cdw.gan + cdw.ji + ' ' + cdw.ss + '운 (' + cdw.startAge + '~' + cdw.endAge + '세)\n';
      var nextDI = dw.currentDWIdx >= 0 ? dw.currentDWIdx + 1 : -1;
      var nextDW = nextDI >= 0 && nextDI < dw.daewoons.length ? dw.daewoons[nextDI] : null;
      if (nextDW) {
        txt += '다음 전환: ' + nextDW.startAge + '세 ' + nextDW.gan + nextDW.ji + ' ' + nextDW.ss + '운\n';
      }
      txt += '세운: ' + dw.seun.map(function(s){ return s.y + '년 ' + s.gan + s.ji + '(' + s.ss + ')'; }).join(', ') + '\n';
      return txt;
    }

    userPrompt += buildDWDetail('A', sajuA, dwA);
    userPrompt += buildDWDetail('B', sajuB, dwB);

    // 대운 전환점 교차
    var cdwA = dwA.currentDWIdx >= 0 ? dwA.daewoons[dwA.currentDWIdx] : null;
    var cdwB = dwB.currentDWIdx >= 0 ? dwB.daewoons[dwB.currentDWIdx] : null;
    var nextA = (dwA.currentDWIdx >= 0 && dwA.currentDWIdx + 1 < dwA.daewoons.length) ? dwA.daewoons[dwA.currentDWIdx + 1] : null;
    var nextB = (dwB.currentDWIdx >= 0 && dwB.currentDWIdx + 1 < dwB.daewoons.length) ? dwB.daewoons[dwB.currentDWIdx + 1] : null;
    if (nextA || nextB) {
      userPrompt += '\n### 대운 전환점 교차\n';
      if (nextA) userPrompt += '- A 다음 전환: ' + nextA.startAge + '세 → ' + nextA.ss + '운\n';
      if (nextB) userPrompt += '- B 다음 전환: ' + nextB.startAge + '세 → ' + nextB.ss + '운\n';
      if (nextA && nextB && Math.abs(nextA.startAge - nextB.startAge) <= 3) {
        userPrompt += '- ⚠️ A·B 대운 전환이 비슷한 시기! 관계에 큰 변화 가능\n';
      }
    }

    // 세운 교차 분석
    if (dwA.seun && dwB.seun) {
      userPrompt += '\n### 세운 교차\n';
      for (var si = 0; si < Math.min(dwA.seun.length, dwB.seun.length); si++) {
        var seA = dwA.seun[si], seB = dwB.seun[si];
        userPrompt += '- ' + seA.y + '년: A=' + seA.gan + seA.ji + '(' + seA.ss + ') / B=' + seB.gan + seB.ji + '(' + seB.ss + ')\n';
      }
    }
  } catch(e) { console.warn('[gunghap] 대운 상세 실패:', e.message); }

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

  userPrompt = termUtils.applyTermHints(userPrompt);

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
