import React, { useState, useCallback, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Store } from 'lucide-react'
import OBSStatus from './OBSStatus'
import AppSwitcher from './AppSwitcher'
import { appForRoute, APP_REGISTRY } from '../apps'

const SPIN_DURATION = 600

export default function Nav({ obsConnected, twitchUser, subscribedIds }) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const lastAppRef = useRef(null)
  const currentApp = appForRoute(pathname)
  if (currentApp) lastAppRef.current = currentApp
  const navItems = pathname === '/marketplace'
    ? []
    : (currentApp ?? lastAppRef.current)?.navItems ?? []

  function openSwitcher() {
    if (spinning) return
    setSpinning(true)
    setSwitcherOpen(true)
    setTimeout(() => setSpinning(false), SPIN_DURATION)
  }

  const closeSwitcher = useCallback(() => setSwitcherOpen(false), [])

  return (
    <>
      <aside className="w-16 flex flex-col items-center py-4 gap-2 bg-twitch-mid border-r border-twitch-border shrink-0 z-40">

        {/* App launcher button */}
        <button
          onClick={openSwitcher}
          title="Switch app"
          className="w-10 h-10 rounded-xl bg-twitch-purple flex items-center justify-center mb-2 shrink-0 hover:brightness-110 transition-all active:scale-95"
          style={spinning ? { animation: `k3lNavSpin ${SPIN_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1) both` } : {}}
        >
          {/* Clapperboard / clip icon built from SVG so no version dependency */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.6l13.5-4.7c1-.3 2.1.3 2.4 1.3Z" />
            <path d="m6.2 5.3 3.1 3.9" />
            <path d="m12.4 3.4 3.1 3.9" />
            <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
        </button>

        {/* Current app nav items */}
        <nav className="flex flex-col gap-1 flex-1 w-full items-center">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `w-10 h-10 rounded-lg flex items-center justify-center transition-colors ` +
                (isActive
                  ? 'bg-twitch-purple text-white'
                  : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text')
              }
            >
              <Icon size={18} />
            </NavLink>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-2">
          <OBSStatus connected={obsConnected} />

          {/* Marketplace */}
          <NavLink
            to="/marketplace"
            title="Marketplace"
            className={({ isActive }) =>
              `w-10 h-10 rounded-lg flex items-center justify-center transition-colors ` +
              (isActive
                ? 'bg-twitch-purple text-white'
                : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text')
            }
          >
            <Store size={18} />
          </NavLink>

          {/* Avatar → Settings */}
          {twitchUser ? (
            <button
              onClick={() => navigate('/settings')}
              title={`${twitchUser.display_name} · Settings`}
              className={`w-8 h-8 rounded-full border-2 transition-colors overflow-hidden ${
                pathname === '/settings'
                  ? 'border-twitch-purple'
                  : 'border-twitch-border hover:border-twitch-purple/60'
              }`}
            >
              <img
                src={twitchUser.profile_image_url}
                alt={twitchUser.display_name}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <button
              onClick={() => navigate('/settings')}
              title="Settings"
              className="w-8 h-8 rounded-full border-2 border-twitch-border hover:border-twitch-purple/60 bg-twitch-surface flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-twitch-muted">
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 1 0-16 0" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes k3lNavSpin {
          0%   { transform: rotate(0deg)   scale(1);    }
          40%  { transform: rotate(200deg) scale(1.15); }
          100% { transform: rotate(360deg) scale(1);    }
        }
      `}</style>

      {switcherOpen && (
        <AppSwitcher
          subscribedIds={subscribedIds}
          onClose={closeSwitcher}
        />
      )}
    </>
  )
}
