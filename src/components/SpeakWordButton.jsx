function SpeakerIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}

export default function SpeakWordButton({ word, lang = 'en-US' }) {
  if (!word) return null
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    return null
  }

  function speak() {
    try {
      window.speechSynthesis.cancel()
      const u = new window.SpeechSynthesisUtterance(String(word))
      u.lang = lang
      u.rate = 0.9
      window.speechSynthesis.speak(u)
    } catch {
      // best-effort; some browsers throw on cancel under specific states
    }
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Play pronunciation of ${word}`}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-indigo-600 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors"
    >
      <SpeakerIcon />
    </button>
  )
}
