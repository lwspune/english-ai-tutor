import { useState } from 'react'

export default function QuizForm({ questions, onSubmit }) {
  const [selected, setSelected] = useState({})

  const allAnswered = questions.every(q => selected[q.id] !== undefined)

  function handleSubmit(e) {
    e.preventDefault()
    const answers = questions.map(q => ({
      question_id: q.id,
      selected_index: selected[q.id],
    }))
    onSubmit(answers)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {questions
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((q, qi) => (
          <div key={q.id} className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">
              <span className="text-slate-400 mr-1">{qi + 1}.</span>
              <span>{q.question_text}</span>
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const id = `${q.id}-${oi}`
                const checked = selected[q.id] === oi
                return (
                  <label
                    key={oi}
                    htmlFor={id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors min-h-[44px] ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      id={id}
                      name={q.id}
                      value={oi}
                      checked={checked}
                      onChange={() => setSelected(prev => ({ ...prev, [q.id]: oi }))}
                      className="w-4 h-4 accent-indigo-600"
                      aria-label={opt}
                    />
                    <span className="text-sm">{opt}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}

      <button
        type="submit"
        disabled={!allAnswered}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Submit Answers
      </button>
    </form>
  )
}
