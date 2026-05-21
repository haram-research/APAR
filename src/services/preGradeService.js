/**
 * preGradeService.js
 * LLM 없이 동작하는 규칙 기반 사전 채점 레이어
 *
 * Type A — 단일/구 정답형: 정규화 후 허용 표현 집합과 완전 일치 검사
 * Type C — 단어 리스트형: 항목별 매칭 + Levenshtein 스펠링 허용 + 부분점수
 * Type D — 번호 선택형: 숫자 집합 완전 일치 (오답/누락 시 0점)
 */

import { normalizeAnswer, normalizeCI } from './normalizeService.js';

// ─────────────────────────────────────────────
// D열 파싱
// ─────────────────────────────────────────────

/**
 * 최상위 [...] 그룹만 추출하는 깊이 추적 파서 (P1)
 * [[p],[d]] → ["[p],[d]"]  (중첩 괄호 보존)
 * [ans1][ans2] → ["ans1", "ans2"]
 */
export const parseAnswerKey = (dCol) => {
  if (!dCol || dCol === 'None') return [];
  const str = String(dCol);
  const results = [];
  let depth = 0, start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        const inner = str.slice(start + 1, i).trim();
        if (inner) results.push(inner);
        start = -1;
      }
    }
  }
  return results;
};

// ─────────────────────────────────────────────
// 문제 유형 자동 감지
// ─────────────────────────────────────────────

/**
 * Type C 판정 기준을 options.listMinItems(기본 5)개 이상으로 상향 (P2-C1)
 * → 3단어 구/제목(102, 104)이 오검출되던 문제 해결
 */
export const detectQuestionType = (allowedForms, options = {}) => {
  if (!allowedForms.length) return 'UNKNOWN';

  // Type D: 모든 form이 숫자 + 구분자만으로 구성
  const isAllDigits = allowedForms.every((f) => /^[\d\s,().]+$/.test(f));
  if (isAllDigits) return 'D';

  // Type C: 어느 form이라도 쉼표 구분 항목이 listMinItems개 이상
  const listMinItems = options.listMinItems ?? 5;
  const hasListForm = allowedForms.some(
    (f) => f.split(',').map((t) => t.trim()).filter(Boolean).length >= listMinItems
  );
  if (hasListForm) return 'C';

  // Type E: 어느 form이라도 단어 수가 5개 이상인 문장형
  const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
  const hasSentenceForm = allowedForms.some((f) => wordCount(f) >= 5);
  if (hasSentenceForm) return 'E';

  return 'A';
};

// ─────────────────────────────────────────────
// Levenshtein 거리
// ─────────────────────────────────────────────

/**
 * Optimal String Alignment (OSA) 거리
 * 표준 Levenshtein + 인접 두 문자 전치(transposition)를 편집 1회로 계산
 * silthy → slithy = 1 (전치), brilling → brillig = 1 (삭제)
 */
export const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
        }
      }
    }
  }
  return dp[m][n];
};

/**
 * 단어 길이 기반 허용 편집 거리 계산
 * mode: 'strict' | 'lenient' | 'none'
 * P3: 기준 하한을 ≤4 → ≤3으로 조정 (4자 단어도 1오타 허용)
 */
const spellThreshold = (wordLen, mode) => {
  if (mode === 'none') return -1;
  const base = wordLen <= 3 ? 0 : wordLen <= 7 ? 1 : 2;
  return mode === 'lenient' ? base + 1 : base;
};

// ─────────────────────────────────────────────
// 편집 diff 헬퍼 (편집거리 1 전용)
// ─────────────────────────────────────────────

/**
 * 편집거리가 정확히 1인 두 문자열의 차이를 한국어로 기술
 * from: 학생 답안(정규화), to: 정답(정규화)
 * 반환: "a→b" | "a 추가" | "a 누락" | "ab→ba" | null
 */
