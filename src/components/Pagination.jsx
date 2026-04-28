export const PAGE_SIZE = 5

export default function Pagination({ page, total, onPrev, onNext, testIdPrefix }) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-3">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="text-xs text-gray-500 hover:text-gray-800 disabled:invisible px-2 py-1 min-h-[44px]"
        aria-label="Previous"
      >
        ← Previous
      </button>
      <span
        className="text-xs text-gray-400"
        data-testid={testIdPrefix ? `${testIdPrefix}-page-indicator` : undefined}
      >
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="text-xs text-gray-500 hover:text-gray-800 disabled:invisible px-2 py-1 min-h-[44px]"
        aria-label="Next"
        data-testid={testIdPrefix ? `${testIdPrefix}-next` : undefined}
      >
        Next →
      </button>
    </div>
  )
}
