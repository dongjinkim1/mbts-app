#!/usr/bin/env node
// scripts/translate-cross.js (v2)
// MBTS cross 필드 841개 → 자연어 번역 하네스
// 병렬 5 worker + 검증자 + 재작업 루프
// v2: require 로드, ID 기반 교체, saju/mbti 필드 제거
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
const MAX_RETRY = 2;
const MODEL = 'claude-sonnet-4-6';

// ── 체크포인트 디렉토리 (이어하기 지원) ──
const CHECKPOINT_DIR = path.join(__dirname, '.translate-checkpoint');
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
합충형해=에너지 결합/충돌/마찰, 12운성=에너지 생명주기
도화살=매력 에너지, 역마살=이동 에너지, 화개살=영적/예술 에너지
신강=에너지 강함, 신약=에너지 약함, 대운=10년 흐름, 세운=올해 흐름
살인상생=압박→지혜 전환, 식상생재=재능→돈 연결, 관살혼잡=명예와 압박 뒤섞임
재다신약=기회 많은데 힘 부족, 비겁탈재=경쟁자가 재물 가져감
MBTI: 주기능/열등기능 → "가장 강한 성향/가장 약한 성향"
인지기능 코드(Fi,Te,Ni 등) → 노출 금지, 자연어로 설명
그립(grip) → "극심한 스트레스 상태"
`.trim();

const TRANSLATOR_SYSTEM = `당신은 MBTS(사주×MBTI) 분석 텍스트를 자연어로 번역하는 전문가입니다.

## 규칙
1. 패턴 ID 참조 (CROSS-XXX, P-CHAR-XXX, META-XXX, P-YEAR-XXX 등) 포함 문장 → 통째 삭제
2. 코드 변수/함수명 (MT_xxx, SJ_xxx, SSP[...], analyzeDWSEvsWonkuk, rootCause 등) → 삭제
3. 메타 분석 표현 ("심판 결과에서 S급", "이것은 ~의 역방향", "~를 구현한다") → 삭제
4. 사주/MBTI 전문용어 → 아래 매핑표 기준 자연어 치환
5. 톤: 친절한 설명체 ("~보인다", "~라는 뜻이다", "~가 포인트다")
   - 딱딱한 학술("진단한다", "수렴/괴리의 진단적 가치") ❌
   - 너무 감성("소름 돋는 포인트예요~") ❌
6. 핵심 인사이트 유실 금지 — 원본이 말하는 핵심 메시지가 반드시 남아야 함
7. 길이: 원본의 50~100%. 삭제만으로 짧아지면 OK, 억지로 늘리지 말 것
8. "사주 단독 완결" 패턴은 사주 용어만 치환하고 구조 유지

${TERM_MAP}

## 입출력
입력: JSON 배열 [{"id":"xxx", "cross":"원본"}]
출력: JSON 배열 [{"id":"xxx", "cross_new":"번역본"}]
JSON만 출력하세요. 마크다운 백틱 금지.`;

const VALIDATOR_SYSTEM = `당신은 MBTS 텍스트 품질 검증자입니다.

## 체크항목 (하나라도 걸리면 FAIL)
1. 전문용어 잔존: 십성명(비견,겁재,식신 등), 격국명(편관격 등), 신살명(도화살 등), 통변(식상생재 등)
2. 코드 레퍼런스 잔존: CROSS-XXX, MT_xxx, SJ_xxx, SSP[...], rootCause 등
3. 패턴 ID 참조 잔존
4. MBTI 학술용어 잔존: Fi, Te, Ni, grip, 인지기능 스택, 주기능-열등기능 등
5. 핵심 인사이트 유실: 원본의 핵심 메시지가 번역에서 사라진 경우
6. 톤: 학술 분석 톤이 남아있는 경우 ("진단하므로", "수렴/괴리")

단, "사주", "MBTI"는 OK. "에너지", "흐름" 같은 자연어도 OK.

