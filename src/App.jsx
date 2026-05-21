import { useState, useCallback, useEffect } from 'react'
import { Upload, BarChart2, TableProperties, Download, RefreshCw, SlidersHorizontal, ListChecks, Info } from 'lucide-react'
import FileUpload from './components/FileUpload'
import GradingSummary from './components/GradingMonitor'
import ResultTable from './components/ResultTable'
import AppPreferencesModal from './components/AppPreferencesModal'
import GradingOptionsModal from './components/GradingOptionsModal'
import TypeInfoModal from './components/TypeInfoModal'
import TypeOverridePanel from './components/TypeOverridePanel'
import { processXLSX, exportToXLSX } from './services/xlsxService'
import { processCSV, exportToCSV } from './services/csvService'
import { preGrade } from './services/preGradeService'

const DEFAULT_OPTIONS = {
  // Type A/B
  fuzzyScoreRatio: 0.5,
  fuzzyThresholdEnabled: false,
  fuzzyThresholdMax: 4,
  fuzzyThresholdScore: 1,
  levenshteinModeA: 'none',
  // Type C
  wrongPolicy: 'zero',
  levenshteinModeC: 'strict',
  partialPolicy: 'proportional',
  roundingMode: 'round',
  pointsPerItem: 1,
  deductionPerWrong: 1,
  thresholdMin: 1,
  failCutoffN: 2,
  listMinItems: 5,
  typeCFuzzyCapEnabled: false,
  typeCFuzzyThresholdMax: 4,
  typeCFuzzyThresholdScore: 1,
  typeCFuzzyScoreRatio: 0.33,
  // Type D
  digitOrder: 'any',
  // Type E
  sentenceThreshold: 0.3,
  sentenceFuzzyScoreRatio: 0.5,
  sentenceThresholdEnabled: false,
  sentenceThresholdMax: 4,
  sentenceThresholdScore: 1,
  // LLM
  provider: 'openai',
  apiKey: '',
  rubric: '',
}

const DEFAULT_PREFS = { theme: 'system' }

const loadOptions = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('apar_options') || '{}')
    // v1.1→v1.2 마이그레이션: levenshteinMode → levenshteinModeC
    if (saved.levenshteinMode && !saved.levenshteinModeC) {
      saved.levenshteinModeC = saved.levenshteinMode
    }
    delete saved.levenshteinMode
    return { ...DEFAULT_OPTIONS, ...saved }
  } catch {
    return DEFAULT_OPTIONS
  }
}

const loadPrefs = () => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('apar_prefs') || '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

const runPreGrade = (data, options, forcedTypes = {}) =>
  data.map((row) => {
    const forcedType = forcedTypes[row.problemId] || undefined
    const result = preGrade(
      row.studentAnswer ?? row._apar_answer ?? '',
      row.answerKey ?? row._apar_dCol ?? '',
      row.maxScore ?? 1,
      { ...options, forcedType },
    )
    return { ...row, ...(result || { score: 0, reason: '정답키 없음', gradingStatus: 'review', questionType: 'UNKNOWN' }) }
  })

