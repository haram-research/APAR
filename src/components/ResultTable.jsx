const TYPE_BADGE = {
  A: 'bg-blue-50 text-blue-600 border-blue-200',
  C: 'bg-violet-50 text-violet-600 border-violet-200',
  D: 'bg-teal-50 text-teal-600 border-teal-200',
  UNKNOWN: 'bg-gray-100 text-gray-400 border-gray-200',
}

const STATUS_BADGE = {
  correct: { label: '정답', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: '부분정답', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  fuzzy:   { label: '검토 권장', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  review:  { label: '검토 필요', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  wrong:   { label: '오답', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  blank:   { label: '미응답', cls: 'bg-gray-100 text-gray-400 border-gray-200' },
}

function Badge({ text, cls }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {text}
    </span>
  )
}

export default function ResultTable({ data }) {
  if (!data.length) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl">
        <p className="text-sm">업로드된 데이터가 없습니다.</p>
        <p className="text-xs mt-1">xlsx 파일을 먼저 업로드해주세요.</p>
      </div>
    )
  }

  const preview = data.slice(0, 100)

  return (
    <div className="overflow-x-auto -mx-6 -mb-6">
      <table className="w-full text-sm text-left">
        <thead className="text-[11px] text-[var(--text-muted)] uppercase bg-gray-50 border-y border-[var(--border)]">
          <tr>
            <th className="px-4 py-3 font-medium">학번</th>
            <th className="px-4 py-3 font-medium text-center">문제</th>
            <th className="px-4 py-3 font-medium text-center">유형</th>
            <th className="px-4 py-3 font-medium">학생 답안</th>
            <th className="px-4 py-3 font-medium text-center">점수</th>
            <th className="px-4 py-3 font-medium">채점 근거</th>
            <th className="px-4 py-3 font-medium text-center">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {preview.map((row, i) => {
            const statusMeta = STATUS_BADGE[row.gradingStatus] || STATUS_BADGE.review
            const typeCls = TYPE_BADGE[row.questionType] || TYPE_BADGE.UNKNOWN
            const isReview = row.gradingStatus === 'review' || row.gradingStatus === 'fuzzy'

            return (
              <tr
                key={i}
                className={`transition-colors ${
                  isReview
                    ? 'bg-amber-50/40 hover:bg-amber-50'
                    : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {row.studentId || '-'}
                </td>
                <td className="px-4 py-3 text-center font-medium text-gray-700">
                  {row.problemId || '-'}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge
                    text={row.questionType || '?'}
                    cls={typeCls}
                  />
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate" title={row.studentAnswer}>
                  {row.studentAnswer || <span className="italic text-gray-300">미응답</span>}
                </td>
                <td className={`px-4 py-3 text-center font-bold text-base ${
                  row.gradingStatus === 'correct' ? 'text-emerald-600'
                  : row.gradingStatus === 'partial' || row.gradingStatus === 'fuzzy' ? 'text-sky-600'
                  : row.gradingStatus === 'wrong' || row.gradingStatus === 'blank' ? 'text-rose-400'
                  : 'text-gray-400'
                }`}>
                  {row.score !== undefined ? row.score : '–'}
                  {row.maxScore !== undefined && (
                    <span className="text-[10px] text-gray-300 font-normal">/{row.maxScore}</span>
                  )}
                </td>
                <td
                  className="px-4 py-3 text-xs text-[var(--text-muted)] max-w-[260px] truncate"
                  title={row.reason}
                >
                  {row.reason || '-'}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge text={statusMeta.label} cls={statusMeta.cls} />
                </td>
              </tr>
            )
          })}
          {data.length > 100 && (
            <tr>
              <td colSpan="7" className="px-6 py-4 text-center text-xs text-[var(--text-muted)] bg-gray-50">
                외 {(data.length - 100).toLocaleString()}건이 더 있습니다. 전체 결과는 다운로드해서 확인하세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
