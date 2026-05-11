export function shuffleOptions({ options, correct_index }, rng = Math.random) {
  const next = [...options]
  let newCorrect = correct_index
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    if (i === j) continue
    ;[next[i], next[j]] = [next[j], next[i]]
    if (newCorrect === i) newCorrect = j
    else if (newCorrect === j) newCorrect = i
  }
  return { options: next, correct_index: newCorrect }
}