const loadForcedTypes = () => {
  try {
    return JSON.parse(localStorage.getItem('apar_forced_types') || '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const [options, setOptions] = useState(loadOptions)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [rawData, setRawData] = useState([])
  const [results, setResults] = useState([])
  const [fileInfo, setFileInfo] = useState(null)
  const [xlsxMeta, setXlsxMeta] = useState(null)
  const [forcedTypes, setForcedTypes] = useState(loadForcedTypes)

  // Modal states
  const [showAppPrefs, setShowAppPrefs] = useState(false)
  const [showGradingOpts, setShowGradingOpts] = useState(false)
  const [showTypeInfo, setShowTypeInfo] = useState(false)

  // ── Theme management ─────────────────────────
  useEffect(() => {
    const html = document.documentElement
    const applyDark = (dark) => {
      html.classList.toggle('dark', dark)
      html.classList.toggle('light', !dark)
    }

    if (prefs.theme === 'dark') {
      applyDark(true)
    } else if (prefs.theme === 'light') {
      applyDark(false)
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyDark(mq.matches)
      const handler = (e) => applyDark(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [prefs.theme])

  // ── Persist prefs ────────────────────────────
  useEffect(() => {
    localStorage.setItem('apar_prefs', JSON.stringify(prefs))
  }, [prefs])

  // ── Persist forced types ─────────────────────
  useEffect(() => {
    localStorage.setItem('apar_forced_types', JSON.stringify(forcedTypes))
  }, [forcedTypes])

  // ── Electron IPC — open preferences from menu ─
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const { ipcRenderer } = window.require('electron')
      const handler = () => setShowAppPrefs(true)
      ipcRenderer.on('open-preferences', handler)
      return () => ipcRenderer.removeListener('open-preferences', handler)
    } catch {
      // non-Electron environment
    }
  }, [])

  // ── Options persistence ──────────────────────
  const handleOptionsChange = useCallback((updater) => {
    setOptions((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem('apar_options', JSON.stringify(next))
      return next
    })
  }, [])

  // ── File upload ──────────────────────────────
  const handleFileUpload = async (file) => {
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx')
    if (isXlsx) {
      const { data, headers, rawRows } = await processXLSX(file)
      const graded = runPreGrade(data, options, forcedTypes)
      setRawData(data)
      setResults(graded)
      setXlsxMeta({ headers, rawRows })
      const problemIds = [...new Set(data.map((r) => r.problemId))]
      setFileInfo({ name: file.name, rowCount: data.length, problemCount: problemIds.length })
    } else {
      const data = await processCSV(file)
      const normalized = data.map((r) => ({
        ...r,
        studentId: r[r.idKey] || '',
        studentAnswer: r._apar_answer || '',
        answerKey: r._apar_dCol || '',
        maxScore: 1,
        problemId: '',
      }))
      const graded = runPreGrade(normalized, options, forcedTypes)
      setRawData(normalized)
      setResults(graded)
      setXlsxMeta(null)
      setFileInfo({ name: file.name, rowCount: data.length, problemCount: 0 })
    }
  }

  const handleRegrade = () => {
    if (!rawData.length) return
    setResults(runPreGrade(rawData, options, forcedTypes))
  }

  const handleDownload = () => {
    if (!results.length) return
    if (xlsxMeta) {
      exportToXLSX(xlsxMeta.headers, xlsxMeta.rawRows, results)
    } else {
      exportToCSV(results)
    }
  }

  const hasResults = results.length > 0

  // ── Icon button style helper ─────────────────
  const iconBtn = (active = false) =>
    `flex items-center justify-center w-9 h-9 rounded-xl border transition-all ${
      active
        ? 'bg-indigo-600 border-indigo-600 text-white shadow'
        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-indigo-300 hover:text-indigo-600 bg-white dark:bg-slate-800'
    }`

  return (
    <div className="min-h-screen bg-[var(--bg)] p-4 md:p-8 flex flex-col">

      {/* ── Modals ── */}
      <AppPreferencesModal
        open={showAppPrefs}
        onClose={() => setShowAppPrefs(false)}
        prefs={prefs}
        setPrefs={setPrefs}
      />
      <GradingOptionsModal
        open={showGradingOpts}
        onClose={() => setShowGradingOpts(false)}
        options={options}
        setOptions={handleOptionsChange}
      />
      <TypeInfoModal
        open={showTypeInfo}
        onClose={() => setShowTypeInfo(false)}
      />

      {/* ── Header ── */}
      <header className="w-full mb-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">APAR</h1>
            <p className="text-[var(--text-muted)] text-sm">Automated Provisional Answer Review</p>
          </div>

          <div className="flex items-center gap-2">
            {/* 문항 유형 안내 */}
            <button
              onClick={() => setShowTypeInfo(true)}
              className={iconBtn()}
              title="문항 유형 안내"
            >
              <Info size={16} />
            </button>

            {/* 채점 옵션 */}
            <button
              onClick={() => setShowGradingOpts(true)}
              className={iconBtn()}
              title="채점 옵션 설정"
            >
              <ListChecks size={16} />
            </button>

            {/* 앱 환경설정 */}
            <button
              onClick={() => setShowAppPrefs(true)}
              className={iconBtn()}
              title="앱 환경설정"
            >
              <SlidersHorizontal size={16} />
            </button>

            <div className="w-px h-6 bg-[var(--border)] mx-1" />

            {hasResults && (
              <button
                onClick={handleRegrade}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                재채점
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={!hasResults}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              <Download className="w-5 h-5" />
              결과 다운로드
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 왼쪽 — 업로드 */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-[var(--border)]">
            <div className="flex items-center gap-2 mb-4 text-indigo-600 font-semibold">
              <Upload className="w-5 h-5" />
              <h2>파일 업로드</h2>
            </div>
            <FileUpload onFileSelect={handleFileUpload} fileInfo={fileInfo} />
            <p className="text-[10px] text-gray-400 mt-3 text-center">
              파일 업로드 즉시 자동으로 채점이 실행됩니다
            </p>
          </section>

          {hasResults && (
            <TypeOverridePanel
              results={results}
              forcedTypes={forcedTypes}
              setForcedTypes={setForcedTypes}
            />
          )}
        </div>

        {/* 오른쪽 — 요약 + 결과 테이블 */}
        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-[var(--border)] min-h-[220px] flex flex-col">
            <div className="flex items-center gap-2 mb-5 text-indigo-600 font-semibold">
              <BarChart2 className="w-5 h-5" />
              <h2>채점 현황</h2>
            </div>
            <GradingSummary results={results} />
          </section>

          <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-indigo-600 font-semibold">
                <TableProperties className="w-5 h-5" />
                <h2>채점 결과 미리보기</h2>
              </div>
              {hasResults && (
                <span className="text-xs text-[var(--text-muted)]">
                  상위 100건 표시 · 전체 {results.length.toLocaleString()}건
                </span>
              )}
            </div>
            <ResultTable data={results} />
          </section>
        </div>
      </main>

      <footer className="max-w-7xl w-full mx-auto mt-auto pt-8 pb-6 text-center">
        <p className="text-[var(--text-muted)] text-[10px] tracking-widest uppercase opacity-50">
          Copyright © 2026, HARAM PARK. All rights reserved. &nbsp;·&nbsp; v1.2.0
        </p>
      </footer>
    </div>
  )
}
