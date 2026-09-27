import React, { useEffect, useState } from 'react'
import { Unplug, Smartphone, X, Bot } from 'lucide-react'

// Shown when the bot/main account can't send (dead token, unverified phone).
// The account avatar + badge icon says who is broken and how; one button fixes it.
const ISSUES = {
  'bot-auth': { badge: Unplug,     title: 'Bot disconnected',          sub: 'Can’t send chat or whispers', action: 'Reconnect' },
  phone:      { badge: Smartphone, title: 'Whispers need a phone',     sub: 'Verify a phone on this account',  action: 'Open Twitch' },
}

export default function SendIssuePrompt() {
  const [issue, setIssue] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => window.api.chatTriggers.onSendIssue(d => { setIssue(d); setErr(null) }), [])

  if (!issue || !ISSUES[issue.code]) return null
  const cfg = ISSUES[issue.code]
  const Badge = cfg.badge
  const name = issue.account?.displayName || issue.account?.login

  async function fix() {
    if (issue.code === 'phone') {
      window.open('https://www.twitch.tv/settings/security')
      return
    }
    setBusy(true); setErr(null)
    const res = await window.api.chatTriggers.loginBot()
    setBusy(false)
    if (res?.ok) setIssue(null)
    else setErr(res?.error || 'Login failed')
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-twitch-surface border border-red-500/60 rounded-lg p-3 shadow-lg w-80 flex items-center gap-3">
      <div className="relative shrink-0">
        {issue.account?.avatar
          ? <img src={issue.account.avatar} alt="" className="w-10 h-10 rounded-full ring-2 ring-red-500 grayscale" />
          : <div className="w-10 h-10 rounded-full ring-2 ring-red-500 bg-twitch-border flex items-center justify-center"><Bot size={18} className="text-twitch-muted" /></div>}
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-twitch-surface">
          <Badge size={11} className="text-white" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-twitch-text text-sm font-medium">{cfg.title}</p>
        <p className="text-twitch-muted text-xs leading-snug">{err ?? (name ? `${name} · ${cfg.sub}` : cfg.sub)}</p>
      </div>
      <button
        onClick={fix}
        disabled={busy}
        className="px-3 py-1 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors shrink-0"
      >
        {busy ? '…' : cfg.action}
      </button>
      <button onClick={() => setIssue(null)} className="text-twitch-muted hover:text-twitch-text shrink-0" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
