#!/usr/bin/env node
// scripts/translate-cross-v3.js
// 107개 미해결 번역 + 841개 전체 검증↔변환 피드백 루프
'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKey = envContent.match(/ANTHROPIC_API_KEY=(.+)/)[1].trim();

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey });

const BATCH_SIZE = 40;
const PARALLEL = 5;
const MAX_LOOP = 3;
const MODEL = 'claude-sonnet-4-6';

const PATTERN_PATH = path.join(__dirname, '..', 'lib', 'pattern-data.js');
const PUBLIC_PATTERN_PATH = path.join(__dirname, '..', 'public', 'pattern-data.js');
const ORIGINAL_PATH = path.join(__dirname, '.pattern-data-original.js');

const CHECKPOINT_DIR = path.join(__dirname, '.translate-checkpoint-v3');
if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });

function loadCheckpoint(name) {
  const p = path.join(CHECKPOINT_DIR, name + '.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return {}; }
}

function saveCheckpoint(name, obj) {
  const p = path.join(CHECKPOINT_DIR, name + '.json');
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try { fs.renameSync(tmp, p); } catch(e) { fs.writeFileSync(p, JSON.stringify(obj)); }
}

function clearCheckpoints() {
  if (!fs.existsSync(CHECKPOINT_DIR)) return;
  for (const f of fs.readdirSync(CHECKPOINT_DIR)) {
    try { fs.unlinkSync(path.join(CHECKPOINT_DIR, f)); } catch(e) {}
  }
}

// ── 프롬프트 ──
const TERM_MAP = `
[사주 전문용어 → 자연어 매핑]
비견=동료/자기 힘, 겁재=경쟁/승부, 식신=재능/표현, 상관=창의/날카로움
편재=큰 돈/사업, 정재=안정 수입, 편관=카리스마/압박, 정관=안정/질서
편인=영감/독창, 정인=학습/보호, 비겁=자기 에너지, 식상=표현 에너지
재성=재물 에너지, 관성=명예 에너지, 인성=학습 에너지
격국=에너지 구조, 용신=가장 필요한 에너지, 기신=방해 에너지
일주=본인/배우자 자리, 일간=나 자신, 월주=사회/직업 자리
년주=외부환경 자리, 시주=자녀/말년 자리, 배우자궁=배우자 자리
천간=하늘 에너지, 지지=땅 에너지, 지장간=숨겨진 에너지
도화살=매력 에너지, 역마살=이동 에너지, 화개살=영적/예술 에너지
신강=에너지 강함, 신약=에너지 약함, 십성=에너지 성격
주기능=가장 강한 성향, 열등기능=가장 약한 성향
grip=극심한 스트레스 상태, shadow=숨겨진 어두운 면
괴리=차이/갭, 수렴=같은 방향, 진단=파악/확인
`.trim();

const TRANSLATOR_SYSTEM = `당신은 MBTS(사주×MBTI) 분석 텍스트를 자연어로 번역하는 전문가입니다.

## 규칙
1. 패턴 ID 참조 (CROSS-XXX, P-CHAR-XXX, META-XXX) → 통째 삭제
2. 코드 변수/함수명 (MT_xxx, SJ_xxx, SSP[...], rootCause 등) → 삭제
3. 메타 분석 표현 ("심판 결과에서 S급", "이것은 ~의 역방향") → 삭제
4. 사주/MBTI 전문용어 → 매핑표 기준 자연어 치환
5. 톤: 친절한 설명체 ("~보인다", "~라는 뜻이다")
6. 핵심 인사이트 유실 금지
7. 길이: 원본의 50~100%

${TERM_MAP}

입력: [{"id":"xxx", "cross":"원본"}]
출력: [{"id":"xxx", "cross_new":"번역본"}]
JSON만 출력. 마크다운 백틱 금지.`;

const VALIDATOR_SYSTEM = `당신은 MBTS 번역 품질 검증자입니다.

## 체크 (하나라도 걸리면 NO)
1. 사주 전문용어 잔존: 십성(비견,겁재,식신,상관,편재,정재,편관,정관,편인,정인), 십성그룹(비겁,식상,재성,관성,인성), 격국명, 신살명, 통변 조합(식상생재,관살혼잡 등), 12운성명(장생,관대,건록,제왕 등), 5신(용신,기신 등), 강약(신강,신약)
2. 코드 레퍼런스: CROSS-XXX, MT_xxx, SJ_xxx, SSP[...], ILJU_KW, rootCause, coreFear, analyzeDWSE 등
3. 패턴 ID: P-CHAR-036, META-FIX-009, CROSS-FIX-007 등
4. MBTI 학술용어: Fi, Te, Ni, Se, Si, Fe, Ti, Ne, grip, shadow, 인지기능 스택, 주기능-열등기능
5. 핵심 인사이트 유실
6. 학술 톤: "진단한다", "수렴/괴리", "정량 체계", "이중 포착", "삼중 진단"
7. 메타 표현: "심판 결과에서", "~의 역방향", "~를 구현한다"

"사주","MBTI","에너지","흐름" OK.

입력: [{"id":"xxx", "cross":"현재 텍스트"}]
출력: [{"id":"xxx", "pass":true/false, "issues":["비견이라는 전문용어 잔존","학술 톤: 괴리 표현"]}]
issues는 구체적으로. JSON만. 백틱 금지.`;

const FIXER_SYSTEM = `당신은 MBTS 번역 보정 전문가입니다.
아래 텍스트가 검증에서 불합격했습니다. issues에 적힌 문제를 해결하세요.

## 규칙
- issues에 지적된 문제만 수정. 멀쩡한 부분 건드리지 말 것
- 사주/MBTI 전문용어 → 자연어 (매핑표 참고)
- 코드 레퍼런스, 패턴 ID → 삭제
- 학술 톤 → 친절한 설명체
- 핵심 인사이트 유실 금지

${TERM_MAP}

입력: [{"id":"xxx", "cross":"현재 텍스트", "issues":["문제1","문제2"]}]
출력: [{"id":"xxx", "cross_new":"보정본"}]
JSON만 출력. 백틱 금지.`;

// ── 유틸 ──
function findClosingQuote(str, startIdx) {
  let i = startIdx;
  while (i < str.length) {
    if (str[i] === '\\') { i += 2; continue; }
    if (str[i] === '"') return i;
    i++;
  }
  return -1;
}

function toBatches(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += BATCH_SIZE) out.push(arr.slice(i, i + BATCH_SIZE));
  return out;
}

