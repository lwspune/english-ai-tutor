import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function SpeakerIcon({ playing }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {playing
        ? <line x1="23" y1="9" x2="17" y2="15" />
        : <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />}
    </svg>
  )
}

export default function AudioPlayButton({ audioPath, word }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  if (!audioPath) return null

  function toggle() {
    if (playing && audioRef.current) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }
    const { data } = supabase.storage.from('vocab-audio').getPublicUrl(audioPath)
    const a = new Audio(data.publicUrl)
    a.addEventListener('ended', () => setPlaying(false))
    audioRef.current = a
    setPlaying(true)
    a.play().catch(() => setPlaying(false))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? `Stop pronunciation of ${word}` : `Play pronunciation of ${word}`}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-indigo-600 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors"
    >
      <SpeakerIcon playing={playing} />
    </button>
  )
}
