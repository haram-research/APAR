import { useState, useRef } from 'react'
import { FileSpreadsheet, CheckCircle2 } from 'lucide-react'

const ACCEPTED = ['.xlsx', '.csv']
const ACCEPT_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
].join(',')

export default function FileUpload({ onFileSelect, fileInfo }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const validate = (file) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (!ACCEPTED.includes(ext)) {
      alert('xlsx 또는 csv 파일만 업로드 가능합니다.')
      return false
    }
    return true
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && validate(file)) onFileSelect(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative group cursor-pointer border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all py-8 ${
        isDragging
          ? 'border-indigo-500 bg-indigo-50'
          : fileInfo
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-[var(--border)] hover:border-indigo-400 hover:bg-slate-50'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files[0]
          if (file && validate(file)) onFileSelect(file)
        }}
        accept={ACCEPT_MIME}
        className="hidden"
      />

      <div className={`p-3 rounded-full mb-3 group-hover:scale-110 transition-transform ${
        fileInfo ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
      }`}>
        {fileInfo ? <CheckCircle2 size={24} /> : <FileSpreadsheet size={24} />}
      </div>

      {fileInfo ? (
        <>
          <p className="text-sm font-semibold text-emerald-700">{fileInfo.name}</p>
          <p className="text-xs text-emerald-600 mt-1">
            {fileInfo.rowCount.toLocaleString()}건 로드됨 · {fileInfo.problemCount}문제
          </p>
          <p className="text-xs text-gray-400 mt-2">다른 파일로 교체하려면 클릭</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">xlsx 또는 csv 파일을 드래그하세요</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">또는 클릭하여 파일 탐색기 열기</p>
        </>
      )}
    </div>
  )
}
