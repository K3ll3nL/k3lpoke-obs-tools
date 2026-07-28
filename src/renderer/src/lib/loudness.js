// ITU-R BS.1770-4 loudness (LUFS) + the shared clip volume model.
//
// Auto-normalize works *through the envelope*: we measure short-term loudness
// across the clip and emit keyframes that pull each moment toward the target.
// That keeps a clip that starts quiet and ends loud at a consistent level,
// and the result stays visible and hand-editable in the envelope editor.

export const LUFS_TARGET = -14

// K-weighting: stage 1 high-shelf, stage 2 RLB high-pass.
// Coefficients derived for arbitrary sample rate (libebur128 method).
function kWeightingCoeffs(fs) {
  const f0 = 1681.974450955533
  const G = 3.999843853973347
  const Q = 0.7071752369554196
  const K = Math.tan((Math.PI * f0) / fs)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  const a0 = 1 + K / Q + K * K
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0
  }

  const f0h = 38.13547087602444
  const Qh = 0.5003270373238773
  const Kh = Math.tan((Math.PI * f0h) / fs)
  const den = 1 + Kh / Qh + Kh * Kh
  const hp = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (Kh * Kh - 1)) / den,
    a2: (1 - Kh / Qh + Kh * Kh) / den
  }

  return [shelf, hp]
}

function biquad(input, c) {
  const out = new Float32Array(input.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i]
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    out[i] = y0
    x2 = x1; x1 = x0
    y2 = y1; y1 = y0
  }
  return out
}

// Surround channels are weighted higher per BS.1770; L/R/C are unity.
const chWeight = i => (i === 3 || i === 4 ? 1.41 : 1.0)

function loudnessOf(z, nCh) {
  let sum = 0
  for (let c = 0; c < nCh; c++) sum += chWeight(c) * z[c]
  return sum > 0 ? -0.691 + 10 * Math.log10(sum) : -Infinity
}

/**
 * K-weights every channel, then returns the 400ms/100ms-hop mean-square blocks
 * that both the integrated measurement and the short-term curve are built from.
 */
function analyze(audioBuffer) {
  const fs = audioBuffer.sampleRate
  const nCh = Math.min(audioBuffer.numberOfChannels, 5)
  if (!nCh) return null

  const coeffs = kWeightingCoeffs(fs)
  const weighted = []
  for (let c = 0; c < nCh; c++) {
    let sig = audioBuffer.getChannelData(c)
    for (const co of coeffs) sig = biquad(sig, co)
    weighted.push(sig)
  }

  const blockLen = Math.round(0.4 * fs)
  const hopLen = Math.round(0.1 * fs)
  const nSamples = weighted[0].length
  if (nSamples < blockLen) return null

  const blocks = []
  for (let start = 0; start + blockLen <= nSamples; start += hopLen) {
    const z = new Array(nCh)
    for (let c = 0; c < nCh; c++) {
      const sig = weighted[c]
      let sum = 0
      for (let i = start; i < start + blockLen; i++) sum += sig[i] * sig[i]
      z[c] = sum / blockLen
    }
    blocks.push({ z, time: start / fs })
  }
  return blocks.length ? { blocks, nCh, hop: 0.1 } : null
}

/** Integrated loudness in LUFS. Null when silent / too short to gate. */
export function measureIntegratedLufs(audioBuffer) {
  const a = analyze(audioBuffer)
  if (!a) return null
  const { blocks, nCh } = a

  const absGated = blocks.filter(b => loudnessOf(b.z, nCh) > -70)
  if (!absGated.length) return null

  const meanOf = list => {
    const m = new Array(nCh).fill(0)
    for (const b of list) for (let c = 0; c < nCh; c++) m[c] += b.z[c] / list.length
    return m
  }

  const relThresh = loudnessOf(meanOf(absGated), nCh) - 10
  const gated = absGated.filter(b => loudnessOf(b.z, nCh) > relThresh)
  if (!gated.length) return null

  const lufs = loudnessOf(meanOf(gated), nCh)
  return isFinite(lufs) ? lufs : null
}

