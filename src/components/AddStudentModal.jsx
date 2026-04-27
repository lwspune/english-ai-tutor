import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const VALID_GRADES = ['9', '10', '11', '12', 'MBA']

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validateRow(row) {
  const errors = []
  if (!row.full_name?.trim()) errors.push('Name required')
  if (!row.email || !isValidEmail(row.email)) errors.push('Invalid email')
  if (!row.password || row.password.length < 8) errors.push('Password min 8 chars')
  if (!row.grade || !VALID_GRADES.includes(row.grade)) errors.push('Invalid grade')
  return errors
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.split(',').map(c => c.trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
    return row
  })
}

// ─── Single tab ───────────────────────────────────────────────────────────────

function SingleTab({ onClose }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', grade: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error: fnError } = await supabase.functions.invoke('create-student', {
      body: { students: [form] },
    })

    setSubmitting(false)

    if (fnError) {
      setError(fnError.message)
      return
    }

    const result = data?.results?.[0]
    if (!result?.success) {
      setError(result?.error ?? 'Failed to add student')
      return
    }

    onClose(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="single-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input
          id="single-name"
          type="text"
          value={form.full_name}
          onChange={set('full_name')}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="Student full name"
        />
      </div>

      <div>
        <label htmlFor="single-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          id="single-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="student@school.com"
        />
      </div>

      <div>
        <label htmlFor="single-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <div className="relative">
          <input
            id="single-password"
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            placeholder="Min 8 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:underline"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="single-grade" className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
        <select
          id="single-grade"
          value={form.grade}
          onChange={set('grade')}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <option value="">Select grade</option>
          {VALID_GRADES.map(g => (
            <option key={g} value={g}>{g === 'MBA' ? 'MBA' : `Grade ${g}`}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => onClose(false)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 focus-visible:outline-none focus-visible:underline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {submitting ? 'Adding…' : 'Add Student'}
        </button>
      </div>
    </form>
  )
}

// ─── CSV tab ──────────────────────────────────────────────────────────────────

function CsvTab({ onClose }) {
  const [rows, setRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState(null)
  const fileInputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCsv(ev.target.result)
      setRows(parsed.map(row => ({ ...row, errors: validateRow(row) })))
      setSummary(null)
    }
    reader.readAsText(file)
  }

  const validRows = rows.filter(r => r.errors.length === 0)

  async function handleImport() {
    setImporting(true)
    const students = validRows.map(({ full_name, email, password, grade }) => ({ full_name, email, password, grade }))
    const { data, error: fnError } = await supabase.functions.invoke('create-student', {
      body: { students },
    })
    setImporting(false)

    if (fnError) {
      setSummary({ created: 0, failed: validRows.length, error: fnError.message })
      return
    }

    const results = data?.results ?? []
    const created = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success)
    setSummary({ created, failed })

    if (created > 0) onClose(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700 mb-1">
          Upload CSV
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Required columns (header row): <span className="font-mono">full_name, email, password, grade</span>
        </p>
        <input
          id="csv-upload"
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Email</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Grade</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 last:border-0 ${row.errors.length ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2 text-gray-800">{row.full_name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{row.email || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600">{row.grade || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2">
                    {row.errors.length === 0 ? (
                      <span className="text-xs text-green-700 font-medium">Valid</span>
                    ) : (
                      <span className="text-xs text-red-600">{row.errors.join('; ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div className={`rounded-lg px-4 py-3 text-sm ${summary.created > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <span className="font-semibold">{summary.created} created</span>
          {summary.failed?.length > 0 && (
            <span className="ml-2 text-red-700">· {summary.failed.length} failed</span>
          )}
          {summary.error && <span className="ml-2">{summary.error}</span>}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => onClose(false)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 focus-visible:outline-none focus-visible:underline"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={validRows.length === 0 || importing}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {importing ? 'Importing…' : `Import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function AddStudentModal({ onClose }) {
  const [tab, setTab] = useState('single')
  const [singleSuccess, setSingleSuccess] = useState(false)

  function handleSingleClose(didAdd) {
    if (didAdd) {
      setSingleSuccess(true)
      onClose(true)
    } else {
      onClose(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add student"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Add Student</h2>

        {singleSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
            Student added successfully.
          </div>
        )}

        <div role="tablist" className="flex gap-1 mb-5 border-b border-gray-200">
          {[
            { id: 'single', label: 'Single' },
            { id: 'csv', label: 'Import CSV' },
          ].map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'single' ? (
          <SingleTab onClose={handleSingleClose} />
        ) : (
          <CsvTab onClose={onClose} />
        )}
      </div>
    </div>
  )
}
