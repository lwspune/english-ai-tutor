import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function ScoreRing({ value, label, color }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-20 h-20 rounded-full border-4 ${color} flex items-center justify-center`}>
        <span className="text-xl font-bold text-gray-800">{value}</span>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

export default function SessionReport() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase
      .from('sessions')
      .select('*, passages(title, content)')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => setSession(data))
  }, [sessionId])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const words = session.word_results ?? []
  const passageWords = session.passages.content.split(/\s+/)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/student')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-gray-800">Session Report</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">{new Date(session.created_at).toLocaleString()}</p>
          <h2 className="text-base font-semibold text-gray-800 mb-4">{session.passages.title}</h2>

          <div className="flex justify-around">
            <ScoreRing value={`${session.score_accuracy}%`} label="Accuracy" color="border-blue-500" />
            <ScoreRing value={session.score_wpm} label="WPM" color="border-green-500" />
            <ScoreRing value={`${session.score_fluency}%`} label="Fluency" color="border-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Word-by-Word Analysis</h3>
          <div className="flex flex-wrap gap-1.5">
            {passageWords.map((word, i) => {
              const result = words[i]
              const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase()
              const status = result?.status ?? 'unknown'
              const colorClass = status === 'correct' ? 'bg-green-100 text-green-800'
                : status === 'mispronounced' ? 'bg-yellow-100 text-yellow-800'
                : status === 'skipped' ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-600'
              return (
                <span key={i} className={`px-2 py-0.5 rounded text-sm font-medium ${colorClass}`}>
                  {word}
                </span>
              )
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1" />Correct</span>
            <span><span className="inline-block w-3 h-3 rounded bg-yellow-200 mr-1" />Mispronounced</span>
            <span><span className="inline-block w-3 h-3 rounded bg-red-200 mr-1" />Skipped</span>
          </div>
        </div>

        {session.feedback && (
          <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Feedback</h3>
            <p className="text-sm text-blue-700 leading-relaxed">{session.feedback}</p>
          </div>
        )}
      </main>
    </div>
  )
}
