import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useAuth } from '../../lib/AuthContext'
import AudioPlayButton from '../../components/AudioPlayButton'
import { feedback } from '../../lib/feedback'
import { selectStumbleWords } from '../../lib/stumbleWords'
import { findSentence } from '../../lib/stumbleSentence'

const MAX_ATTEMPTS = 3
const MAX_DRILL_SECONDS = 15

export default function StumbleDrill() {
  const { sessionId, wordIndex } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [stumble, setStumble] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const { recording, audioBlob, remaining, startRecording, stopRecording, reset } =
    useAudioRecorder(MAX_DRILL_SECONDS)

  useEffect(() => {
    async function load() {
      const { data: s } = await supabase
        .from('sessions')
        .select('*, passages(title, content)')
        .eq('id', sessionId)
        .single()
      if (!s) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }
      const { data: recent } = await supabase
        .from('sessions')
        .select('id, word_results, created_at')
        .eq('student_id', s.student_id)
        .lte('created_at', s.created_at)
        .order('created_at', { ascending: false })
        .limit(5)
      const inOrder = (recent ?? []).slice().reverse()
      const stumbles = selectStumbleWords(inOrder)
      const sw = stumbles[Number(wordIndex)]
      if (!sw) {
        navigate(`/student/report/${sessionId}`, { replace: true })
        return
      }
      const sentenceResult = findSentence(s.passages?.content || '', sw.word)
      const sentence = sentenceResult?.sentence || sw.word
      setStumble({ word: sw.word, sentence })

      const { data: priorAttempts } = await supabase
        .from('drill_attempts')
        .select('id, attempt_index, was_correct, score')
        .eq('session_id', sessionId)
        .ilike('stumble_word', sw.word)
        .order('attempt_index', { ascending: true })
      setAttempts(priorAttempts ?? [])
    }
    load()
  }, [sessionId, wordIndex, navigate])

  async function handleSubmit() {
    if (!audioBlob || !stumble) return
    setSubmitting(true)
    setError(null)
    try {
      const filename = `${profile.id}/${Date.now()}.webm`
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filename, audioBlob)
      if (uploadError) throw uploadError
      const { data, error: fnError } = await supabase.functions.invoke('analyze-drill', {
        body: {
          audioPath: filename,
          sessionId,
          stumbleWord: stumble.word,
          sentence: stumble.sentence,
        },
      })
      if (fnError) {
        throw new Error(fnError.message || 'Drill failed.')
      }
      setResult(data)
      feedback(data.wasCorrect ? 'correct' : 'wrong')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleTryAgain() {
    if (result) {
      setAttempts((prev) => [
        ...prev,
        {
          attempt_index: prev.length + 1,
          was_correct: result.wasCorrect,
          score: result.score,
        },
      ])
    }
    setResult(null)
    setError(null)
    reset()
  }

  if (!stumble) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const attemptsTotal = attempts.length + (result ? 1 : 0)
  const isOutOfAttempts = attemptsTotal >= MAX_ATTEMPTS
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsTotal)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/student/report/${sessionId}`)}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Practise</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h2 className="text-3xl font-bold text-indigo-700">{stumble.word}</h2>
            <AudioPlayButton word={stumble.word} />
          </div>
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-4">
            Read it aloud in this sentence
          </p>
          <p className="text-base text-slate-800 leading-relaxed">{stumble.sentence}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          {!result && !audioBlob && !recording && !isOutOfAttempts && (
            <button
              onClick={() => { feedback('tap'); startRecording() }}
              className="w-full bg-indigo-600 text-white text-base font-semibold px-5 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Record
            </button>
          )}

          {recording && (
            <div className="flex flex-col items-center gap-2">
              <span
                data-testid="recording-pulse"
                className="w-4 h-4 bg-red-500 rounded-full animate-pulse"
              />
              <p className={`text-2xl font-bold tabular-nums ${remaining <= 5 ? 'text-red-500' : 'text-slate-700'}`}>
                0:{String(remaining).padStart(2, '0')}
              </p>
              <button
                onClick={() => { feedback('tap'); stopRecording() }}
                className="bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-xl hover:bg-slate-900 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                Stop
              </button>
            </div>
          )}

          {audioBlob && !result && !recording && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-indigo-600 text-white text-base font-semibold px-5 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors min-h-[48px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button
                onClick={() => reset()}
                disabled={submitting}
                className="w-full bg-white border border-slate-300 text-slate-700 text-sm font-medium px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Re-record
              </button>
            </div>
          )}

          {result && (
            <div
              className={`rounded-2xl px-4 py-4 text-center ${
                result.wasCorrect ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
              }`}
            >
              <p className={`text-lg font-semibold ${result.wasCorrect ? 'text-green-800' : 'text-amber-800'}`}>
                {result.wasCorrect ? '✓ Got it! Nicely read.' : '✗ Try again.'}
              </p>
              {!result.wasCorrect && !isOutOfAttempts && (
                <p className="text-xs text-slate-500 mt-1">
                  {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} left
                </p>
              )}
            </div>
          )}

          {isOutOfAttempts && !result && (
            <p className="text-sm text-center text-slate-500">
              No attempts left for this word. Come back next session.
            </p>
          )}

          {result && (
            <div className="flex gap-2">
              {!result.wasCorrect && !isOutOfAttempts && (
                <button
                  onClick={handleTryAgain}
                  className="flex-1 bg-indigo-600 text-white text-sm font-medium px-5 py-3 rounded-xl hover:bg-indigo-700 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  Try again
                </button>
              )}
              <button
                onClick={() => navigate(`/student/report/${sessionId}`)}
                className="flex-1 bg-white border border-slate-300 text-slate-700 text-sm font-medium px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Done
              </button>
            </div>
          )}

          {isOutOfAttempts && !result && (
            <button
              onClick={() => navigate(`/student/report/${sessionId}`)}
              className="w-full bg-white border border-slate-300 text-slate-700 text-sm font-medium px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Done
            </button>
          )}

          {error && (
            <p className="text-xs text-center text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
