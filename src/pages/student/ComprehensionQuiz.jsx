import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import QuizForm from '../../components/QuizForm'
import { feedback } from '../../lib/feedback'

export default function ComprehensionQuiz() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [passage, setPassage] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingAnswers, setPendingAnswers] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: session } = await supabase
        .from('sessions')
        .select('passage_id, comprehension_answers')
        .eq('id', sessionId)
        .single()

      if (!session) { navigate('/student'); return }

      if (session.comprehension_answers !== null) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }

      const [{ data: qs }, { data: p }] = await Promise.all([
        supabase.from('questions').select('id, question_text, options, display_order').eq('passage_id', session.passage_id).order('display_order'),
        supabase.from('passages').select('title, content').eq('id', session.passage_id).single(),
      ])

      if (!qs || qs.length === 0) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }

      setPassage(p)
      setQuestions(qs)
    }
    load()
  }, [sessionId, navigate])

  function handleSubmit(answers) {
    setPendingAnswers(answers)
    setConfirming(true)
  }

  async function confirmSubmit() {
    setConfirming(false)
    setSubmitting(true)
    feedback('swoosh')
    await supabase.rpc('grade_comprehension', {
      p_session_id: sessionId,
      p_answers: pendingAnswers,
    })
    navigate(`/student/report/${sessionId}`, { replace: true })
  }

  if (questions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/student/report/${sessionId}`)}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Comprehension Quiz</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {passage && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{passage.title}</p>
            <div className="max-h-48 overflow-y-auto">
              <p className="text-slate-700 leading-relaxed text-sm">{passage.content}</p>
            </div>
          </div>
        )}
        <p className="text-sm text-slate-500">
          Answer all {questions.length} questions, then tap Submit.
        </p>
        {submitting ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <QuizForm questions={questions} onSubmit={handleSubmit} />
        )}
      </main>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-800 mb-2">Submit your answers?</h2>
            <p className="text-sm text-slate-500 mb-6">Once submitted, your answers cannot be changed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Go back
              </button>
              <button
                onClick={confirmSubmit}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
