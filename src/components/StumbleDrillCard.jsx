import { Link } from 'react-router-dom'

export default function StumbleDrillCard({ stumbleWords, sessionId }) {
  if (!stumbleWords || stumbleWords.length === 0) return null

  return (
    <section className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
      <h3 className="text-base font-semibold text-slate-900">Practise these words</h3>
      <p className="mt-1 text-sm text-slate-600">
        Read each word in a sentence aloud — focus on the one you stumbled on.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stumbleWords.map((sw, i) => {
          const recurring = sw.occurrences && sw.occurrences.length >= 2
          return (
            <Link
              key={`${sw.word}-${i}`}
              to={`/student/drill/${sessionId}/${i}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-indigo-500 min-h-[36px]"
            >
              <span>{sw.word}</span>
              {recurring && (
                <span
                  className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs font-semibold"
                  aria-label={`${sw.occurrences.length} sessions`}
                >
                  ×{sw.occurrences.length}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
