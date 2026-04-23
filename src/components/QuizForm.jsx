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
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((q, qi) => (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              <span className="text-gray-400 mr-1">{qi + 1}.</span>
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
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      id={id}
                      name={q.id}
                      value={oi}
                      checked={checked}
                      onChange={() => setSelected(prev => ({ ...prev, [q.id]: oi }))}
                      className="w-4 h-4 accent-blue-600"
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
        className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
      >
        Submit Answers
      </button>
    </form>
  )
}
