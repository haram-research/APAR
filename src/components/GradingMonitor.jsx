import { useMemo } from 'react'
import { CheckCircle2, AlertCircle, XCircle, MinusCircle, HelpCircle } from 'lucide-react'

const TYPE_META = {
  A: { label: 'Type A', desc: '단순 일치형', color: 'bg-blue-100 text-blue-700' },
  C: { label: 'Type C', desc: '리스트/부분점수형', color: 'bg-violet-100 text-violet-700' },
  D: { label: 'Type D', desc: '번호 선택형', color: 'bg-teal-100 text-teal-700' },
  UNKNOWN: { label: '미분류', desc: '정답키 없음', color: 'bg-gray-100 text-gray-500' },
}

const STATUS_META = {
  correct: { icon: CheckCircle2, label: '정답', color: 'text-emerald-600' },
  partial: { icon: CheckCircle2, label: '부분정답', color: 'text-sky-600' },
  fuzzy:   { icon: AlertCircle, label: '검토 권장', color: 'text-amber-600' },
  review:  { icon: HelpCircle, label: '검토 필요', color: 'text-orange-500' },
  wrong:   { icon: XCircle, label: '오답', color: 'text-rose-500' },
  blank:   { icon: MinusCircle, label: '미응답', color: 'text-gray-400' },
}

export default function GradingSummary({ results }) {
  const stats = useMemo(() => {
    if (!results.length) return null

    // 문제별 유형 수집 (중복 없이)
    const problemTypes = {}
    const statusCounts = { correct: 0, partial: 0, fuzzy: 0, review: 0, wrong: 0, blank: 0 }

    for (const r of results) {
      if (r.questionType && r.problemId) {
        problemTypes[r.problemId] = r.questionType
      }
      if (r.gradingStatus && statusCounts[r.gradingStatus] !== undefined) {
        statusCounts[r.gradingStatus]++
      }
    }

    // Type별 문제 목록
    const typeDist = {}
    for (const [pid, type] of Object.entries(problemTypes)) {
      if (!typeDist[type]) typeDist[type] = []
      typeDist[type].push(pid)
    }

    const total = results.length
    const autoCount = statusCounts.correct + statusCounts.partial + statusCounts.wrong + statusCounts.blank
    const reviewCount = statusCounts.fuzzy + statusCounts.review

    return { typeDist, statusCounts, total, autoCount, reviewCount }
  }, [results])

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm border-2 border-dashed border-[var(--border)] rounded-xl">
        파일을 업로드하면 채점 현황이 여기에 표시됩니다.
      </div>
    )
  }

  const { typeDist, statusCounts, total, reviewCount } = stats

  return (
    <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
      {/* 문항 유형 분포 */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">문항 유형 분포</p>
        {Object.entries(typeDist).map(([type, problems]) => {
          const meta = TYPE_META[type] || TYPE_META.UNKNOWN
          return (
            <div key={type} className="flex items-start gap-3">
              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${meta.color}`}>
                {meta.label}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{meta.desc}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  문제 {problems.sort((a, b) => +a - +b).join(', ')}
                </p>
              </div>
              <span className="ml-auto text-sm font-bold text-gray-700 shrink-0">
                {problems.length}
              </span>
            </div>
          )
        })}
      </div>

      {/* 채점 결과 현황 */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          채점 결과 <span className="normal-case font-normal">({total.toLocaleString()}건)</span>
        </p>
        {Object.entries(statusCounts).map(([status, count]) => {
          if (!count) return null
          const meta = STATUS_META[status]
          const Icon = meta.icon
          const pct = Math.round((count / total) * 100)
          return (
            <div key={status} className="flex items-center gap-2">
              <Icon size={14} className={meta.color} />
              <span className="text-xs text-gray-600 w-20 shrink-0">{meta.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    status === 'correct' ? 'bg-emerald-500'
                    : status === 'partial' ? 'bg-sky-400'
                    : status === 'fuzzy' ? 'bg-amber-400'
                    : status === 'review' ? 'bg-orange-400'
                    : status === 'wrong' ? 'bg-rose-400'
                    : 'bg-gray-300'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-12 text-right shrink-0">
                {count.toLocaleString()}
              </span>
            </div>
          )
        })}

        {reviewCount > 0 && (
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
            검토 필요 {reviewCount.toLocaleString()}건 — 결과 다운로드 후 수동 확인을 권장합니다.
          </p>
        )}
      </div>
    </div>
  )
}
