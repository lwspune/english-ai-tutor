import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = {
  reviewed: 'Reviewed',
  disputed: 'Disputed',
  no_action: 'No action',
}
const STATUS_COLORS = {
  reviewed: 'bg-green-100 text-green-800',
  disputed: 'bg-amber-100 text-amber-800',
  no_action: 'bg-slate-100 text-slate-600',
}

export default function AudioReview() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sessions')
        .select(`
          id, score_accuracy, score_wpm, score_phrasing, score_comprehension,
          retained_audio_path, retention_reviewed_status, created_at,
          profiles ( full_name ),
          passages ( title )
        `)
        .not('retained_audio_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)
      setSessions(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  async function handlePlay(sessionId) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playingId === sessionId) {
      setPlayingId(null)
      return
    }
    const { data, error } = await supabase.functions.invoke('retained-audio-url', {
      body: { sessionId },
    })
    if (error || !data?.url) {
      console.error('Failed to fetch audio URL', error)
      return
    }
    const audio = new Audio(data.url)
    audio.addEventListener('ended', () => setPlayingId(null))
    audioRef.current = audio
    setPlayingId(sessionId)
    audio.play().catch(() => setPlayingId(null))
  }

  async function handleMark(sessionId, status) {
    const { error } = await supabase.rpc('mark_retention_review', {
      p_session_id: sessionId,
      p_status: status,
    })
    if (!error) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, retention_reviewed_status: status } : s,
        ),
      )
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/teacher')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Audio Review</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        <p className="text-xs text-slate-500">
          Latest 100 retained reading recordings, newest first. Parent consent obtained offline; recordings are used only for research, analysis, and app improvement.
        </p>

        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {!loading && sessions.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-600">No retained recordings yet.</p>
            <p className="text-xs text-slate-400 mt-2">
              Once students record reading sessions, the latest 100 will appear here.
            </p>
          </div>
        )}

        {sessions.map((s) => {
          const status = s.retention_reviewed_status
          const isPlaying = playingId === s.id
          return (
            <div
              key={s.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {s.profiles?.full_name ?? '(unknown student)'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {s.passages?.title ?? '(unknown passage)'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(s.created_at).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {status && (
                  <span
                    data-testid={`status-badge-${s.id}`}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                )}
              </div>

              <div className="flex gap-4 text-xs text-slate-600">
                <span>Acc <span className="font-semibold text-slate-800">{s.score_accuracy ?? '—'}%</span></span>
                <span>WPM <span className="font-semibold text-slate-800">{s.score_wpm ?? '—'}</span></span>
                <span>Phr <span className="font-semibold text-slate-800">{s.score_phrasing ?? '—'}%</span></span>
                {s.score_comprehension != null && (
                  <span>Comp <span className="font-semibold text-slate-800">{s.score_comprehension}%</span></span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handlePlay(s.id)}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-indigo-700 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={() => handleMark(s.id, 'reviewed')}
                  className="bg-white border border-green-300 text-green-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-green-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                >
                  Reviewed
                </button>
                <button
                  onClick={() => handleMark(s.id, 'disputed')}
                  className="bg-white border border-amber-300 text-amber-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-amber-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  Disputed
                </button>
                <button
                  onClick={() => handleMark(s.id, 'no_action')}
                  className="bg-white border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-slate-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  No action
                </button>
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