const describeEdit1 = (from, to) => {
  const fl = from.length, tl = to.length
  if (fl === tl) {
    const diffs = []
    for (let i = 0; i < fl; i++) if (from[i] !== to[i]) diffs.push(i)
    if (diffs.length === 2) {
      const [i, j] = diffs
      if (from[i] === to[j] && from[j] === to[i])
        return `${from[i]}${from[j]}→${to[i]}${to[j]}`
    }
    if (diffs.length === 1) return `${from[diffs[0]]}→${to[diffs[0]]}`
  } else if (fl === tl + 1) {
    for (let i = 0; i <= tl; i++) {
      if (from.slice(0, i) === to.slice(0, i) && from.slice(i + 1) === to.slice(i))
        return `'${from[i]}' 추가`
    }
  } else if (fl === tl - 1) {
    for (let i = 0; i <= fl; i++) {
      if (from.slice(0, i) === to.slice(0, i) && from.slice(i) === to.slice(i + 1))
        return `'${to[i]}' 누락`
    }
  }
  return null
}

// ─────────────────────────────────────────────
// 구분자 무시 탐지 헬퍼 (Type A 전용)
// ─────────────────────────────────────────────

const SEP_NAMES = {
  '-': '하이픈', ' ': '공백', ',': '쉼표',
  '(': '소괄호', ')': '소괄호', '[': '대괄호', ']': '대괄호',
}

const detectIgnoredSeps = (normStudent, note) => {
  const pattern = note === 'canonical' ? /[()[\],]/g : /[()\[\] ,\-]/g
  const chars = [...normStudent.matchAll(pattern)].map(m => m[0])
  if (!chars.length) return '구분자 무시'
  const names = [...new Set(chars.map(c => SEP_NAMES[c] ?? `'${c}'`))]
  return names.join('·') + ' 무시'
}

// ─────────────────────────────────────────────
// Type A 채점: 정규화 + 완전 일치 (4단계)
// ─────────────────────────────────────────────

const canonicalize = (s) =>
  s.replace(/[()[\]]/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

const stripAll = (s) => s.replace(/[()\[\]\s,\-]/g, '');

/**
 * P2-C3: levenshteinMode → levenshteinModeA (Type A 전용 키)
 * P2-C3: 편집거리 상한을 1로 고정 (교수 기준: 거리≥2 → 0점)
 */
export const gradeTypeA = (studentAns, allowedForms, options = {}) => {
  const { levenshteinModeA = 'none', fuzzyScoreRatio = 0 } = options;
  const normStudent = normalizeCI(studentAns);

  // 1단계: 완전 일치
  for (const form of allowedForms) {
    if (normalizeCI(form) === normStudent)
      return { matched: true, matchedForm: form };
  }

  // 2단계: 구분자 정규화 일치
  const canStudent = canonicalize(normStudent);
  for (const form of allowedForms) {
    if (canonicalize(normalizeCI(form)) === canStudent)
      return { matched: true, matchedForm: form, note: 'canonical' };
  }

  // 3단계: 구분자 전체 제거 일치
  const strippedStudent = stripAll(normStudent);
  if (strippedStudent.length <= 30) {
    for (const form of allowedForms) {
      if (stripAll(normalizeCI(form)) === strippedStudent)
        return { matched: true, matchedForm: form, note: 'separator-stripped' };
    }
  }

  // 4단계: Levenshtein 유사 매칭 (편집거리 1 상한 고정)
  if (levenshteinModeA !== 'none') {
    let bestDist = Infinity, bestForm = null, bestNormForm = null;
    for (const form of allowedForms) {
      const normForm = normalizeCI(form);
      const refLen = Math.max(normStudent.length, normForm.length);
      const threshold = Math.min(spellThreshold(refLen, levenshteinModeA), 1);
      if (threshold < 0) continue;
      const dist = levenshtein(normStudent, normForm);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestForm = form;
        bestNormForm = normForm;
      }
    }
    if (bestForm) {
      const diffDesc = bestDist === 1 ? describeEdit1(normStudent, bestNormForm) : null;
      return { matched: true, matchedForm: bestForm, fuzzy: true, dist: bestDist, fuzzyScoreRatio, diffDesc };
    }
  }

  return { matched: false };
};

