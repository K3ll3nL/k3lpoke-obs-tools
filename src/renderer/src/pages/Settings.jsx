import React, { useEffect, useState } from 'react'
import { LogOut, Download } from 'lucide-react'

export default function Settings({ twitchUser, obsConnected }) {
  const [obsHost, setObsHost] = useState('localhost')
  const [obsPort, setObsPort] = useState('4455')
  const [obsPass, setObsPass] = useState('')
  const [obsLoading, setObsLoading] = useState(false)
  const [obsError, setObsError] = useState(null)
  const [updateState, setUpdateState] = useState(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.api.settings.getAll().then(r => {
      if (!r.ok) return
      const s = r.data
      if (s.obsHost)            setObsHost(s.obsHost)
      if (s.obsPort)            setObsPort(String(s.obsPort))
      if (s.obsPassword != null) setObsPass(s.obsPassword)
    })

    window.api.app.getUpdateState().then(r => {
      if (r.ok) setUpdateState(r.data)
    })

    const handleUpdateAvailable = () => {
      window.api.app.getUpdateState().then(r => {
        if (r.ok) setUpdateState(r.data)
      })
    }

    const handleUpdateReady = () => {
      window.api.app.getUpdateState().then(r => {
        if (r.ok) setUpdateState({ ...r.data, isReady: true })
      })
    }

    window.api.onUpdateAvailable?.(handleUpdateAvailable)
    window.api.onUpdateReady?.(handleUpdateReady)
  }, [])

  async function reconnectOBS() {
    setObsLoading(true)
    setObsError(null)
    try {
      await window.api.settings.set('obsHost', obsHost)
      await window.api.settings.set('obsPort', parseInt(obsPort, 10))
      const r = await window.api.obs.connect({ host: obsHost, port: parseInt(obsPort, 10), password: obsPass })
      if (!r.ok) throw new Error(r.error)
    } catch (e) {
      setObsError(e.message)
    } finally {
      setObsLoading(false)
    }
  }

  async function handleInstallUpdate() {
    setInstalling(true)
    await window.api.app.installUpdate()
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="font-bold text-xl text-twitch-text mb-6">Connections</h1>

      <div className="max-w-2xl space-y-6">

        {/* App Update */}
        {updateState?.hasUpdate && (
          <section className="card p-5 bg-blue-900/20 border border-blue-600/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-twitch-text mb-1">Update Available</h2>
                <p className="text-xs text-twitch-muted">Version {updateState.version} is ready to install</p>
              </div>
              <button
                className="btn-purple flex items-center gap-1.5 text-xs"
                onClick={handleInstallUpdate}
                disabled={installing}
              >
                <Download size={13} /> {installing ? 'Installing...' : 'Install'}
              </button>
            </div>
          </section>
        )}

        {/* Twitch Account */}
        <section className="card p-5">
          <h2 className="font-semibold text-twitch-text mb-4">Twitch Account</h2>
          {twitchUser ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={twitchUser.profile_image_url} className="w-9 h-9 rounded-full" alt="" />
                <div>
                  <p className="text-sm font-medium text-twitch-text">{twitchUser.display_name}</p>
                  <p className="text-xs text-twitch-muted">@{twitchUser.login}</p>
                </div>
              </div>
              <button className="btn-ghost flex items-center gap-1.5 text-xs" onClick={() => window.api.twitch.logout()}>
                <LogOut size={13} /> Logout
              </button>
            </div>
          ) : (
            <p className="text-twitch-muted text-sm">Not connected. Go to Setup.</p>
          )}
        </section>

        {/* OBS Connection */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-twitch-text">OBS Connection</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${obsConnected ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
              {obsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2">
              <label className="label">Host</label>
              <input className="input" value={obsHost} onChange={e => setObsHost(e.target.value)} />
            </div>
            <div>
              <label className="label">Port</label>
              <input className="input" value={obsPort} onChange={e => setObsPort(e.target.value)} />
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Password</label>
            <input className="input" type="password" value={obsPass} onChange={e => setObsPass(e.target.value)} placeholder="Optional" />
          </div>
          {obsError && <p className="text-red-400 text-xs mb-2">{obsError}</p>}
          <button className="btn-purple" onClick={reconnectOBS} disabled={obsLoading}>
            {obsLoading ? 'Connecting...' : obsConnected ? 'Reconnect' : 'Connect'}
          </button>
        </section>

      </div>
    </div>
  )
}
