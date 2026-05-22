import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { WifiOff, ChevronRight, Loader2, CheckCircle, AlertCircle, Plus, Trash2, ArrowRight } from 'lucide-react'

// ── Shared ────────────────────────────────────────────────────────────────────

function OBSGate({ obsConnected, children }) {
  if (!obsConnected) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <WifiOff size={36} className="text-twitch-muted" />
      <p className="text-white font-medium">OBS not connected</p>
      <p className="text-twitch-muted text-sm">Connect OBS in Settings first.</p>
    </div>
  )
  return children
}

function Success({ name, onAgain }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <CheckCircle size={48} className="text-green-400" />
      <div>
        <p className="text-white text-lg font-semibold">Scene created!</p>
        <p className="text-twitch-muted text-sm mt-1">
          <span className="text-indigo-300 font-mono">{name}</span> is now in OBS.
        </p>
      </div>
      <button onClick={onAgain} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">
        Create Another
      </button>
    </div>
  )
}

// ── Create Tab ────────────────────────────────────────────────────────────────

function CreateTab({ obsConnected }) {
  const [scenes,       setScenes]       = useState([])
  const [sceneName,    setSceneName]    = useState('')
  const [base,         setBase]         = useState('blank')
  const [baseScene,    setBaseScene]    = useState('')
  const [baseItems,    setBaseItems]    = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [created,      setCreated]      = useState(null)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    if (!obsConnected) return
    window.api.obs.getScenes().then(r => { if (r.ok) setScenes(r.data.scenes ?? []) })
  }, [obsConnected])

  useEffect(() => {
    if (base !== 'copy' || !baseScene) { setBaseItems([]); return }
    setLoadingItems(true)
    window.api.scenes.getAll().then(r => {
      if (r.ok) {
        const s = r.data.find(s => s.name === baseScene)
        setBaseItems(s?.items ?? [])
      }
      setLoadingItems(false)
    })
  }, [base, baseScene])

  async function handleCreate() {
    setCreating(true); setError(null)
    const name = sceneName.trim()
    const res = base === 'blank'
      ? await window.api.scenes.create(name)
      : await window.api.scenes.duplicate(baseScene, name, {})
    if (res.ok) {
      setCreated(name)
    } else {
      setError(res.error)
    }
    setCreating(false)
  }

  function reset() {
    setSceneName(''); setBase('blank'); setBaseScene('')
    setBaseItems([]); setCreated(null); setError(null)
  }

  if (created) return <Success name={created} onAgain={reset} />

  const canCreate = sceneName.trim() && (base === 'blank' || baseScene)

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-8 pt-8 pb-4 border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Create Scene</h1>
        <p className="text-twitch-muted text-sm mt-1">Start from blank or copy an existing scene.</p>
      </div>
      <div className="p-8 max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-twitch-muted mb-2">Scene Name</label>
        <input
          type="text" value={sceneName}
          onChange={e => setSceneName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canCreate && !creating && handleCreate()}
          placeholder="e.g. Gameplay – Tournament"
          className="w-full px-4 py-2.5 rounded-lg bg-twitch-mid border border-white/10 text-white placeholder-twitch-muted focus:outline-none focus:border-indigo-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-twitch-muted mb-2">Starting Point</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['blank', 'Blank Scene',          'Empty — add sources manually in OBS'],
            ['copy',  'Copy Existing Scene',  'Duplicates all sources and transforms'],
          ].map(([val, title, desc]) => (
            <button key={val} onClick={() => setBase(val)}
              className={`p-4 rounded-xl border text-left transition-colors ${base === val ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-twitch-mid hover:border-white/20'}`}
            >
              <div className="text-white font-medium text-sm">{title}</div>
              <div className="text-twitch-muted text-xs mt-1">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {base === 'copy' && (
        <div>
          <label className="block text-sm font-medium text-twitch-muted mb-2">Source Scene</label>
          <select value={baseScene} onChange={e => setBaseScene(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-twitch-mid border border-white/10 text-white focus:outline-none focus:border-indigo-500 text-sm"
          >
            <option value="">— select a scene —</option>
            {scenes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {baseScene && (
            <div className="mt-3 p-3 rounded-xl bg-twitch-mid border border-white/10">
              {loadingItems
                ? <div className="flex items-center gap-2 text-twitch-muted text-sm"><Loader2 size={13} className="animate-spin" /> Loading…</div>
                : <p className="text-twitch-muted text-sm">
                    {baseItems.length} source{baseItems.length !== 1 ? 's' : ''} will be copied:{' '}
                    <span className="text-white">
                      {baseItems.slice(0,5).map(i => i.sourceName).join(', ')}
                      {baseItems.length > 5 ? ` +${baseItems.length - 5} more` : ''}
                    </span>
                  </p>
              }
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={14} className="shrink-0" />{error}
        </div>
      )}

      <button onClick={handleCreate} disabled={!canCreate || creating}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {creating ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} />}
        {creating ? 'Creating…' : 'Create Scene'}
      </button>
      </div>
    </div>
  )
}

// ── Duplicate Tab ─────────────────────────────────────────────────────────────

function DuplicateTab({ obsConnected }) {
  const [scenes,      setScenes]      = useState([])
  const [allSources,  setAllSources]  = useState([])
  const [sourceScene, setSourceScene] = useState('')
  const [sourceItems, setSourceItems] = useState([])
  const [destName,    setDestName]    = useState('')
  const [replacements,setReplacements]= useState({})
  const [batch,       setBatch]       = useState(false)
  const [batchNames,  setBatchNames]  = useState([''])
  const [loading,     setLoading]     = useState(false)
  const [creating,    setCreating]    = useState(false)
  const [results,     setResults]     = useState(null)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    if (!obsConnected) return
    window.api.obs.getScenes().then(r => { if (r.ok) setScenes(r.data.scenes ?? []) })
    window.api.scenes.getSources().then(r => { if (r.ok) setAllSources(r.data.map(s => s.name)) })
  }, [obsConnected])

  useEffect(() => {
    if (!sourceScene) return
    setDestName(`${sourceScene} (Copy)`)
    setLoading(true)
    window.api.scenes.getAll().then(r => {
      if (r.ok) {
        const s = r.data.find(s => s.name === sourceScene)
        setSourceItems(s?.items ?? [])
      }
      setLoading(false)
    })
    setReplacements({})
  }, [sourceScene])

  function setReplacement(src, next) {
    setReplacements(r => {
      const n = { ...r }
      if (!next || next === src) delete n[src]; else n[src] = next
      return n
    })
  }

  async function handleDuplicate() {
    setCreating(true); setError(null); setResults(null)
    const names = batch ? batchNames.filter(n => n.trim()) : [destName.trim()]
    if (!names.length) { setError('Enter at least one scene name.'); setCreating(false); return }
    const out = []
    for (const name of names) {
      const res = await window.api.scenes.duplicate(sourceScene, name, replacements)
      out.push({ name, ok: res.ok, error: res.error })
    }
    setResults(out)
    setCreating(false)
  }

  const canCreate = sourceScene && (batch ? batchNames.some(n => n.trim()) : destName.trim())
  const uniqueSources = [...new Map(sourceItems.map(i => [i.sourceName, i])).values()]
  const repCount = Object.keys(replacements).length

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-8 pt-8 pb-4 border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Duplicate Scene</h1>
        <p className="text-twitch-muted text-sm mt-1">Copy a scene and optionally swap sources — transforms preserved automatically.</p>
      </div>
      <div className="p-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
        {/* Left */}
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-twitch-muted mb-2">Source Scene</label>
            <select value={sourceScene} onChange={e => setSourceScene(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-twitch-mid border border-white/10 text-white focus:outline-none focus:border-indigo-500 text-sm"
            >
              <option value="">— select a scene —</option>
              {scenes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {!batch && (
            <div>
              <label className="block text-sm font-medium text-twitch-muted mb-2">New Scene Name</label>
              <input type="text" value={destName} onChange={e => setDestName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-twitch-mid border border-white/10 text-white focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => setBatch(b => !b)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${batch ? 'bg-indigo-500' : 'bg-white/20'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${batch ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm text-twitch-muted">Batch — generate multiple scenes</span>
          </div>

          {batch && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-twitch-muted">Scene Names</label>
              {batchNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={name} placeholder={`Scene name ${i + 1}`}
                    onChange={e => setBatchNames(ns => ns.map((n, j) => j === i ? e.target.value : n))}
                    className="flex-1 px-3 py-2 rounded-lg bg-twitch-mid border border-white/10 text-white placeholder-twitch-muted focus:outline-none focus:border-indigo-500 text-sm"
                  />
                  <button onClick={() => setBatchNames(ns => ns.filter((_, j) => j !== i))}
                    className="p-2 rounded-lg text-twitch-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button onClick={() => setBatchNames(ns => [...ns, ''])}
                className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
              >
                <Plus size={14} /> Add scene
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          {results && (
            <div className="space-y-2">
              {results.map(r => (
                <div key={r.name} className={`flex items-center gap-2 p-2.5 rounded-lg text-sm border ${r.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  {r.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span className="font-mono">{r.name}</span>
                  {!r.ok && <span className="text-xs opacity-70">— {r.error}</span>}
                </div>
              ))}
            </div>
          )}

          <button onClick={handleDuplicate} disabled={!canCreate || creating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {creating ? 'Creating…' : `Duplicate${batch ? ` (${batchNames.filter(n => n.trim()).length})` : ''}`}
          </button>
        </div>

        {/* Right — source replacements */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm font-medium text-twitch-muted">Source Replacements</label>
            {repCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs">{repCount}</span>
            )}
            {loading && <Loader2 size={13} className="animate-spin text-twitch-muted ml-auto" />}
          </div>

          {!sourceScene && <p className="text-twitch-muted text-sm">Select a source scene to configure replacements.</p>}
          {sourceScene && !loading && uniqueSources.length === 0 && <p className="text-twitch-muted text-sm">No sources in this scene.</p>}

          <div className="space-y-2">
            {uniqueSources.map(item => (
              <div key={item.sourceName} className="p-3 rounded-xl bg-twitch-mid border border-white/10">
                <p className="text-white text-sm font-medium truncate mb-2">{item.sourceName}</p>
                <select
                  value={replacements[item.sourceName] ?? ''}
                  onChange={e => setReplacement(item.sourceName, e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Keep original</option>
                  {allSources.filter(s => s !== item.sourceName).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>

          {uniqueSources.length > 0 && (
            <p className="text-twitch-muted text-xs mt-3">Transforms are preserved when replacing sources.</p>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SceneBuilder({ obsConnected }) {
  const { pathname } = useLocation()
  const isDuplicate = pathname.includes('duplicate')

  return (
    <OBSGate obsConnected={obsConnected}>
      <div className="flex flex-col h-full bg-twitch-dark overflow-auto">
        {isDuplicate ? <DuplicateTab obsConnected={obsConnected} /> : <CreateTab obsConnected={obsConnected} />}
      </div>
    </OBSGate>
  )
}