function reloadPatternData() {
  delete require.cache[require.resolve(PATTERN_PATH)];
  const pd = require(PATTERN_PATH);
  return pd.MBTS_PATTERNS || pd;
}

function flattenCross(data) {
  const out = [];
  for (const cat of Object.keys(data)) {
    for (const sub of Object.keys(data[cat])) {
      for (const pat of data[cat][sub]) {
        if (pat.cross) out.push({ id: pat.id, cross: pat.cross });
      }
    }
  }
  return out;
}

function applyToFile(translated) {
  let src = fs.readFileSync(PATTERN_PATH, 'utf8');
  let ok = 0, fail = 0;
  for (const [id, newCross] of Object.entries(translated)) {
    if (typeof newCross !== 'string' || !newCross) { fail++; continue; }
    const idIdx1 = src.indexOf('"id": "' + id + '"');
    const idIdx2 = src.indexOf('"id":"' + id + '"');
    const idIdx = idIdx1 >= 0 ? idIdx1 : idIdx2;
    if (idIdx < 0) { fail++; continue; }

    const crossKeyIdx = src.indexOf('"cross"', idIdx);
    if (crossKeyIdx < 0 || crossKeyIdx - idIdx > 1000) { fail++; continue; }

    const colonIdx = src.indexOf(':', crossKeyIdx + 6);
    const valQuote = src.indexOf('"', colonIdx + 1);
    if (valQuote < 0) { fail++; continue; }

    const valStart = valQuote + 1;
    const valEnd = findClosingQuote(src, valStart);
    if (valEnd < 0) { fail++; continue; }

    const safe = newCross.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    src = src.substring(0, valStart) + safe + src.substring(valEnd);
    ok++;
  }
  fs.writeFileSync(PATTERN_PATH, src);
  if (fs.existsSync(PUBLIC_PATTERN_PATH)) fs.writeFileSync(PUBLIC_PATTERN_PATH, src);
  return { ok, fail };
}

