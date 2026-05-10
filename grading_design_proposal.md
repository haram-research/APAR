# APAR 채점 설계 v2 — 실제 시험 데이터 기반 업데이트

> **데이터**: 주관식채점_기초자료_(2026_중간).xlsx  
> **규모**: 26문제 × 538명 = 13,988행  
> **업데이트**: 이전 제안서(v1)를 실제 답안 패턴으로 검증·수정

---

## 1. D열 정답 포맷 파싱 (핵심 발견)

교수님이 D열에 작성한 형식:
```
[form1],[form2],[form3],...
```
**각 `[...]`은 eclass가 정답으로 인정하는 완전한 표현 하나**를 의미.

### 실제 예시 분류

| 문제 | D열 정답 | 유형 |
|------|---------|------|
| 107 | `[magnet],[(magnet)]` | 단일 답 + 괄호 변형 |
| 97 | `[5, 7, 9],[5 7 9],[579],[(5) (7) (9)]` | 번호 리스트 |
| 110 | `[was, Did, gyre, ...],[was Did gyre ...]` | 단어 리스트 |
| 1 | `[manufuckingfacturer],[manu-fucking-facturer],...` | 철자 변형 다수 |

→ **APAR는 D열을 파싱해서 허용 답안 집합을 자동 구성해야 함**

```javascript
// D열 파싱 로직
const parseAnswerKey = (dCol) => {
  // "[form1],[form2]" → ["form1", "form2"]
  return [...dCol.matchAll(/\[([^\[\]]+)\]/g)].map(m => m[1].trim());
};
```

---

## 2. 실제 확인된 유니코드 문제 (v1 보완)

v1에서 예상한 문제 외에 실제 답안에서 발견된 문자들:

| 유니코드 | 문자 | 출처 | 예시 |
|---------|------|------|------|
| U+2006 | ` ` (six-per-em space) | 특수 자판 | `fu cki nu fa c tu r er` |
| U+2013 | `–` (en dash) | 맥 자판 | `au–bloody–tomatic` |
| U+2014 | `—` (em dash) | 맥 자판 | `au—bloody-tomatic` |
| U+2018/19 | `'`/`'` (curly quote) | 스마트 따옴표 | `'Twas` → eclass가 `'T`로 오인 |
| U+200B | (zero-width space) | 복붙 시 | 앞에 숨은 공백 |
| U+3001 | `、` (일본어 쉼표) | 아이폰 키보드 | `{university、manufacturer}` |

```javascript
// normalizeService.js — 실데이터 기반 확장
export const normalizeAnswer = (text) => {
  if (!text) return '';
  return text
    .replace(/\u200B/g, '')           // zero-width space 제거
    .replace(/[\u2006\u00A0\u3000]/g, ' ') // 특수 공백 → 일반 공백
    .replace(/[\u2013\u2014\u2212]/g, '-') // en/em dash → hyphen
    .replace(/[\u2018\u2019]/g, "'")   // curly single quote → '
    .replace(/[\u201C\u201D]/g, '"')   // curly double quote → "
    .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\u3001/g, ',')           // 일본어 쉼표 → ,
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
};
```

---

## 3. 문제 유형 분류 (실데이터 기반 확정)

### Type A — 단일 정답형 (완전 일치 또는 대안 표현)
**해당 문제**: 99, 103, 105, 106, 107, 112, 117, 118, 119, 120  
**특징**: 각 `[...]` 항목이 1~3개 단어 이하, 대안 표현만 다름  
**채점 전략**: D열 파싱 → 허용 표현 집합과 정규화된 학생 답 비교  
**부분점수**: 없음 (맞거나 틀리거나)

```javascript
const gradeTypeA = (studentAns, allowedForms, maxScore) => {
  const normalized = normalizeAnswer(studentAns).toLowerCase();
  const match = allowedForms.some(f => normalizeAnswer(f).toLowerCase() === normalized);
  return { score: match ? maxScore : 0, skipLLM: match };
  // 불일치 시 LLM에 위임 (스펠링 부분점수 판단)
};
```

