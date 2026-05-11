import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { WPM_TARGETS } from '../../lib/wpmTargets'
import AudioPlayButton from '../../components/AudioPlayButton'
import Confetti from '../../components/Confetti'
import { buildRetentionQuiz } from '../../lib/vocabRetentionQuiz'
import { feedback } from '../../lib/feedback'

const VOCAB_GRADES = new Set(['11', '12', 'MBA'])
const normalizeWord = (s) => s.toLowerCase().replace(/^[^a-z-]+|[^a-z-]+$/g, '')

function VocabSheet({ vocab, onClose }) {
  if (!vocab) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40"
      onClick={onClose}
      role="dialog"
      aria-label={`Definition of ${vocab.word}`}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'sheet-spring 320ms cubic-bezier(0.2, 1, 0.3, 1) forwards' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-800">{vocab.word}</h3>
              <AudioPlayButton audioPath={vocab.audio_path} word={vocab.word} />
            </div>
            <p className="text-xs uppercase tracking-wide text-slate-400 mt-0.5">{vocab.part_of_speech}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-slate-700">{vocab.definition}</p>
        {vocab.example_sentence && (
          <p className="text-sm text-slate-500 italic">"{vocab.example_sentence}"</p>
        )}
      </div>
    </div>
  )
}

function ComprehensionResults({ questions, answers }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Comprehension Results</h3>
      {questions
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((q, qi) => {
          const ans = answers.find(a => a.question_id === q.id)
          return (
            <div key={q.id}>
              <p className="text-sm font-medium text-slate-800 mb-2">
                <span className="text-slate-400 mr-1">{qi + 1}.</span>
                {q.question_text}
              </p>
              <div className="space-y-1">
                {q.options.map((opt, oi) => {
                  const isCorrect = oi === q.correct_index
                  const isSelected = ans?.selected_index === oi
                  let cls = 'text-slate-400'
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

function FeedbackCard({ raw }) {
  let ai = null
  try { ai = JSON.parse(raw) } catch { /* plain text fallback */ }

  if (ai && ai.wentWell) {
    return (
      <div className="bg-indigo-50 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-indigo-800">Feedback</h3>
        <div>
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">What went well</p>
          <p className="text-sm text-slate-700 leading-relaxed">{ai.wentWell}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Focus on</p>
          <p className="text-sm text-slate-700 leading-relaxed">{ai.focusOn}</p>
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
        <div className="pt-1 border-t border-indigo-100">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Tip for next time</p>
          <p className="text-sm text-indigo-700 leading-relaxed">{ai.tip}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-indigo-50 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-indigo-800 mb-2">Feedback</h3>
      <p className="text-sm text-indigo-700 leading-relaxed">{raw}</p>
    </div>
  )
}

function MetricRing({ value, label, colorClass, sub }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
      <div className={`w-16 h-16 rounded-full border-4 ${colorClass} flex items-center justify-center`}>
        <span className="text-sm font-bold text-slate-800 leading-none">{value}</span>
      </div>
      <span className="text-xs text-slate-500 text-center">{label}</span>
      {sub && <span className="text-xs text-slate-400 text-center leading-tight">{sub}</span>}
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
  const [vocabMap, setVocabMap] = useState(null) // Map<lowercase word, vocab>
  const [openVocab, setOpenVocab] = useState(null)
  const [retentionCards, setRetentionCards] = useState([])
  const [retentionIndex, setRetentionIndex] = useState(0)
  const [retentionSelected, setRetentionSelected] = useState(null)
  const [retentionAnswers, setRetentionAnswers] = useState([])
  const [retentionSkipped, setRetentionSkipped] = useState(false)
  const [retentionDone, setRetentionDone] = useState(false)
  const celebratedRef = useRef(false)

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

      if (VOCAB_GRADES.has(String(p?.grade))) {
        const [{ data: vocab }, { data: progress }] = await Promise.all([
          supabase.from('vocabulary_words').select('id, word, part_of_speech, definition, example_sentence, audio_path, synonyms, antonyms'),
          supabase.from('student_word_progress').select('word_id, mastered_at').eq('student_id', s.student_id),
        ])
        const map = new Map()
        for (const v of vocab ?? []) map.set(v.word.toLowerCase(), v)
        setVocabMap(map)
        if (!s.vocab_retention_answers) {
          const cards = buildRetentionQuiz(s.word_results ?? [], map, progress ?? [], vocab ?? [])
          setRetentionCards(cards)
        }
      }
    }
    load()
  }, [sessionId])

  useEffect(() => {
    if (celebratedRef.current) return
    if (!session) return
    const isNew = personalBest && (personalBest.newAccuracy || personalBest.newWpm)
    const compAced = session.score_comprehension != null && session.score_comprehension >= 80
    if (isNew || compAced) {
      celebratedRef.current = true
      feedback('celebrate')
    }
  }, [session, personalBest])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const words = session.word_results ?? []
  const wpmTarget = WPM_TARGETS[grade] ?? 150
  const wpmDiff = session.score_wpm - wpmTarget
  const wpmSub = wpmDiff >= 0
    ? `+${wpmDiff} vs target`
    : `${Math.abs(wpmDiff)} below target`
  const wpmColor = Math.abs(wpmDiff) <= 15 ? 'border-green-500' : wpmDiff < 0 ? 'border-amber-400' : 'border-blue-500'
  const omissions = session.count_omissions ?? words.filter(w => w.status === 'omission').length
  const substitutions = session.count_substitutions ?? words.filter(w => w.status === 'substitution').length
  const phrasing = session.score_phrasing ?? session.score_fluency ?? 0
  const isNewBest = personalBest && (personalBest.newAccuracy || personalBest.newWpm)
  const comprehensionAced = session.score_comprehension != null && session.score_comprehension >= 80
  const showCelebration = !!(isNewBest || comprehensionAced)

  return (
    <div className="min-h-screen bg-slate-50">
      <Confetti active={showCelebration} />
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/student')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Session Report</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Personal best banner */}
        {isNewBest && (
          <div className="bg-green-500 rounded-2xl px-5 py-4 text-white">
            <p className="text-base font-bold">New personal best!</p>
            <p className="text-sm text-green-100 mt-0.5">
              {[
                personalBest.newAccuracy && `Accuracy: ${session.score_accuracy}% (was ${personalBest.prevBestAccuracy}%)`,
                personalBest.newWpm && `WPM: ${session.score_wpm} (was ${personalBest.prevBestWpm})`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
        {personalBest && !isNewBest && (
          <p className="text-xs text-slate-400 px-1">
            Your best on this passage — {personalBest.prevBestAccuracy}% accuracy · {personalBest.prevBestWpm} WPM
          </p>
        )}

        {/* Accuracy hero */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center text-center">
          <p className="text-xs text-slate-400 mb-1">{new Date(session.created_at).toLocaleString()}</p>
          <h2 className="text-base font-semibold text-slate-700 mb-3">{session.passages.title}</h2>
          <p className="text-7xl font-bold text-indigo-600 leading-none mb-1">{session.score_accuracy}%</p>
          <p className="text-xs text-slate-400 mb-5">Accuracy</p>
          <div className="flex gap-6 text-sm text-slate-600">
            <span><span className="font-bold text-red-500">{omissions}</span> skipped</span>
            <span><span className="font-bold text-amber-500">{substitutions}</span> substituted</span>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="flex gap-3">
          <MetricRing value={session.score_wpm} label="Pace (WPM)" colorClass={wpmColor} sub={wpmSub} />
          <MetricRing value={`${phrasing}%`} label="Phrasing" colorClass="border-purple-400" />
          {session.score_comprehension != null && (
            <MetricRing value={`${session.score_comprehension}%`} label="Comprehension" colorClass="border-teal-400" />
          )}
        </div>

        {/* Feedback */}
        {session.feedback && <FeedbackCard raw={session.feedback} />}

        {/* Vocab retention quiz — once-only, inline, before comprehension */}
        {!retentionSkipped && !retentionDone && retentionCards.length > 0 && (() => {
          const card = retentionCards[retentionIndex]
          const answered = retentionSelected !== null
          async function handleRetentionPick(i) {
            if (answered) return
            setRetentionSelected(i)
            const wasCorrect = i === card.correctIndex
            feedback(wasCorrect ? 'correct' : 'wrong')
            const answer = { word_id: card.word_id, selected_index: i, was_correct: wasCorrect }
            const allAnswers = [...retentionAnswers, answer]
            setRetentionAnswers(allAnswers)
            await supabase.rpc('grade_vocab_attempt', { p_word_id: card.word_id, p_was_correct: wasCorrect })
          }
          async function handleRetentionNext() {
            const isLast = retentionIndex + 1 >= retentionCards.length
            if (isLast) {
              await supabase.from('sessions').update({ vocab_retention_answers: retentionAnswers }).eq('id', sessionId)
              setRetentionDone(true)
            } else {
              setRetentionIndex(retentionIndex + 1)
              setRetentionSelected(null)
            }
          }
          return (
            <div data-testid="retention-quiz" className="bg-indigo-50 rounded-2xl border border-indigo-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-indigo-900">
                  Quick check — vocab from this passage
                  <span className="ml-2 text-xs font-normal text-indigo-700">{retentionIndex + 1} / {retentionCards.length}</span>
                </h3>
                <button
                  onClick={() => setRetentionSkipped(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Skip
                </button>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-2xl font-bold text-slate-800">{card.word}</h4>
                  <AudioPlayButton audioPath={card.audio_path} word={card.word} />
                </div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{card.part_of_speech}</p>
              </div>
              <p className="text-sm text-indigo-900 font-medium">{card.prompt}</p>
              <div className="space-y-2">
                {card.options.map((opt, i) => {
                  const isCorrect = i === card.correctIndex
                  const isSelected = i === retentionSelected
                  let style = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  if (answered) {
                    if (isCorrect) style = 'bg-green-50 border-green-400 text-green-800 font-medium'
                    else if (isSelected) style = 'bg-red-50 border-red-400 text-red-800'
                    else style = 'bg-white border-slate-200 text-slate-400'
                  }
                  const animation =
                    answered && isSelected
                      ? isCorrect
                        ? 'card-pulse-correct 500ms ease-out 1'
                        : 'card-shake-wrong 400ms ease-out 1'
                      : undefined
                  return (
                    <button
                      key={i}
                      onClick={() => handleRetentionPick(i)}
                      disabled={answered}
                      style={animation ? { animation } : undefined}
                      className={`w-full text-left text-sm border rounded-xl px-4 py-3 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${style}`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
              {answered && (
                <button
                  onClick={handleRetentionNext}
                  className="w-full bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-xl hover:bg-indigo-700 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {retentionIndex + 1 < retentionCards.length ? 'Next' : 'Done'}
                </button>
              )}
            </div>
          )
        })()}

        {/* Comprehension CTA */}
        {questions.length > 0 && session.comprehension_answers == null && (
          <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-slate-600">Ready to test your understanding?</p>
            <button
              onClick={() => navigate(`/student/comprehension/${sessionId}`)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors min-h-[44px] w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Answer Comprehension Questions
            </button>
          </div>
        )}

        {questions.length > 0 && session.comprehension_answers != null && (
          <ComprehensionResults questions={questions} answers={session.comprehension_answers} />
        )}

        {/* Word-by-word */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Word-by-Word</h3>
          <div className="flex flex-wrap gap-1.5">
            {words.map((result, i) => {
              const colorClass =
                result.status === 'correct'      ? 'bg-green-100 text-green-800' :
                result.status === 'substitution' ? 'bg-amber-100 text-amber-800' :
                result.status === 'omission'     ? 'bg-red-100 text-red-800'
                                                 : 'bg-slate-100 text-slate-600'
              const title = result.status === 'substitution' && result.spoken
                ? `Said: "${result.spoken}"`
                : undefined
              const normalised = normalizeWord(result.word)
              const vocab = vocabMap?.get(normalised)
              const vocabClass = vocab
                ? ' underline decoration-dotted decoration-indigo-500 underline-offset-4 cursor-pointer'
                : ''
              return (
                <span
                  key={i}
                  title={title}
                  data-testid={vocab ? `vocab-word-${normalised}` : undefined}
                  role={vocab ? 'button' : undefined}
                  tabIndex={vocab ? 0 : undefined}
                  onClick={vocab ? () => setOpenVocab(vocab) : undefined}
                  onKeyDown={vocab ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVocab(vocab) } } : undefined}
                  className={`px-2 py-0.5 rounded text-sm font-medium ${colorClass}${vocabClass}`}
                >
                  {result.word}
                </span>
              )
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-slate-500 flex-wrap">
            <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1" />Correct</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-200 mr-1" />Substituted</span>
            <span><span className="inline-block w-3 h-3 rounded bg-red-200 mr-1" />Skipped</span>
            {vocabMap && vocabMap.size > 0 && (
              <span className="underline decoration-dotted decoration-indigo-500 underline-offset-4">Vocab — tap for definition</span>
            )}
          </div>
        </div>
      </main>

      <VocabSheet vocab={openVocab} onClose={() => setOpenVocab(null)} />
    </div>
  )
}
