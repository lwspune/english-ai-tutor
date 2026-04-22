import { useRef, useState, useEffect } from 'react'

export function useAudioRecorder(maxDurationSec = 180) {
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [autoStopped, setAutoStopped] = useState(false)
  const [elapsed, setElapsed] = useState(0) // seconds
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const autoStopTimerRef = useRef(null)
  const elapsedTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(autoStopTimerRef.current)
      clearInterval(elapsedTimerRef.current)
    }
  }, [])

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunksRef.current = []
    setAutoStopped(false)
    setElapsed(0)

    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      setAudioBlob(blob)
      stream.getTracks().forEach(t => t.stop())
      clearTimeout(autoStopTimerRef.current)
      clearInterval(elapsedTimerRef.current)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
    setAudioBlob(null)

    // Auto-stop at passage-based limit
    autoStopTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
        setRecording(false)
        setAutoStopped(true)
      }
    }, maxDurationSec * 1000)

    // Tick elapsed seconds for UI countdown
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(s => s + 1)
    }, 1000)
  }

  function stopRecording() {
    clearTimeout(autoStopTimerRef.current)
    clearInterval(elapsedTimerRef.current)
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function reset() {
    setAudioBlob(null)
    setRecording(false)
    setAutoStopped(false)
    setElapsed(0)
  }

  const remaining = Math.max(0, maxDurationSec - elapsed)

  return { recording, audioBlob, autoStopped, elapsed, remaining, startRecording, stopRecording, reset }
}
