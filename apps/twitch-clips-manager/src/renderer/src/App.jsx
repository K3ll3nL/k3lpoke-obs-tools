import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import RightPanel from './components/RightPanel'
import UndoToast from './components/UndoToast'
import UpdatePrompt from './components/UpdatePrompt'
import Setup from './pages/Setup'
import ShinySetup from './pages/ShinySetup'
import ShinyDevices from './pages/ShinyDevices'
import ShinyLayouts from './pages/ShinyLayouts'
import Updates from './pages/Updates'
import Review from './pages/Review'
import Collections from './pages/Collections'
import Settings from './pages/Settings'
import Marketplace from './pages/Marketplace'
import ClipSettings from './pages/ClipSettings'

export default function App() {
  const [twitchUser, setTwitchUser] = useState(null)
  const [obsConnected, setObsConnected] = useState(false)
  const [ready, setReady] = useState(false)
  const [subscribedIds, setSubscribedIds] = useState([])

  useEffect(() => {
    async function init() {
      const state = await window.api.twitch.getState()
      if (state.ok) setTwitchUser(state.data.user)

      const obs = await window.api.obs.getStatus()
      if (obs.ok) setObsConnected(obs.data.connected)

      const subs = await window.api.marketplace.getSubscribed()
      if (subs.ok) setSubscribedIds(subs.data)

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
  const { pathname } = useLocation()
  const hidePanel = ['/settings', '/setup', '/marketplace'].includes(pathname) || pathname.startsWith('/shiny')

  return (
    <div className="flex h-screen bg-twitch-dark overflow-hidden">
      {isSetup && (
        <Nav
          obsConnected={obsConnected}
          twitchUser={twitchUser}
          subscribedIds={subscribedIds}
        />
      )}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/setup" element={
            <Setup twitchUser={twitchUser} obsConnected={obsConnected} />
          } />
          <Route path="/updates" element={
            isSetup ? <Updates /> : <Navigate to="/setup" />
          } />
          <Route path="/review" element={
            isSetup ? <Review /> : <Navigate to="/setup" />
          } />
          <Route path="/collections" element={
            isSetup ? <Collections /> : <Navigate to="/setup" />
          } />
          <Route path="/settings" element={
            <Settings twitchUser={twitchUser} obsConnected={obsConnected} />
          } />
          <Route path="/clip-settings" element={
            isSetup ? <ClipSettings /> : <Navigate to="/setup" />
          } />
          <Route path="/marketplace" element={
            isSetup
              ? <Marketplace subscribedIds={subscribedIds} onSubscriptionChange={setSubscribedIds} />
              : <Navigate to="/setup" />
          } />
          <Route path="/shiny/setup"   element={<ShinySetup obsConnected={obsConnected} />} />
          <Route path="/shiny/devices" element={isSetup ? <ShinyDevices /> : <Navigate to="/setup" />} />
          <Route path="/shiny/layouts" element={isSetup ? <ShinyLayouts /> : <Navigate to="/setup" />} />
          <Route path="*" element={
            <Navigate to={isSetup ? '/updates' : '/setup'} />
          } />
        </Routes>
      </main>
      {isSetup && !hidePanel && <RightPanel />}
      <UndoToast />
      <UpdatePrompt />
    </div>
  )
}