입력: [{"id":"xxx", "cross":"원본", "cross_new":"번역본"}]
출력: [{"id":"xxx", "pass":true/false, "issues":["문제1"]}]
JSON만 출력하세요.`;

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

// ═══════════════════════════════════════════
async function main() {
  console.log('🚀 MBTS cross 번역 하네스 v2\n');

  // ── 0단계: pat.saju/mbti 제거 ──
  console.log('── 0단계: pat.saju/mbti 제거 ──');
  const matcherPath = path.join(__dirname, '..', 'lib', 'pattern-matcher.js');
  let matcherSrc = fs.readFileSync(matcherPath, 'utf8');
  let sajuOK = false, mbtiOK = false;

  if (matcherSrc.includes("pat.saju) lines.push")) {
    matcherSrc = matcherSrc.replace(
      /^.*pat\.saju\) lines\.push.*$/m,
      '      // [REMOVED] pat.saju — 코드 레퍼런스, AI에 불필요'
    );
    sajuOK = true;
  }
  if (matcherSrc.includes("pat.mbti) lines.push")) {
    matcherSrc = matcherSrc.replace(
      /^.*pat\.mbti\) lines\.push.*$/m,
      '      // [REMOVED] pat.mbti — 코드 레퍼런스, AI에 불필요'
    );
    mbtiOK = true;
  }
  if (sajuOK || mbtiOK) {
    fs.writeFileSync(matcherPath, matcherSrc);
    console.log(`  pat.saju: ${sajuOK ? '✅ 제거' : '⚠️ 수동'} / pat.mbti: ${mbtiOK ? '✅ 제거' : '⚠️ 수동'}`);
  } else {
    console.log('  ℹ️ 이미 제거됨 또는 수동 확인 필요');
  }

  // ── 1단계: 패턴 로드 ──
  const patternPath = path.join(__dirname, '..', 'lib', 'pattern-data.js');
  const src = fs.readFileSync(patternPath, 'utf8');

  delete require.cache[require.resolve(patternPath)];
  const pd = require(patternPath);
  const data = pd.MBTS_PATTERNS || pd;

  const allPatterns = [];
  for (const cat of Object.keys(data)) {
    for (const sub of Object.keys(data[cat])) {
      for (const pat of data[cat][sub]) {
        if (pat.cross) allPatterns.push({ id: pat.id, cat, sub, cross: pat.cross });
      }
    }
  }
  console.log(`\n📊 ${allPatterns.length}개 패턴 로드`);

  // ── 체크포인트 이어하기: 이미 번역된 ID는 스킵 ──
  const prevTranslated = loadCheckpoint('translated');
  const prevDoneCount = Object.keys(prevTranslated).length;
  if (prevDoneCount > 0) console.log(`📂 체크포인트: 번역 ${prevDoneCount}개 이미 완료 — 스킵`);
  const remaining = allPatterns.filter(function(p) {
    return typeof prevTranslated[p.id] !== 'string' || !prevTranslated[p.id];
  });

  const batches = [];
  for (let i = 0; i < remaining.length; i += BATCH_SIZE)
    batches.push(remaining.slice(i, i + BATCH_SIZE));
  console.log(`📦 ${batches.length}개 배치 (남은 ${remaining.length}개)\n`);

  // ── 2단계: 번역 ──
  console.log('── 번역 (5 병렬) ──');
  const translated = batches.length > 0
    ? await runParallel(batches, translateBatch, '번역', 'translated', prevTranslated)
    : Object.assign({}, prevTranslated);

  // ── 3단계: 검증 (체크포인트 이어하기 지원) ──
  console.log('\n── 검증 (5 병렬) ──');
  const prevValidated = loadCheckpoint('validated');
  const valDoneCount = Object.keys(prevValidated).length;
  if (valDoneCount > 0) console.log(`📂 체크포인트: 검증 ${valDoneCount}개 완료 — 스킵`);
  const valInputAll = allPatterns.map(p => ({ id: p.id, cross: p.cross, cross_new: translated[p.id] || p.cross }));
  const valInputRemaining = valInputAll.filter(function(it) { return !prevValidated[it.id]; });
  const valBatches = [];
  for (let i = 0; i < valInputRemaining.length; i += BATCH_SIZE) valBatches.push(valInputRemaining.slice(i, i + BATCH_SIZE));
  const valResults = valBatches.length > 0
    ? await runParallel(valBatches, validateBatch, '검증', 'validated', prevValidated)
    : Object.assign({}, prevValidated);

  const failed = [];
  for (const [id, r] of Object.entries(valResults)) {
    if (!r.pass) failed.push({ id, cross: allPatterns.find(p => p.id === id)?.cross || '', issues: r.issues });
  }
  console.log(`\n✅ ${allPatterns.length - failed.length}개 통과 / ❌ ${failed.length}개 실패`);

  // ── 4단계: 재작업 (각 라운드별 체크포인트) ──
  let retryQueue = failed;
  for (let attempt = 1; attempt <= MAX_RETRY && retryQueue.length > 0; attempt++) {
    console.log(`\n── 재작업 ${attempt}/${MAX_RETRY} (${retryQueue.length}개) ──`);

    // 4-A: 재번역
    const retryCpName = 'retry-' + attempt + '-translated';
    const prevRetry = loadCheckpoint(retryCpName);
    const prevRetryCount = Object.keys(prevRetry).length;
    if (prevRetryCount > 0) console.log(`  📂 재번역 ${prevRetryCount}개 완료 — 스킵`);
    const retryRemaining = retryQueue.filter(function(p) { return typeof prevRetry[p.id] !== 'string' || !prevRetry[p.id]; });
    const rBatches = [];
    for (let i = 0; i < retryRemaining.length; i += BATCH_SIZE) rBatches.push(retryRemaining.slice(i, i + BATCH_SIZE));

    const retried = rBatches.length > 0
      ? await runParallel(rBatches, retryBatch, '재작업', retryCpName, prevRetry)
      : Object.assign({}, prevRetry);
    for (const [id, c] of Object.entries(retried)) {
      if (typeof c === 'string' && c) translated[id] = c;
    }
    saveCheckpoint('translated', translated);

    // 4-B: 재검증
    const reValCpName = 'retry-' + attempt + '-validated';
    const prevReVal = loadCheckpoint(reValCpName);
    const reInput = retryQueue.map(p => ({ id: p.id, cross: p.cross, cross_new: translated[p.id] || p.cross }));
    const reInputRemaining = reInput.filter(function(it) { return !prevReVal[it.id]; });
    const reBatches = [];
    for (let i = 0; i < reInputRemaining.length; i += BATCH_SIZE) reBatches.push(reInputRemaining.slice(i, i + BATCH_SIZE));
    const reResults = reBatches.length > 0
      ? await runParallel(reBatches, validateBatch, '재검증', reValCpName, prevReVal)
      : Object.assign({}, prevReVal);

    retryQueue = [];
    for (const item of reInput) {
      const r = reResults[item.id];
      if (r && !r.pass) retryQueue.push({ id: item.id, cross: item.cross, issues: r.issues });
    }
    console.log(`  통과: ${reInput.length - retryQueue.length} / 실패: ${retryQueue.length}`);
  }

  if (retryQueue.length > 0) {
    fs.writeFileSync(path.join(__dirname, 'cross-translate-failed.json'), JSON.stringify(retryQueue, null, 2));
    console.log(`\n⚠️ 미해결 ${retryQueue.length}개 → cross-translate-failed.json`);
  }

  // ── 5단계: ID 기반 파일 업데이트 ──
  console.log('\n── pattern-data.js 업데이트 ──');
  let updatedSrc = src;
  let ok = 0, fail = 0;

  for (const [id, newCross] of Object.entries(translated)) {
    if (typeof newCross !== 'string' || !newCross) { fail++; continue; }
    const idIdx1 = updatedSrc.indexOf('"id": "' + id + '"');
    const idIdx2 = updatedSrc.indexOf('"id":"' + id + '"');
    const idIdx = idIdx1 >= 0 ? idIdx1 : idIdx2;
    if (idIdx < 0) { fail++; continue; }

    const crossKeyIdx = updatedSrc.indexOf('"cross"', idIdx);
    if (crossKeyIdx < 0 || crossKeyIdx - idIdx > 1000) { fail++; continue; }

    const colonIdx = updatedSrc.indexOf(':', crossKeyIdx + 6);
    const valQuote = updatedSrc.indexOf('"', colonIdx + 1);
    if (valQuote < 0) { fail++; continue; }

    const valStart = valQuote + 1;
    const valEnd = findClosingQuote(updatedSrc, valStart);
    if (valEnd < 0) { fail++; continue; }

    const safe = newCross.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    updatedSrc = updatedSrc.substring(0, valStart) + safe + updatedSrc.substring(valEnd);
    ok++;
  }

  fs.writeFileSync(patternPath + '.bak', src);
  fs.writeFileSync(patternPath, updatedSrc);
  console.log(`✅ ${ok}개 업데이트 / ⚠️ ${fail}개 교체실패`);

  const publicPath = path.join(__dirname, '..', 'public', 'pattern-data.js');
  if (fs.existsSync(publicPath)) {
    fs.writeFileSync(publicPath + '.bak', fs.readFileSync(publicPath));
    fs.writeFileSync(publicPath, updatedSrc);
    console.log('✅ public/ 동기화');
  }

  let syntaxOK = false;
  try {
    require('child_process').execSync('node -c ' + patternPath, { stdio: 'pipe' });
    console.log('✅ 구문 검사 통과');
    syntaxOK = true;
  } catch (e) {
    console.error('❌ 구문 오류! .bak에서 복원하세요');
  }

  // 성공 시 체크포인트 cleanup
  if (syntaxOK && ok > 0) {
    clearCheckpoints();
    console.log('🧹 체크포인트 정리 완료');
  } else {
    console.log('ℹ️ 체크포인트 보존 (재실행 시 이어하기)');
  }

  console.log('\n🏁 완료');
}

// ═══════════════════════════════════════════
async function runParallel(batches, fn, label, checkpointName, initial) {
  const results = initial ? Object.assign({}, initial) : {};
  const queue = [...batches];
  let done = 0;
  async function worker(wid) {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch) break;
      try {
        const batchResult = await fn(batch, wid);
        Object.assign(results, batchResult);
        done++;
        // 체크포인트: 배치 완료마다 즉시 저장
        if (checkpointName) saveCheckpoint(checkpointName, results);
        process.stdout.write(`  [${label}] ${done}/${batches.length} (W${wid})\r`);
      } catch (e) {
        console.error(`\n  ❌ W${wid}:`, e.message);
        for (const item of batch) results[item.id] = item.cross || item.cross_new || '';
        done++;
        if (checkpointName) saveCheckpoint(checkpointName, results);
      }
    }
  }
  await Promise.all(Array.from({length: PARALLEL}, (_, i) => worker(i + 1)));
  console.log(`  [${label}] 완료              `);
  return results;
}

async function translateBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross }));
  const r = await client.messages.create({ model: MODEL, max_tokens: 16000, temperature: 0.3, system: TRANSLATOR_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(input) }] });
  const parsed = JSON.parse(r.content[0].text.replace(/```json|```/g, '').trim());
  const out = {};
  for (const item of parsed) out[item.id] = item.cross_new;
  return out;
}

async function validateBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross, cross_new: p.cross_new }));
  const r = await client.messages.create({ model: MODEL, max_tokens: 8000, temperature: 0, system: VALIDATOR_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(input) }] });
  const parsed = JSON.parse(r.content[0].text.replace(/```json|```/g, '').trim());
  const out = {};
  for (const item of parsed) out[item.id] = { pass: item.pass, issues: item.issues || [] };
  return out;
}

async function retryBatch(batch) {
  const input = batch.map(p => ({ id: p.id, cross: p.cross, issues: p.issues }));
  const r = await client.messages.create({ model: MODEL, max_tokens: 16000, temperature: 0.3, system: TRANSLATOR_SYSTEM, messages: [{ role: 'user', content: `이전 번역 문제를 수정하세요.\n\n${JSON.stringify(input, null, 2)}\n\n[{"id":"xxx","cross_new":"수정본"}] JSON만.` }] });
  const parsed = JSON.parse(r.content[0].text.replace(/```json|```/g, '').trim());
  const out = {};
  for (const item of parsed) out[item.id] = item.cross_new;
  return out;
}

main().catch(e => { console.error('💥', e); process.exit(1); });
