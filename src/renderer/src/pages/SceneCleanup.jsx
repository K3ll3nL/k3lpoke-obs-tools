import React, { useState, useEffect, useCallback } from 'react'
import { WifiOff, RefreshCw, ArrowRight, AlertCircle, CheckCircle, Loader2, Search, GitMerge, Package } from 'lucide-react'

const SIMILARITY_THRESHOLD = 0.8

function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 1
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

function groupSimilarScenes(scenes) {
  const visited = new Set()
  const groups = []
  for (let i = 0; i < scenes.length; i++) {
    if (visited.has(i)) continue
    const group = [scenes[i]]
    visited.add(i)
    const setA = new Set(scenes[i].items.map(x => x.sourceName))
    for (let j = i + 1; j < scenes.length; j++) {
      if (visited.has(j)) continue
      const setB = new Set(scenes[j].items.map(x => x.sourceName))
      if (jaccardSimilarity(setA, setB) >= SIMILARITY_THRESHOLD) {
        group.push(scenes[j])
        visited.add(j)
      }
    }
    if (group.length > 1) groups.push(group)
  }
  return groups
}

function findUnusedSources(allSourceNames, scenes) {
  const used = new Set(scenes.flatMap(s => s.items.map(i => i.sourceName)))
  return allSourceNames.filter(name => !used.has(name))
}

// ── Shared ────────────────────────────────────────────────────────────────────

