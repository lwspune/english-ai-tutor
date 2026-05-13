import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const LAUNCH_THRESHOLD = 50

function formatSource(source) {
  return source ? source : 'direct'
}

function buildSourceBreakdown(rows) {
  const counts = new Map()
  for (const r of rows) {
    const key = formatSource(r.source)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export default function WaitlistPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('waitlist_signups')
        .select('id, email, source, created_at')
        .order('created_at', { ascending: false })
      setRows(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const breakdown = buildSourceBreakdown(rows)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/teacher')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Waitlist</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-slate-800">
                <span data-testid="total-count">{rows.length}</span>
                <span className="text-slate-400 text-lg font-normal"> / {LAUNCH_THRESHOLD}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">Signups (launch trigger)</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">
                {Math.round((rows.length / LAUNCH_THRESHOLD) * 100)}%
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${Math.min(100, (rows.length / LAUNCH_THRESHOLD) * 100)}%` }}
              aria-label={`${rows.length} of ${LAUNCH_THRESHOLD} signups`}
            />
          </div>
          {breakdown.length > 0 && (
            <p data-testid="source-summary" className="text-xs text-slate-500 mt-3">
              {breakdown.map(([src, count], i) => (
                <span key={src}>
                  {i > 0 && ' · '}
                  <span className="font-semibold text-slate-700">{count}</span> {src}
                </span>
              ))}
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-600">No signups yet.</p>
            <p className="text-xs text-slate-400 mt-2">
              The launch gate is {LAUNCH_THRESHOLD} signups. Share your landing-page link with
              <span className="font-mono">{' '}?src=&lt;channel&gt;</span> to attribute.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800">{r.email}</td>
                    <td data-testid={`source-cell-${r.id}`} className="px-4 py-2.5 text-slate-600">
                      {formatSource(r.source)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
