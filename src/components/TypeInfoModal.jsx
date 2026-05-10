import Modal from './Modal'

const TYPES = [
  {
    id: 'A',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    name: '단순 일치형 (Type A)',
    detect: '정답키의 각 허용 표현([...])에 쉼표 구분 항목이 3개 미만이고, 숫자만으로 구성되지 않은 경우',
    scoring: '정규화 후 완전 일치 시 만점, 불일치 시 0점 (검토 권장 표시)',
    steps: [
      '소문자 변환 + 특수문자 정규화',
      '괄호·쉼표·공백 제거 후 재비교',
      '구분자 전체 제거 후 재비교',
    ],
    examples: [
      { key: '[slithy] [slithy toves]', student: 'Slithy', result: '정답' },
      { key: '[brillig]', student: 'brilling', result: '오답 (검토 권장)' },
    ],
  },
  {
    id: 'B',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    badge: 'bg-orange-100 text-orange-700',
    name: '형태 변형형 (Type B)',
    detect: '정답키 구조는 Type A와 동일하나, 허용 표현이 형태론적 변형(어중 삽입, 파생어 등)을 포함하는 경우. 현재 자동 탐지 없이 수동 분류.',
    scoring: '현재 Type A와 동일한 알고리즘(정규화 후 완전 일치)으로 처리됨. 변형 형태를 정답키에 허용 표현([...])으로 모두 등록하면 정확도 유지 가능.',
    steps: [
      'Type A 1~3단계 동일 적용',
      '불일치 시 "검토 권장" 상태로 표시',
    ],
    examples: [
      { key: '[fan-bloody-tastic] [fantabulous]', student: 'fan-bloody-tastic', result: '정답 (완전 일치)' },
      { key: '[fan-bloody-tastic] [fantabulous]', student: 'fanbloodytastic', result: '정답 (구분자 무시)' },
      { key: '[fan-bloody-tastic] [fantabulous]', student: 'fanfreakintastic', result: '오답 → 검토 권장 (LLM 대기)' },
    ],
  },
  {
    id: 'C',
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-700',
    name: '리스트/부분점수형 (Type C)',
    detect: '정답키의 어느 허용 표현이라도 쉼표로 구분된 항목이 3개 이상인 경우',
    scoring: '항목별 독립 매칭 → 선택된 부분점수 방식으로 계산 (스펠링 허용 범위 적용)',
    steps: [
      '쉼표·공백 등 다양한 구분자로 학생 답안 토크나이징',
      '각 토큰을 정답 항목과 완전 일치 우선 매칭',
      '불일치 시 Levenshtein 거리 기반 유사 매칭 (설정된 허용 범위 적용)',
      '오답 처리 정책 적용 후 최종 점수 계산',
    ],
    examples: [
      { key: '[mimsy, borogoves, mome, raths]', student: 'mimsy borogoves mome raths', result: '4/4 → 만점' },
      { key: '[mimsy, borogoves, mome, raths]', student: 'mimsy borogoves', result: '2/4 → 부분점수' },
      { key: '[mimsy, borogoves, mome, raths]', student: 'mimsy wrong', result: '오답 포함 → 정책에 따라 결정' },
    ],
  },
  {
    id: 'D',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    badge: 'bg-teal-100 text-teal-700',
    name: '번호 선택형 (Type D)',
    detect: '정답키의 모든 허용 표현이 숫자와 구분자(공백·쉼표·괄호)만으로 구성된 경우',
    scoring: '숫자 집합이 완전 일치하면 만점, 하나라도 다르거나 누락·추가 시 0점',
    steps: [
      '정규화 후 숫자만 추출하여 집합 구성',
      '두 집합(정답 vs 학생)의 원소와 크기가 모두 일치하면 정답',
    ],
    examples: [
      { key: '[(1), (3), (5)]', student: '1, 3, 5', result: '정답' },
      { key: '[(1), (3), (5)]', student: '1, 3', result: '0점 (누락)' },
      { key: '[(1), (3), (5)]', student: '1, 3, 5, 7', result: '0점 (추가)' },
    ],
  },
  {
    id: 'E',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    badge: 'bg-rose-100 text-rose-700',
    name: '문장 서술형 (Type E)',
    detect: '정답키의 어느 허용 표현이라도 단어 수가 5개 이상인 경우 (쉼표 항목 3개 미만, 숫자형 아닌 것 중)',
    scoring: '학생 답안과 정답 문장 전체를 Levenshtein으로 비교. 편집거리 ÷ 문장 길이 ≤ 설정 임계값이면 만점 + 검토 권장, 초과 시 0점 + 검토 필요.',
    steps: [
      '정규화(소문자 변환, 특수문자 제거) 후 전체 문장 단위로 OSA Levenshtein 계산',
      '허용 표현 중 편집거리가 가장 작은 form 선택',
      '편집거리 ÷ max(학생답 길이, 정답 길이) → 비율 계산',
      '비율 ≤ 임계값: 유사 정답(fuzzy, 검토 권장) / 초과: 검토 필요',
    ],
    examples: [
      { key: '[Susan is aware of the fact that Bill is]', student: 'Susan is aware of the fact that Bill is', result: '정답 (편집거리 0)' },
      { key: '[Susan is aware of the fact that Bill is]', student: 'Suan is aware of the fact that Bill is', result: '유사 정답 — 검토 권장 (거리 1, 약 3%)' },
      { key: '[Susan is aware of the fact that Bill is]', student: 'Susan us aware of the fact Bill is', result: '유사 정답 — 검토 권장 (거리 6, 약 15%)' },
      { key: '[Susan is aware of the fact that Bill is]', student: 'Bill is aware', result: '검토 필요 (거리 크게 초과)' },
    ],
  },
]

function TypeCard({ type }) {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className={`px-4 py-3 font-semibold text-sm flex items-center justify-between ${type.color}`}>
        <span>{type.name}</span>
        {type.id === 'B' && (
          <span className="text-[10px] font-medium bg-white/30 px-2 py-0.5 rounded-full">
            현재 Type A로 처리 · LLM 폴백 예정
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">탐지 기준</p>
          <p className="text-sm text-[var(--text)]">{type.detect}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">채점 방식</p>
          <p className="text-sm text-[var(--text)]">{type.scoring}</p>
        </div>
        {type.note && (
          <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2">
            <p className="text-xs text-orange-800 dark:text-orange-300">{type.note}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">처리 단계</p>
          <ol className="text-sm text-[var(--text)] space-y-0.5 list-decimal list-inside">
            {type.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">예시</p>
          <div className="space-y-1.5">
            {type.examples.map((ex, i) => (
              <div key={i} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-xs">
                <div className="text-[var(--text-muted)]">정답키: <span className="font-mono text-[var(--text)]">{ex.key}</span></div>
                <div className="text-[var(--text-muted)]">학생답: <span className="font-mono text-[var(--text)]">{ex.student}</span></div>
                <div className="font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">→ {ex.result}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TypeInfoModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="문항 유형 안내" width="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          APAR는 정답키(D열) 형식을 분석해 문항 유형을 자동 탐지하고, 유형별 알고리즘으로 채점합니다.
          탐지 우선순위는 <strong className="text-[var(--text)]">D → C → E → A</strong> 순서입니다.
        </p>
        {TYPES.map((t) => <TypeCard key={t.id} type={t} />)}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>스펠링 유사 매칭(fuzzy)</strong>이 적용된 항목은 "검토 권장" 상태로 표시됩니다.
            결과 테이블에서 해당 행을 확인 후 수동 검토하는 것을 권장합니다.
          </p>
        </div>
      </div>
    </Modal>
  )
}
