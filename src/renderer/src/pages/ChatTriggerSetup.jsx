import React, { useState, useEffect } from 'react'
import { CheckCircle, Circle, Loader, AlertCircle, Bot, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const REQUIRED_SCOPES = ['chat:read', 'user:write:chat', 'moderator:manage:announcements', 'channel:read:redemptions', 'user:manage:whispers']

function ScopesStep({ twitchUser, onNext }) {
  const [scopes, setScopes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reauthing, setReauthing] = useState(false)

  useEffect(() => {
    window.api.chatTriggers.getScopes().then(res => {
      if (res.ok) setScopes(res.data)
      setLoading(false)
    })
  }, [])

  const missing = scopes ? REQUIRED_SCOPES.filter(s => !scopes.includes(s)) : REQUIRED_SCOPES
  const hasAll = missing.length === 0

  async function reauth() {
    setReauthing(true)
    const res = await window.api.chatTriggers.reauth()
    if (res.ok) {
      const scopeRes = await window.api.chatTriggers.getScopes()
      if (scopeRes.ok) setScopes(scopeRes.data)
    }
    setReauthing(false)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-twitch-muted text-sm">
      <Loader size={14} className="animate-spin" /> Checking permissions...
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-twitch-muted text-sm">
        Chat Triggers connects to your Twitch chat to listen for messages and run actions. It needs a few extra permissions beyond the basic Twitch login.
      </p>

      <div className="space-y-2">
        {REQUIRED_SCOPES.map(scope => {
          const granted = scopes?.includes(scope)
          return (
            <div key={scope} className={`flex items-center gap-2 text-sm px-3 py-2 rounded ${granted ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
              {granted ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <code className="font-mono text-xs">{scope}</code>
            </div>
          )
        })}
      </div>

      {hasAll ? (
        <div className="space-y-3">
          <p className="text-green-400 text-sm flex items-center gap-2"><CheckCircle size={14} /> All permissions granted.</p>
          <button onClick={onNext} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Continue →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-twitch-muted text-sm">
            Click below to re-authorize with Twitch. This opens a browser window — you'll approve the extra permissions and be redirected back automatically.
          </p>
          <button onClick={reauth} disabled={reauthing} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {reauthing ? <Loader size={14} className="animate-spin" /> : <LogIn size={14} />}
            {reauthing ? 'Waiting for browser...' : 'Grant Chat Permissions'}
          </button>
        </div>
      )}
    </div>
  )
}

function BotStep({ onNext }) {
  const [bot, setBot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.chatTriggers.getBotAccount().then(res => {
      if (res.ok) setBot(res.data)
      setLoading(false)
    })
  }, [])

  async function loginBot() {
    setConnecting(true); setError('')
    const res = await window.api.chatTriggers.loginBot()
    setConnecting(false)
    if (res.ok) setBot(res.data)
    else setError(res.error ?? 'Failed to connect bot account')
  }

  async function logoutBot() {
    await window.api.chatTriggers.logoutBot()
    setBot(null)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-twitch-muted text-sm">
      <Loader size={14} className="animate-spin" /> Loading...
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-twitch-muted text-sm">
        Optionally connect a separate bot account. Triggers can send responses as either your main account or the bot. Skip this if you want everything sent as yourself.
      </p>

      {bot ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-twitch-surface border border-twitch-border rounded-lg">
            <Bot size={18} className="text-teal-400 shrink-0" />
            <div>
              <p className="text-twitch-text text-sm font-medium">{bot.displayName}</p>
              <p className="text-twitch-muted text-xs">@{bot.login} — Bot account connected</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onNext} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">Continue →</button>
            <button onClick={logoutBot} className="bg-twitch-surface border border-twitch-border hover:bg-twitch-border text-twitch-muted text-sm px-3 py-2 rounded-lg transition-colors">Remove bot</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={loginBot} disabled={connecting} className="flex items-center gap-2 bg-twitch-surface border border-twitch-border hover:bg-twitch-border disabled:opacity-50 text-twitch-text text-sm px-4 py-2 rounded-lg transition-colors">
              {connecting ? <Loader size={14} className="animate-spin" /> : <Bot size={14} />}
              {connecting ? 'Waiting for browser...' : 'Connect bot account'}
            </button>
            <button onClick={onNext} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">Skip →</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DoneStep() {
  const navigate = useNavigate()

  async function finish() {
    await window.api.settings.set('chatTriggersSetupComplete', true)
    await window.api.settings.set('chatEngineAutoStart', true)
    await window.api.chatTriggers.start()
    navigate('/chat-triggers')
  }

  return (
    <div className="space-y-5">
      <div className="p-4 bg-teal-900/20 border border-teal-800/40 rounded-lg">
        <p className="text-teal-400 font-medium text-sm flex items-center gap-2"><CheckCircle size={15} /> You're all set!</p>
        <p className="text-twitch-muted text-sm mt-1">Chat Triggers will start listening to your channel when you click Finish. You can build your first trigger from the main screen.</p>
      </div>
      <button onClick={finish} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-5 py-2 rounded-lg transition-colors">
        Finish &amp; Start Listening
      </button>
    </div>
  )
}

const STEPS = ['Permissions', 'Bot Account (optional)', 'Ready']

export default function ChatTriggerSetup({ twitchUser }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const next = () => setStep(s => s + 1)

  if (!twitchUser) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-3">
          <AlertCircle size={32} className="text-twitch-muted mx-auto" />
          <p className="text-twitch-text">You need to log in with Twitch first.</p>
          <button onClick={() => navigate('/setup')} className="bg-twitch-purple hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Go to Setup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-lg bg-twitch-mid border border-twitch-border rounded-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-teal-400 text-xl">⚡</span>
          <h1 className="text-twitch-text font-semibold text-lg">Chat Triggers Setup</h1>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-1.5">
                {i < step
                  ? <CheckCircle size={14} className="text-teal-400" />
                  : i === step
                    ? <Circle size={14} className="text-teal-400" />
                    : <Circle size={14} className="text-twitch-border" />}
                <span className={`text-xs ${i === step ? 'text-twitch-text' : i < step ? 'text-teal-400' : 'text-twitch-muted'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-twitch-border" />}
            </React.Fragment>
          ))}
        </div>

        {step === 0 && <ScopesStep twitchUser={twitchUser} onNext={next} />}
        {step === 1 && <BotStep onNext={next} />}
        {step === 2 && <DoneStep />}
      </div>
    </div>
  )
}
