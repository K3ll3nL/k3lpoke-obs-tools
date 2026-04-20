import React from 'react'

export default function OBSStatus({ connected }) {
  return (
    <div
      title={connected ? 'OBS Connected' : 'OBS Disconnected'}
      className="flex items-center justify-center w-10 h-10"
    >
      <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
    </div>
  )
}
