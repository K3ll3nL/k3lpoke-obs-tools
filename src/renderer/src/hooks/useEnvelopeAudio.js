import { useEffect, useRef, useState } from 'react'
import { getEnvelopeVol } from '../components/WaveformEditor'
import { getBaseVolume } from '../lib/loudness'

/**
 * Drives an in-app <video> so its audible level always matches the envelope.
 *
 * Routes the element through a GainNode because:
 *  - element.volume is capped at 1.0, so envelope points >100% and any
 *    normalize boost on a quiet clip would otherwise be silently dropped;
 *  - 'timeupdate' only fires ~4x/sec, which makes fades steppy — we sample the
 *    envelope on rAF instead so playback tracks the drawn curve exactly.
 *
 * NOTE: only for the in-app player. The OBS overlay must never use Web Audio
 * (createMediaElementSource breaks OBS's reroute_audio capture).
 *
 * Returns the live effective volume so the UI can display what's being heard.
 */
export function useEnvelopeAudio(videoRef, clip, envelope, active = true) {
  const ctxRef = useRef(null)
  const gainRef = useRef(null)
  const rafRef = useRef(null)
  const [liveVolume, setLiveVolume] = useState(1)

  // Keep the latest values without tearing down the audio graph on every edit.
  const stateRef = useRef({ clip, envelope })
  stateRef.current = { clip, envelope }

  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !active) return

    let cancelled = false

    if (!ctxRef.current) {
      try {
        const ctx = new AudioContext()
        const src = ctx.createMediaElementSource(vid)
        const gain = ctx.createGain()
        src.connect(gain).connect(ctx.destination)
        ctxRef.current = ctx
        gainRef.current = gain
        // The element itself stays at unity; the GainNode is the only control.
        vid.volume = 1
      } catch {
        // Already-wired element or no audio device — fall back to element volume.
        ctxRef.current = null
      }
    }

    const apply = () => {
      if (cancelled) return
      const { clip: c, envelope: env } = stateRef.current
      const base = getBaseVolume(c)
      const envVol = env && env.length ? getEnvelopeVol(env, vid.currentTime) : 1.0
      const eff = Math.max(0, base * envVol)

      if (gainRef.current && ctxRef.current) {
        if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {})
        gainRef.current.gain.value = eff
      } else {
        vid.volume = Math.min(1, eff)
      }
      setLiveVolume(eff)
      rafRef.current = requestAnimationFrame(apply)
    }
    rafRef.current = requestAnimationFrame(apply)

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [videoRef, active])

  // Tear the graph down only when the player actually goes away.
  useEffect(() => {
    return () => {
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
        ctxRef.current = null
        gainRef.current = null
      }
    }
  }, [])

  return liveVolume
}
