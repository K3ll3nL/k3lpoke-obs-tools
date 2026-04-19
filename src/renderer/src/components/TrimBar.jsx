import React, { useRef } from 'react'

function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function TrimBar({ duration, trimStart, trimEnd, onChange, onSave, videoRef }) {
  const barRef = useRef(null)
  const dur = Math.max(1, duration ?? 300)

  function getTime(clientX) {
    const rect = barRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(dur, ((clientX - rect.left) / rect.width) * dur))
  }

  function startDrag(which) {
    return (e) => {
      if (e.button !== 0) return
      e.preventDefault()

      function onMove(me) {
        const t = getTime(me.clientX)
        if (which === 'start') {
          const v = Math.min(t, trimEnd - 0.5)
          onChange(v, trimEnd)
          if (videoRef?.current) videoRef.current.currentTime = v
        } else {
          const v = Math.max(t, trimStart + 0.5)
          onChange(trimStart, v)
          if (videoRef?.current) videoRef.current.currentTime = v
        }
      }

      function onUp(me) {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        const t = getTime(me.clientX)
        if (which === 'start') onSave(Math.min(t, trimEnd - 0.5), trimEnd)
        else onSave(trimStart, Math.max(t, trimStart + 0.5))
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  const sp = Math.max(0, Math.min(100, (trimStart / dur) * 100))
  const ep = Math.max(0, Math.min(100, (trimEnd / dur) * 100))
  const tickCount = Math.min(19, Math.floor(dur / 10))

  return (
    <div className="space-y-1.5 select-none">
      <div
        ref={barRef}
        className="relative h-10 bg-twitch-dark rounded-md overflow-visible cursor-default"
      >
        {/* Excluded regions */}
        {sp > 0 && (
          <div className="absolute inset-y-0 left-0 bg-black/60 rounded-l-md" style={{ width: `${sp}%` }} />
        )}
        {ep < 100 && (
          <div className="absolute inset-y-0 right-0 bg-black/60 rounded-r-md" style={{ left: `${ep}%` }} />
        )}

        {/* Active region */}
        <div
          className="absolute inset-y-0 border-y-2 border-twitch-purple/70 bg-twitch-purple/20"
          style={{ left: `${sp}%`, width: `${ep - sp}%` }}
        />

        {/* Tick marks */}
        {Array.from({ length: tickCount }, (_, i) => (
          <div
            key={i}
            className="absolute top-1 w-px h-2 bg-white/10"
            style={{ left: `${((i + 1) * 10 / dur) * 100}%` }}
          />
        ))}

        {/* Start handle */}
        <div
          className="absolute inset-y-0 w-3 flex items-center justify-center bg-twitch-purple hover:brightness-125 cursor-ew-resize rounded-sm z-10 shadow-md"
          style={{ left: `${sp}%`, transform: 'translateX(-50%)' }}
          onMouseDown={startDrag('start')}
          title={`Trim start: ${fmt(trimStart)}`}
        >
          <div className="w-0.5 h-4 bg-white/70 rounded" />
        </div>

        {/* End handle */}
        <div
          className="absolute inset-y-0 w-3 flex items-center justify-center bg-twitch-purple hover:brightness-125 cursor-ew-resize rounded-sm z-10 shadow-md"
          style={{ left: `${ep}%`, transform: 'translateX(-50%)' }}
          onMouseDown={startDrag('end')}
          title={`Trim end: ${fmt(trimEnd)}`}
        >
          <div className="w-0.5 h-4 bg-white/70 rounded" />
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between items-center text-[10px] px-0.5">
        <div className="flex items-center gap-1 text-twitch-purple font-semibold">
          <span>Start</span>
          <span className="font-mono">{fmt(trimStart)}</span>
        </div>
        <span className="text-twitch-muted">{fmt(dur)} total</span>
        <div className="flex items-center gap-1 text-twitch-purple font-semibold">
          <span className="font-mono">{fmt(trimEnd)}</span>
          <span>End</span>
        </div>
      </div>
    </div>
  )
}
