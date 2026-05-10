import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Modal from './Modal'

const PARTIAL_MODELS = [
  { value: 'proportional', label: '비율 비례',   desc: '(정답수 ÷ 전체) × 배점' },
  { value: 'fixed',        label: '항목당 고정', desc: '맞은 개수 × 항목당 점수 (상한: 배점)' },
  { value: 'deduction',    label: '감점 방식',   desc: '배점 − 오답 수 × 감점액 (하한: 0)' },
  { value: 'threshold',    label: '임계값',      desc: 'N개 이상 맞춰야 점수 시작' },
]

const ROUNDING_OPTIONS = [
  { value: 'round', label: '반올림 (0.5 → 1)' },
  { value: 'ceil',  label: '올림 (0.1 → 1)' },
  { value: 'floor', label: '버림 (0.9 → 0)' },
  { value: 'half',  label: '0.5점 단위 반올림' },
]

const WRONG_OPTIONS = [
  { value: 'zero',   label: '오답 포함 시 전체 0점' },
  { value: 'ignore', label: '정답 항목만 계산 (오답 무시)' },
]

const LEVENSHTEIN_OPTIONS = [
  { value: 'strict',  label: '엄격 — ≤4자: 완전일치, 5–7자: 1오타, 8자+: 2오타' },
  { value: 'lenient', label: '관대 — 각 기준 +1 오타 추가 허용' },
  { value: 'none',    label: '허용 안 함 (스펠링 오류 = 오답)' },
]

// ── 공통 서브 컴포넌트 ────────────────────────

