import React, { useState, useEffect } from 'react'
import { Bot, LogOut, Loader, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'

const REQUIRED_SCOPES = ['chat:read', 'user:write:chat', 'moderator:manage:announcements']

export default function ChatTriggerSettings() {
  const [bot, setBot] = useState(null)
  const [scopes, setScopes] = useState(null)
  const [loadingBot, setLoadingBot] = useState(true)
  const [loadingScopes, setLoadingScopes] = useState(true)
  const [connectingBot, setConnectingBot] = useState(false)
  const [reauthing, setReauthing] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [botError, setBotError] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.chatTriggers.getBotAccount(),
      window.api.chatTriggers.getScopes(),
      window.api.settings.get('chatEngineAutoStart'),
    ]).then(([botRes, scopeRes, autoRes]) => {
      if (botRes.ok) setBot(botRes.data)
      if (scopeRes.ok) setScopes(scopeRes.data)
      if (autoRes.ok) setAutoStart(!!autoRes.data)
      setLoadingBot(false)
      setLoadingScopes(false)
    })
  }, [])

  const missingScopes = scopes ? REQUIRED_SCOPES.filter(s => !scopes.includes(s)) : []
  const hasAllScopes = missingScopes.length === 0

  async function loginBot() {
    setConnectingBot(true); setBotError('')
    const res = await window.api.chatTriggers.loginBot()
    setConnectingBot(false)
    if (res.ok) setBot(res.data)
    else setBotError(res.error ?? 'Failed to connect bot')
  }

  async function logoutBot() {
    await window.api.chatTriggers.logoutBot()
    setBot(null)
  }

  async function reauth() {
    setReauthing(true)
    const res = await window.api.chatTriggers.reauth()
    if (res.ok) {
      const scopeRes = await window.api.chatTriggers.getScopes()
      if (scopeRes.ok) setScopes(scopeRes.data)
    }
    setReauthing(false)
  }

  async function toggleAutoStart(val) {
    setAutoStart(val)
    await window.api.settings.set('chatEngineAutoStart', val)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-twitch-border shrink-0">
        <h1 className="text-twitch-text font-semibold">Chat Triggers Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-xl">

        {/* Permissions */}
        <section className="space-y-3">
          <h2 className="text-twitch-text text-sm font-medium">Twitch Permissions</h2>
          {loadingScopes ? (
            <div className="flex items-center gap-2 text-twitch-muted text-sm"><Loader size={13} className="animate-spin" /> Checking...</div>
          ) : (
            <div className="space-y-2">
              {REQUIRED_SCOPES.map(scope => {
                const granted = scopes?.includes(scope)
                return (
                  <div key={scope} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${granted ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                    {granted ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                    <code className="font-mono text-xs flex-1">{scope}</code>
                    {!granted && <span className="text-xs">missing</span>}
                  </div>
                )
              })}

              {!hasAllScopes && (
                <div className="pt-1">
                  <p className="text-twitch-muted text-xs mb-2">Re-authorize with Twitch to grant the missing permissions.</p>
                  <button onClick={reauth} disabled={reauthing}
                    className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                    {reauthing ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {reauthing ? 'Waiting for browser...' : 'Re-authorize'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Bot account */}
        <section className="space-y-3">
          <div>
            <h2 className="text-twitch-text text-sm font-medium">Bot Account</h2>
            <p className="text-twitch-muted text-xs mt-0.5">When configured, actions can send responses as this bot instead of your main account.</p>
          </div>

          {loadingBot ? (
            <div className="flex items-center gap-2 text-twitch-muted text-sm"><Loader size={13} className="animate-spin" /> Loading...</div>
          ) : bot ? (
            <div className="flex items-center gap-3 p-3 bg-twitch-surface border border-twitch-border rounded-lg">
              {bot.avatar
                ? <img src={bot.avatar} alt="" className="w-8 h-8 rounded-full" />
                : <Bot size={20} className="text-teal-400" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-twitch-text text-sm font-medium">{bot.displayName}</p>
                <p className="text-twitch-muted text-xs">@{bot.login}</p>
              </div>
              <button onClick={logoutBot} className="flex items-center gap-1.5 text-twitch-muted hover:text-red-400 text-xs transition-colors">
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {botError && <p className="text-red-400 text-xs">{botError}</p>}
              <button onClick={loginBot} disabled={connectingBot}
                className="flex items-center gap-2 bg-twitch-surface border border-twitch-border hover:bg-twitch-border disabled:opacity-50 text-twitch-text text-sm px-3 py-2 rounded-lg transition-colors">
                {connectingBot ? <Loader size={13} className="animate-spin" /> : <Bot size={13} />}
                {connectingBot ? 'Waiting for browser...' : 'Connect bot account'}
              </button>
              <p className="text-twitch-muted text-xs">Opens a Twitch authorization page. Log in as your bot account there.</p>
            </div>
          )}
        </section>

        {/* Auto-start */}
        <section className="space-y-2">
          <h2 className="text-twitch-text text-sm font-medium">Connection</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => toggleAutoStart(!autoStart)}
              className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${autoStart ? 'bg-teal-500' : 'bg-twitch-border'}`}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ left: autoStart ? '18px' : '2px' }} />
            </button>
            <div>
              <p className="text-twitch-text text-sm">Start listening automatically on launch</p>
              <p className="text-twitch-muted text-xs">The chat engine will connect when you open the app.</p>
            </div>
          </label>
        </section>

      </div>
    </div>
  )
}
