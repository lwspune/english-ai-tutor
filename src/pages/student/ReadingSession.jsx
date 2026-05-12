import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { extractEdgeFunctionError } from '../../lib/edgeFunctionError'
import { feedback } from '../../lib/feedback'

export default function ReadingSession() {
  const { passageId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [passage, setPassage] = useState(null)
  const [aiFeedbackEnabled, setAiFeedbackEnabled] = useState(true)
  const [attemptCount, setAttemptCount] = useState(null)
  const [dailyCount, setDailyCount] = useState(null)
  const [dailyLimit, setDailyLimit] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const maxDurationSec = passage ? Math.max(60, Math.round(passage.word_count / 70 * 60 * 1.5)) : 180
  const dailyLimitReached = dailyCount !== null && dailyLimit !== null && dailyCount >= dailyLimit
  const { recording, audioBlob, autoStopped, remaining, startRecording, stopRecording, reset } = useAudioRecorder(maxDurationSec)

  useEffect(() => {
    async function load() {
      const istOffsetMs = 330 * 60 * 1000
      const istNow = new Date(Date.now() + istOffsetMs)
      const istMidnightUtc = new Date(
        Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffsetMs,
      ).toISOString()

      const [{ data: p }, { data: s }, { count: attempts }, { count: todayCount }] = await Promise.all([
        supabase.from('passages').select('*').eq('id', passageId).single(),
        supabase.from('app_settings').select('ai_feedback_enabled, daily_session_limit').single(),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', profile.id).eq('passage_id', passageId),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('student_id', profile.id).gte('created_at', istMidnightUtc),
      ])
      setPassage(p)
      setAiFeedbackEnabled(s?.ai_feedback_enabled ?? true)
      setAttemptCount(attempts ?? 0)
      setDailyCount(todayCount ?? 0)
      setDailyLimit(s?.daily_session_limit ?? 5)
    }
    load()
  }, [passageId, profile.id])

  async function handleSubmit() {
    if (!audioBlob) return
    setSubmitting(true)
    setError('')

    try {
      const filename = `${profile.id}/${Date.now()}.webm`
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filename, audioBlob)
      if (uploadError) throw uploadError

      const { data, error: fnError } = await supabase.functions.invoke('analyze-reading', {
        body: { audioPath: filename, passageId, aiFeedbackEnabled },
      })
      if (fnError) {
        throw new Error(await extractEdgeFunctionError(fnError))
      }

      navigate(`/student/report/${data.sessionId}`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (!passage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const showStartHint = !recording && !audioBlob && !submitting

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/student')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">{passage.title}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-44 space-y-3">
        {showStartHint && (
          <p data-testid="start-hint" className="text-xs text-slate-500 text-center">
            Read aloud — tap <span className="font-semibold text-slate-700">Start Recording</span> below when you're ready.
          </p>
        )}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <p className="text-slate-800 leading-relaxed text-lg">{passage.content}</p>
        </div>
      </main>

      <div
        data-testid="recording-bar"
        className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0)]"
      >
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          {dailyLimitReached && (
            <p className="text-xs text-center font-medium text-red-500">
              You've reached today's limit of {dailyLimit} passages. Come back tomorrow.
            </p>
          )}
          {!dailyLimitReached && attemptCount !== null && !recording && (
            <p className={`text-xs text-center font-medium ${attemptCount >= 3 ? 'text-red-500' : 'text-slate-500'}`}>
              {attemptCount >= 3
                ? 'You have used all 3 attempts for this passage.'
                : `Attempt ${attemptCount + 1} of 3`}
            </p>
          )}

          {recording && (
            <div className="flex items-center justify-center gap-3">
              <span
                data-testid="recording-pulse"
                className="w-3 h-3 bg-red-500 rounded-full animate-pulse"
              />
              <p className={`text-2xl font-bold tabular-nums ${remaining <= 30 ? 'text-red-500' : 'text-slate-700'}`}>
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </p>
              <p className="text-xs text-slate-400">Reading aloud…</p>
            </div>
          )}

          {!recording && !audioBlob && !submitting && autoStopped && (
            <p className="text-xs text-center font-medium text-slate-600">
              Recording stopped — time limit reached
            </p>
          )}

          {audioBlob && !recording && !submitting && (
            <p className="text-xs text-center font-medium text-slate-600">
              Recording complete — Submit to score, or Re-record to try again.
            </p>
          )}

          <div className="flex gap-3 justify-center">
            {!recording && !audioBlob && (
              <button
                onClick={() => { feedback('tap'); startRecording() }}
                disabled={attemptCount >= 3 || dailyLimitReached}
                className="bg-red-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                <span className="w-2 h-2 bg-white rounded-full" />
                Start Recording
              </button>
            )}
            {recording && (
              <button
                onClick={() => { feedback('tap'); stopRecording() }}
                className="bg-slate-800 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-slate-900 transition-colors min-h-[44px]"
              >
                Stop Recording
              </button>
            )}
            {audioBlob && !submitting && (
              <>
                <button
                  onClick={reset}
                  className="border border-slate-200 text-slate-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-slate-50 transition-colors min-h-[44px]"
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-indigo-700 transition-colors min-h-[44px]"
                >
                  Submit
                </button>
              </>
            )}
            {submitting && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Analysing your reading...
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
        </div>
      </div>
    </div>
  )
}
