import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wifi, WifiOff, Loader, Trash2, Edit2, Terminal, MessageSquare, ChevronDown, ChevronUp, Zap, Radio, Clock } from 'lucide-react'

// ── Example cards shown in the empty state ────────────────────────────────────

const EXAMPLES = [
  {
    icon: Terminal,
    label: 'Command',
    title: '!lurk command',
    desc: 'When someone types !lurk, thank them in chat.',
    hint: '!lurk → "Thanks for lurking, {display_name}!"',
  },
  {
    icon: Terminal,
    label: 'Command',
    title: '!followage lookup',
    desc: 'Tell a viewer how long they\'ve been following.',
    hint: '!followage → "You\'ve followed for {followage}!"',
  },
  {
    icon: MessageSquare,
    label: 'Keyword',
    title: 'Hype response',
    desc: 'React when chat says a specific word or phrase.',
    hint: 'Contains "Pog" → "Chat is hyped! PogChamp"',
  },
  {
    icon: Zap,
    label: 'Announcement',
    title: 'Social links',
    desc: 'Post a channel announcement when someone asks.',
    hint: 'Contains "discord" → announcement with your link',
  },
]

function EmptyState({ onNew }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 space-y-8">
      <div className="text-center space-y-2 max-w-sm">
        <p className="text-twitch-text font-medium">No triggers yet</p>
        <p className="text-twitch-muted text-sm">
          Triggers listen to your chat and automatically respond. Here are some ideas to get started:
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            onClick={onNew}
            className="group text-left p-4 bg-twitch-surface border border-twitch-border hover:border-teal-700 rounded-xl transition-colors space-y-2"
          >
            <div className="flex items-center gap-2">
              <ex.icon size={13} className="text-teal-400 shrink-0" />
              <span className="text-teal-400 text-xs font-medium">{ex.label}</span>
            </div>
            <p className="text-twitch-text text-sm font-medium leading-snug">{ex.title}</p>
            <p className="text-twitch-muted text-xs leading-relaxed">{ex.desc}</p>
            <p className="font-mono text-xs text-twitch-border group-hover:text-twitch-muted transition-colors truncate">{ex.hint}</p>
          </button>
        ))}
      </div>

      <button
        onClick={onNew}
        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-sm px-5 py-2.5 rounded-lg transition-colors"
      >
        <Plus size={15} /> Create your first trigger
      </button>
    </div>
  )
}

// ── Trigger card ──────────────────────────────────────────────────────────────