### Type B — 형태 변형형 (expletive infixation 등)
**해당 문제**: 1, 96, 113  
**특징**: D열에 `[dis-fucking-honest, ab-fucking-normal]` 처럼 **2개 답을 동시에** 써야 하는 경우  
**실제 오답 패턴**: `dis-fucing-honest` (스펠링), `ad-fucking-mission` (오답 단어)  
**채점 전략**: Type A와 동일하되, LLM에게 "두 단어 모두 맞아야 함" 명시

### Type C — 단어 리스트형 (부분점수 핵심)
**해당 문제**: 100, 108, 109, 110  
**오답 비율**: 69~90% (eclass 현행 방식으로)

#### 문제 110 실제 상황 분석

```
정답: was, Did, gyre, gimble, Beware, bite, catch, Shun, sought (9개)
자동정답: 98명 (18.2%) / 자동오답: 440명 (81.8%)
```

**주요 오답 패턴**:
- `Twas, Did, gyre, gimble, Beware, bite, catch, Shun, sought` → 0점  
  → `was` 대신 `Twas` (438명 중 상당수) — **단어 1개 차이인데 전부 0점**
- `Did, Beware, bite, catch, Shun, sought` → 0점 (누락 3개)
- `brilling, did, gyre, gimble, bite, catch, shun, sought` → 0점 (오답+누락)

#### 문제 109 실제 상황 분석

```
정답: brillig, slithy, frumious, Long, manxome (5개)
자동정답: 52명 (9.7%) / 자동오답: 486명 (90.3%)
```

**주요 오답 패턴**:
- `brillig, slithy, frumious, manxome` → 0점 (Long 누락, 4/5개 정답)
- `brilling, slithy, frumious, Long, manxome` → 0점 (brillig 스펠링 오류)
- `brillig, silthy, frumious, Long, manxome` → 0점 (slithy 스펠링 오류)

#### Type C 채점 알고리즘

```javascript
const gradeTypeC = (studentAns, correctItems, maxScore) => {
  const normalize = s => normalizeAnswer(s).toLowerCase().trim();
  const correctSet = new Set(correctItems.map(normalize));
  
  // 학생 답변 파싱 (다양한 구분자 처리)
  const studentItems = studentAns
    .split(/[,\s]+/)
    .map(normalize)
    .filter(Boolean);

  // 오답 포함 여부 (정답 목록에 없는 항목)
  const wrongItems = studentItems.filter(item => !correctSet.has(item));
  if (wrongItems.length > 0) {
    return {
      score: 0,
      reason: `오답 포함 (${wrongItems.join(', ')}) → 0점`,
      skipLLM: false  // LLM에게 스펠링 유사성 판단 위임
    };
  }

  // 정답만 포함된 경우: 부분점수
  const correctCount = studentItems.filter(item => correctSet.has(item)).length;
  const partialScore = Math.round((correctCount / correctItems.length) * maxScore * 10) / 10;
  return {
    score: partialScore,
    reason: `${correctItems.length}개 중 ${correctCount}개 정답 (누락: ${correctItems.length - correctCount}개)`,
    skipLLM: true
  };
};
```

> **⚠️ `Twas` vs `was` 이슈**: 오답 판정이지만 LLM이 맥락상 부분점수 여부를 판단해야 함.  
> `wrongItems`가 있어도 `skipLLM: false`로 설정 → LLM이 최종 확인.

### Type D — 번호 선택형 (엄격, 부분점수 없음)
**해당 문제**: 97, 111, 114, 115, 116  
**정책**: 오답 포함 또는 누락 → 0점 (교수님 명시)

```
문제 114: 정답 [1,2,3,6]
  [1234] → 0점 (4 오답)  
  [12346] → 0점 (5 오답)
  [1,2,3] → 0점 (6 누락)
  → 부분점수 없음, 완전 일치만 정답
```

