import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, CheckCircle, Circle } from 'lucide-react'

export default function Setup({ twitchUser, obsConnected }) {
  const navigate = useNavigate()
  const [obsHost, setObsHost] = useState('localhost')
  const [obsPort, setObsPort] = useState('4455')
  const [obsPass, setObsPass] = useState('')
  const [twitchLoading, setTwitchLoading] = useState(false)
  const [obsLoading, setObsLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleTwitchLogin() {
    setError(null)
    setTwitchLoading(true)
    try {
      const r = await window.api.twitch.login()
      if (!r.ok) throw new Error(r.error)
    } catch (e) {
      setError(e.message)
    } finally {
      setTwitchLoading(false)
    }
  }

  async function handleObsConnect() {
    setError(null)
    setObsLoading(true)
    try {
      const r = await window.api.obs.connect({
        host: obsHost,
        port: parseInt(obsPort, 10),
        password: obsPass
      })
      if (!r.ok) throw new Error(r.error)
    } catch (e) {
      setError(e.message)
    } finally {
      setObsLoading(false)
    }
  }

  const allDone = twitchUser && obsConnected

  return (
    <div className="flex items-center justify-center h-full bg-twitch-dark p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <div className="w-12 h-12 rounded-xl bg-twitch-purple flex items-center justify-center mb-4">
            <span className="text-white font-bold text-lg">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-twitch-text">Twitch Clip Queue</h1>
          <p className="text-twitch-muted text-sm mt-1">Connect your accounts to get started.</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Step 1 — Twitch */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            {twitchUser
              ? <CheckCircle size={18} className="text-green-400 shrink-0" />
              : <Circle size={18} className="text-twitch-muted shrink-0" />
            }
            <h2 className="font-semibold text-twitch-text">Connect Twitch</h2>
          </div>

          {twitchUser ? (
            <div className="flex items-center gap-3">
              <img src={twitchUser.profile_image_url} className="w-9 h-9 rounded-full" alt="" />
              <div>
                <p className="text-sm font-medium text-twitch-text">{twitchUser.display_name}</p>
                <p className="text-xs text-twitch-muted">
                  Connected &middot; <span className="text-twitch-purple">/{twitchUser.login}</span> added as a clip source
                </p>
              </div>
            </div>
          ) : (
            <button className="btn-purple w-full" onClick={handleTwitchLogin} disabled={twitchLoading}>
              {twitchLoading ? 'Opening browser...' : 'Login with Twitch'}
            </button>
          )}
        </div>

        {/* Step 2 — OBS */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            {obsConnected
              ? <CheckCircle size={18} className="text-green-400 shrink-0" />
              : <Circle size={18} className="text-twitch-muted shrink-0" />
            }
            <h2 className="font-semibold text-twitch-text">Connect OBS</h2>
          </div>

          {obsConnected ? (
            <p className="text-sm text-green-400">OBS WebSocket connected</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-twitch-muted">
                In OBS: Tools → WebSocket Server Settings → Enable, then set a password.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="label">Host</label>
                  <input className="input" value={obsHost} onChange={e => setObsHost(e.target.value)} />
                </div>
                <div>
                  <label className="label">Port</label>
                  <input className="input" value={obsPort} onChange={e => setObsPort(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={obsPass} onChange={e => setObsPass(e.target.value)} placeholder="Optional" />
              </div>
              <button className="btn-purple w-full" onClick={handleObsConnect} disabled={obsLoading}>
                {obsLoading ? 'Connecting...' : 'Connect to OBS'}
              </button>
            </div>
          )}
        </div>

        {allDone && (
          <button className="btn-purple w-full text-base py-3" onClick={() => navigate('/queue')}>
            Get Started →
          </button>
        )}
      </div>
    </div>
  )
}
