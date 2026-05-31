import React from 'react'
import { Bell, ClipboardCheck, Settings, Layers, Monitor, LayoutGrid, MessageSquare, Plus, Zap, Copy, Trash2 } from 'lucide-react'

/**
 * Central registry of all K3LPoke apps.
 * Each app declares its nav items, routes, and marketplace metadata.
 * Background services for each app are registered separately in main/modules/.
 */
export const APP_REGISTRY = [
  {
    id: 'clip-queue',
    name: 'Twitch Clip Player',
    tagline: 'Queue Twitch clips for OBS',
    description:
      'Review, approve, and play Twitch clips in OBS with volume control, trim, and envelope editing. Clips shuffle and loop automatically as a browser source.',
    color: '#9146FF',
    gradient: 'from-violet-600 to-purple-800',
    defaultRoute: '/updates',
    core: true,
    version: '1.1.0',
    navItems: [
      { to: '/updates',     icon: Bell,           label: 'Updates'     },
      { to: '/review',      icon: ClipboardCheck, label: 'Review'      },
      { to: '/collections', icon: Layers,         label: 'Collections' },
      { to: '/clip-settings', icon: Settings,     label: 'Settings'    },
    ],
    image: () => React.createElement('svg', {
      width: '20', 
      height: '20', 
      viewBox: '0 0 24 24', 
      fill: 'none', 
      stroke: 'white', 
      strokeWidth: '2', 
      strokeLinecap: 'round', 
      strokeLinejoin: 'round'
    }, [
      React.createElement('path', { key: 'path1', d: 'M 20.2 6 3 11 l -.9 -2.4 c -.3 -1.1 .3 -2.2 1.3-2.6 l 13.5 -4.7 c 1-.3 2.1 .3 2.4 1.3 Z' }),
      React.createElement('path', { key: 'path2', d: 'm 6.2 5.3 3.1 3.9' }),
      React.createElement('path', { key: 'path3', d: 'm 12.4 3.4 3.1 3.9' }),
      React.createElement('path', { key: 'path4', d: 'M 3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' })
    ])
  },
  {
    id: 'quick-shiny-scene',
    name: 'Quick Shiny Scene',
    tagline: 'OBS Scene switcher for shiny hunters',
    description:
      'Cut the clutter from your shiny hunting stream. Assign your Switch capture sources, build a grid layout, and get a one-click OBS dock that instantly routes to your shiny highlight screen — so you never miss a frame when a shiny appears.',
    color: '#facc15',
    gradient: 'from-yellow-400 to-amber-600',
    defaultRoute: '/shiny/devices',
    routePrefix: '/shiny',
    core: true,
    version: '0.2.1',
    navItems: [
      { to: '/shiny/devices', icon: Monitor,    label: 'Devices' },
      { to: '/shiny/layouts', icon: LayoutGrid, label: 'Layouts' },
    ],
    image: () => React.createElement('svg', {
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'white',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, [
      React.createElement('rect', { key: 'monitor', x: '2', y: '3', width: '20', height: '14', rx: '2' }),
      React.createElement('path', { key: 'stand', d: 'M 8 17 L 8 21 M 16 17 L 16 21 M 7 21 L 17 21' }),
      React.createElement('path', { key: 'sparkle1', d: 'M 16 8 L 17 9 L 16 10 L 15 9 Z', fill: 'white' }),
      React.createElement('path', { key: 'sparkle2', d: 'M 14 6 L 14.5 7 L 14 8 L 13.5 7 Z', fill: 'white' }),
    ])
  },
  {
    id: 'chat-triggers',
    name: 'Chat Triggers',
    tagline: 'Automate responses to chat messages',
    description:
      'Build smart chat automations with a visual no-code editor. Match keywords, run !commands with parameters, send messages or announcements, and manage cooldowns — without writing a line of regex.',
    color: '#00b5ad',
    gradient: 'from-teal-500 to-cyan-700',
    defaultRoute: '/chat-triggers',
    routePrefix: '/chat-triggers',
    core: false,
    version: '0.1.3',
    navItems: [
      { to: '/chat-triggers',          icon: Zap,      label: 'Triggers', end: true },
      { to: '/chat-triggers/settings', icon: Settings, label: 'Settings'              },
    ],
    image: () => React.createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'white', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, [
      React.createElement('path', { key: 'bubble', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
      React.createElement('path', { key: 'bolt', d: 'M13 8l-2 4h3l-2 4', stroke: '#00b5ad' }),
    ])
  },
  {
    id: 'scene-arranger',
    name: 'Scene Arranger',
    tagline: 'Intelligent OBS scene management',
    description:
      'Stop manually duplicating and tweaking scenes. Scene Arranger analyzes your OBS setup and lets you create scenes from templates, duplicate with smart source swapping, and bulk-clean large scene collections — all with preview and rollback.',
    color: '#6366f1',
    gradient: 'from-indigo-500 to-violet-700',
    defaultRoute: '/scenes',
    routePrefix: '/scenes',
    core: false,
    version: '0.1.0',
    navItems: [
      { to: '/scenes',           icon: LayoutGrid, label: 'Layout',     end: true },
      { to: '/scenes/create',    icon: Plus,       label: 'Create'               },
      { to: '/scenes/duplicate', icon: Copy,       label: 'Duplicate'            },
      { to: '/scenes/cleanup',   icon: Trash2,     label: 'Clean Up'             },
    ],
    image: () => React.createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'white', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, [
      React.createElement('rect', { key: 'r1', x: '3', y: '3', width: '7', height: '7', rx: '1' }),
      React.createElement('rect', { key: 'r2', x: '14', y: '3', width: '7', height: '7', rx: '1' }),
      React.createElement('rect', { key: 'r3', x: '14', y: '14', width: '7', height: '7', rx: '1' }),
      React.createElement('rect', { key: 'r4', x: '3', y: '14', width: '7', height: '7', rx: '1' }),
    ])
  },
]

/** Apps that the user has subscribed to, merged with registry metadata. */
export function resolveSubscribedApps(subscribedIds) {
  return APP_REGISTRY.filter(app => app.core || subscribedIds.includes(app.id))
}

/** Which app owns a given route path. */
export function appForRoute(pathname) {
  for (const app of APP_REGISTRY) {
    if (app.routePrefix && pathname.startsWith(app.routePrefix)) return app
    if (app.navItems.some(item => pathname.startsWith(item.to))) return app
    if (pathname === app.defaultRoute) return app
  }
  return null
}

