import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_REGISTRY } from '../apps'

const BADGE_ANIM = (i) => ({
  animation: `k3lCardIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms both`,
})

export default function Marketplace({ subscribedIds, onSubscriptionChange }) {
  const [pending, setPending] = useState(null)
  const navigate = useNavigate()

  async function handleSubscribe(appId) {
    setPending(appId)
    const r = await window.api.marketplace.subscribe(appId)
    if (r.ok) onSubscriptionChange(prev => [...prev, appId])
    setPending(null)
  }

  async function handleUnsubscribe(appId) {
    setPending(appId)
    const r = await window.api.marketplace.unsubscribe(appId)
    if (r.ok) onSubscriptionChange(prev => prev.filter(id => id !== appId))
    setPending(null)
  }

  const available  = APP_REGISTRY.filter(a => a.version || a.core)
  const comingSoon = APP_REGISTRY.filter(a => !a.version && !a.core)

  return (
    <div className="h-full overflow-y-auto">
      <style>{`
        @keyframes k3lCardIn {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      {/* Hero */}
      <div className="px-8 pt-10 pb-8 border-b border-twitch-border bg-gradient-to-b from-twitch-surface to-transparent">
        <p className="text-xs text-twitch-purple font-semibold uppercase tracking-widest mb-1">K3LPoke</p>
        <h1 className="text-2xl font-bold text-twitch-text">Marketplace</h1>
        <p className="text-sm text-twitch-muted mt-1 max-w-lg">
          Expand your broadcast toolkit. Subscribe to apps and they appear in your launcher — all running in the background so nothing misses a beat.
        </p>
      </div>

      <div className="px-8 py-8 space-y-10 max-w-4xl">

        {/* Available now */}
        <section>
          <h2 className="text-xs font-semibold text-twitch-muted uppercase tracking-widest mb-4">Available Now</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {available.map((app, i) => {
              const subscribed = app.core || subscribedIds.includes(app.id)
              return (
                <div
                  key={app.id}
                  style={BADGE_ANIM(i)}
                  className="rounded-xl border border-twitch-border bg-twitch-surface overflow-hidden flex flex-col"
                >
                  {/* Color header */}
                  <div
                    className="h-2"
                    style={{ background: `linear-gradient(90deg, ${app.color}, ${app.color}66)` }}
                  />

                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${app.color}cc, ${app.color}55)`,
                          boxShadow: `0 4px 14px ${app.color}40`,
                        }}
                      >
                        {app.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-twitch-text">{app.name}</h3>
                          {app.core && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-twitch-purple/20 text-twitch-purple">
                              Core
                            </span>
                          )}
                          {app.version && (
                            <span className="text-[9px] text-twitch-muted">v{app.version}</span>
                          )}
                        </div>
                        <p className="text-xs text-twitch-muted">{app.tagline}</p>
                      </div>
                    </div>

                    <p className="text-xs text-twitch-muted leading-relaxed flex-1">{app.description}</p>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => navigate(app.defaultRoute)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-twitch-purple text-white hover:brightness-110 transition-all"
                      >
                        Open
                      </button>
                      {!app.core && (subscribed ? (
                        <button
                          onClick={() => handleUnsubscribe(app.id)}
                          disabled={pending === app.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-twitch-border text-twitch-muted hover:border-red-500/50 hover:text-red-400 transition-colors"
                        >
                          {pending === app.id ? 'Removing…' : 'Remove'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(app.id)}
                          disabled={pending === app.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-twitch-border text-twitch-muted hover:border-twitch-purple/50 hover:text-twitch-text transition-colors"
                        >
                          {pending === app.id ? 'Adding…' : 'Add to launcher'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Coming soon */}
        {comingSoon.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-twitch-muted uppercase tracking-widest mb-4">Coming Soon</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comingSoon.map((app, i) => (
                <div
                  key={app.id}
                  style={BADGE_ANIM(available.length + i)}
                  className="rounded-xl border border-twitch-border/50 bg-twitch-surface/50 overflow-hidden opacity-70"
                >
                  <div
                    className="h-2"
                    style={{ background: `linear-gradient(90deg, ${app.color}66, ${app.color}22)` }}
                  />
                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 text-lg font-bold shrink-0"
                        style={{ background: `linear-gradient(135deg, ${app.color}44, ${app.color}22)` }}
                      >
                        {app.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-twitch-text">{app.name}</h3>
                          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-twitch-border text-twitch-muted">
                            Soon
                          </span>
                        </div>
                        <p className="text-xs text-twitch-muted">{app.tagline}</p>
                      </div>
                    </div>
                    <p className="text-xs text-twitch-muted leading-relaxed">{app.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
