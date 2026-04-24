import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import QuizForm from '../../components/QuizForm'

export default function ComprehensionQuiz() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: session } = await supabase
        .from('sessions')
        .select('passage_id, comprehension_answers')
        .eq('id', sessionId)
        .single()

      if (!session) { navigate('/student'); return }

      // already answered — go back to report
      if (session.comprehension_answers !== null) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }

      const { data: qs } = await supabase
        .from('questions')
        .select('id, question_text, options, display_order')
        .eq('passage_id', session.passage_id)
        .order('display_order')

      // no questions for this passage
      if (!qs || qs.length === 0) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }

      setQuestions(qs)
    }
    load()
  }, [sessionId, navigate])

  async function handleSubmit(answers) {
    setSubmitting(true)
    await supabase.rpc('grade_comprehension', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    navigate(`/student/report/${sessionId}`, { replace: true })
  }

  if (questions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/student/report/${sessionId}`)}
          className="text-gray-500 hover:text-gray-800 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-gray-800">Comprehension Quiz</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-6">
          Answer all {questions.length} questions, then tap Submit.
        </p>
        {submitting ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <QuizForm questions={questions} onSubmit={handleSubmit} />
        )}
      </main>
    </div>
  )
}