function SectionHeader({ color, id, name }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${color}`}>
      <span className="font-bold">Type {id}</span>
      <span className="opacity-70">—</span>
      <span>{name}</span>
    </div>
  )
}

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

function NumberField({ label, value, onChange, min = 0.5, step = 0.5, placeholder }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        step={step}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
      />
    </div>
  )
}

const AB_THRESHOLD_KEYS = {
  enabled: 'fuzzyThresholdEnabled',
  max: 'fuzzyThresholdMax',
  score: 'fuzzyThresholdScore',
}
const E_THRESHOLD_KEYS = {
  enabled: 'sentenceThresholdEnabled',
  max: 'sentenceThresholdMax',
  score: 'sentenceThresholdScore',
}

function ThresholdBlock({ options, set, keys = AB_THRESHOLD_KEYS }) {
  const enabled = options[keys.enabled] ?? false
  return (
    <div className="rounded-xl border border-[var(--border)] bg-amber-50/50 dark:bg-amber-900/10 px-3 py-3 space-y-3">
      <button
        onClick={() => set(keys.enabled)(!enabled)}
        className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 w-full text-left"
      >
        <span className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 ${enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
          <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </span>
        저배점 임계값 모드
      </button>
      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
        배점이 N점 이하인 문항은 비율 대신 고정 점수를 부여합니다. (예: 배점 3·4점 → 1점 고정)
      </p>
      {enabled && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="기준 배점 이하 (N점)"
            value={options[keys.max] ?? 4}
            onChange={set(keys.max)}
            min={1}
            step={1}
            placeholder="예: 4"
          />
          <NumberField
            label="부여할 고정 점수 (M점)"
            value={options[keys.score] ?? 1}
            onChange={set(keys.score)}
            min={0}
            step={1}
            placeholder="예: 1"
          />
        </div>
      )}
    </div>
  )
}

function TypeCFuzzyCapBlock({ options, set }) {
  const enabled = options.typeCFuzzyCapEnabled ?? false
  return (
    <div className="rounded-xl border border-[var(--border)] bg-amber-50/50 dark:bg-amber-900/10 px-3 py-3 space-y-3">
      <button
        onClick={() => set('typeCFuzzyCapEnabled')(!enabled)}
        className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 w-full text-left"
      >
        <span className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 ${enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
          <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </span>
        오탈자 점수 상한 적용
      </button>
      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
        오탈자 항목이 하나라도 있으면 총점에 상한을 씌웁니다. 저배점은 고정 점수, 고배점은 비율로 계산합니다.
      </p>
      {enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="기준 배점 이하 (N점)"
              value={options.typeCFuzzyThresholdMax ?? 4}
              onChange={set('typeCFuzzyThresholdMax')}
              min={1} step={1} placeholder="예: 4"
            />
            <NumberField
              label="N점 이하일 때 상한 (M점)"
              value={options.typeCFuzzyThresholdScore ?? 1}
              onChange={set('typeCFuzzyThresholdScore')}
              min={0} step={1} placeholder="예: 1"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block">
              N점 초과 시 상한 비율
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 0.25, label: '25%' },
                { value: 0.33, label: '33% (기본)' },
                { value: 0.5,  label: '50%' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => set('typeCFuzzyScoreRatio')(value)}
                  className={`px-2 py-2 rounded-xl border text-xs transition-all ${
                    (options.typeCFuzzyScoreRatio ?? 0.33) === value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-indigo-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              예) 33%: 6점 → 상한 2점, 9점 → 상한 3점
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 타입별 옵션 섹션 ──────────────────────────

function TypeCSection({ options, set }) {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-violet-50 dark:bg-violet-900/20">
        <SectionHeader color="text-violet-700 dark:text-violet-300" id="C" name="리스트/부분점수형" />
      </div>
      <div className="px-4 py-4 space-y-4">
        {/* 부분점수 산정 방식 */}
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
            부분점수 산정 방식
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PARTIAL_MODELS.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => set('partialPolicy')(value)}
                className={`text-left p-3 rounded-xl border text-sm transition-all ${
                  options.partialPolicy === value
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-indigo-300'
                }`}
              >
                <div className="font-semibold">{label}</div>
                <div className={`text-xs mt-0.5 leading-tight ${options.partialPolicy === value ? 'text-indigo-200' : 'text-[var(--text-muted)]'}`}>
                  {desc}
                </div>
              </button>
            ))}
          </div>
          {options.partialPolicy === 'fixed' && (
            <div className="mt-3">
              <NumberField label="항목당 점수" value={options.pointsPerItem ?? 1} onChange={set('pointsPerItem')} placeholder="예: 1" />
            </div>
          )}
          {options.partialPolicy === 'deduction' && (
            <div className="mt-3">
              <NumberField label="오답 1개당 감점액" value={options.deductionPerWrong ?? 1} onChange={set('deductionPerWrong')} placeholder="예: 1" />
            </div>
          )}
          {options.partialPolicy === 'threshold' && (
            <div className="mt-3">
              <NumberField label="최소 정답 개수" value={options.thresholdMin ?? 1} onChange={set('thresholdMin')} min={1} step={1} placeholder="예: 2" />
            </div>
          )}
        </div>

        <SelectField
          label="소수점 처리"
          value={options.roundingMode ?? 'round'}
          options={ROUNDING_OPTIONS}
          onChange={set('roundingMode')}
        />

        <SelectField
          label="오답 항목 포함 시"
          value={options.wrongPolicy}
          options={WRONG_OPTIONS}
          onChange={set('wrongPolicy')}
        />

        <SelectField
          label="스펠링 오류 허용 범위 (Levenshtein)"
          value={options.levenshteinMode}
          options={LEVENSHTEIN_OPTIONS}
          onChange={set('levenshteinMode')}
        />

        {/* 오탈자 점수 상한 */}
        <TypeCFuzzyCapBlock options={options} set={set} />
      </div>
    </div>
  )
}

const SENTENCE_FUZZY_SCORE_OPTIONS = [
  { value: 0,    label: '0점 (검토 권장 표시만)' },
  { value: 0.5,  label: '50% 부분점수 (기본)' },
  { value: 0.75, label: '75% 부분점수' },
  { value: 1,    label: '만점 처리 (검토 권장 표시)' },
]

