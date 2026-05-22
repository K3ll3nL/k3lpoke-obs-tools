import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    console.log('[UpdatePrompt] Setting up listeners')
    window.api.app.onUpdateAvailable((data) => {
      console.log('[UpdatePrompt] onUpdateAvailable fired:', data)
      setUpdateAvailable(true)
    })
    window.api.app.onUpdateReady((data) => {
      console.log('[UpdatePrompt] onUpdateReady fired:', data)
      setUpdateReady(true)
    })
  }, [])

  if (!updateAvailable && !updateReady) return null

  return (
    <div className="fixed bottom-6 right-6 bg-twitch-purple border border-twitch-border rounded-lg p-4 shadow-lg max-w-xs flex items-center gap-3">
      <Download size={18} className="text-white flex-shrink-0" />
      <div className="flex-1">
        <p className="text-twitch-text text-sm font-medium">
          {updateReady ? 'Update ready' : 'Downloading update...'}
        </p>
        <p className="text-twitch-muted text-xs">
          {updateReady ? 'Restart to apply' : 'Please wait'}
        </p>
      </div>
      {updateReady && (
        <button
          onClick={() => window.api.app.installUpdate()}
          className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded font-medium transition-colors"
        >
          Restart
        </button>
      )}
    </div>
  )
}
