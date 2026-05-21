import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: '',  label: '자동 감지' },
  { value: 'A', label: 'Type A — 단답/구' },
  { value: 'C', label: 'Type C — 리스트' },
  { value: 'D', label: 'Type D — 번호선택' },
  { value: 'E', label: 'Type E — 문장서술' },
]

const TYPE_BADGE = {
  A:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  B:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  C:       'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  D:       'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  E:       'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  UNKNOWN: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export default function TypeOverridePanel({ results, forcedTypes, setForcedTypes }) {
  const [open, setOpen] = useState(false)

  // 문항번호별 첫 행의 questionType 수집
  const problems = []
  const seen = new Set()
  for (const row of results) {
    const id = row.problemId
    if (id && !seen.has(id)) {
      seen.add(id)
      problems.push({ id, autoType: row.questionType ?? 'UNKNOWN' })
    }
  }

  if (!problems.length) return null

  const overrideCount = problems.filter((p) => forcedTypes[p.id]).length

  const handleChange = (id, val) => {
    setForcedTypes((prev) => {
      const next = { ...prev }
      if (val) next[id] = val
      else delete next[id]
      return next
    })
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          문항 유형 검토
          {overrideCount > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {overrideCount}개 변경
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--text-muted)] font-normal">{problems.length}개 문항</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="text-[10px] text-[var(--text-muted)] mb-3">
            자동 감지 유형이 잘못된 경우 강제 지정하세요. 변경 후 재채점 버튼을 눌러야 반영됩니다.
          </p>
          <div className="space-y-2">
            {problems.map(({ id, autoType }) => {
              const forced = forcedTypes[id]
              const displayType = forced ?? autoType
              return (
                <div key={id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[var(--text)] shrink-0 w-14">
                      Q{id}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        TYPE_BADGE[displayType] ?? TYPE_BADGE.UNKNOWN
                      } ${forced ? 'ring-1 ring-indigo-400' : ''}`}
                    >
                      {forced ? `${autoType} → ${forced}` : autoType}
                    </span>
                  </div>
                  <select
                    value={forced ?? ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          {overrideCount > 0 && (
            <button
              onClick={() => setForcedTypes({})}
              className="mt-3 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
            >
              모든 강제 지정 초기화
            </button>
          )}
        </div>
      )}
    </section>
  )
}