// ─────────────────────────────────────────────
// Type C 채점: 항목별 매칭 + 부분점수
// ─────────────────────────────────────────────

/**
 * 허용 form들을 위치별 허용 토큰 목록으로 변환 (P5)
 * - 가장 긴 form들에서 위치별 대안을 수집
 * - 필수 항목 수(totalItems)는 가장 짧은 form의 길이로 설정
 *   → 선택적 추가 항목(예: Q108의 'Twas)이 있어도 기준 점수에 영향 없음
 * 반환: { positions: [[alt1, alt2, ...], ...], totalItems: number }
 */
const extractCorrectPositions = (allowedForms) => {
  const allSets = allowedForms.map((form) =>
    form.split(',').map((t) => t.trim()).filter(Boolean)
  );
  const lengths = allSets.map((s) => s.length).filter((n) => n > 0);
  if (!lengths.length) return { positions: [], totalItems: 0 };

  const minCount = Math.min(...lengths);
  const maxCount = Math.max(...lengths);
  const maxSets = allSets.filter((s) => s.length === maxCount);
  const positions = Array.from({ length: maxCount }, (_, i) =>
    [...new Set(maxSets.map((s) => s[i]).filter(Boolean))]
  );
  return { positions, totalItems: minCount };
};

const applyRounding = (val, mode) => {
  if (mode === 'ceil')  return Math.ceil(val);
  if (mode === 'floor') return Math.floor(val);
  if (mode === 'half')  return Math.round(val * 2) / 2;
  return Math.round(val);
}

/**
 * 유사 매칭 점수 계산 (Type A/B, E 공통)
 */
const calcFuzzyScore = (maxScore, options) => {
  const {
    fuzzyThresholdEnabled = false,
    fuzzyThresholdMax = 4,
    fuzzyThresholdScore = 1,
    fuzzyScoreRatio = 0.5,
    roundingMode = 'floor',
  } = options
  if (fuzzyThresholdEnabled && maxScore <= fuzzyThresholdMax) {
    return fuzzyThresholdScore
  }
  return applyRounding(maxScore * fuzzyScoreRatio, roundingMode)
}

/**
 * P6: wrongTokenCount 파라미터 추가, failCutoff 정책 추가
 * failCutoff: 오답+누락 ≥ N이면 0점, 그 이하이면 비례 점수
 */
const calcPartialScore = (correctCount, totalItems, maxScore, options, wrongTokenCount = 0) => {
  const {
    partialPolicy = 'proportional',
    roundingMode = 'round',
    pointsPerItem = 1,
    deductionPerWrong = 1,
    thresholdMin = 1,
    failCutoffN = 1,
  } = options
  const missingCount = totalItems - correctCount

  let raw
  switch (partialPolicy) {
    case 'fixed':
      raw = Math.min(correctCount * pointsPerItem, maxScore)
      break
    case 'deduction':
      raw = Math.max(maxScore - missingCount * deductionPerWrong, 0)
      break
    case 'threshold':
      raw = correctCount >= thresholdMin
        ? (correctCount / totalItems) * maxScore
        : 0
      break
    case 'failCutoff':
      raw = (wrongTokenCount + missingCount >= failCutoffN)
        ? 0
        : (correctCount / totalItems) * maxScore
      break
    default: // proportional
      raw = (correctCount / totalItems) * maxScore
  }
  return applyRounding(raw, roundingMode)
}

/**
 * P2-C3: levenshteinMode → levenshteinModeC (Type C 전용 키)
 * P4: 중복 토큰 감지 — 이미 매칭된 토큰의 재출현을 'duplicate'로 처리 (오답 카운트 제외)
 * P5: extractCorrectPositions의 totalItems(minCount) 사용
 */
