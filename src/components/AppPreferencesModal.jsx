import { Monitor, Sun, Moon } from 'lucide-react'
import Modal from './Modal'

const THEMES = [
  { value: 'system', label: '시스템 설정', icon: Monitor },
  { value: 'light',  label: '라이트 모드', icon: Sun },
  { value: 'dark',   label: '다크 모드',   icon: Moon },
]

export default function AppPreferencesModal({ open, onClose, prefs, setPrefs }) {
  return (
    <Modal open={open} onClose={onClose} title="앱 환경설정">
      <div className="space-y-6">
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block mb-3">
            화면 테마
          </label>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setPrefs((p) => ({ ...p, theme: value }))}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all ${
                  prefs.theme === value
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)] hover:border-indigo-300 hover:text-[var(--text)]'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide block mb-3">
            언어
          </label>
          <select
            disabled
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-muted)] opacity-60 cursor-not-allowed outline-none"
          >
            <option>한국어 (Korean)</option>
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">현재 한국어만 지원됩니다.</p>
        </div>

        <div className="pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)]">
            설정은 자동으로 저장됩니다.
          </p>
        </div>
      </div>
    </Modal>
  )
}