/**
 * Builds envelope keyframes that hold the clip near `target` throughout.
 *
 * Uses BS.1770 short-term loudness (3s sliding window) rather than a single
 * integrated figure, so quiet passages get lifted and loud ones pulled down.
 *
 * - Silent/near-silent windows inherit the previous gain instead of being
 *   boosted to the ceiling (which would just amplify room noise).
 * - Gain is slew-limited so the result rides the level instead of pumping.
 * - Collinear points are dropped so the user gets an editable curve, not 200
 *   keyframes.
 */
export function buildNormalizeEnvelope(audioBuffer, {
  target = LUFS_TARGET,
  minGain = 0.25,
  maxGain = 4.0,
  windowSec = 3.0,
  hopSec = 0.5,
  maxSlewDbPerSec = 6,
  toleranceDb = 0.75
} = {}) {
  const a = analyze(audioBuffer)
  if (!a) return null
  const { blocks, nCh, hop } = a

  const perWindow = Math.max(1, Math.round(windowSec / hop))
  const stride = Math.max(1, Math.round(hopSec / hop))
  const duration = audioBuffer.duration

  // Short-term loudness at each sampled point.
  const points = []
  for (let i = 0; i < blocks.length; i += stride) {
    const from = Math.max(0, i - Math.floor(perWindow / 2))
    const to = Math.min(blocks.length, from + perWindow)
    const slice = blocks.slice(from, to)
    if (!slice.length) continue

    const m = new Array(nCh).fill(0)
    for (const b of slice) for (let c = 0; c < nCh; c++) m[c] += b.z[c] / slice.length
    points.push({ time: blocks[i].time, lufs: loudnessOf(m, nCh) })
  }
  if (!points.length) return null

  const clamp = g => Math.max(minGain, Math.min(maxGain, g))
  const toDb = g => 20 * Math.log10(g)
  const fromDb = d => Math.pow(10, d / 20)

  // Desired gain per point; silence holds the previous value.
  const SILENCE = -60
  let lastDb = null
  const raw = points.map(p => {
    let db
    if (!isFinite(p.lufs) || p.lufs < SILENCE) {
      db = lastDb ?? 0
    } else {
      db = toDb(clamp(fromDb(target - p.lufs)))
      lastDb = db
    }
    return { time: p.time, db }
  })

  // Slew-limit both directions so the gain rides the level instead of pumping.
  const maxStep = maxSlewDbPerSec * hopSec
  for (let i = 1; i < raw.length; i++) {
    const d = raw[i].db - raw[i - 1].db
    if (Math.abs(d) > maxStep) raw[i].db = raw[i - 1].db + Math.sign(d) * maxStep
  }
  for (let i = raw.length - 2; i >= 0; i--) {
    const d = raw[i].db - raw[i + 1].db
    if (Math.abs(d) > maxStep) raw[i].db = raw[i + 1].db + Math.sign(d) * maxStep
  }

  // Drop points that a straight line between their neighbours already predicts.
  const kept = []
  for (let i = 0; i < raw.length; i++) {
    if (i === 0 || i === raw.length - 1) { kept.push(raw[i]); continue }
    const prev = kept[kept.length - 1]
    const next = raw[i + 1]
    const span = next.time - prev.time
    const p = span > 0 ? (raw[i].time - prev.time) / span : 0
    const predicted = prev.db + (next.db - prev.db) * p
    if (Math.abs(raw[i].db - predicted) > toleranceDb) kept.push(raw[i])
  }

  const kfs = kept.map((k, i) => ({
    id: `norm-${i}-${Math.random().toString(36).slice(2, 8)}`,
    time: Math.max(0, Math.min(duration, k.time)),
    volume: Math.max(0, Math.min(2, fromDb(k.db))),
    mode: 'smooth',
    curve: 'linear'
  }))

  return kfs.length ? kfs : null
}

/**
 * Base gain applied before the envelope. The envelope carries normalization,
 * so this is just the user's master level for the clip.
 */
export function getBaseVolume(clip) {
  return clip?.volume ?? 1.0
}

export function formatLufs(lufs) {
  return lufs == null || !isFinite(lufs) ? '—' : `${lufs.toFixed(1)} LUFS`
}
