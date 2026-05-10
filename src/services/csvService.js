import Papa from 'papaparse'

export const processCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Automatically find the ID/Name column and Answer column
        const headers = results.meta.fields
        const idKey = headers.find(h => h.includes('학번') || h.includes('ID')) || headers[0]
        const answerKey = headers.find(h => h.includes('답변') || h.includes('내용') || h.includes('Answer')) || headers[headers.length - 1]
        
        const dataWithKeys = results.data.map((row, index) => ({
          ...row,
          _apar_id: row[idKey] || index,
          _apar_answer: row[answerKey] || '',
          idKey,
          answerKey
        }))
        
        resolve(dataWithKeys)
      },
      error: (err) => reject(err)
    })
  })
}

export const exportToCSV = (results) => {
  const csv = Papa.unparse(results.map(row => {
    // Remove internal keys before export
    const { _apar_id, _apar_answer, idKey, answerKey, ...cleanRow } = row
    return cleanRow
  }))
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `APAR_Result_${new Date().toISOString().slice(0, 10)}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
