// lib/validators.js — AI output post-validation and input validation
'use strict';

/* ====== AI output post-validation (v29.1) ====== */
function postValidateAI(result, dw, saju, gg) {
  if (!result || !result.categories) return result;
  if (!dw || !dw.daewoons) return result;
  var dwRanges = dw.daewoons.map(function(d) {
    return { start: d.startAge, end: d.endAge, text: d.startAge + '~' + d.endAge + '세' };
  });
  var fixCount = 0;
  result.categories.forEach(function(cat) {
    // v2: subs[{h,b}] or legacy items[{content,insightText}]
    var entries = cat.subs || cat.items || [];
    entries.forEach(function(item) {
      var txt = item.b || item.content;
      if (!txt) return;
      // 1. Daewoon age range correction
      txt = txt.replace(/(\d{1,2})~(\d{1,2})세/g, function(match, s, e) {
        var start = parseInt(s), end = parseInt(e), span = end - start;
        if (span >= 8 && span <= 11) {
          var found = dwRanges.some(function(r) { return r.start === start && r.end === end; });
          if (!found) {
            var closest = null, minDiff = 999;
            dwRanges.forEach(function(r) {
              var diff = Math.abs(r.start - start);
              if (diff < minDiff) { minDiff = diff; closest = r; }
            });
            if (closest && minDiff <= 5) {
              fixCount++;
              console.log('[PostValidate] 대운 나이 교정:', match, '→', closest.text);
              return closest.text;
            }
          }
        }
        return match;
      });
      // 2. insightText correction (legacy compat)
      if (item.insightText) {
        item.insightText = item.insightText.replace(/(\d{1,2})~(\d{1,2})세/g, function(match, s, e) {
          var start = parseInt(s), end = parseInt(e), span = end - start;
          if (span >= 8 && span <= 11) {
            var found = dwRanges.some(function(r) { return r.start === start && r.end === end; });
            if (!found) {
              var closest = null, minDiff = 999;
              dwRanges.forEach(function(r) {
                var diff = Math.abs(r.start - start);
                if (diff < minDiff) { minDiff = diff; closest = r; }
              });
              if (closest && minDiff <= 5) { fixCount++; return closest.text; }
            }
          }
          return match;
        });
      }
      // 3. Oheng count correction (when AI altered numbers)
      var ohNames = ['목','화','토','금','수'];
      ohNames.forEach(function(oh) {
        var ohRe = new RegExp(oh + '[=이가] ?(\\d+\\.?\\d*)', 'g');
        txt = txt.replace(ohRe, function(match, num) {
          var aiVal = parseFloat(num);
          var realVal = saju.el[oh];
          if (realVal !== undefined && aiVal !== realVal && Math.abs(aiVal - realVal) >= 1) {
            fixCount++;
            console.log('[PostValidate] 오행 교정:', oh, aiVal, '→', realVal);
            return match.replace(num, String(realVal));
          }
          return match;
        });
      });
      // 4. Seun year-ganji mismatch correction
      if (dw.seun) {
        dw.seun.forEach(function(se) {
          var wrongPattern = new RegExp(se.y + '년[^가-힣]*(갑|을|병|정|무|기|경|신|임|계)(자|축|인|묘|진|사|오|미|신|유|술|해)', 'g');
          txt = txt.replace(wrongPattern, function(match, g, j) {
            if (g !== se.gan || j !== se.ji) {
              fixCount++;
              console.log('[PostValidate] 세운 교정:', match, '→', se.y + '년 ' + se.gan + se.ji);
              return se.y + '년 ' + se.gan + se.ji;
            }
            return match;
          });
        });
      }
      // Store corrected text (v2: b / legacy: content)
      if (item.b !== undefined) item.b = txt;
      else item.content = txt;
    });
  });
  if (fixCount > 0) console.log('[PostValidate] 총 ' + fixCount + '건 교정 완료');
  return result;
}

