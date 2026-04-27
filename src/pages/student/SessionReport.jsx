import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function ComprehensionResults({ questions, answers }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Comprehension Results</h3>
      {questions
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((q, qi) => {
          const ans = answers.find(a => a.question_id === q.id)
          return (
            <div key={q.id}>
              <p className="text-sm font-medium text-gray-800 mb-2">
                <span className="text-gray-400 mr-1">{qi + 1}.</span>
                <span>{q.question_text}</span>
              </p>
              <div className="space-y-1">
                {q.options.map((opt, oi) => {
                  const isCorrect = oi === q.correct_index
                  const isSelected = ans?.selected_index === oi
                  let cls = 'text-gray-500'
                  if (isSelected && isCorrect) cls = 'text-green-700 font-semibold'
                  else if (isSelected && !isCorrect) cls = 'text-red-600 font-semibold'
                  else if (isCorrect) cls = 'text-green-600'
                  return (
                    <p key={oi} className={`text-xs flex items-center gap-1 ${cls}`}>
                      <span>{isSelected ? (isCorrect ? '✓' : '✗') : isCorrect ? '✓' : ' '}</span>
                      <span>{opt}</span>
                    </p>
                  )
                })}
              </div>
            </div>
          )
        })}
    </div>
  )
}

const WPM_TARGETS = { 9: 140, 10: 150, 11: 160, 12: 170, MBA: 180 }

function FeedbackCard({ raw }) {
  let ai = null
  try { ai = JSON.parse(raw) } catch { /* plain text fallback */ }

  if (ai && ai.wentWell) {
    return (
      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-blue-800">Feedback</h3>
        <div>
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">What went well</p>
          <p className="text-sm text-gray-700 leading-relaxed">{ai.wentWell}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Focus on</p>
          <p className="text-sm text-gray-700 leading-relaxed">{ai.focusOn}</p>
        </div>
        {ai.practiseWords?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Words to practise</p>
            <div className="flex flex-wrap gap-2">
              {ai.practiseWords.map(w => (
                <span key={w} className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-sm font-medium">{w}</span>
              ))}
            </div>
          </div>
        )}
        <div className="pt-1 border-t border-blue-100">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Tip for next time</p>
          <p className="text-sm text-blue-700 leading-relaxed">{ai.tip}</p>
        </div>
      </div>
    )
  }

  // plain text fallback (rule-based or old sessions)
  return (
    <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
      <h3 className="text-sm font-semibold text-blue-800 mb-2">Feedback</h3>
      <p className="text-sm text-blue-700 leading-relaxed">{raw}</p>
    </div>
  )
}