export const gradeTypeC = (studentAns, allowedForms, maxScore, options = {}) => {
  const { wrongPolicy = 'zero', levenshteinModeC = 'strict' } = options;

  const { positions: correctPositions, totalItems } = extractCorrectPositions(allowedForms);
  if (!correctPositions.length) return null;

  const normalize = (s) => normalizeAnswer(s).toLowerCase().trim();
  const normPositions = correctPositions.map((alts) => alts.map(normalize));

  const studentTokens = studentAns
    .split(/[,，、\s]+/)
    .map(normalize)
    .filter(Boolean);

  if (!studentTokens.length) {
    return { score: 0, reason: '미응답', gradingStatus: 'blank', questionType: 'C' };
  }

  const matchResults = [];
  const usedPosIdx = new Set();
  const matchedNormTokens = new Set(); // P4: 중복 감지용

  for (const token of studentTokens) {
    // P4: 이미 매칭된 동일 토큰 → 중복으로 표시하고 건너뜀
    if (matchedNormTokens.has(token)) {
      matchResults.push({ token, type: 'duplicate' });
      continue;
    }

    // 1차: 완전 일치
    let matched = false;
    for (let i = 0; i < normPositions.length; i++) {
      if (usedPosIdx.has(i)) continue;
      if (normPositions[i].includes(token)) {
        matchResults.push({ token, type: 'exact', correctItem: correctPositions[i][0] });
        usedPosIdx.add(i);
        matchedNormTokens.add(token);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 2차: Levenshtein 유사 매칭
    let bestDist = Infinity, bestPosIdx = -1, bestNormAlt = null;
    for (let i = 0; i < normPositions.length; i++) {
      if (usedPosIdx.has(i)) continue;
      for (const normAlt of normPositions[i]) {
        const wordLen = Math.max(token.length, normAlt.length);
        const threshold = spellThreshold(wordLen, levenshteinModeC);
        if (threshold < 0) continue;
        const dist = levenshtein(token, normAlt);
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          bestPosIdx = i;
          bestNormAlt = normAlt;
        }
      }
    }

    if (bestPosIdx !== -1) {
      const diffDesc = bestDist === 1 ? describeEdit1(token, bestNormAlt) : null;
      matchResults.push({ token, type: 'fuzzy', dist: bestDist, correctItem: correctPositions[bestPosIdx][0], diffDesc });
      usedPosIdx.add(bestPosIdx);
      matchedNormTokens.add(token);
    } else {
      matchResults.push({ token, type: 'wrong' });
    }
  }

  const exactCount = matchResults.filter((r) => r.type === 'exact').length;
  const fuzzyCount = matchResults.filter((r) => r.type === 'fuzzy').length;
  const wrongTokens = matchResults.filter((r) => r.type === 'wrong').map((r) => r.token);
  const duplicateTokens = matchResults.filter((r) => r.type === 'duplicate').map((r) => r.token);
  // P5: totalItems(minCount) 초과 불가
  const correctCount = Math.min(exactCount + fuzzyCount, totalItems);

  if (wrongTokens.length > 0 && wrongPolicy === 'zero') {
    return {
      score: 0,
      reason: `오답 포함 (${wrongTokens.join(', ')}) → 0점`,
      gradingStatus: 'wrong',
      questionType: 'C',
    };
  }

  // P5: 선택적 위치(totalItems 초과 인덱스)는 누락으로 계산하지 않음
  const missingCount = totalItems - Math.min(usedPosIdx.size, totalItems);
  let score = calcPartialScore(correctCount, totalItems, maxScore, options, wrongTokens.length);

  // 오탈자 점수 상한 적용 (Type C 전용)
  if (fuzzyCount > 0 && options.typeCFuzzyCapEnabled) {
    const cap = calcFuzzyScore(maxScore, {
      fuzzyThresholdEnabled: true,
      fuzzyThresholdMax: options.typeCFuzzyThresholdMax ?? 4,
      fuzzyThresholdScore: options.typeCFuzzyThresholdScore ?? 1,
      fuzzyScoreRatio: options.typeCFuzzyScoreRatio ?? 0.33,
      roundingMode: options.roundingMode ?? 'round',
    });
    score = Math.min(score, cap);
  }

  let reason = `${totalItems}개 항목 중 ${correctCount}개 일치`;
  if (fuzzyCount > 0) {
    const fuzzyItems = matchResults.filter((r) => r.type === 'fuzzy');
    const fuzzyDescs = fuzzyItems.map((r) => {
      const diffStr = r.diffDesc ? `, ${r.diffDesc}` : '';
      return `스펠링 오류(편집거리 ${r.dist}${diffStr})`;
    });
    reason += ` (${fuzzyDescs.join(', ')} — 검토 권장)`;
  }
  if (missingCount > 0) reason += `, ${missingCount}개 누락`;
  if (wrongTokens.length > 0) reason += `, 오답(${wrongTokens.join(', ')}) 제외 후 계산`;
  if (duplicateTokens.length > 0) reason += `, 중복 무시(${duplicateTokens.join(', ')})`;

  const gradingStatus =
    fuzzyCount > 0 ? 'fuzzy'
    : score === maxScore ? 'correct'
    : 'partial';

  return { score, reason, gradingStatus, questionType: 'C' };
};

// ─────────────────────────────────────────────
// Type E 채점: 문장 전체 Levenshtein
// ─────────────────────────────────────────────

/**
 * options: { sentenceThreshold: 0~1 (기본 0.3 = 편집거리/문장길이 ≤ 30%) }
 * 유사 범위 내: 만점 + fuzzy 플래그 (조교 검토 권장)
 * 유사 범위 초과: 0점 + review 플래그
 */
export const gradeTypeE = (studentAns, allowedForms, maxScore, options = {}) => {
  const { sentenceThreshold = 0.3 } = options;

  const normalize = (s) => normalizeAnswer(s).toLowerCase().trim();
  const normStudent = normalize(studentAns);

  if (!normStudent) {
    return { score: 0, reason: '미응답', gradingStatus: 'blank', questionType: 'E' };
  }

  let bestDist = Infinity;
  let bestForm = allowedForms[0];
  for (const form of allowedForms) {
    const dist = levenshtein(normStudent, normalize(form));
    if (dist < bestDist) { bestDist = dist; bestForm = form; }
  }

  const refLen = Math.max(normStudent.length, normalize(bestForm).length);
  const ratio = refLen > 0 ? bestDist / refLen : 0;
  const pct = Math.round(ratio * 100);

  if (bestDist === 0) {
    return {
      score: maxScore,
      reason: `정답 일치`,
      gradingStatus: 'correct',
      questionType: 'E',
    };
  }

  if (ratio <= sentenceThreshold) {
    const score = calcFuzzyScore(maxScore, {
      ...options,
      fuzzyThresholdEnabled: options.sentenceThresholdEnabled ?? false,
      fuzzyThresholdMax: options.sentenceThresholdMax ?? 4,
      fuzzyThresholdScore: options.sentenceThresholdScore ?? 1,
      fuzzyScoreRatio: options.sentenceFuzzyScoreRatio ?? 0.5,
    });
    const pctScore = Math.round((score / maxScore) * 100);
    const diffDesc = bestDist === 1 ? describeEdit1(normStudent, normalize(bestForm)) : null;
    const diffStr = diffDesc ? `, ${diffDesc}` : '';
    return {
      score,
      reason: `스펠링 오류(편집거리 ${bestDist}${diffStr}, ${pct}%, ${pctScore}% 부분점수) — 검토 권장`,
      gradingStatus: 'fuzzy',
      questionType: 'E',
    };
  }

  return {
    score: 0,
    reason: `문장 불일치 (편집거리 ${bestDist}, ${pct}%)`,
    gradingStatus: 'review',
    questionType: 'E',
  };
};

// ─────────────────────────────────────────────
// Type D 채점: 숫자/토큰 집합 완전 일치
// ─────────────────────────────────────────────

const extractDigits = (text, ordered = false) => {
  const normalized = normalizeAnswer(text);
  const tokens = normalized.split(/[\s,()]+/).filter(Boolean);
  const digits = ordered ? [] : new Set();
  for (const token of tokens) {
    const num = token.replace(/\D/g, '');
    if (!num) continue;
    if (num.length === 1) {
      ordered ? digits.push(num) : digits.add(num);
    } else {
      for (const ch of num) ordered ? digits.push(ch) : digits.add(ch);
    }
  }
  return ordered ? digits : [...digits].sort();
};

export const gradeTypeD = (studentAns, allowedForms, options = {}) => {
  const strict = options.digitOrder === 'strict';
  const studentDigits = extractDigits(studentAns, strict);
  const correctDigits = extractDigits(allowedForms[0], strict);
  const isMatch =
    studentDigits.length === correctDigits.length &&
    studentDigits.every((d, i) => d === correctDigits[i]);
  return { matched: isMatch, studentDigits, correctDigits };
};

// ─────────────────────────────────────────────
// 메인 사전 채점 함수
// ─────────────────────────────────────────────

/**
 * preGrade(studentAns, dCol, maxScore, options)
 *
 * P2-C2: options.forcedType 가 있으면 자동 감지를 건너뜀
 * P2-C1: detectQuestionType에 options 전달 (listMinItems 적용)
 *
 * 반환값:
 *   { score, reason, gradingStatus, questionType }
 *   gradingStatus: 'correct' | 'partial' | 'fuzzy' | 'wrong' | 'review' | 'blank'
 */
export const preGrade = (studentAns, dCol, maxScore = 1, options = {}) => {
  const allowedForms = parseAnswerKey(dCol);
  if (!allowedForms.length) {
    return {
      score: 0,
      reason: '정답 키 없음',
      gradingStatus: 'review',
      questionType: 'UNKNOWN',
    };
  }

  const qType = options.forcedType ?? detectQuestionType(allowedForms, options);

  // ── Type D ──────────────────────────────────
  if (qType === 'D') {
    const norm = normalizeCI(studentAns);
    if (!norm) {
      return { score: 0, reason: '미응답', gradingStatus: 'blank', questionType: 'D' };
    }
    const result = gradeTypeD(studentAns, allowedForms, options);
    const orderLabel = options.digitOrder === 'strict' ? ' (순서 엄격)' : '';
    return {
      score: result.matched ? maxScore : 0,
      reason: result.matched
        ? `정답 — 번호 일치: {${result.correctDigits.join(', ')}}${orderLabel}`
        : `오답 — 제출: {${result.studentDigits.join(', ')}} | 정답: {${result.correctDigits.join(', ')}}${orderLabel}`,
      gradingStatus: result.matched ? 'correct' : 'wrong',
      questionType: 'D',
    };
  }

  // ── Type C ──────────────────────────────────
  if (qType === 'C') {
    return gradeTypeC(studentAns, allowedForms, maxScore, options);
  }

  // ── Type E ──────────────────────────────────
  if (qType === 'E') {
    return gradeTypeE(studentAns, allowedForms, maxScore, options);
  }

  // ── Type A ──────────────────────────────────
  const norm = normalizeCI(studentAns);
  if (!norm) {
    return { score: 0, reason: '미응답', gradingStatus: 'blank', questionType: 'A' };
  }

  const result = gradeTypeA(studentAns, allowedForms, options);
  if (result.matched) {
    if (result.fuzzy) {
      const score = calcFuzzyScore(maxScore, options);
      const diffStr = result.diffDesc ? `, ${result.diffDesc}` : '';
      return {
        score,
        reason: `스펠링 오류(편집거리 ${result.dist}${diffStr}) — 검토 권장`,
        gradingStatus: 'fuzzy',
        questionType: 'A',
      };
    }
    const noteStr = result.note ? ` (${detectIgnoredSeps(norm, result.note)})` : '';
    return {
      score: maxScore,
      reason: `정답 일치: "${result.matchedForm}"${noteStr}`,
      gradingStatus: 'correct',
      questionType: 'A',
    };
  }

  return {
    score: 0,
    reason: '정답 불일치',
    gradingStatus: 'review',
    questionType: 'A',
  };
};
