import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Setup from './pages/Setup'
import Queue from './pages/Queue'
import Updates from './pages/Updates'
import Review from './pages/Review'
import Settings from './pages/Settings'

export default function App() {
  const [twitchUser, setTwitchUser] = useState(null)
  const [obsConnected, setObsConnected] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const state = await window.api.twitch.getState()
      if (state.ok) setTwitchUser(state.data.user)

      const obs = await window.api.obs.getStatus()
      if (obs.ok) setObsConnected(obs.data.connected)

      setReady(true)
    }
    init()

    window.api.twitch.onAuthChanged(({ user }) => setTwitchUser(user))
    window.api.obs.onStatusChanged(({ connected }) => setObsConnected(connected))
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-twitch-dark">
        <div className="text-twitch-muted text-sm">Loading...</div>
      </div>
    )
  }

  const isSetup = !!twitchUser

  return (
    <div className="flex h-screen bg-twitch-dark overflow-hidden">
      {isSetup && <Nav obsConnected={obsConnected} twitchUser={twitchUser} />}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/setup" element={
            <Setup twitchUser={twitchUser} obsConnected={obsConnected} />
          } />
          <Route path="/queue" element={
            isSetup ? <Queue /> : <Navigate to="/setup" />
          } />
          <Route path="/updates" element={
            isSetup ? <Updates /> : <Navigate to="/setup" />
          } />
          <Route path="/review" element={
            isSetup ? <Review /> : <Navigate to="/setup" />
          } />
          <Route path="/settings" element={
            <Settings twitchUser={twitchUser} obsConnected={obsConnected} />
          } />
          <Route path="*" element={
            <Navigate to={isSetup ? '/queue' : '/setup'} />
          } />
        </Routes>
      </main>
    </div>
  )
}
