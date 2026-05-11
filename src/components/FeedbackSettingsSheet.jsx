import { useState } from 'react'
import { getPrefs, setPrefs, playSound, vibrate } from '../lib/feedback'

function ToggleRow({ label, sub, checked, onChange, testId }) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer">
      <span className="flex-1 pr-4">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{sub}</span>
      </span>
      <span className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          data-testid={testId}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="w-11 h-6 bg-slate-300 rounded-full peer-checked:bg-indigo-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  )
}

export default function FeedbackSettingsSheet({ onClose }) {
  const [prefs, setLocalPrefs] = useState(getPrefs())

  function toggle(key) {
    const wasOn = prefs[key]
    const next = setPrefs({ [key]: !wasOn })
    setLocalPrefs(next)
    if (!wasOn) {
      if (key === 'sound') playSound('correct')
      if (key === 'haptics') vibrate('correct')
    }
  }

  return (
    <div
      data-testid="feedback-sheet-backdrop"
      className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'sheet-spring 320ms cubic-bezier(0.2, 1, 0.3, 1) forwards' }}
      >
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Sound & Haptics</h2>
        <p className="text-xs text-slate-500 mb-2">Saved on this device.</p>
        <div className="divide-y divide-slate-100">
          <ToggleRow
            label="Sound effects"
            sub="Tones on correct, wrong, and celebrate"
            checked={prefs.sound}
            onChange={() => toggle('sound')}
            testId="toggle-sound"
          />
          <ToggleRow
            label="Haptic feedback"
            sub="Vibration on supported devices"
            checked={prefs.haptics}
            onChange={() => toggle('haptics')}
            testId="toggle-haptics"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full bg-indigo-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors min-h-[44px]"
        >
          Done
        </button>
      </div>
    </div>
  )
}