async function callWithRetry(fn, maxRetry) {
  maxRetry = maxRetry || 3;
  for (let i = 0; i < maxRetry; i++) {
    try { return await fn(); }
    catch (e) {
      if ((e.status === 500 || e.status === 529) && i < maxRetry - 1) {
        const wait = (i + 1) * 5000;
        console.log('  ⏳ ' + e.status + ' 에러, ' + (wait/1000) + '초 후 재시도 (' + (i+1) + '/' + maxRetry + ')');
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

function parseTranslate(response) {
  const text = response.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    const out = {};
    for (const item of parsed) {
      if (item.id && typeof item.cross_new === 'string' && item.cross_new) out[item.id] = item.cross_new;
    }
    return out;
  } catch (e) {
    console.error('  JSON 파싱 실패:', e.message);
    return {};
  }
}

function parseValidate(response) {
  const text = response.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    const out = {};
    for (const item of parsed) {
      if (item.id) out[item.id] = { pass: !!item.pass, issues: item.issues || [] };
    }
    return out;
  } catch (e) {
    console.error('  JSON 파싱 실패 (val):', e.message);
    return {};
  }
}

// ── 배치 함수 ──
async function translateBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross }));
  const r = await callWithRetry(() => client.messages.create({
    model: MODEL, max_tokens: 16000, temperature: 0.3,
    system: TRANSLATOR_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(input) }]
  }));
  return parseTranslate(r);
}

async function validateBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross }));
  const r = await callWithRetry(() => client.messages.create({
    model: MODEL, max_tokens: 8000, temperature: 0,
    system: VALIDATOR_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(input) }]
  }));
  return parseValidate(r);
}

async function fixBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross, issues: p.issues }));
  const r = await callWithRetry(() => client.messages.create({
    model: MODEL, max_tokens: 16000, temperature: 0.3,
    system: FIXER_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(input) }]
  }));
  return parseTranslate(r);
}

// ── runParallel (체크포인트 + resume) ──
async function runParallel(batches, fn, label, checkpointName, initial) {
  const results = initial ? Object.assign({}, initial) : {};
  const queue = [...batches];
  let done = 0;
  async function worker(wid) {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch) break;
      try {
        Object.assign(results, await fn(batch, wid));
        done++;
        if (checkpointName) saveCheckpoint(checkpointName, results);
        process.stdout.write('  [' + label + '] ' + done + '/' + batches.length + ' (W' + wid + ')\r');
      } catch (e) {
        console.error('\n  ❌ W' + wid + ':', e.message);
        done++;
        if (checkpointName) saveCheckpoint(checkpointName, results);
      }
    }
  }
  await Promise.all(Array.from({length: PARALLEL}, (_, i) => worker(i + 1)));
  console.log('  [' + label + '] 완료              ');
  return results;
}

