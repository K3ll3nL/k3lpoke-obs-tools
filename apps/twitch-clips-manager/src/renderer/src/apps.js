import { Bell, ClipboardCheck, Settings, ListVideo, Layers, Monitor, LayoutGrid } from 'lucide-react'

/**
 * Central registry of all K3LPoke apps.
 * Each app declares its nav items, routes, and marketplace metadata.
 * Background services for each app are registered separately in main/modules/.
 */
export const APP_REGISTRY = [
  {
    id: 'clip-queue',
    name: 'Clip Queue',
    tagline: 'Queue Twitch clips for OBS',
    description:
      'Review, approve, and play Twitch clips in OBS with volume control, trim, and envelope editing. Clips shuffle and loop automatically as a browser source.',
    color: '#9146FF',
    gradient: 'from-violet-600 to-purple-800',
    defaultRoute: '/updates',
    core: true,
    version: '0.1.0',
    navItems: [
      { to: '/updates',     icon: Bell,           label: 'Updates'     },
      { to: '/review',      icon: ClipboardCheck, label: 'Review'      },
      { to: '/collections', icon: Layers,         label: 'Collections' },
      { to: '/clip-settings', icon: Settings,     label: 'Settings'    },
    ],
  },
  {
    id: 'quick-shiny-screen',
    name: 'Quick Shiny Screen',
    tagline: 'Scene switcher for shiny hunters',
    description:
      'Manage multiple Nintendo Switches for shiny Pokemon hunting. Assign OBS scenes to each device, build a physical grid layout, and get a one-click OBS dock to switch scenes instantly.',
    color: '#FFD700',
    gradient: 'from-yellow-400 to-amber-600',
    defaultRoute: '/shiny/devices',
    core: false,
    version: '0.1.0',
    navItems: [
      { to: '/shiny/devices', icon: Monitor,    label: 'Devices' },
      { to: '/shiny/layouts', icon: LayoutGrid, label: 'Layouts' },
    ],
  },
  {
    id: 'alert-manager',
    name: 'Alert Manager',
    tagline: 'Custom alerts & sounds',
    description:
      'Design and trigger custom follower, sub, and donation alerts with full audio mixing, timing control, and per-event animations.',
    color: '#FF6B6B',
    gradient: 'from-red-500 to-rose-700',
    defaultRoute: '/alerts',
    core: false,
    version: null,
    navItems: [],
  },
  {
    id: 'hype-tracker',
    name: 'Hype Tracker',
    tagline: 'Real-time hype train overlays',
    description:
      'Monitor and display Twitch hype train events with animated progress bars, milestone animations, and cooldown timers in OBS.',
    color: '#FFD93D',
    gradient: 'from-yellow-400 to-orange-500',
    defaultRoute: '/hype',
    core: false,
    version: null,
    navItems: [],
  },
  {
    id: 'raid-dashboard',
    name: 'Raid Dashboard',
    tagline: 'Plan and execute raids',
    description:
      'Schedule raids, browse who is live, track raid history, and coordinate with your community — all without leaving your broadcast workflow.',
    color: '#4ECDC4',
    gradient: 'from-teal-400 to-cyan-600',
    defaultRoute: '/raids',
    core: false,
    version: null,
    navItems: [],
  },
  {
    id: 'vod-highlights',
    name: 'VOD Highlights',
    tagline: 'Auto-clip your best moments',
    description:
      'Automatically identify highlight-worthy moments from your VODs using chat velocity, emote spikes, and viewer reactions, then export clips instantly.',
    color: '#6BCB77',
    gradient: 'from-green-400 to-emerald-600',
    defaultRoute: '/highlights',
    core: false,
    version: null,
    navItems: [],
  },
  {
    id: 'chat-games',
    name: 'Chat Games',
    tagline: 'Interactive chat mini-games',
    description:
      'Run polls, predictions, trivia, and custom point-redemption mini-games driven entirely by chat — no third-party overlay required.',
    color: '#C77DFF',
    gradient: 'from-purple-400 to-pink-600',
    defaultRoute: '/games',
    core: false,
    version: null,
    navItems: [],
  },
]

/** Apps that the user has subscribed to, merged with registry metadata. */
export function resolveSubscribedApps(subscribedIds) {
  return APP_REGISTRY.filter(app => app.core || subscribedIds.includes(app.id))
}

/** Which app owns a given route path. */
export function appForRoute(pathname) {
  for (const app of APP_REGISTRY) {
    if (app.navItems.some(item => pathname.startsWith(item.to))) return app
    if (pathname === app.defaultRoute) return app
  }
  return null
}
