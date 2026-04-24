function Sparkline({ values, color, fillColor, referenceY, yMin = 0, yMax = 100 }) {
  const W = 300
  const H = 80
  const PX = 4
  const PY = 10

  const range = yMax - yMin || 1
  const toX = i => PX + (i / Math.max(values.length - 1, 1)) * (W - 2 * PX)
  const toY = v => PY + (1 - (v - yMin) / range) * (H - 2 * PY)

  if (values.length === 1) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
        <circle cx={W / 2} cy={toY(values[0])} r="6" fill={color} />
      </svg>
    )
  }

  const linePoints = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const areaPoints = [
    `${toX(0)},${H - PY}`,
    ...values.map((v, i) => `${toX(i)},${toY(v)}`),
    `${toX(values.length - 1)},${H - PY}`,
  ].join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
      {referenceY != null && (
        <line
          x1={PX} y1={toY(referenceY)}
          x2={W - PX} y2={toY(referenceY)}
          stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4,3"
        />
      )}
      <polygon points={areaPoints} fill={fillColor} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MetricCard({ label, values, color, fillColor, unit = '%', referenceY, yMin = 0, yMax = 100, refLabel }) {
  const latest = values.length ? values[values.length - 1] : null
  const best = values.length ? Math.max(...values) : null
  const change = values.length >= 2 ? values[values.length - 1] - values[0] : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        {refLabel && <p className="text-xs text-gray-400 mt-0.5">{refLabel}</p>}
      </div>
      {values.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">No data yet</p>
      ) : (
        <>
          <Sparkline
            values={values}
            color={color}
            fillColor={fillColor}
            referenceY={referenceY}
            yMin={yMin}
            yMax={yMax}
          />
          <div className="flex justify-between mt-3 pt-3 border-t border-gray-100">
            <div className="text-center">
              <p className="text-sm font-bold text-gray-800">{latest}{unit}</p>
              <p className="text-xs text-gray-400">Latest</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-800">{best}{unit}</p>
              <p className="text-xs text-gray-400">Best</p>
            </div>
            <div className="text-center">
              {change !== null ? (
                <>
                  <p className={`text-sm font-bold ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {change >= 0 ? '+' : ''}{change}{unit}
                  </p>
                  <p className="text-xs text-gray-400">Since start</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-gray-800">—</p>
                  <p className="text-xs text-gray-400">Change</p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
