import React, { useState, useEffect } from 'react'
import { CheckCircle, Circle, Loader } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function OBSStep({ onNext }) {
  const [host, setHost]         = useState('localhost')
  const [port, setPort]         = useState('4455')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function connect() {
    setLoading(true); setError('')
    const res = await window.api.obs.connect({ host, port: Number(port), password })
    setLoading(false)
    res.ok ? onNext() : setError(res.error ?? 'Connection failed')
  }

  return (
    <div className="space-y-4">
      <p className="text-twitch-muted text-sm">Enter your OBS WebSocket details (Tools → WebSocket Server Settings).</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-twitch-muted text-xs">Host</label>
          <input value={host} onChange={e => setHost(e.target.value)} className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple" />
        </div>
        <div className="space-y-1">
          <label className="text-twitch-muted text-xs">Port</label>
          <input value={port} onChange={e => setPort(e.target.value)} className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-twitch-muted text-xs">Password (optional)</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple" placeholder="Leave blank if not set" />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button onClick={connect} disabled={loading} className="flex items-center gap-2 bg-twitch-purple hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
        {loading && <Loader size={14} className="animate-spin" />}
        {loading ? 'Connecting...' : 'Connect to OBS'}
      </button>
    </div>
  )
}

function DockStep({ onNext }) {
  const [dockUrl, setDockUrl] = useState('')
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    window.api.shiny.getDockUrl().then(res => { if (res.ok) setDockUrl(res.data) })
  }, [])

  function copy() { navigator.clipboard.writeText(dockUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="space-y-5">
      <p className="text-twitch-muted text-sm">
        The dock shows your Switch grid inside OBS with one-click scene switching. OBS's API doesn't support adding docks automatically — it's a one-time manual step.
      </p>

      <ol className="space-y-3">
        {[
          'In OBS, open View → Docks → Custom Browser Docks',
          'Click the + button to add a new dock',
          'Set the name to "Quick Shiny Screen" and paste the URL below',
          'Click Apply — the dock will appear in your OBS layout',
        ].map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-5 h-5 rounded-full bg-twitch-purple text-white text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span className="text-twitch-text">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <input readOnly value={dockUrl} className="flex-1 bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-muted text-xs font-mono outline-none" />
        <button onClick={copy} className="bg-twitch-surface border border-twitch-border hover:bg-twitch-border text-twitch-text text-sm px-3 py-2 rounded-lg transition-colors shrink-0">
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
      </div>

      <button onClick={onNext} className="bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
        Done, I've added it →
      </button>
    </div>
  )
}

function UniversalSceneStep({ onNext }) {
  const [scenes, setScenes] = useState([])
  const [scene, setScene]   = useState('')
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    window.api.obs.getScenes().then(res => {
      if (res.ok) { setScenes(res.data.scenes); setScene(res.data.scenes[0] ?? '') }
    })
  }, [])

  async function save() {
    if (!scene) { setError('Pick a scene first'); return }
    const res = await window.api.shiny.setUniversalScene(scene)
    if (res.ok) setSaved(true)
    else setError(res.error ?? 'Failed to save')
  }

  if (saved) return (
    <div className="space-y-4">
      <p className="text-green-400 text-sm flex items-center gap-2"><CheckCircle size={15} /> Universal scene set!</p>
      <button onClick={onNext} className="bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">Continue →</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-twitch-muted text-sm">
        Pick the OBS scene you switch to when you spot a shiny Pokémon. Quick Shiny Screen will route to this scene and show only the device you click.
      </p>
      <div className="space-y-1">
        <label className="text-twitch-muted text-xs">Universal scene</label>
        <select value={scene} onChange={e => setScene(e.target.value)} className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm">
          {scenes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {scenes.length === 0 && <p className="text-twitch-muted text-xs">No scenes found — make sure OBS is connected.</p>}
      <button onClick={save} disabled={!scene} className="bg-twitch-purple hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
        Save →
      </button>
    </div>
  )
}

function DeviceStep({ onNext }) {
  const [sources, setSources] = useState([])
  const [name, setName]       = useState('')
  const [source, setSource]   = useState('')
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    window.api.shiny.getSourceList().then(res => {
      if (res.ok) { setSources(res.data); setSource(res.data[0]?.name ?? '') }
    })
  }, [])

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    const res = await window.api.shiny.devices.add({ name: name.trim(), obsSourceName: source })
    if (res.ok) setSaved(true)
    else setError(res.error ?? 'Failed to add device')
  }

  if (saved) return (
    <div className="space-y-4">
      <p className="text-green-400 text-sm flex items-center gap-2"><CheckCircle size={15} /> Device added!</p>
      <button onClick={onNext} className="bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">Finish →</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-twitch-muted text-sm">Add your first Switch and assign the OBS capture source for its screen.</p>
      <div className="space-y-1">
        <label className="text-twitch-muted text-xs">Device name</label>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple" placeholder="Switch 1" />
      </div>
      <div className="space-y-1">
        <label className="text-twitch-muted text-xs">OBS source (capture card)</label>
        <select value={source} onChange={e => setSource(e.target.value)} className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm">
          {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {sources.length === 0 && <p className="text-twitch-muted text-xs">No sources found — you can add devices later.</p>}
      <div className="flex gap-3">
        <button onClick={save} className="bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">Add Device</button>
        <button onClick={onNext} className="bg-twitch-surface border border-twitch-border hover:bg-twitch-border text-twitch-text text-sm px-4 py-2 rounded-lg transition-colors">Skip</button>
      </div>
    </div>
  )
}

const STEPS = ['OBS Connection', 'Dock Setup', 'Universal Scene', 'First Device']

export default function ShinySetup({ obsConnected }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(obsConnected ? 1 : 0)
  const next = () => setStep(s => s + 1)

  async function finish() {
    await window.api.settings.set('shinyWizardComplete', true)
    navigate('/shiny/devices')
  }

  const visibleSteps = obsConnected ? STEPS.slice(1) : STEPS
  const visibleStep  = obsConnected ? step - 1 : step

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-lg bg-twitch-mid border border-twitch-border rounded-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-yellow-400 text-xl">✦</span>
          <h1 className="text-twitch-text font-semibold text-lg">Quick Shiny Screen Setup</h1>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {visibleSteps.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-1.5">
                {i < visibleStep
                  ? <CheckCircle size={14} className="text-green-400" />
                  : i === visibleStep
                    ? <Circle size={14} className="text-yellow-400" />
                    : <Circle size={14} className="text-twitch-border" />
                }
                <span className={`text-xs ${i === visibleStep ? 'text-twitch-text' : i < visibleStep ? 'text-green-400' : 'text-twitch-muted'}`}>{label}</span>
              </div>
              {i < visibleSteps.length - 1 && <div className="flex-1 h-px bg-twitch-border" />}
            </React.Fragment>
          ))}
        </div>

        {step === 0 && <OBSStep           onNext={next} />}
        {step === 1 && <DockStep          onNext={next} />}
        {step === 2 && <UniversalSceneStep onNext={next} />}
        {step === 3 && <DeviceStep        onNext={finish} />}
      </div>
    </div>
  )
}
