import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const WRONG_POLICY_OPTIONS = [
  { value: 'zero',   label: '0점 처리 (오답 포함 시 전체 0점)' },
  { value: 'ignore', label: '정답 항목만 계산 (오답 무시)' },
]

const LEVENSHTEIN_OPTIONS = [
  { value: 'strict',  label: '엄격 — 길이 기반 자동 (≤4자: 완전일치, 5–7자: 1오타, 8자+: 2오타)' },
  { value: 'lenient', label: '관대 — 각 기준 +1 오타 추가 허용' },
  { value: 'none',    label: '허용 안 함 (스펠링 오류 = 오답)' },
]

function SelectField({ label, value, options, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function SettingsPanel({ options, setOptions }) {
  const [llmOpen, setLlmOpen] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const set = (key) => (val) => setOptions((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="space-y-5">
      <SelectField
        label="리스트 정답 — 오답 항목 포함 시"
        value={options.wrongPolicy}
        options={WRONG_POLICY_OPTIONS}
        onChange={set('wrongPolicy')}
      />

      <SelectField
        label="스펠링 오류 허용 범위 (Levenshtein)"
        value={options.levenshteinMode}
        options={LEVENSHTEIN_OPTIONS}
        onChange={set('levenshteinMode')}
      />

      {/* LLM 고급 설정 (접이식) */}
      <div className="border-t border-[var(--border)] pt-4">
        <button
          onClick={() => setLlmOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors w-full text-left"
        >
          {llmOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          LLM 고급 설정
        </button>

        {llmOpen && (
          <div className="mt-4 space-y-4 opacity-70">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">API 서비스</label>
              <div className="grid grid-cols-3 gap-2">
                {['openai', 'gemini', 'together'].map((p) => (
                  <button
                    key={p}
                    onClick={() => set('provider')(p)}
                    className={`py-1.5 px-1 rounded-xl border text-[10px] font-semibold transition-all ${
                      options.provider === p
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-[var(--bg)] border-[var(--border)] text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : '기타(T)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={options.apiKey || ''}
                  onChange={(e) => set('apiKey')(e.target.value)}
                  placeholder="API Key를 입력하세요"
                  className="w-full pl-3 pr-14 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  {showKey ? '숨김' : '표시'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">채점 기준 (Rubric)</label>
              <textarea
                value={options.rubric || ''}
                onChange={(e) => set('rubric')(e.target.value)}
                placeholder="LLM 채점 기준을 입력하세요..."
                className="w-full h-24 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