/* ====== Gunghap AI output post-validation ====== */
// postValidateAI의 궁합 버전. A/B 두 사람의 대운/오행/세운을 합쳐 매칭.
function postValidateGunghapAI(result, dwA, dwB, sajuA, sajuB) {
  if (!result || !result.categories) return result;

  // 1) A/B 대운 범위 통합
  var dwRanges = [];
  if (dwA && dwA.daewoons) {
    dwA.daewoons.forEach(function(d) {
      dwRanges.push({ start: d.startAge, end: d.endAge, text: d.startAge + '~' + d.endAge + '세' });
    });
  }
  if (dwB && dwB.daewoons) {
    dwB.daewoons.forEach(function(d) {
      dwRanges.push({ start: d.startAge, end: d.endAge, text: d.startAge + '~' + d.endAge + '세' });
    });
  }

  // 2) A/B 오행 (둘 중 매칭되는 쪽으로 교정)
  var elA = (sajuA && sajuA.el) || {};
  var elB = (sajuB && sajuB.el) || {};

  // 3) A/B 세운을 연도별로 묶음 (같은 해 A·B 모두 가능)
  var seunByYear = {};
  function addSeun(seun) {
    if (!seun) return;
    seun.forEach(function(se) {
      if (!seunByYear[se.y]) seunByYear[se.y] = [];
      seunByYear[se.y].push(se);
    });
  }
  addSeun(dwA && dwA.seun);
  addSeun(dwB && dwB.seun);

  var fixCount = 0;
  result.categories.forEach(function(cat) {
    var entries = cat.subs || cat.items || [];
    entries.forEach(function(item) {
      var txt = item.b || item.content;
      if (!txt) return;

      // 1. 대운 나이 교정 (A/B 합쳐서 매칭)
      txt = txt.replace(/(\d{1,2})~(\d{1,2})세/g, function(match, s, e) {
        var start = parseInt(s), end = parseInt(e), span = end - start;
        if (span >= 8 && span <= 11) {
          var found = dwRanges.some(function(r) { return r.start === start && r.end === end; });
          if (!found) {
            var closest = null, minDiff = 999;
            dwRanges.forEach(function(r) {
              var diff = Math.abs(r.start - start);
              if (diff < minDiff) { minDiff = diff; closest = r; }
            });
            if (closest && minDiff <= 5) {
              fixCount++;
              console.log('[PostValidateGH] 대운 나이 교정:', match, '→', closest.text);
              return closest.text;
            }
          }
        }
        return match;
      });

      // 2. 오행 개수 교정 (A 또는 B 값 중 가까운 쪽으로)
      var ohNames = ['목','화','토','금','수'];
      ohNames.forEach(function(oh) {
        var ohRe = new RegExp(oh + '[=이가] ?(\\d+\\.?\\d*)', 'g');
        txt = txt.replace(ohRe, function(match, num) {
          var aiVal = parseFloat(num);
          var realA = elA[oh], realB = elB[oh];
          // 이미 A나 B 값과 일치하면 통과
          if (realA !== undefined && aiVal === realA) return match;
          if (realB !== undefined && aiVal === realB) return match;
          // 가까운 쪽으로 교정 (편차 1 이상일 때만)
          var dA = (realA !== undefined) ? Math.abs(aiVal - realA) : Infinity;
          var dB = (realB !== undefined) ? Math.abs(aiVal - realB) : Infinity;
          var matchedReal = null;
          if (dA < dB && dA >= 1) matchedReal = realA;
          else if (dB <= dA && dB >= 1) matchedReal = realB;
          if (matchedReal !== null && matchedReal !== undefined) {
            fixCount++;
            console.log('[PostValidateGH] 오행 교정:', oh, aiVal, '→', matchedReal);
            return match.replace(num, String(matchedReal));
          }
          return match;
        });
      });

      // 3. 세운 간지 교정 (A 또는 B의 해당 연도 간지 중 하나에 매칭)
      Object.keys(seunByYear).forEach(function(year) {
        var seArr = seunByYear[year];
        var wrongPattern = new RegExp(year + '년[^가-힣]*(갑|을|병|정|무|기|경|신|임|계)(자|축|인|묘|진|사|오|미|신|유|술|해)', 'g');
        txt = txt.replace(wrongPattern, function(match, g, j) {
          var ok = seArr.some(function(se) { return g === se.gan && j === se.ji; });
          if (ok) return match;
          var se = seArr[0];
          fixCount++;
          console.log('[PostValidateGH] 세운 교정:', match, '→', se.y + '년 ' + se.gan + se.ji);
          return se.y + '년 ' + se.gan + se.ji;
        });
      });

      if (item.b !== undefined) item.b = txt;
      else item.content = txt;
    });
  });
  if (fixCount > 0) console.log('[PostValidateGH] 총 ' + fixCount + '건 교정 완료');
  return result;
}

