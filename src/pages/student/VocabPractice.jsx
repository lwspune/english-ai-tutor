import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import BottomNav from '../../components/BottomNav'
import { assembleDeck } from '../../lib/vocabDeck'
import { buildPracticeCards } from '../../lib/vocabPracticeCard'

export default function VocabPractice() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState([])
  const [cardIndex, setCardIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: allWords } = await supabase.from('vocabulary_words').select('*')
      const { data: progress } = await supabase
        .from('student_word_progress')
        .select('*')
        .eq('student_id', profile.id)

      const deck = assembleDeck(progress ?? [], allWords ?? [], new Date())
      const built = buildPracticeCards(deck, allWords ?? [])
      setCards(built)
      setLoading(false)
    }
    load()
  }, [profile.id])

  const card = cards[cardIndex]
  const answered = selectedIndex !== null
  const done = !loading && cards.length > 0 && cardIndex >= cards.length

  async function handleSelect(i) {
    if (answered) return
    setSelectedIndex(i)
    const isCorrect = i === card.correctIndex
    if (isCorrect) setCorrectCount(c => c + 1)
    await supabase.rpc('grade_vocab_attempt', { p_word_id: card.word_id, p_was_correct: isCorrect })
  }

  function handleNext() {
    setSelectedIndex(null)
    setCardIndex(i => i + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/student/vocab')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
          aria-label="Back to vocabulary home"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Vocab Practice</h1>
        {!loading && cards.length > 0 && !done && (
          <span className="ml-auto text-xs text-slate-500">
            {cardIndex + 1} / {cards.length}
          </span>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : cards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-600">All caught up — come back tomorrow.</p>
            <button
              onClick={() => navigate('/student/vocab')}
              className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 min-h-[44px]"
            >
              Back to vocabulary
            </button>
          </div>
        ) : done ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
            <p className="text-base font-semibold text-slate-800">Session complete</p>
            <p className="text-3xl font-bold text-indigo-600">
              {correctCount} <span className="text-slate-400 text-lg font-normal">of</span> {cards.length}
            </p>
            <p className="text-xs text-slate-500">correct</p>
            <button
              onClick={() => navigate('/student/vocab')}
              className="w-full bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-xl hover:bg-indigo-700 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-medium">
                {card.part_of_speech}
              </p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1">{card.word}</h2>
              <p className="text-sm text-slate-600 mt-3">{card.definition}</p>
              <p className="text-sm text-slate-500 italic mt-2">"{card.example_sentence}"</p>
            </div>

            <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-5">
              <p className="text-sm text-indigo-900 font-medium">{card.prompt}</p>
              <div className="mt-4 space-y-2">
                {card.options.map((opt, i) => {
                  const isCorrect = i === card.correctIndex
                  const isSelected = i === selectedIndex
                  let style = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  if (answered) {
                    if (isCorrect) style = 'bg-green-50 border-green-400 text-green-800 font-medium'
                    else if (isSelected) style = 'bg-red-50 border-red-400 text-red-800'
                    else style = 'bg-white border-slate-200 text-slate-400'
                  }
                  return (
                    <button
                      key={i}
                      data-testid={`option-${i}`}
                      onClick={() => handleSelect(i)}
                      disabled={answered}
                      className={`w-full text-left text-sm border rounded-xl px-4 py-3 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${style}`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
              {answered && (
                <div className="mt-4">
                  <p className={`text-sm font-medium ${selectedIndex === card.correctIndex ? 'text-green-700' : 'text-amber-700'}`}>
                    {selectedIndex === card.correctIndex ? 'Correct!' : 'Not quite — the right answer is highlighted in green.'}
                  </p>
                  <button
                    onClick={handleNext}
                    className="mt-3 w-full bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-xl hover:bg-indigo-700 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    {cardIndex + 1 < cards.length ? 'Next' : 'Finish'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
