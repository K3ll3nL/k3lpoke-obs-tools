import React, { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const CHANNEL_COLORS = [
  '#9146FF','#FF6B6B','#4ECDC4','#FFD93D',
  '#6BCB77','#4D96FF','#FF8C42','#C77DFF',
  '#F72585','#7B2FBE','#06D6A0','#FFB347',
]

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-twitch-text">{label}</p>
        {description && <p className="text-xs text-twitch-muted">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-twitch-purple' : 'bg-twitch-border'}`}
      >
        <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function PieChart({ data, size = 130 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  const cx = size / 2, cy = size / 2, r = size / 2 - 5
  if (total === 0 || data.length === 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="#1e1e2a" stroke="#3a3a5a" strokeWidth="1" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#6b6b8a" fontSize="11">No channels</text>
      </svg>
    )
  }
  let angle = -Math.PI / 2
  return (
    <svg width={size} height={size}>
      {data.map((d, i) => {
        if (d.value <= 0) return null
        const pct = d.value / total
        const start = angle
        const end = angle + pct * 2 * Math.PI
        angle = end
        if (pct > 0.9999) return <circle key={i} cx={cx} cy={cy} r={r} fill={d.color} />
        const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
        const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end)
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`}
            fill={d.color}
          />
        )
      })}
      <circle cx={cx} cy={cy} r={r * 0.42} fill="#141420" />
    </svg>
  )
}

export default function ClipSettings() {
  const [channels, setChannels] = useState([])
  const [newChannel, setNewChannel] = useState('')
  const [addingChannel, setAddingChannel] = useState(false)
  const [channelError, setChannelError] = useState(null)

  const [overlayConfig, setOverlayConfig] = useState({
    showOverlay: true,
    position: 'bottom-left',
    fontSize: 20,
    cardSize: 'normal',
    displayMode: 'timed',
    displayDuration: 8,
    showTitle: true,
    showBroadcaster: true,
    showCreator: true,
    showViews: false,
    showDate: false,
    showDuration: false,
    forceProper: false,
    keepCaps: false,
    biasPopular: false,
    biasRecent: false,
    channelWeights: {},
  })
  const [configReady, setConfigReady] = useState(false)

  useEffect(() => {
    loadChannels()
    window.api.settings.getAll().then(r => {
      if (!r.ok) return
      const s = r.data
      if (s.overlayConfig) {
        setOverlayConfig(prev => {
          const merged = { ...prev, ...s.overlayConfig }
          if (s.overlayConfig.shuffleBias && s.overlayConfig.shuffleBias !== 'none') {
            merged.biasPopular = merged.biasPopular || s.overlayConfig.shuffleBias === 'popular'
            merged.biasRecent  = merged.biasRecent  || s.overlayConfig.shuffleBias === 'recent'
          }
          return merged
        })
      }
      setConfigReady(true)
    })
  }, [])

  useEffect(() => {
    if (!configReady) return
    const t = setTimeout(() => {
      window.api.settings.set('overlayConfig', overlayConfig)
      window.api.overlay.sendConfig(overlayConfig)
    }, 500)
    return () => clearTimeout(t)
  }, [overlayConfig, configReady])

  function loadChannels() {
    window.api.channels.list().then(r => { if (r.ok) setChannels(r.data) })
  }

  async function addChannel() {
    if (!newChannel.trim()) return
    setAddingChannel(true)
    setChannelError(null)
    try {
      const r = await window.api.channels.add(newChannel.trim(), false)
      if (!r.ok) throw new Error(r.error)
      setNewChannel('')
      loadChannels()
    } catch (e) {
      setChannelError(e.message)
    } finally {
      setAddingChannel(false)
    }
  }

  async function removeChannel(name) {
    await window.api.channels.remove(name)
    loadChannels()
  }

  const totalChWeight = channels.reduce((s, ch) => s + (overlayConfig.channelWeights[ch.name] ?? 1), 0)
  function chEffectivePct(name) {
    if (totalChWeight === 0) return 0
    return Math.round(((overlayConfig.channelWeights[name] ?? 1) / totalChWeight) * 100)
  }
  function setChWeight(name, val) {
    setOverlayConfig(p => ({ ...p, channelWeights: { ...p.channelWeights, [name]: val } }))
  }
  const pieData = channels.map((ch, i) => ({
    label: ch.display_name || ch.name,
    value: overlayConfig.channelWeights[ch.name] ?? 1,
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
  }))

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="font-bold text-xl text-twitch-text mb-6">Clip Queue Settings</h1>

      <div className="max-w-2xl space-y-6">

        {/* Clip Sources */}
        <section className="card p-5">
          <h2 className="font-semibold text-twitch-text mb-1">Clip Sources</h2>
          <p className="text-xs text-twitch-muted mb-4">
            Add channels here, then go to <strong className="text-twitch-text">Review</strong> to fetch and approve their clips.
          </p>
          <div className="space-y-1 mb-4">
            {channels.map(ch => (
              <div key={ch.name} className="flex items-center justify-between px-3 py-2 rounded-md bg-twitch-dark">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-twitch-text font-medium">{ch.display_name || ch.name}</span>
                  {ch.is_own ? <span className="text-[10px] bg-twitch-purple/20 text-twitch-purple px-1.5 py-0.5 rounded">your channel</span> : null}
                </div>
                <button
                  className="text-twitch-border hover:text-red-400 p-1 rounded transition-colors"
                  onClick={() => removeChannel(ch.name)}
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {channels.length === 0 && <p className="text-twitch-muted text-sm py-2">No channels yet — your channel is added automatically on login.</p>}
          </div>
          {channelError && <p className="text-red-400 text-xs mb-2">{channelError}</p>}
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Add a streamer (e.g. xqc)"
              value={newChannel}
              onChange={e => setNewChannel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addChannel()}
            />
            <button className="btn-purple shrink-0 flex items-center gap-1.5" onClick={addChannel} disabled={addingChannel}>
              <Plus size={14} /> Add
            </button>
          </div>
        </section>

        {/* Playback Order */}
        <section className="card p-5">
          <h2 className="font-semibold text-twitch-text mb-1">Playback Order</h2>
          <p className="text-xs text-twitch-muted mb-5">
            Control how clips are mixed across channels and which clips play first within each channel.
          </p>

          <div className="space-y-6">
            <div>
              <label className="label mb-1 block">Channel Distribution</label>
              <p className="text-xs text-twitch-muted mb-3">
                Set the relative weight for each channel. Higher weight means more clips from that channel.
              </p>
              {channels.length === 0 ? (
                <p className="text-xs text-twitch-muted py-2">Add channels in Clip Sources above.</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    {channels.map((ch, i) => {
                      const w = overlayConfig.channelWeights[ch.name] ?? 1
                      return (
                        <div key={ch.name} className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                          <span className="text-xs text-twitch-text w-28 truncate shrink-0">{ch.display_name || ch.name}</span>
                          <input
                            type="range" min="0" max="10" step="0.5"
                            value={w}
                            onChange={e => setChWeight(ch.name, Number(e.target.value))}
                            className="flex-1 accent-twitch-purple"
                          />
                          <span className="text-[10px] text-twitch-muted w-8 text-right shrink-0 font-mono">{chEffectivePct(ch.name)}%</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-5 pt-1">
                    <PieChart data={pieData} size={130} />
                    <div className="space-y-1.5 min-w-0">
                      {channels.map((ch, i) => (
                        <div key={ch.name} className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                          <span className="text-xs text-twitch-muted truncate">{ch.display_name || ch.name}</span>
                          <span className="text-[10px] text-twitch-text shrink-0 ml-auto pl-2">{chEffectivePct(ch.name)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-twitch-border pt-5 space-y-3">
              <div>
                <label className="label mb-1 block">Shuffle Bias</label>
                <p className="text-xs text-twitch-muted">Within each channel, boost clips that are more popular or more recent. Both can be active at once.</p>
              </div>
              <Toggle
                label="Favor Popular"
                description="Within a channel, boost clips with higher view counts"
                checked={overlayConfig.biasPopular}
                onChange={v => setOverlayConfig(p => ({ ...p, biasPopular: v }))}
              />
              <Toggle
                label="Favor Recent"
                description="Within a channel, boost clips that were clipped more recently"
                checked={overlayConfig.biasRecent}
                onChange={v => setOverlayConfig(p => ({ ...p, biasRecent: v }))}
              />
              <Toggle
                label="Play All Before Looping"
                description="Cycle through every clip once before any clip repeats; when off, each pick is fully random"
                checked={overlayConfig.playAllBeforeLoop ?? true}
                onChange={v => setOverlayConfig(p => ({ ...p, playAllBeforeLoop: v }))}
              />
            </div>
          </div>
        </section>

        {/* Overlay Options */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-twitch-text">Overlay Options</h2>
            <button
              onClick={() => { window.api.settings.set('overlayConfig', overlayConfig); window.api.overlay.sendConfig(overlayConfig) }}
              className="text-xs text-twitch-purple hover:text-white transition-colors"
            >
              Apply Now
            </button>
          </div>
          <div className="space-y-5">
            <Toggle
              label="Show info card"
              description="Display clip info on screen while playing"
              checked={overlayConfig.showOverlay}
              onChange={v => setOverlayConfig(p => ({ ...p, showOverlay: v }))}
            />

            {overlayConfig.showOverlay && <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Position</label>
                  <select className="input" value={overlayConfig.position} onChange={e => setOverlayConfig(p => ({ ...p, position: e.target.value }))}>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                  </select>
                </div>
                <div>
                  <label className="label">Card Size</label>
                  <select className="input" value={overlayConfig.cardSize} onChange={e => {
                    const fonts = { compact: 14, normal: 18, large: 24 }
                    setOverlayConfig(p => ({ ...p, cardSize: e.target.value, fontSize: fonts[e.target.value] ?? p.fontSize }))
                  }}>
                    <option value="compact">Compact</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Font Size ({(overlayConfig.fontSize * 0.1).toFixed(1)}vw)</label>
                <input
                  type="range" min="12" max="36" step="1"
                  value={overlayConfig.fontSize}
                  onChange={e => setOverlayConfig(p => ({ ...p, fontSize: Number(e.target.value) }))}
                  className="w-full accent-twitch-purple"
                />
              </div>

              <div>
                <label className="label">Display Mode</label>
                <div className="flex gap-2">
                  {['always', 'timed'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setOverlayConfig(p => ({ ...p, displayMode: mode }))}
                      className={`flex-1 py-1.5 rounded text-sm border transition-colors ${
                        overlayConfig.displayMode === mode
                          ? 'bg-twitch-purple border-twitch-purple text-white'
                          : 'border-twitch-border text-twitch-muted hover:text-twitch-text'
                      }`}
                    >
                      {mode === 'always' ? 'Always visible' : 'Show then hide'}
                    </button>
                  ))}
                </div>
                {overlayConfig.displayMode === 'timed' && (
                  <div className="mt-3">
                    <label className="label">Visible for ({overlayConfig.displayDuration}s)</label>
                    <input
                      type="range" min="2" max="30" step="1"
                      value={overlayConfig.displayDuration}
                      onChange={e => setOverlayConfig(p => ({ ...p, displayDuration: Number(e.target.value) }))}
                      className="w-full accent-twitch-purple"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="label mb-2 block">Show Fields</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'showTitle',       label: 'Clip title' },
                    { key: 'showBroadcaster', label: 'Channel name' },
                    { key: 'showCreator',     label: 'Clipped by' },
                    { key: 'showViews',       label: 'View count' },
                    { key: 'showDate',        label: 'Date clipped' },
                    { key: 'showDuration',    label: 'Duration' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!overlayConfig[key]}
                        onChange={e => setOverlayConfig(p => ({ ...p, [key]: e.target.checked }))}
                        className="accent-twitch-purple w-3.5 h-3.5"
                      />
                      <span className="text-sm text-twitch-text">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="border-t border-twitch-border pt-4 space-y-3">
                <Toggle
                  label="Force Proper Case"
                  description="Reformat clip titles in title case"
                  checked={overlayConfig.forceProper}
                  onChange={v => setOverlayConfig(p => ({ ...p, forceProper: v, keepCaps: v ? p.keepCaps : false }))}
                />
                {overlayConfig.forceProper && (
                  <div className="ml-4">
                    <Toggle
                      label="Keep Caps"
                      description="Preserve ALL CAPS words as written"
                      checked={overlayConfig.keepCaps}
                      onChange={v => setOverlayConfig(p => ({ ...p, keepCaps: v }))}
                    />
                  </div>
                )}
              </div>
            </>}
          </div>
        </section>

      </div>
    </div>
  )
}