// Days in month (considering leap years)
function daysInMonth(y, m) {
  if (m === 2) {
    var leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].indexOf(m) >= 0) return 30;
  return 31;
}

// Input parameter validation (strengthened)
function validateInput(params) {
  var errors = [];
  var y = +params.y, m = +params.m, d = +params.d;

  // Birth date — bound upper year by current year (M1)
  var nowY = new Date().getFullYear();
  if (!y || y < 1920 || y > nowY) errors.push('년도 범위 초과');
  if (!m || m < 1 || m > 12) errors.push('월 범위 초과');
  if (!d || d < 1 || d > 31) errors.push('일 범위 초과');

  // Calendar-aware day check (M2): reject Feb 30, Apr 31, etc.
  if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    if (d > daysInMonth(y, m)) errors.push('해당 월에 없는 일자');
  }

  // Future-date check: same year but month/day in the future
  if (y && y === nowY) {
    var now = new Date();
    var birth = new Date(y, (m || 1) - 1, d || 1);
    if (birth > now) errors.push('미래 날짜');
  }

  // Hour (optional)
  if (params.h !== null && params.h !== '' && params.h !== undefined) {
    if (params.h < 0 || params.h > 23) errors.push('시간 범위 초과');
  }

  // Minute (optional) — M3
  if (params.min !== null && params.min !== '' && params.min !== undefined) {
    var minVal = +params.min;
    if (isNaN(minVal) || minVal < 0 || minVal > 59) errors.push('분 범위 초과');
  }

  // Gender
  if (params.gender && !['남성','여성','남','여'].includes(params.gender)) {
    errors.push('성별 값 이상');
  }

  // MBTI choices
  if (!params.mbtiChoices || !Array.isArray(params.mbtiChoices) || params.mbtiChoices.length !== 4) {
    errors.push('MBTI 선택값 이상');
  } else if (params.mbtiChoices.some(function(c) { return c !== 'L' && c !== 'R'; })) {
    errors.push('MBTI 선택값 범위 이상');
  }

  // Intensities (optional)
  if (params.mbtiIntensities && Array.isArray(params.mbtiIntensities)) {
    if (params.mbtiIntensities.some(function(i) { return i < 50 || i > 100; })) {
      errors.push('MBTI 강도 범위 초과');
    }
  }

  // XSS check on string fields
  var strFields = [params.gender, params.city].filter(Boolean);
  if (strFields.some(function(s) { return /<script|javascript:|on\w+=/i.test(String(s)); })) {
    errors.push('입력값에 스크립트 감지');
  }

  return errors.length > 0 ? errors.join(', ') : null;
}

// Gunghap input validation
function validateGunghapInput(paramsA, paramsB, relType) {
  if (!paramsA || !paramsB || !relType) return 'Missing required fields';
  if (!paramsA.y || !paramsA.m || !paramsA.d || !paramsA.mbtiType) return 'Invalid paramsA';
  if (!paramsB.y || !paramsB.m || !paramsB.d || !paramsB.mbtiType) return 'Invalid paramsB';
  // 날짜 범위 검증 (개인분석 동기화)
  if (paramsA.y < 1920 || paramsA.y > 2030) return 'Invalid year (A)';
  if (paramsA.m < 1 || paramsA.m > 12) return 'Invalid month (A)';
  if (paramsA.d < 1 || paramsA.d > 31) return 'Invalid day (A)';
  if (paramsB.y < 1920 || paramsB.y > 2030) return 'Invalid year (B)';
  if (paramsB.m < 1 || paramsB.m > 12) return 'Invalid month (B)';
  if (paramsB.d < 1 || paramsB.d > 31) return 'Invalid day (B)';
  var validRels = ['ssom', 'lover', 'colleague', 'friend'];
  if (validRels.indexOf(relType) === -1) return 'Invalid relType';
  var validMbti = ['INFP','ENFP','INFJ','ENFJ','INTP','ENTP','INTJ','ENTJ',
                   'ISFP','ESFP','ISFJ','ESFJ','ISTP','ESTP','ISTJ','ESTJ'];
  if (validMbti.indexOf(paramsA.mbtiType) === -1) return 'Invalid MBTI A';
  if (validMbti.indexOf(paramsB.mbtiType) === -1) return 'Invalid MBTI B';
  return null;
}

module.exports = {
  postValidateAI: postValidateAI,
  postValidateGunghapAI: postValidateGunghapAI,
  validateInput: validateInput,
  validateGunghapInput: validateGunghapInput
};
