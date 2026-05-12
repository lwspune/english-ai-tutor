const STOP_WORDS = new Set([
  'a', 'an', 'the',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'did', 'does', 'has', 'have', 'had',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'from',
  'and', 'or', 'but', 'so', 'if', 'than', 'that',
  'i', 'we', 'you', 'he', 'she', 'it', 'they', 'me', 'us', 'them',
  'my', 'his', 'her', 'our', 'their', 'your',
  'this', 'these', 'those',
])

function stripEdges(word) {
  return String(word ?? '').replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '')
}

function normalize(word) {
  return stripEdges(word).toLowerCase()
}

function isStumbleStatus(s) {
  return s === 'substitution' || s === 'omission'
}

function isPracticeWord(normalized) {
  return normalized.length >= 2 && !STOP_WORDS.has(normalized)
}

export function selectStumbleWords(sessions, opts = {}) {
  const { count = 3, recencyWindow = 5 } = opts
  if (!Array.isArray(sessions) || sessions.length === 0) return []

  const windowed = sessions.slice(-recencyWindow)
  const latest = windowed[windowed.length - 1]
  const tally = new Map()
  const inLatest = new Set()

  for (const s of windowed) {
    const wr = Array.isArray(s?.word_results) ? s.word_results : []
    for (const w of wr) {
      if (!isStumbleStatus(w?.status)) continue
      const norm = normalize(w?.word)
      if (!isPracticeWord(norm)) continue
      if (!tally.has(norm)) {
        tally.set(norm, { word: stripEdges(w.word), occurrences: [] })
      }
      const entry = tally.get(norm)
      entry.occurrences.push({ sessionId: s.id, status: w.status })
      if (s === latest) {
        entry.word = stripEdges(w.word)
        inLatest.add(norm)
      }
    }
  }

  const candidates = []
  for (const [norm, entry] of tally) {
    if (entry.occurrences.length >= 2 || inLatest.has(norm)) {
      candidates.push(entry)
    }
  }

  candidates.sort((a, b) => {
    if (b.occurrences.length !== a.occurrences.length) {
      return b.occurrences.length - a.occurrences.length
    }
    return a.word.toLowerCase().localeCompare(b.word.toLowerCase())
  })

  return candidates.slice(0, count)
}
