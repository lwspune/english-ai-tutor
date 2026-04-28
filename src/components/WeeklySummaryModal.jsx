const TREND_ICON = { up: '↑', down: '↓', same: '→' }
const TREND_COLOR = { up: 'text-green-600', down: 'text-red-500', same: 'text-gray-400' }

export default function WeeklySummaryModal({ data, streak, onDismiss }) {
  const { passagesLastWeek, accuracyLastWeek, trend, weekLabel } = data

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Week</p>
          <p className="text-sm text-gray-500 mt-0.5">{weekLabel}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl py-3 px-2">
            <p className="text-2xl font-bold text-gray-800">{passagesLastWeek}</p>
            <p className="text-xs text-gray-500 mt-1">Passages<br />read</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-3 px-2">
            <p className="text-2xl font-bold text-gray-800">
              {accuracyLastWeek !== null ? `${accuracyLastWeek}%` : '—'}
            </p>
            {trend && (
              <p className={`text-lg font-bold ${TREND_COLOR[trend]}`}>{TREND_ICON[trend]}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">Accuracy</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-3 px-2">
            <p className="text-2xl font-bold text-orange-500">{streak}</p>
            <p className="text-xs text-gray-500 mt-1">Day<br />streak</p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors min-h-[44px]"
        >
          Let's go!
        </button>
      </div>
    </div>
  )
}
