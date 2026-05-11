const ICONS = {
  streak_5: '🔥',
  streak_10: '🔥',
  streak_20: '🔥',
  personal_best_accuracy: '🎯',
  personal_best_wpm: '⚡',
  comprehension_aced: '📘',
  word_mastered: '⭐',
}

function labelFor(m) {
  const p = m.payload ?? {}
  switch (m.kind) {
    case 'streak_5':
    case 'streak_10':
    case 'streak_20':
      return `${p.streak ?? m.kind.replace('streak_', '')}-day streak`
    case 'personal_best_accuracy':
      return `New accuracy best — ${p.score}%`
    case 'personal_best_wpm':
      return `New WPM best — ${p.score}`
    case 'comprehension_aced':
      return `Comprehension aced — ${p.score}%`
    case 'word_mastered':
      return `Mastered "${p.word ?? '…'}"`
    default:
      return m.kind
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
  })
}

export default function MilestoneList({ milestones }) {
  if (!milestones || milestones.length === 0) return null
  return (
    <div data-testid="milestone-list" className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent milestones</h3>
      <ul className="space-y-2">
        {milestones.map((m) => (
          <li
            key={m.id}
            data-testid={`milestone-row-${m.id}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span aria-hidden="true" className="text-base flex-shrink-0">{ICONS[m.kind] ?? '✨'}</span>
              <span className="text-slate-700 truncate">{labelFor(m)}</span>
            </span>
            <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(m.achieved_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
