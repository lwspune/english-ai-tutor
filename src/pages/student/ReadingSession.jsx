import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'

export default function ReadingSession() {
  const { passageId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [passage, setPassage] = useState(null)
  const [aiFeedbackEnabled, setAiFeedbackEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { recording, audioBlob, startRecording, stopRecording, reset } = useAudioRecorder()

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('passages').select('*').eq('id', passageId).single(),
        supabase.from('app_settings').select('ai_feedback_enabled').single(),
      ])
      setPassage(p)
      setAiFeedbackEnabled(s?.ai_feedback_enabled ?? true)
    }
    load()
  }, [passageId])

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

      const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(filename)

      const { data, error: fnError } = await supabase.functions.invoke('analyze-reading', {
        body: { audioPath: filename, passageText: passage.content, studentId: profile.id, passageId, grade: profile.grade, aiFeedbackEnabled },
      })
      if (fnError) throw fnError

      navigate(`/student/report/${data.sessionId}`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (!passage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/student')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-gray-800">{passage.title}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-gray-800 leading-relaxed text-lg">{passage.content}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700 text-center">
            {recording ? 'Recording... read the passage aloud' : audioBlob ? 'Recording complete' : 'Press Start when ready to read'}
          </p>

          <div className="flex gap-3 justify-center">
            {!recording && !audioBlob && (
              <button
                onClick={startRecording}
                className="bg-red-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
              >
                <span className="w-2 h-2 bg-white rounded-full" />
                Start Recording
              </button>
            )}
            {recording && (
              <button
                onClick={stopRecording}
                className="bg-gray-800 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors"
              >
                Stop Recording
              </button>
            )}
            {audioBlob && !submitting && (
              <>
                <button
                  onClick={reset}
                  className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Submit
                </button>
              </>
            )}
            {submitting && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Analysing your reading...
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        </div>
      </main>
    </div>
  )
}
