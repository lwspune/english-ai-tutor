import { useState } from 'react'

const EMPTY_FORM = { question_text: '', options: ['', '', '', ''], correct_index: 0 }

export default function QuestionPanel({ questions, onSave, onDelete }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const atLimit = questions.length >= 5

  function setOption(index, value) {
    setForm(f => {
      const options = [...f.options]
      options[index] = value
      return { ...f, options }
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ question_text: form.question_text, options: form.options, correct_index: form.correct_index })
    setForm(EMPTY_FORM)
  }

  return (
    <div className="mt-3 space-y-3">
      {questions
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((q, i) => (
          <div key={q.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-gray-800">
                <span className="text-gray-400 mr-1">{i + 1}.</span>
                <span>{q.question_text}</span>
              </p>
              <button
                type="button"
                onClick={() => onDelete(q.id)}
                className="text-xs text-red-400 hover:text-red-600 shrink-0"
              >
                Delete
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {q.options.map((opt, j) => (
                <li
                  key={j}
                  className={`text-xs px-2 py-1 rounded flex gap-1 ${j === q.correct_index ? 'bg-green-100 text-green-800 font-medium' : 'text-gray-600'}`}
                >
                  <span className="shrink-0">{String.fromCharCode(65 + j)}.</span>
                  <span>{opt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {atLimit ? (
        <p className="text-xs text-amber-600 font-medium">Maximum of 5 questions reached for this passage.</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-blue-50 rounded-lg border border-blue-200 p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-800">Add Question ({questions.length}/5)</p>
          <input
            value={form.question_text}
            onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
            required
            placeholder="Question text"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="grid grid-cols-1 gap-2">
            {['A', 'B', 'C', 'D'].map((letter, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={form.correct_index === i}
                  onChange={() => setForm(f => ({ ...f, correct_index: i }))}
                  className="w-4 h-4 accent-green-600"
                  title="Mark as correct"
                />
                <input
                  value={form.options[i]}
                  onChange={e => setOption(i, e.target.value)}
                  required
                  placeholder={`Option ${letter}`}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">Select the radio button next to the correct answer.</p>
          <button
            type="submit"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            Add Question
          </button>
        </form>
      )}
    </div>
  )
}
