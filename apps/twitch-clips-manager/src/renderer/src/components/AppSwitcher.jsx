import React, { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { resolveSubscribedApps } from '../apps'

const NAV_W = 64 // px — must match aside w-16

const CARD_ANIM = (i) => ({
  animation: `k3lDropCard 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 45}ms both`,
})

export default function AppSwitcher({ subscribedIds, onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const panelRef = useRef(null)

  const subscribed = resolveSubscribedApps(subscribedIds)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isActive(app) {
    return app.navItems.some(n => pathname.startsWith(n.to)) || pathname === app.defaultRoute
  }

  function handleAppClick(app) {
    if (!app.version && !app.core) return
    navigate(app.defaultRoute)
    onClose()
  }

  return (
    <>
      <style>{`
        @keyframes k3lDropCard {
          from { opacity: 0; transform: translateX(-6px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
      `}</style>

      {/* Invisible backdrop — closes on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown panel anchored just right of the nav */}
      <div
        ref={panelRef}
        className="fixed z-50 top-3 flex flex-col gap-1 p-2 rounded-xl border border-twitch-border bg-twitch-mid shadow-2xl shadow-black/60"
        style={{ left: NAV_W + 8 }}
      >
        <p className="text-[10px] font-semibold text-twitch-muted uppercase tracking-widest px-2 pt-1 pb-0.5">
          K3LPoke
        </p>

        {subscribed.map((app, i) => {
          const active = isActive(app)
          const available = app.version || app.core
          return (
            <button
              key={app.id}
              style={CARD_ANIM(i)}
              onClick={() => handleAppClick(app)}
              disabled={!available}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-left w-56 transition-colors
                ${active
                  ? 'bg-twitch-purple/20 text-twitch-text'
                  : available
                    ? 'hover:bg-twitch-surface text-twitch-muted hover:text-twitch-text'
                    : 'text-twitch-border cursor-not-allowed'
                }
              `}
            >
              {/* Color dot / icon */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{
                  background: available
                    ? `linear-gradient(135deg, ${app.color}cc, ${app.color}55)`
                    : '#2a2a45',
                  boxShadow: available ? `0 2px 8px ${app.color}40` : 'none',
                }}
              >
                {app.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-tight truncate">{app.name}</p>
                <p className="text-[10px] text-twitch-muted leading-tight truncate">{app.tagline}</p>
              </div>

              {active && (
                <div className="w-1.5 h-1.5 rounded-full bg-twitch-purple shrink-0" />
              )}
              {!available && (
                <span className="text-[9px] text-twitch-border shrink-0">Soon</span>
              )}
            </button>
          )
        })}

        {/* Marketplace shortcut */}
        <div className="border-t border-twitch-border mt-1 pt-1">
          <button
            style={CARD_ANIM(subscribed.length)}
            onClick={() => { navigate('/marketplace'); onClose() }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left text-twitch-muted hover:text-twitch-text hover:bg-twitch-surface transition-colors"
          >
            <div className="w-7 h-7 rounded-lg border border-dashed border-twitch-border flex items-center justify-center shrink-0">
              <span className="text-xs">+</span>
            </div>
            <span className="text-xs">Browse Marketplace</span>
          </button>
        </div>
      </div>
    </>
  )
}