function TabButton({ label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-twitch-muted hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

// ── Bulk Replace Tab ──────────────────────────────────────────────────────────

function BulkReplaceTab({ scenes, allSources }) {
  const [oldSource, setOldSource] = useState('')
  const [newSource, setNewSource] = useState('')
  const [applying, setApplying] = useState(false)
  const [results, setResults] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  const affectedScenes = oldSource
    ? scenes.filter(s => s.items.some(i => i.sourceName === oldSource)).map(s => s.name)
    : []

  async function apply() {
    if (!confirmed || !oldSource || !newSource || !affectedScenes.length) return
    setApplying(true)
    setResults(null)
    const res = await window.api.scenes.bulkReplace(oldSource, newSource, affectedScenes)
    setResults(res.ok ? res.data : null)
    setApplying(false)
    setConfirmed(false)
  }

  const canApply = oldSource && newSource && oldSource !== newSource && affectedScenes.length > 0

  return (
    <div className="space-y-5 max-w-xl">
      <p className="text-twitch-muted text-sm">Replace a source across every scene it appears in — transforms are preserved.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-twitch-muted mb-1.5">Find</label>
          <select
            value={oldSource}
            onChange={e => { setOldSource(e.target.value); setConfirmed(false); setResults(null) }}
            className="w-full px-3 py-2 rounded-lg bg-twitch-mid border border-white/10 text-white focus:outline-none focus:border-indigo-500 text-sm"
          >
            <option value="">— select source —</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-twitch-muted mb-1.5">Replace With</label>
          <select
            value={newSource}
            onChange={e => { setNewSource(e.target.value); setConfirmed(false); setResults(null) }}
            className="w-full px-3 py-2 rounded-lg bg-twitch-mid border border-white/10 text-white focus:outline-none focus:border-indigo-500 text-sm"
          >
            <option value="">— select source —</option>
            {allSources.filter(s => s !== oldSource).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {oldSource && (
        <div>
          <p className="text-sm text-twitch-muted mb-2">
            {affectedScenes.length === 0
              ? `"${oldSource}" is not used in any scene.`
              : `Will update ${affectedScenes.length} scene${affectedScenes.length > 1 ? 's' : ''}:`}
          </p>
          {affectedScenes.length > 0 && (
            <div className="rounded-xl bg-twitch-mid border border-white/10 p-3 max-h-40 overflow-y-auto space-y-1">
              {affectedScenes.map(name => (
                <div key={name} className="flex items-center gap-2 text-sm text-white">
                  <ArrowRight size={12} className="text-indigo-400 shrink-0" />
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-1.5">
          {results.map(r => (
            <div key={r.sceneName} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${r.success ? 'text-green-400' : 'text-red-400'}`}>
              {r.success ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
              <span className="font-mono text-xs">{r.sceneName}</span>
              {r.success && <span className="text-xs opacity-60">— {r.replaced} replaced</span>}
              {!r.success && <span className="text-xs opacity-60">— {r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {canApply && !results && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="rounded border-white/20 bg-twitch-mid text-indigo-500 focus:ring-indigo-500"
          />
          <span className="text-sm text-twitch-muted">
            I understand this modifies {affectedScenes.length} scene{affectedScenes.length > 1 ? 's' : ''} in OBS
          </span>
        </label>
      )}

      <button
        onClick={apply}
        disabled={!canApply || !confirmed || applying}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {applying ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        {applying ? 'Applying…' : 'Apply Replacement'}
      </button>
    </div>
  )
}

// ── Similar Scenes Tab ────────────────────────────────────────────────────────

function SimilarScenesTab({ scenes }) {
  const groups = groupSimilarScenes(scenes)
  const [removing, setRemoving] = useState(null)
  const [removed, setRemoved] = useState(new Set())

  async function deleteScene(name) {
    setRemoving(name)
    await window.api.scenes.remove(name)
    setRemoved(r => new Set([...r, name]))
    setRemoving(null)
  }

  const visibleGroups = groups.map(g => g.filter(s => !removed.has(s.name))).filter(g => g.length > 1)

  return (
    <div className="space-y-4 max-w-2xl">
      {visibleGroups.length === 0 && (
        <div className="text-center py-12 text-twitch-muted">
          <GitMerge size={32} className="mx-auto mb-3 opacity-40" />
          <p>No similar scenes found.</p>
        </div>
      )}

      {visibleGroups.map((group, gi) => (
        <div key={gi} className="rounded-xl bg-twitch-mid border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white text-sm font-medium">{group.length} similar scenes</p>
            <p className="text-twitch-muted text-xs mt-0.5">
              {new Set(group.flatMap(s => s.items.map(i => i.sourceName))).size} unique sources across this group
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {group.map((scene, si) => (
              <div key={scene.name} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{scene.name}</p>
                  <p className="text-twitch-muted text-xs">{scene.items.length} sources</p>
                </div>
                {si === 0
                  ? <span className="px-3 py-1.5 text-xs text-indigo-300 bg-indigo-500/10 rounded-lg border border-indigo-500/20">Keep</span>
                  : (
                    <button
                      onClick={() => deleteScene(scene.name)}
                      disabled={removing === scene.name}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      {removing === scene.name ? <Loader2 size={12} className="animate-spin" /> : 'Delete'}
                    </button>
                  )
                }
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Unused Sources Tab ────────────────────────────────────────────────────────

function UnusedSourcesTab({ scenes, allSources }) {
  const initialUnused = findUnusedSources(allSources, scenes)
  const [deleted, setDeleted] = useState(new Set())
  const [deleting, setDeleting] = useState(null)
  const [errors, setErrors] = useState({}) // { name: errorMsg }

  const unused = initialUnused.filter(name => !deleted.has(name))

  async function handleDelete(name) {
    setDeleting(name)
    setErrors(e => { const next = { ...e }; delete next[name]; return next })
    const res = await window.api.scenes.removeSource(name)
    if (res.ok) {
      setDeleted(d => new Set([...d, name]))
    } else {
      setErrors(e => ({ ...e, [name]: res.error }))
    }
    setDeleting(null)
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-twitch-muted text-sm">
        These sources exist in OBS but are not referenced in any scene.
      </p>

      {unused.length === 0 && (
        <div className="text-center py-12 text-twitch-muted">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p>{initialUnused.length > 0 ? 'All unused sources deleted.' : 'No orphaned sources found — your setup is clean.'}</p>
        </div>
      )}

      {unused.length > 0 && (
        <div className="rounded-xl bg-twitch-mid border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white text-sm font-medium">{unused.length} unused source{unused.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-twitch-muted mt-0.5">Deleting a source removes it from OBS entirely — this cannot be undone.</p>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {unused.map(name => (
              <div key={name} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-white flex-1 truncate">{name}</span>
                {errors[name] && (
                  <span className="text-xs text-red-400 truncate max-w-32">{errors[name]}</span>
                )}
                <button
                  onClick={() => handleDelete(name)}
                  disabled={deleting === name}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium transition-colors disabled:opacity-40 shrink-0"
                >
                  {deleting === name ? <Loader2 size={12} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-twitch-muted">
        Note: Sources used only inside OBS groups may appear here. Verify before deleting.
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SceneCleanup({ obsConnected }) {
  const [tab, setTab] = useState('replace')
  const [scenes, setScenes] = useState([])
  const [allSources, setAllSources] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!obsConnected) return
    setLoading(true)
    try {
      const [scenesRes, sourcesRes] = await Promise.all([
        window.api.scenes.getAll(),
        window.api.scenes.getSources(),
      ])
      if (scenesRes.ok) setScenes(scenesRes.data)
      if (sourcesRes.ok) setAllSources(sourcesRes.data.map(s => s.name))
    } finally {
      setLoading(false)
    }
  }, [obsConnected])

  useEffect(() => { load() }, [load])

  if (!obsConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <WifiOff size={36} className="text-twitch-muted" />
        <p className="text-white font-medium">OBS not connected</p>
        <p className="text-twitch-muted text-sm">Connect OBS in Settings first.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-twitch-dark overflow-auto">
      <div className="px-8 pt-8 pb-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Clean Up Scenes</h1>
            <p className="text-twitch-muted text-sm mt-1">Bulk replace, detect duplicates, and find orphaned sources.</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg text-twitch-muted hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-8 pt-4 pb-0">
        <TabButton label="Bulk Replace" icon={Search}    active={tab === 'replace'}  onClick={() => setTab('replace')} />
        <TabButton label="Similar Scenes" icon={GitMerge} active={tab === 'similar'}  onClick={() => setTab('similar')} />
        <TabButton label="Unused Sources" icon={Package}  active={tab === 'unused'}   onClick={() => setTab('unused')} />
      </div>

      <div className="flex-1 p-8 pt-5 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-twitch-muted text-sm">
            <Loader2 size={16} className="animate-spin" />
            Scanning OBS…
          </div>
        ) : (
          <>
            {tab === 'replace' && <BulkReplaceTab scenes={scenes} allSources={allSources} />}
            {tab === 'similar' && <SimilarScenesTab scenes={scenes} />}
            {tab === 'unused'  && <UnusedSourcesTab scenes={scenes} allSources={allSources} />}
          </>
        )}
      </div>
    </div>
  )
}