function fmtCooldown(ms) {
  if (!ms) return null
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${Math.round(ms / 3600000)}h`
}

function stripPattern(pattern) {
  if (!pattern) return ''
  return pattern
    .replace(/@\{choice\|[^|]*\|([^}]*)\}/g, (_, opts) => `[${opts.split('|').filter(Boolean).join('/')}]`)
    .replace(/@\{capture\|number\|[^}]*\}/g, '[#]')
    .replace(/@\{capture\|wildcard\|[^}]*\}/g, '[*]')
    .replace(/@\{capture\|[^}]*\}/g, '[text]')
    .replace(/@\{optional\|([^}]*)\}/g, (_, w) => `(${w}?)`)
    .replace(/@\{optional_capture\|number\|([^}]*)\}/g, (_, n) => n ? `(🔢 ${n}?)` : '(🔢?)')
    .replace(/@\{optional_capture\|[^|]*\|([^}]*)\}/g, (_, n) => n ? `(📝 ${n}?)` : '(📝?)')
    .replace(/@\{optional_choice\|[^|]*\|([^}]*)\}/g, (_, opts) => `(${opts.split('|').filter(Boolean).join('/')}?)`)
    .replace(/@\{optional_seq\|([^}]*)\}/g, (_, enc) => { try { return `(${stripPattern(decodeURIComponent(enc))}?)` } catch { return '(seq?)' } })
    .replace(/@\{seq\|([^|]*)\|([^}]*)\}/g, (_, lbl) => lbl ? `{${lbl}}` : '{sequence}')
    .replace(/@\{seq\|([^}]*)\}/g, () => '{sequence}')
    .replace(/@\{anyof\|([^}]*)\}/g, (_, opts) => `[${opts.split('|').filter(Boolean).join('/')}]`)
    .replace(/@\{minletters\|(\d+)\}/g, (_, n) => `[≥${n} letters]`)
    .replace(/@\{mindigits\|(\d+)\}/g, (_, n) => `[≥${n} numbers]`)
    .trim()
}

function TriggerCard({ trigger, onEdit, onDelete, onToggle }) {
  const isCommand      = trigger.type === 'command'
  const isObsSource    = trigger.type === 'obs_source'
  const isTimer        = trigger.type === 'timer'
  const isChannelPoint = trigger.type === 'channel_point'
  const firstAction  = trigger.responses?.[0]?.actions?.[0]
  const extraActions = (trigger.responses?.[0]?.actions?.length ?? 1) - 1

  let matchSummary = ''
  if (isCommand) {
    matchSummary = `${trigger.command}${(trigger.commandParams ?? []).map(p => p.optional ? ` [${p.name}]` : ` <${p.name}>`).join('')}`
  } else if (isObsSource) {
    matchSummary = `${trigger.obsSource || 'any source'} → ${trigger.obsState ?? 'visible'}`
  } else if (isTimer) {
    if ((trigger.timerMode ?? 'interval') === 'stream_start') {
      matchSummary = `${trigger.streamStartDelay ?? 15} min after stream start`
    } else {
      matchSummary = `every ${trigger.interval ?? 15} ${trigger.intervalUnit ?? 'minutes'}`
    }
  } else if (isChannelPoint) {
    matchSummary = trigger.rewardTitle || trigger.rewardId || 'Any reward'
  } else {
    const stripped = stripPattern(trigger.pattern)
    matchSummary = stripped || ''
  }

  const badgeCls = isCommand ? 'bg-teal-900/40'
    : isObsSource ? 'bg-amber-900/30'
    : isTimer ? 'bg-blue-900/30'
    : isChannelPoint ? 'bg-yellow-900/30'
    : 'bg-purple-900/30'

  const BadgeIcon = isCommand ? Terminal
    : isObsSource ? Radio
    : isTimer ? Clock
    : isChannelPoint ? Zap
    : MessageSquare

  const badgeIconCls = isCommand ? 'text-teal-400'
    : isObsSource ? 'text-amber-400'
    : isTimer ? 'text-blue-400'
    : isChannelPoint ? 'text-yellow-400'
    : 'text-purple-400'

  const summaryPrefix = isCommand ? '! ' : isObsSource ? '📡 ' : isTimer ? '⏱ ' : isChannelPoint ? '⭐ ' : '≈ '

  return (
    <div
      className={`group relative flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer
        ${trigger.enabled
          ? 'bg-twitch-surface border-twitch-border hover:border-teal-700/60'
          : 'bg-twitch-dark border-twitch-border opacity-50'}`}
      onClick={() => onEdit(trigger.id)}
    >
      {/* Type badge */}
      <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${badgeCls}`}>
        <BadgeIcon size={13} className={badgeIconCls} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-twitch-text text-sm font-medium truncate">{trigger.name}</span>
          {trigger.cooldown > 0 && (
            <span className="shrink-0 text-twitch-muted text-xs px-1.5 py-0.5 bg-twitch-dark rounded border border-twitch-border">
              {fmtCooldown(trigger.cooldown)}
            </span>
          )}
          {trigger.activation?.mode === 'auto' && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded border bg-teal-900/20 border-teal-700/50 text-teal-400">AUTO</span>
          )}
          {trigger.activation?.mode === 'auto' && trigger.activation?.currentOverride !== null && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded border bg-amber-900/20 border-amber-700/50 text-amber-400">OVERRIDE</span>
          )}
        </div>

        {/* Match summary */}
        <p className="text-twitch-muted text-xs font-mono truncate">
          {summaryPrefix}{matchSummary || <span className="italic">no conditions</span>}
        </p>

        {/* Activation condition badges */}
        {trigger.activation?.mode === 'auto' && (() => {
          const conds = trigger.activation.conditions ?? {}
          const badges = []
          if (conds.whenLive) badges.push({ label: 'Live', color: 'bg-teal-900/30 border-teal-700/50 text-teal-300' })
          ;(conds.gameCategories ?? []).forEach(g => badges.push({ label: g, color: 'bg-purple-900/30 border-purple-700/50 text-purple-300' }))
          ;(conds.titleContains ?? []).forEach(t => badges.push({ label: `"${t}"`, color: 'bg-blue-900/30 border-blue-700/50 text-blue-300' }))
          if (badges.length === 0) return null
          const logic = trigger.activation.logic ?? 'and'
          return (
            <div className="flex flex-wrap items-center gap-1">
              {badges.map((b, i) => (
                <React.Fragment key={b.label}>
                  {i > 0 && <span className="text-twitch-border text-xs">{logic === 'or' ? 'or' : '+'}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${b.color}`}>{b.label}</span>
                </React.Fragment>
              ))}
            </div>
          )
        })()}

        {/* Response preview */}
        {firstAction?.template && (
          <p className="text-twitch-muted text-xs truncate">
            <span className="text-twitch-border mr-1">→</span>
            <span className="text-twitch-text/70 italic">{firstAction.template}</span>
            {extraActions > 0 && <span className="text-twitch-muted ml-1">+{extraActions} more</span>}
          </p>
        )}
      </div>

      {/* Right controls — shown on hover, toggle always visible */}
      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onDelete(trigger.id)}
            className="p-1.5 rounded text-twitch-muted hover:text-red-400 hover:bg-twitch-border transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => onEdit(trigger.id)}
            className="p-1.5 rounded text-twitch-muted hover:text-twitch-text hover:bg-twitch-border transition-colors"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
        </div>

        <button
          onClick={() => onToggle(trigger.id, !trigger.enabled)}
          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${trigger.enabled ? 'bg-teal-500' : 'bg-twitch-border'}`}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
            style={{ left: trigger.enabled ? '18px' : '2px' }}
          />
        </button>
      </div>
    </div>
  )
}

// ── Activity log (collapsed by default) ──────────────────────────────────────

function ActivityLog({ logs }) {
  const [open, setOpen] = useState(true)
  const unread = logs.filter(l => l.level === 'fire').length

  return (
    <div className="border border-twitch-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-twitch-surface hover:bg-twitch-border/50 transition-colors text-sm"
      >
        <div className="flex items-center gap-2 text-twitch-muted">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Activity log
          {unread > 0 && (
            <span className="px-1.5 py-0.5 bg-teal-900/50 text-teal-400 text-xs rounded-full">{unread} fired</span>
          )}
        </div>
        {logs.length > 0 && <span className="text-twitch-muted text-xs">{logs.length} entries</span>}
      </button>

      {open && (
        <div className="max-h-40 overflow-y-auto p-2 space-y-0.5 font-mono text-xs bg-twitch-dark border-t border-twitch-border">
          {logs.length === 0
            ? <p className="text-twitch-muted px-1 py-1">Nothing fired yet.</p>
            : [...logs].reverse().map((log, i) => (
              <div key={i} className={`px-1.5 py-0.5 rounded ${log.level === 'error' ? 'text-red-400' : log.level === 'fire' ? 'text-teal-400' : log.level === 'msg' ? 'text-twitch-border' : 'text-twitch-muted'}`}>
                {log.level === 'fire' && '⚡ '}{log.msg}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ── Connection pill ───────────────────────────────────────────────────────────

function ConnectionPill({ connected, channel, starting, onStart, onStop }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-teal-400' : 'bg-twitch-border'}`} />
      {connected ? (
        <span className="text-twitch-muted text-xs">#{channel}</span>
      ) : (
        <button
          onClick={onStart}
          disabled={starting}
          className="text-xs text-twitch-muted hover:text-teal-400 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {starting && <Loader size={10} className="animate-spin" />}
          {starting ? 'connecting…' : 'not listening'}
        </button>
      )}
      {connected && (
        <button onClick={onStop} className="text-xs text-twitch-muted hover:text-twitch-text transition-colors ml-1">
          ×
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatTriggerList() {
  const navigate = useNavigate()
  const [triggers, setTriggers] = useState([])
  const [status, setStatus] = useState({ connected: false, channel: null })
  const [starting, setStarting] = useState(false)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)

  const addLog = useCallback((entry) => {
    setLogs(prev => [...prev.slice(-99), entry])
  }, [])

  useEffect(() => {
    async function init() {
      const [setupRes, triggersRes, statusRes] = await Promise.all([
        window.api.settings.get('chatTriggersSetupComplete'),
        window.api.chatTriggers.list(),
        window.api.chatTriggers.getStatus(),
      ])
      setSetupComplete(setupRes.ok && setupRes.data === true)
      if (triggersRes.ok) setTriggers(triggersRes.data)
      if (statusRes.ok) setStatus(statusRes.data)
      setLoading(false)
    }
    init()

    const offStatus  = window.api.chatTriggers.onStatus(d => setStatus(d))
    const offFired   = window.api.chatTriggers.onFired(d => {
      const label = d.action === 'send_announcement' ? `announcement: ${d.text}` : d.action === 'play_media' ? 'played audio' : d.action === 'obs_set_source' ? 'OBS source' : d.action === 'random_line' ? `random line: ${d.text}` : `message: ${d.text}`
      addLog({ level: 'fire', msg: `"${d.triggerName}" fired → ${label}` })
    })
    const offLog     = window.api.chatTriggers.onLog(d => addLog(d))
    const offMessage = window.api.chatTriggers.onMessage(d => addLog({ level: 'msg', msg: `[${d.username}] ${d.text}` }))
    const offActivation = window.api.chatTriggers.onActivationChanged(({ id, enabled }) =>
      setTriggers(prev => prev.map(t => t.id === id ? { ...t, enabled, activation: { ...t.activation, currentOverride: null } } : t))
    )
    return () => { offStatus(); offFired(); offLog(); offMessage(); offActivation() }
  }, [addLog])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader size={20} className="animate-spin text-twitch-muted" />
    </div>
  )

  if (!setupComplete) return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center space-y-4">
        <Zap size={36} className="text-teal-400 mx-auto" />
        <h2 className="text-twitch-text font-semibold">Chat Triggers</h2>
        <p className="text-twitch-muted text-sm max-w-xs">Automate chat responses with a visual no-code editor. One-time setup needed first.</p>
        <button onClick={() => navigate('/chat-triggers/setup')} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          Start Setup →
        </button>
      </div>
    </div>
  )

  async function handleStart() {
    setStarting(true)
    const res = await window.api.chatTriggers.start()
    setStarting(false)
    if (!res.ok) addLog({ level: 'error', msg: res.error ?? 'Failed to start' })
  }

  async function handleStop() {
    await window.api.chatTriggers.stop()
  }

  async function handleToggle(id, enabled) {
    const res = await window.api.chatTriggers.update(id, { enabled })
    if (res.ok) setTriggers(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
  }

  async function handleDelete(id) {
    const res = await window.api.chatTriggers.delete(id)
    if (res.ok) setTriggers(prev => prev.filter(t => t.id !== id))
  }

  const enabled  = triggers.filter(t => t.enabled).length
  const disabled = triggers.length - enabled

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-twitch-border shrink-0">
        <div className="space-y-0.5">
          <h1 className="text-twitch-text font-semibold">Chat Triggers</h1>
          <ConnectionPill
            connected={status.connected}
            channel={status.channel}
            starting={starting}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>
        <button
          onClick={() => navigate('/chat-triggers/new')}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> New Trigger
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {triggers.length === 0 ? (
          <EmptyState onNew={() => navigate('/chat-triggers/new')} />
        ) : (
          <div className="p-6 space-y-5">
            {/* Stats row */}
            {triggers.length > 1 && (
              <div className="flex items-center gap-4 text-xs text-twitch-muted">
                <span>{triggers.length} trigger{triggers.length !== 1 ? 's' : ''}</span>
                {disabled > 0 && <span>{disabled} paused</span>}
              </div>
            )}

            {/* Active triggers */}
            {enabled > 0 && (
              <div className="space-y-2">
                {triggers.filter(t => t.enabled).map(t => (
                  <TriggerCard
                    key={t.id}
                    trigger={t}
                    onEdit={id => navigate(`/chat-triggers/edit/${id}`)}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            )}

            {/* Paused triggers */}
            {disabled > 0 && (
              <div className="space-y-2">
                {enabled > 0 && (
                  <p className="text-twitch-muted text-xs px-1">Paused</p>
                )}
                {triggers.filter(t => !t.enabled).map(t => (
                  <TriggerCard
                    key={t.id}
                    trigger={t}
                    onEdit={id => navigate(`/chat-triggers/edit/${id}`)}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            )}

            {/* Activity log — collapsed, at bottom */}
            <ActivityLog logs={logs} />
          </div>
        )}
      </div>
    </div>
  )
}
