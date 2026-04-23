import React, { useState } from 'react'
import { X } from 'lucide-react'

const PRESET_COLORS = ['#9146ff', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#fdcb6e']

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full border-2 transition-all"
          style={{ background: c, borderColor: value === c ? '#fff' : 'transparent' }}
        />
      ))}
    </div>
  )
}

export default function CreateCollectionModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    const r = await window.api.collections.create(name.trim(), color)
    if (r.ok) {
      onCreate?.(r.data)
      setName('')
      setColor(PRESET_COLORS[0])
      onClose()
    }
    setCreating(false)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center" onClick={onClose}>
        <div
          className="bg-twitch-mid border border-twitch-border rounded-lg w-96 p-5 space-y-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-twitch-text">Create Collection</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-twitch-muted hover:bg-twitch-surface transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-twitch-muted mb-1.5">Name</label>
              <input
                className="input text-sm w-full"
                placeholder="Collection name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-twitch-muted mb-1.5">Color</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="btn-ghost text-sm px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="btn-purple text-sm px-4 py-2"
            >
              {creating ? '...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