// ═══════════════════════════════════════════
async function main() {
  console.log('🚀 cross 2차 하네스 v3 (검증↔변환 피드백)\n');

  // ── 0단계: 107개 미해결 번역 ──
  const failedPath = path.join(__dirname, 'cross-translate-failed.json');
  if (fs.existsSync(failedPath)) {
    const failed = JSON.parse(fs.readFileSync(failedPath, 'utf8'));
    const failedIds = failed.map(f => f.id);
    console.log('── 0단계: 미해결 ' + failedIds.length + '개 번역 ──');

    if (!fs.existsSync(ORIGINAL_PATH)) {
      console.error('❌ 원본 미발견: ' + ORIGINAL_PATH);
      console.error('   git show 2cf4415:lib/pattern-data.js > ' + ORIGINAL_PATH);
      process.exit(1);
    }
    delete require.cache[require.resolve(ORIGINAL_PATH)];
    const origPd = require(ORIGINAL_PATH);
    const origData = origPd.MBTS_PATTERNS || origPd;

    const toTranslate = [];
    const failedSet = new Set(failedIds);
    for (const cat of Object.keys(origData)) {
      for (const sub of Object.keys(origData[cat])) {
        for (const pat of origData[cat][sub]) {
          if (failedSet.has(pat.id) && pat.cross) {
            toTranslate.push({ id: pat.id, cross: pat.cross });
          }
        }
      }
    }
    console.log('  원본 cross 추출: ' + toTranslate.length + '개');

    const prevStep0 = loadCheckpoint('step0-translate');
    const remaining = toTranslate.filter(p => typeof prevStep0[p.id] !== 'string' || !prevStep0[p.id]);
    if (Object.keys(prevStep0).length > 0) console.log('  📂 체크포인트 ' + Object.keys(prevStep0).length + '개 이미 완료');

    const step0Result = remaining.length > 0
      ? await runParallel(toBatches(remaining), translateBatch, '0-번역', 'step0-translate', prevStep0)
      : Object.assign({}, prevStep0);
    const r0 = applyToFile(step0Result);
    console.log('  ✅ 파일 반영: ' + r0.ok + ' OK / ' + r0.fail + ' 실패');
  } else {
    console.log('ℹ️ cross-translate-failed.json 없음 — 0단계 스킵\n');
  }

  // ── 1~MAX_LOOP단계: 검증↔변환 피드백 루프 ──
  for (let loop = 0; loop < MAX_LOOP; loop++) {
    console.log('\n═══ 루프 ' + (loop + 1) + '/' + MAX_LOOP + ' ═══');
    const currentData = reloadPatternData();
    const allCross = flattenCross(currentData);

    // 검증
    const valCpName = 'val-' + loop;
    const prevVal = loadCheckpoint(valCpName);
    if (Object.keys(prevVal).length > 0) console.log('  📂 검증 ' + Object.keys(prevVal).length + '개 이미 완료');
    const valRemaining = allCross.filter(p => !prevVal[p.id]);
    const valResults = valRemaining.length > 0
      ? await runParallel(toBatches(valRemaining), validateBatch, '검증-' + loop, valCpName, prevVal)
      : Object.assign({}, prevVal);

    const noList = [];
    let yesCount = 0;
    for (const p of allCross) {
      const r = valResults[p.id];
      if (r && r.pass) { yesCount++; }
      else if (r) {
        noList.push({ id: p.id, cross: p.cross, issues: r.issues });
      } else {
        noList.push({ id: p.id, cross: p.cross, issues: ['검증 미수행'] });
      }
    }
    console.log('  📊 YES ' + yesCount + ' / NO ' + noList.length);

    if (noList.length === 0) {
      console.log('🎉 전부 통과 — 루프 종료');
      break;
    }

    // 변환자 (NO 보정)
    const fixCpName = 'fix-' + loop;
    const prevFix = loadCheckpoint(fixCpName);
    const fixRemaining = noList.filter(p => typeof prevFix[p.id] !== 'string' || !prevFix[p.id]);
    if (Object.keys(prevFix).length > 0) console.log('  📂 보정 ' + Object.keys(prevFix).length + '개 이미 완료');
    const fixResults = fixRemaining.length > 0
      ? await runParallel(toBatches(fixRemaining), fixBatch, '보정-' + loop, fixCpName, prevFix)
      : Object.assign({}, prevFix);

    const rFix = applyToFile(fixResults);
    console.log('  ✅ 파일 반영: ' + rFix.ok + ' OK / ' + rFix.fail + ' 실패');
  }

  // ── 최종 ──
  console.log('\n── 최종 구문 검사 ──');
  let syntaxOK = false;
  try {
    require('child_process').execSync('node -c ' + PATTERN_PATH, { stdio: 'pipe' });
    console.log('✅ pattern-data.js 구문 OK');
    syntaxOK = true;
  } catch (e) {
    console.error('❌ 구문 오류!');
  }

  if (syntaxOK) {
    clearCheckpoints();
    console.log('🧹 체크포인트 정리 완료');
  } else {
    console.log('ℹ️ 체크포인트 보존 (재실행 시 이어하기)');
  }

  console.log('\n🏁 완료');
}

main().catch(e => { console.error('💥', e); process.exit(1); });
