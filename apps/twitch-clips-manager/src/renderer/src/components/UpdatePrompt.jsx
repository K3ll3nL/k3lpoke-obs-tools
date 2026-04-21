import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    window.api.app.onUpdateAvailable(() => {
      console.log('Update available')
    })
    window.api.app.onUpdateReady(() => {
      setUpdateReady(true)
    })
  }, [])

  if (!updateReady) return null

  return (
    <div className="fixed bottom-6 right-6 bg-twitch-purple border border-twitch-border rounded-lg p-4 shadow-lg max-w-xs flex items-center gap-3">
      <Download size={18} className="text-white flex-shrink-0" />
      <div className="flex-1">
        <p className="text-twitch-text text-sm font-medium">Update ready</p>
        <p className="text-twitch-muted text-xs">Restart to apply</p>
      </div>
      <button
        onClick={() => window.api.app.installUpdate()}
        className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded font-medium transition-colors"
      >
        Restart
      </button>
    </div>
  )
}
