import axios from 'axios'

const MAX_CONCURRENCY = 8
const MAX_RETRIES = 3

export const startGrading = async ({ provider, apiKey, rubric, model, data, onProgress, onLog, onComplete }) => {
  const queue = [...data]
  const total = data.length
  let completed = 0

  const processRow = async (row) => {
    let attempts = 0
    const idKey = row.idKey
    const id = row[idKey]

    while (attempts < MAX_RETRIES) {
      try {
        onLog(`[${id}] ${provider === 'openai' ? 'OpenAI' : 'Gemini'} 채점 중...`)
        
        let response
        let score, reason

        if (provider === 'openai') {
          response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: model,
              messages: [
                { role: 'system', content: `당신은 교수님의 채점 기준에 따라 학생의 답변을 채점하는 조교입니다. 다음 채점 기준(Rubric)을 엄격히 따라주세요.\n\n[채점 기준]\n${rubric}\n\n반드시 다음 JSON 형식으로만 응답하세요: {"score": 점수(숫자), "reason": "이유(한글)"}` },
                { role: 'user', content: `학생의 답변: ${row._apar_answer}` }
              ],
              response_format: { type: "json_object" }
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              }
            }
          )
          const result = JSON.parse(response.data.choices[0].message.content)
          score = result.score
          reason = result.reason
        } else if (provider === 'gemini') {
          // Gemini API Support
          response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              contents: [{
                parts: [{
                  text: `당신은 교수님의 채점 기준에 따라 학생의 답변을 채점하는 조교입니다. 다음 채점 기준(Rubric)을 엄격히 따라주세요.\n\n[채점 기준]\n${rubric}\n\n학생의 답변: ${row._apar_answer}\n\n반드시 다음 JSON 형식으로만 응답하세요. 다른 설명은 생략하세요: {"score": 점수(숫자), "reason": "이유(한글)"}`
                }]
              }],
              generationConfig: {
                responseMimeType: "application/json"
              }
            }
          )
          const resultText = response.data.candidates[0].content.parts[0].text
          const result = JSON.parse(resultText)
          score = result.score
          reason = result.reason
        } else if (provider === 'together') {
          // Together AI / EXAONE Support (OpenAI Compatible)
          response = await axios.post(
            'https://api.together.xyz/v1/chat/completions',
            {
              model: model.includes('exaone') ? `LG-AI-EXAONE/${model}` : `togethercompute/${model}`,
              messages: [
                { role: 'system', content: `당신은 교수님의 채점 기준에 따라 학생의 답변을 채점하는 조교입니다. 다음 채점 기준(Rubric)을 엄격히 따라주세요.\n\n[채점 기준]\n${rubric}\n\n반드시 다음 JSON 형식으로만 응답하세요: {"score": 점수(숫자), "reason": "이유(한글)"}` },
                { role: 'user', content: `학생의 답변: ${row._apar_answer}` }
              ]
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              }
            }
          )
          const result = JSON.parse(response.data.choices[0].message.content)
          score = result.score
          reason = result.reason
        }
        
        completed++
        onProgress((completed / total) * 100, {
          id,
          idKey,
          score,
          reason,
          status: 'success'
        })
        onLog(`[${id}] 채점 완료: ${score}점`)
        return
      } catch (error) {
        attempts++
        const errorMsg = error.response?.data?.error?.message || error.message
        onLog(`[${id}] 오류 발생: ${errorMsg}`)
        
        if (attempts >= MAX_RETRIES) {
          completed++
          onProgress((completed / total) * 100, {
            id,
            idKey,
            score: 0,
            reason: `오류: ${errorMsg}`,
            status: 'error'
          })
        } else {
          // Wait before retry
          await new Promise(r => setTimeout(r, 1000 * attempts))
        }
      }
    }
  }

  const workers = []
  const runWorker = async () => {
    while (queue.length > 0) {
      const row = queue.shift()
      await processRow(row)
    }
  }

  // Create pool of workers
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, data.length); i++) {
    workers.push(runWorker())
  }

  await Promise.all(workers)
  onComplete()
}
