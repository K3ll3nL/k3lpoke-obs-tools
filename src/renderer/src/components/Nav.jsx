import React from 'react'
import { NavLink } from 'react-router-dom'
import { ListVideo, ClipboardCheck, Bell, Settings } from 'lucide-react'
import OBSStatus from './OBSStatus'

const links = [
  { to: '/queue',    icon: ListVideo,      label: 'Queue' },
  { to: '/updates',  icon: Bell,           label: 'Updates' },
  { to: '/review',   icon: ClipboardCheck, label: 'Review' },
  { to: '/settings', icon: Settings,       label: 'Settings' }
]

export default function Nav({ obsConnected, twitchUser }) {
  return (
    <aside className="w-16 flex flex-col items-center py-4 gap-2 bg-twitch-mid border-r border-twitch-border shrink-0">
      {/* Logo */}
      <div className="w-9 h-9 rounded-lg bg-twitch-purple flex items-center justify-center mb-2 shrink-0">
        <span className="text-white font-bold text-sm">TC</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
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

      <OBSStatus connected={obsConnected} />

      {twitchUser && (
        <img
          src={twitchUser.profile_image_url}
          alt={twitchUser.display_name}
          title={twitchUser.display_name}
          className="w-8 h-8 rounded-full border-2 border-twitch-border"
        />
      )}
    </aside>
  )
}
