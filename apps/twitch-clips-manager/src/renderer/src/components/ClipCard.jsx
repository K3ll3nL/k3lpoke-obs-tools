import React from 'react'
import { Check, X, Trash2, Play } from 'lucide-react'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ClipCard({ clip, mode = 'review', onApprove, onDeny, onRemove, onPlay, dragging }) {
  return (
    <div className={`card flex gap-3 p-3 group transition-shadow ${dragging ? 'opacity-50 shadow-lg' : ''}`}>
      {/* Thumbnail */}
      <div className="relative shrink-0 w-32 h-[72px] rounded overflow-hidden bg-black">
        {clip.thumbnail_url
          ? <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-twitch-mid" />
        }
        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
          {duration(clip.duration)}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p className="text-sm font-medium text-twitch-text truncate leading-tight" title={clip.title}>
            {clip.title}
          </p>
          <p className="text-xs text-twitch-muted mt-0.5">
            {clip.broadcaster_name} &middot; Clipped by <span className="text-twitch-purple">{clip.creator_name}</span>
          </p>
          <p className="text-[11px] text-twitch-border mt-0.5">
            {clip.view_count?.toLocaleString()} views &middot; {new Date(clip.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 justify-center shrink-0">
        {mode === 'review' && (
          <>
            <button onClick={onApprove} title="Approve" className="w-8 h-8 rounded flex items-center justify-center bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white transition-colors">
              <Check size={14} />
            </button>
            <button onClick={onDeny} title="Deny" className="w-8 h-8 rounded flex items-center justify-center bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </>
        )}
        {mode === 'queue' && (
          <button onClick={onRemove} title="Remove from queue" className="w-8 h-8 rounded flex items-center justify-center bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