```javascript
const gradeTypeD = (studentAns, correctNumbers, maxScore) => {
  const normalize = s => s.replace(/[\(\)\s,]/g, ''); // 숫자만 추출
  const studentNums = [...new Set(normalize(studentAns).split('').filter(c => /\d/.test(c)))].sort();
  const correctNums = [...new Set(correctNumbers)].sort();
  const isExact = JSON.stringify(studentNums) === JSON.stringify(correctNums);
  return {
    score: isExact ? maxScore : 0,
    reason: isExact ? '정답' : `정답: ${correctNums.join('')}, 제출: ${studentNums.join('')}`,
    skipLLM: true
  };
};
```

---

## 4. 스펠링 오류 — LLM 위임 전략

실제 스펠링 오류 사례 (데이터에서 확인):

| 원래 정답 | 학생 오류 | 편집거리 |
|---------|---------|--------|
| `brillig` | `brilling` | 2 |
| `slithy` | `silthy` | 1 (전치) |
| `frumious` | `fruminous` | 1 |
| `Jabberwock` | `Jabberwork` | 1 |
| `Bandersnatch` | `Banersnatch` | 1 |
| `Bandersnatch` | `Bendersnatch` | 1 |
| `Jackendoff` | `Jakendoff` | 1 |

**전략**: 완전 일치 실패 시 → LLM에 전달, 프롬프트에 스펠링 정책 주입

```javascript
const SPELLING_PROMPT = `
[스펠링 오류 부분점수 정책]
- 편집 거리(Levenshtein) 1: 해당 항목 50% 감점
- 편집 거리 2 (단순 오타 수준): 해당 항목 30% 감점  
- 편집 거리 3 이상 또는 의미상 다른 단어: 0점
- 대소문자 차이만 있는 경우: 정답으로 인정
- 글자 순서 전치(transposition) 1회: 편집 거리 1과 동일 처리
`;
```

---

## 5. xlsx 직접 지원 (현재 CSV만 가능)

실제 시트가 xlsx이므로, SheetJS 추가 필요:

```bash
npm install xlsx
```

```javascript
// xlsxService.js
import * as XLSX from 'xlsx';

export const processXLSX = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      // 컬럼: Serial, 학번, 문제번호, D열(정답키), E열(학생답안), F열(자동점수)...
      resolve(data);
    };
    reader.readAsArrayBuffer(file);
  });
};
```

---

## 6. 새로운 채점 파이프라인 (업데이트)

```
[xlsx 업로드]
     ↓
[D열 파싱: parseAnswerKey()]
→ allowedForms[] 생성
→ 문제 유형 자동 감지 (A/B/C/D)
     ↓
[전처리: normalizeAnswer()]
→ U+2006, U+200B, en/em dash, curly quotes, 일본어 쉼표 등 정규화
     ↓
[유형별 사전 검증]
→ Type A: 허용 형식과 완전 일치? → 즉시 정답
→ Type C: 오답 포함? → LLM 위임 / 누락만? → 부분점수 계산(skipLLM)
→ Type D: 번호 완전 일치? → 즉시 정오답 (skipLLM 항상)
     ↓
[LLM 호출 (skipLLM=false인 경우만)]
→ 스펠링 정책 + 문제 유형 지시 자동 주입
→ 결과: score + reason
     ↓
[H열(수작업점수), I열(의견) 자동 채우기]
→ 결과 xlsx 다운로드
```

---

## 7. 구현 우선순위 (실데이터 기반 재조정)

| 순위 | 항목 | 근거 | 영향 문제 |
|:---:|------|------|---------|
| 1 | 유니코드 정규화 | 즉각 효과, 코드 10줄 | 전체 |
| 2 | D열 자동 파싱 | xlsx 구조가 이미 파싱에 최적화됨 | 전체 |
| 3 | xlsx 직접 지원 | 현재 CSV 변환 단계 필요 | 전체 |
| 4 | Type D 번호 검증 (skipLLM) | 97,111,114,115,116 → LLM 비용 0 | 5문제 |
| 5 | Type C 부분점수 | 108,109,110 → 0점 비율 75~90% 해소 | 3문제 |
| 6 | 스펠링 LLM 위임 | Jackendoff류 오타 구제 | 전체 |
| 7 | `Twas` vs `was` 처리 | 110번 440명 → LLM 판단 필요 | 110 |
