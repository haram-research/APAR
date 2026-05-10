/**
 * xlsxService.js
 * APAR 전용 xlsx 파싱 및 내보내기
 *
 * 열 구조 (고정):
 *   A(0): Serial   B(1): 학번   C(2): 문제번호
 *   D(3): 정답키   E(4): 학생답안   F(5): 자동채점점수
 *   G(6): 수작업기준   H(7): 수작업점수(OUTPUT)   I(8): 문항유형(OUTPUT)   J(9): 의견(OUTPUT)
 */

import * as XLSX from 'xlsx';

const COL = {
  SERIAL: 0, STUDENT_ID: 1, PROBLEM_ID: 2,
  ANSWER_KEY: 3, STUDENT_ANS: 4, AUTO_SCORE: 5,
  MANUAL_CRITERIA: 6, MANUAL_SCORE: 7, QUESTION_TYPE: 8, MANUAL_OPINION: 9,
};

export const processXLSX = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array', codepage: 65001 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const headers = rawRows[0] || [];
      const dataRows = rawRows.slice(1).filter((r) => r[COL.STUDENT_ID]);

      // 문제별 만점 도출: F열 최댓값
      const maxScoreMap = {};
      for (const row of dataRows) {
        const prob = String(row[COL.PROBLEM_ID]);
        const score = parseFloat(row[COL.AUTO_SCORE]) || 0;
        if (!maxScoreMap[prob] || score > maxScoreMap[prob]) {
          maxScoreMap[prob] = score;
        }
      }

      const data = dataRows.map((row, idx) => {
        const probId = String(row[COL.PROBLEM_ID]);
        return {
          _rowIndex: idx,
          serial: row[COL.SERIAL],
          studentId: String(row[COL.STUDENT_ID]),
          problemId: probId,
          answerKey: String(row[COL.ANSWER_KEY] || ''),
          studentAnswer: String(row[COL.STUDENT_ANS] || ''),
          autoScore: parseFloat(row[COL.AUTO_SCORE]) || 0,
          maxScore: maxScoreMap[probId] || 1,
          // gradingService 호환 키
          _apar_answer: String(row[COL.STUDENT_ANS] || ''),
          idKey: 'studentId',
        };
      });

      resolve({ data, headers, rawRows, maxScoreMap });
    };
    reader.readAsArrayBuffer(file);
  });
};

/**
 * 채점 결과를 H(수작업점수), I(의견) 열에 기입하여 xlsx 다운로드
 */
export const exportToXLSX = (headers, rawRows, results) => {
  // rawRows[0] = 헤더, rawRows[1..] = 데이터
  // results[i] 는 rawRows[i+1] 에 대응
  const headerRow = [...headers];
  headerRow.splice(COL.QUESTION_TYPE, 0, '문항유형');
  const outputRows = [headerRow];

  for (let i = 0; i < results.length; i++) {
    const originalRow = [...(rawRows[i + 1] || [])];
    const r = results[i];

    // I열(문항유형)을 삽입 — 뒤 열들이 한 칸씩 밀림
    originalRow.splice(COL.QUESTION_TYPE, 0, r?.questionType ?? '');

    // 배열 길이가 부족하면 빈 값으로 채움
    while (originalRow.length <= COL.MANUAL_OPINION) originalRow.push('');

    if (r && r.gradingStatus !== undefined) {
      originalRow[COL.MANUAL_SCORE] = r.score ?? '';
      originalRow[COL.MANUAL_OPINION] = r.reason ?? '';
    }

    outputRows.push(originalRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(outputRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `APAR_채점결과_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};