function TypeESection({ options, set }) {
  const pct = Math.round((options.sentenceThreshold ?? 0.3) * 100)
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-rose-50 dark:bg-rose-900/20">
        <SectionHeader color="text-rose-700 dark:text-rose-300" id="E" name="문장 서술형" />
      </div>
      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
            유사도 임계값
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            편집거리 ÷ 문장 길이 이하이면 "유사 정답(검토 권장)"으로 처리합니다.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.05}
              max={0.6}
              step={0.05}
              value={options.sentenceThreshold ?? 0.3}
              onChange={(e) => set('sentenceThreshold')(Number(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <span className="text-sm font-semibold text-[var(--text)] w-12 text-right tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
            <span>5% (엄격)</span>
            <span>30% (기본)</span>
            <span>60% (관대)</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block">
            유사 매칭 시 부여 점수
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SENTENCE_FUZZY_SCORE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => set('sentenceFuzzyScoreRatio')(value)}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${
                  (options.sentenceFuzzyScoreRatio ?? 0.5) === value
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-indigo-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ThresholdBlock options={options} set={set} keys={E_THRESHOLD_KEYS} />
      </div>
    </div>
  )
}

const LEVENSHTEIN_OPTIONS_AB = [
  { value: 'none',    label: '허용 안 함 (완전 일치만 정답)' },
  { value: 'strict',  label: '엄격 — ≤4자: 완전일치, 5–7자: 1오타, 8자+: 2오타' },
  { value: 'lenient', label: '관대 — 각 기준 +1 오타 추가 허용' },
]

const FUZZY_SCORE_OPTIONS = [
  { value: 0,    label: '0점 (검토 권장 표시만)' },
  { value: 0.5,  label: '50% 부분점수' },
  { value: 0.75, label: '75% 부분점수' },
  { value: 1,    label: '만점 처리 (검토 권장 표시)' },
]

function TypeABSection({ options, set }) {
  const fuzzyEnabled = (options.levenshteinMode ?? 'none') !== 'none'
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-blue-50 dark:bg-blue-900/20">
        <SectionHeader color="text-blue-700 dark:text-blue-300" id="A / B" name="단순 일치형 / 형태 변형형" />
      </div>
      <div className="px-4 py-4 space-y-4">
        <SelectField
          label="스펠링 오류 허용 범위"
          value={options.levenshteinMode ?? 'none'}
          options={LEVENSHTEIN_OPTIONS_AB}
          onChange={set('levenshteinMode')}
        />
        {fuzzyEnabled && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block">
                유사 매칭 시 부여 점수
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FUZZY_SCORE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => set('fuzzyScoreRatio')(value)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${
                      (options.fuzzyScoreRatio ?? 0) === value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-indigo-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <SelectField
              label="소수점 처리"
              value={options.roundingMode ?? 'round'}
              options={ROUNDING_OPTIONS}
              onChange={set('roundingMode')}
            />
            <ThresholdBlock options={options} set={set} />
          </>
        )}
      </div>
    </div>
  )
}

const DIGIT_ORDER_OPTIONS = [
  { value: 'any',    label: '순서 무관 (기본) — {1,3,5} = {5,3,1}' },
  { value: 'strict', label: '순서 엄격 — 입력 순서까지 일치해야 정답' },
]

function TypeDSection({ options, set }) {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-teal-50 dark:bg-teal-900/20">
        <SectionHeader color="text-teal-700 dark:text-teal-300" id="D" name="번호 선택형" />
      </div>
      <div className="px-4 py-4">
        <SelectField
          label="번호 순서 일치 여부"
          value={options.digitOrder ?? 'any'}
          options={DIGIT_ORDER_OPTIONS}
          onChange={set('digitOrder')}
        />
      </div>
    </div>
  )
}

// ── 메인 모달 ─────────────────────────────────

export default function GradingOptionsModal({ open, onClose, options, setOptions }) {
  const [llmOpen, setLlmOpen] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const set = (key) => (val) => setOptions((prev) => ({ ...prev, [key]: val }))

  return (
    <Modal open={open} onClose={onClose} title="채점 옵션 설정" width="max-w-xl">
      <div className="space-y-4">

        <TypeABSection options={options} set={set} />
        <TypeCSection options={options} set={set} />
        <TypeDSection options={options} set={set} />
        <TypeESection options={options} set={set} />

        {/* ── LLM 고급 설정 (접이식) ── */}
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <button
            onClick={() => setLlmOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors text-left bg-slate-50 dark:bg-slate-700/30"
          >
            {llmOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            LLM 고급 설정
          </button>

          {llmOpen && (
            <div className="px-4 py-4 space-y-4 opacity-70">
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

        <p className="text-xs text-[var(--text-muted)] px-1">
          설정은 자동으로 저장됩니다. 옵션 변경 후 재채점 버튼을 눌러야 결과에 반영됩니다.
        </p>
      </div>
    </Modal>
  )
}