function ScoreRing({ value, label, color, sub }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-20 h-20 rounded-full border-4 ${color} flex items-center justify-center`}>
        <span className="text-xl font-bold text-gray-800">{value}</span>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

export default function SessionReport() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [grade, setGrade] = useState(null)
  const [questions, setQuestions] = useState([])
  const [personalBest, setPersonalBest] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: s } = await supabase
        .from('sessions')
        .select('*, passages(title, content)')
        .eq('id', sessionId)
        .single()
      setSession(s)

      const [{ data: p }, { data: qs }, { data: prev }] = await Promise.all([
        supabase.from('profiles').select('grade').eq('id', s?.student_id).single(),
        supabase.from('questions').select('*').eq('passage_id', s?.passage_id).order('display_order'),
        supabase.from('sessions')
          .select('score_accuracy, score_wpm')
          .eq('passage_id', s?.passage_id)
          .eq('student_id', s?.student_id)
          .neq('id', sessionId),
      ])
      setGrade(p?.grade ?? null)
      setQuestions(qs ?? [])

      if (prev && prev.length > 0) {
        const prevBestAccuracy = Math.max(...prev.map(r => r.score_accuracy))
        const prevBestWpm = Math.max(...prev.map(r => r.score_wpm))
        setPersonalBest({
          newAccuracy: s.score_accuracy > prevBestAccuracy,
          newWpm: s.score_wpm > prevBestWpm,
          prevBestAccuracy,
          prevBestWpm,
        })
      }
    }
    load()
  }, [sessionId])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const words = session.word_results ?? []
  const wpmTarget = WPM_TARGETS[grade] ?? 150
  const wpmDiff = session.score_wpm - wpmTarget
  const wpmSub = wpmDiff >= 0
    ? `+${wpmDiff} above target`
    : `${Math.abs(wpmDiff)} below target (${wpmTarget})`
  const wpmColor = Math.abs(wpmDiff) <= 15 ? 'border-green-500' : wpmDiff < 0 ? 'border-yellow-500' : 'border-blue-500'

  const omissions = session.count_omissions ?? words.filter(w => w.status === 'omission').length
  const substitutions = session.count_substitutions ?? words.filter(w => w.status === 'substitution').length
  const phrasing = session.score_phrasing ?? session.score_fluency ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/student')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-gray-800">Session Report</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {personalBest && (personalBest.newAccuracy || personalBest.newWpm) && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-green-700">New personal best!</p>
            <p className="text-xs text-green-600 mt-0.5">
              {[
                personalBest.newAccuracy && `Accuracy: ${session.score_accuracy}% (was ${personalBest.prevBestAccuracy}%)`,
                personalBest.newWpm && `WPM: ${session.score_wpm} (was ${personalBest.prevBestWpm})`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
        {personalBest && !personalBest.newAccuracy && !personalBest.newWpm && (
          <p className="text-xs text-gray-400 px-1">
            Your best on this passage — Accuracy: {personalBest.prevBestAccuracy}% · WPM: {personalBest.prevBestWpm}
          </p>
        )}

        {/* Scores */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">{new Date(session.created_at).toLocaleString()}</p>
          <h2 className="text-base font-semibold text-gray-800 mb-5">{session.passages.title}</h2>

          <div className="flex justify-around flex-wrap gap-4">
            <ScoreRing
              value={`${session.score_accuracy}%`}
              label="Accuracy"
              color="border-blue-500"
            />
            <ScoreRing
              value={session.score_wpm}
              label="Pace (WPM)"
              color={wpmColor}
              sub={wpmSub}
            />
            <ScoreRing
              value={`${phrasing}%`}
              label="Phrasing"
              color="border-purple-500"
            />
            {session.score_comprehension != null && (
              <ScoreRing
                value={`${session.score_comprehension}%`}
                label="Comprehension"
                color="border-teal-500"
              />
            )}
          </div>

          {/* Error summary */}
          <div className="mt-5 flex justify-center gap-6 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-red-500">{omissions}</span> skipped
            </span>
            <span>
              <span className="font-semibold text-amber-500">{substitutions}</span> substituted
            </span>
          </div>
        </div>

        {/* Word-by-word */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Word-by-Word Analysis</h3>
          <div className="flex flex-wrap gap-1.5">
            {words.map((result, i) => {
              const colorClass =
                result.status === 'correct'       ? 'bg-green-100 text-green-800' :
                result.status === 'substitution'  ? 'bg-amber-100 text-amber-800' :
                result.status === 'omission'      ? 'bg-red-100 text-red-800'
                                                  : 'bg-gray-100 text-gray-600'
              const title = result.status === 'substitution' && result.spoken
                ? `Said: "${result.spoken}"`
                : undefined
              return (
                <span
                  key={i}
                  title={title}
                  className={`px-2 py-0.5 rounded text-sm font-medium ${colorClass}`}
                >
                  {result.word}
                </span>
              )
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1" />Correct</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-200 mr-1" />Substituted</span>
            <span><span className="inline-block w-3 h-3 rounded bg-red-200 mr-1" />Skipped</span>
          </div>
        </div>

        {/* Feedback */}
        {session.feedback && <FeedbackCard raw={session.feedback} />}

        {/* Comprehension */}
        {questions.length > 0 && session.comprehension_answers == null && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-600">Ready to test your understanding?</p>
            <button
              onClick={() => navigate(`/student/comprehension/${sessionId}`)}
              className="bg-teal-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors min-h-[44px] w-full sm:w-auto"
            >
              Answer Comprehension Questions
            </button>
          </div>
        )}

        {questions.length > 0 && session.comprehension_answers != null && (
          <ComprehensionResults
            questions={questions}
            answers={session.comprehension_answers}
          />
        )}
      </main>
    </div>
  )
}
