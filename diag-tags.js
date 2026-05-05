// diag-tags.js — buildUserTags 서버 환경 진단 스크립트
// 실행: node diag-tags.js

var pd = require('./lib/pattern-data.js');
var buildUserTags = pd.buildUserTags;

// 가짜 데이터
var saju = {
  raw: { dg: 0, dj: 6 },
  uns: ['건록','제왕','관대','사'],
  specialSals: [{ name: '도화살' }, { name: '역마살' }],
  jiSS: [
    { ss: '편관' }, { ss: '정재' }, { ss: '비견' }, { ss: '식신' }
  ],
  ss: [
    { ss: '겁재' }, { ss: '편인' }, { ss: '비견' }, { ss: '식신' }
  ],
  amhap: []
};

var gg = {
  strengthGrade: '신강',
  gyeokgukName: '편관격',
  cnt: { '비겁': 2.0, '식상': 1.5, '재성': 0.5, '관성': 1.0, '인성': 0.5 },
  yongshin: '금',
  yongshinType: '억부',
  johuYongshin: '수'
};

var dw = { currentAge: 35 };
var mbtiType = 'INFP';
var intensities = { I: 88, N: 68, F: 77, P: 55, E: 12, S: 32, T: 23, J: 45 };

// 호출
var tags = buildUserTags(saju, gg, dw, mbtiType, intensities);

console.log('\n========================================');
console.log('  buildUserTags 진단 결과');
console.log('========================================\n');

console.log('총 태그 개수: ' + tags.length + '\n');

console.log('전체 태그 목록:');
for (var i = 0; i < tags.length; i++) {
  console.log('  ' + (i + 1) + '. ' + tags[i]);
}

console.log('\n----------------------------------------');
console.log('  누락 체크 (prefix별)');
console.log('----------------------------------------');

var prefixes = ['dm:', 'relation:', 'tongbyeon:', 'cf:', 'unsung:', 'sinsal:', 'yongshin:'];
var deps = {
  'dm:': 'engine.js TGAN_KR',
  'relation:': 'engine.js calcRelations',
  'tongbyeon:': 'saju-theory-server.js SJ_detectTongbyeon',
  'cf:': 'engine.js TY',
  'unsung:': 'saju.uns',
  'sinsal:': 'saju.specialSals',
  'yongshin:': 'gg.yongshin'
};

for (var p = 0; p < prefixes.length; p++) {
  var prefix = prefixes[p];
  var matches = tags.filter(function(t) { return t.indexOf(prefix) === 0; });
  var status = matches.length > 0 ? '✅' : '❌';
  var detail = matches.length > 0
    ? '(' + matches.length + '개: ' + matches.join(', ') + ')'
    : '(누락 — 의존: ' + deps[prefix] + ')';
  console.log('  ' + status + ' ' + prefix.padEnd(12) + detail);
}

console.log('\n========================================\n');
