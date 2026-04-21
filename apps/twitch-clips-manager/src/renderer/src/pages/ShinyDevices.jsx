import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function DeviceRow({ device, sources, sceneItems, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(device.name)
  const [source, setSource]   = useState(device.obsSourceName)

  async function save() {
    await onUpdate(device.id, { name: name.trim() || device.name, obsSourceName: source })
    setEditing(false)
  }
  function cancel() { setName(device.name); setSource(device.obsSourceName); setEditing(false) }

  const missingFromScene = device.obsSourceName && sceneItems.length > 0 && !sceneItems.includes(device.obsSourceName)

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-3 bg-twitch-surface border border-twitch-purple rounded-lg">
        <input value={name} onChange={e => setName(e.target.value)} className="flex-1 bg-twitch-mid border border-twitch-border rounded px-2 py-1 text-twitch-text text-sm outline-none focus:border-twitch-purple" autoFocus />
        <select value={source} onChange={e => setSource(e.target.value)} className="flex-1 bg-twitch-mid border border-twitch-border rounded px-2 py-1 text-twitch-text text-sm">
          {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          {source && !sources.find(s => s.name === source) && <option value={source}>{source}</option>}
        </select>
        <button onClick={save}   className="p-1.5 text-green-400 hover:bg-twitch-border rounded"><Check size={14} /></button>
        <button onClick={cancel} className="p-1.5 text-twitch-muted hover:bg-twitch-border rounded"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-twitch-surface border border-twitch-border rounded-lg group">
      <div className="w-2 h-2 rounded-full bg-twitch-purple shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-twitch-text text-sm font-medium truncate">{device.name}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-twitch-muted text-xs truncate">{device.obsSourceName || <span className="italic">No source assigned</span>}</span>
          {missingFromScene && (
            <span className="flex items-center gap-1 text-amber-400 text-xs shrink-0">
              <AlertTriangle size={11} /> Not in universal scene
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1.5 text-twitch-muted hover:text-twitch-text hover:bg-twitch-border rounded"><Pencil size={13} /></button>
        <button onClick={() => onRemove(device.id)} className="p-1.5 text-twitch-muted hover:text-red-400 hover:bg-twitch-border rounded"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

export default function ShinyDevices() {
  const navigate = useNavigate()
  const [devices, setDevices]         = useState([])
  const [sources, setSources]         = useState([])
  const [sceneItems, setSceneItems]   = useState([])
  const [obsScenes, setObsScenes]     = useState([])
  const [universalScene, setUniversalScene] = useState('')
  const [sceneSaved, setSceneSaved]   = useState(false)
  const [name, setName]               = useState('')
  const [source, setSource]           = useState('')
  const [error, setError]             = useState('')
  const [ready, setReady]             = useState(false)

  async function load() {
    const [devRes, srcRes, uniRes, wizRes, scenesRes] = await Promise.all([
      window.api.shiny.devices.list(),
      window.api.shiny.getSourceList(),
      window.api.shiny.getUniversalScene(),
      window.api.settings.get('shinyWizardComplete'),
      window.api.obs.getScenes()
    ])
    if (!wizRes.ok || !wizRes.data) { navigate('/shiny/setup'); return }
    if (devRes.ok) setDevices(devRes.data)
    if (srcRes.ok) {
      setSources(srcRes.data)
      if (!source) setSource(srcRes.data[0]?.name ?? '')
    }
    if (scenesRes.ok) setObsScenes(scenesRes.data.scenes ?? [])
    if (uniRes.ok && uniRes.data) {
      setUniversalScene(uniRes.data)
      const itemRes = await window.api.shiny.getSceneItemList(uniRes.data)
      if (itemRes.ok) setSceneItems(itemRes.data.map(i => i.sourceName))
    }
    setReady(true)
  }

  async function saveUniversalScene() {
    if (!universalScene) return
    const res = await window.api.shiny.setUniversalScene(universalScene)
    if (res.ok) {
      setSceneSaved(true)
      setTimeout(() => setSceneSaved(false), 2000)
      const itemRes = await window.api.shiny.getSceneItemList(universalScene)
      if (itemRes.ok) setSceneItems(itemRes.data.map(i => i.sourceName))
    }
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    const res = await window.api.shiny.devices.add({ name: name.trim(), obsSourceName: source })
    if (res.ok) { setName(''); setDevices(d => [...d, res.data]) }
    else setError(res.error ?? 'Failed')
  }

  async function update(id, changes) {
    const res = await window.api.shiny.devices.update(id, changes)
    if (res.ok) setDevices(d => d.map(dev => dev.id === id ? res.data : dev))
  }

  async function remove(id) {
    await window.api.shiny.devices.remove(id)
    setDevices(d => d.filter(dev => dev.id !== id))
  }

  if (!ready) return null

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-twitch-text text-xl font-semibold mb-1">Devices</h1>
      <p className="text-twitch-muted text-sm mb-6">Each device is a Nintendo Switch with an assigned OBS capture source.</p>

      <div className="bg-twitch-mid border border-twitch-border rounded-xl p-4 mb-6 space-y-3">
        <h2 className="text-twitch-text text-sm font-medium">Universal Scene</h2>
        <p className="text-twitch-muted text-xs">The OBS scene you switch to when you spot a shiny Pokémon.</p>
        <div className="flex gap-2">
          <select
            value={universalScene}
            onChange={e => setUniversalScene(e.target.value)}
            className="flex-1 bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm"
          >
            {obsScenes.map(s => <option key={s} value={s}>{s}</option>)}
            {universalScene && !obsScenes.includes(universalScene) && <option value={universalScene}>{universalScene}</option>}
          </select>
          <button
            onClick={saveUniversalScene}
            disabled={!universalScene}
            className="bg-twitch-purple hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {sceneSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {obsScenes.length === 0 && <p className="text-twitch-muted text-xs">OBS not connected — scene list unavailable.</p>}
      </div>

      <div className="bg-twitch-mid border border-twitch-border rounded-xl p-4 mb-6 space-y-3">
        <h2 className="text-twitch-text text-sm font-medium">Add Device</h2>
        <div className="flex gap-3">
          <input
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            className="flex-1 bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple"
            placeholder="Switch 1"
          />
          <select value={source} onChange={e => setSource(e.target.value)} className="flex-1 bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm">
            {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button onClick={add} className="flex items-center gap-1.5 bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0">
            <Plus size={14} /> Add
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        {sources.length === 0 && <p className="text-twitch-muted text-xs">OBS not connected — source list unavailable.</p>}
      </div>

      <div className="space-y-2">
        {devices.length === 0 && <p className="text-twitch-muted text-sm text-center py-8">No devices yet.</p>}
        {devices.map(dev => (
          <DeviceRow key={dev.id} device={dev} sources={sources} sceneItems={sceneItems} onUpdate={update} onRemove={remove} />
        ))}
      </div>
    </div>
  )
}
