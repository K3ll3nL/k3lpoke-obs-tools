import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function ReconnectPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    window.api.twitch.onAuthChanged(({ user, expired }) => {
      if (expired && !user) { setShow(true); setErr(null) }
      if (user) setShow(false)
    })
  }, [])

  if (!show) return null

  async function reconnect() {
    setBusy(true); setErr(null)
    const res = await window.api.twitch.login()
    setBusy(false)
    if (res?.ok) setShow(false)
    else setErr(res?.error || 'Login failed')
  }

  return (
    <div className="fixed bottom-6 right-6 bg-twitch-purple border border-twitch-border rounded-lg p-4 shadow-lg max-w-xs flex items-center gap-3">
      <AlertTriangle size={18} className="text-yellow-300 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-twitch-text text-sm font-medium">Twitch session expired</p>
        <p className="text-twitch-muted text-xs">{err ?? 'Reconnect to keep fetching clips'}</p>
      </div>
      <button
        onClick={reconnect}
        disabled={busy}
        className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
      >
        {busy ? '...' : 'Reconnect'}
      </button>
    </div>
  )
}
