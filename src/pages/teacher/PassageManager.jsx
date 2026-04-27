import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import QuestionPanel from '../../components/QuestionPanel'

const DIFFICULTY_LABELS = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' }

const EMPTY_FORM = { title: '', content: '', grade_level: '9', difficulty: 'easy' }

export default function PassageManager() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [passages, setPassages] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedPassageId, setExpandedPassageId] = useState(null)
  const [questionsByPassage, setQuestionsByPassage] = useState({})
  const [questionCounts, setQuestionCounts] = useState({})

  useEffect(() => { loadPassages() }, [])

  async function loadPassages() {
    const { data } = await supabase.from('passages').select('*').order('created_at', { ascending: false })
    const list = data ?? []
    setPassages(list)
    if (list.length > 0) {
      const { data: qRows } = await supabase
        .from('questions')
        .select('id, passage_id')
        .in('passage_id', list.map(p => p.id))
      const counts = {}
      for (const row of qRows ?? []) {
        counts[row.passage_id] = (counts[row.passage_id] ?? 0) + 1
      }
      setQuestionCounts(counts)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const wordCount = form.content.trim().split(/\s+/).length
    await supabase.from('passages').insert({
      title: form.title,
      content: form.content.trim(),
      grade_level: form.grade_level,
      difficulty: form.difficulty,
      word_count: wordCount,
      created_by: profile.id,
    })
    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)
    loadPassages()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this passage?')) return
    await supabase.from('passages').delete().eq('id', id)
    loadPassages()
  }

  async function toggleQuestions(passageId) {
    if (expandedPassageId === passageId) {
      setExpandedPassageId(null)
      return
    }
    setExpandedPassageId(passageId)
    if (!questionsByPassage[passageId]) {
      const { data } = await supabase
        .from('questions')
        .select('*')
        .eq('passage_id', passageId)
        .order('display_order')
      setQuestionsByPassage(prev => ({ ...prev, [passageId]: data ?? [] }))
    }
  }

  async function handleSaveQuestion(passageId, questionData) {
    const existing = questionsByPassage[passageId] ?? []
    const { data, error } = await supabase
      .from('questions')
      .insert({ ...questionData, passage_id: passageId, display_order: existing.length })
      .select()
      .single()
    if (error) { alert(error.message); return }
    setQuestionsByPassage(prev => ({
      ...prev,
      [passageId]: [...(prev[passageId] ?? []), data],
    }))
    setQuestionCounts(prev => ({ ...prev, [passageId]: (prev[passageId] ?? 0) + 1 }))
  }

  async function handleDeleteQuestion(passageId, questionId) {
    await supabase.from('questions').delete().eq('id', questionId)
    setQuestionsByPassage(prev => ({
      ...prev,
      [passageId]: (prev[passageId] ?? []).filter(q => q.id !== questionId),
    }))
    setQuestionCounts(prev => ({ ...prev, [passageId]: Math.max(0, (prev[passageId] ?? 1) - 1) }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/teacher')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
          <h1 className="text-base font-semibold text-gray-800">Passage Library</h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Passage'}
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {showForm && (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">New Passage</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. The Gift of the Magi"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Passage Text</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                required
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Paste passage text here..."
              />
              <p className="text-xs text-gray-400 mt-1">{form.content.trim() ? form.content.trim().split(/\s+/).length : 0} words</p>
            </div>
            <div className="flex gap-4">
              <div>
                <label htmlFor="grade-level-select" className="block text-xs font-medium text-gray-600 mb-1">Grade Level</label>
                <select
                  id="grade-level-select"
                  value={form.grade_level}
                  onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[9, 10, 11, 12].map(g => <option key={g} value={g}>{g}th Grade</option>)}
                  <option value="MBA">MBA</option>
                </select>
              </div>
              <div>
                <label htmlFor="difficulty-select" className="block text-xs font-medium text-gray-600 mb-1">Difficulty</label>
                <select
                  id="difficulty-select"
                  value={form.difficulty}
                  onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(DIFFICULTY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Passage'}
            </button>
          </form>
        )}

        <div className="space-y-3">
          {passages.length === 0 ? (
            <p className="text-sm text-gray-400">No passages yet. Add one above.</p>
          ) : passages.map(p => {
            const questions = questionsByPassage[p.id] ?? []
            const isExpanded = expandedPassageId === p.id
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.word_count} words · {p.grade_level === 'MBA' ? 'MBA' : `Grade ${p.grade_level}`} · {DIFFICULTY_LABELS[p.difficulty] ?? 'Easy'}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.content}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => toggleQuestions(p.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap min-h-[44px] flex items-center"
                    >
                      {isExpanded ? 'Hide Questions' : `Questions (${questionCounts[p.id] ?? 0})`}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <QuestionPanel
                    questions={questions}
                    onSave={q => handleSaveQuestion(p.id, q)}
                    onDelete={qId => handleDeleteQuestion(p.id, qId)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
