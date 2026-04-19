import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const EMPTY_FORM = { title: '', content: '', grade_level: '9' }

export default function PassageManager() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [passages, setPassages] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { loadPassages() }, [])

  async function loadPassages() {
    const { data } = await supabase.from('passages').select('*').order('created_at', { ascending: false })
    setPassages(data ?? [])
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const wordCount = form.content.trim().split(/\s+/).length
    await supabase.from('passages').insert({
      title: form.title,
      content: form.content.trim(),
      grade_level: parseInt(form.grade_level),
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grade Level</label>
              <select
                value={form.grade_level}
                onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[9, 10, 11, 12].map(g => <option key={g} value={g}>{g}th Grade</option>)}
              </select>
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
          ) : passages.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">{p.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.word_count} words · Grade {p.grade_level}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.content}</p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-xs text-red-400 hover:text-red-600 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
