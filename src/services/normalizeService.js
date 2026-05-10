/**
 * normalizeService.js
 * 유니코드 정규화 레이어 — 실제 학생 답안에서 발견된 특수문자 처리
 *
 * 실데이터에서 확인된 문자 목록:
 *  U+200B  zero-width space      → 제거 (복사-붙여넣기 시 삽입)
 *  U+2006  six-per-em space      → 일반 공백 (특수 모바일 자판)
 *  U+2013  en dash (–)           → 하이픈 (맥 자판 자동변환)
 *  U+2014  em dash (—)           → 하이픈 (맥 자판 자동변환)
 *  U+2018  left single quote (') → 제거/단순화
 *  U+2019  right single quote (')→ 제거/단순화
 *  U+3001  ideographic comma (、) → 콤마 (아이폰 일본어 키보드)
 *  U+FF0C  fullwidth comma (，)  → 콤마
 *  U+FF01~FF5E 전각 ASCII        → 반각 변환
 */
export const normalizeAnswer = (text) => {
  if (!text || text === 'None' || text === 'null') return '';

  return text
    // 1. 보이지 않는 문자 제거
    .replace(/\u200B/g, '')           // zero-width space
    .replace(/\uFEFF/g, '')           // BOM

    // 2. 특수 공백류 → 일반 공백
    .replace(/[\u2006\u2002\u2003\u00A0\u3000]/g, ' ')

    // 3. 대시류 → 하이픈
    .replace(/[\u2013\u2014\u2212]/g, '-')

    // 4. 곡선 따옴표 → 직선 (또는 제거)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

    // 5. 전각 문자 → 반각 (U+FF01~FF5E)
    .replace(/[\uFF01-\uFF5E]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
    )

    // 6. 동아시아 구분자 → 서양식
    .replace(/\u3001/g, ',')          // 일본어 쉼표
    .replace(/\uFF0C/g, ',')          // 전각 콤마
    .replace(/（/g, '(')
    .replace(/）/g, ')')

    // 7. 연속 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * 정규화 후 소문자 변환 (대소문자 무관 비교용)
 */
export const normalizeCI = (text) => normalizeAnswer(text).toLowerCase();
