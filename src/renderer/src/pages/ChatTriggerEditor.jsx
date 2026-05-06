import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, X, ArrowLeft, Loader, Info, ChevronDown, ChevronUp, Bot, Megaphone } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

function emptyParam() {
  return { id: uid(), name: '', optional: false, paramType: 'text', defaultValue: '' }
}

function emptyAction() {
  return { id: uid(), type: 'send_message', template: '', announcementColor: 'primary', useBot: false, delay: 0 }
}

function emptyTrigger() {
  return {
    name: '', enabled: true, type: 'message',
    command: '', commandParams: [], allowExtraText: true,
    pattern: '', actions: [emptyAction()],
    cooldown: 0, userCooldown: 0,
  }
}

// Pattern parsing: convert "text @'[choice|opts]' more text @'{number}'" to visual segments
function parsePattern(pattern) {
  if (!pattern) return []
  const segments = []
  let i = 0

  while (i < pattern.length) {
    if (pattern.slice(i, i + 2) === "@'") {
      const end = pattern.indexOf("'", i + 2)
      if (end === -1) break
      const content = pattern.slice(i + 2, end)

      if (content.startsWith('[') && content.endsWith(']')) {
        const inner = content.slice(1, -1)
        const options = inner.split('|').map(s => s.trim()).filter(Boolean)
        segments.push({ id: uid(), type: 'choice', options })
      } else if (content.startsWith('{') && content.endsWith('}')) {
        const inner = content.slice(1, -1)
        const captureType = inner === 'number' ? 'number' : inner === 'wildcard' ? 'wildcard' : 'text'
        segments.push({ id: uid(), type: 'capture', captureType })
      }
      i = end + 1
    } else {
      let textEnd = i
      while (textEnd < pattern.length && pattern.slice(textEnd, textEnd + 2) !== "@'") {
        textEnd++
      }
      const text = pattern.slice(i, textEnd)
      if (text) segments.push({ id: uid(), type: 'text', value: text })
      i = textEnd
    }
  }

  return segments
}

// Legacy migration - pattern strings now replace template arrays
function migrateToPattern(conditions, blocks, template, pattern) {
  if (pattern) return pattern
  return ''
}

// Extract available variables from pattern (param_0, param_1, etc.)
function extractPatternVars(pattern) {
  if (!pattern) return []
  const vars = []
  const segments = parsePattern(pattern)
  let count = 0
  for (const seg of segments) {
    if (seg.type === 'choice' || seg.type === 'capture') {
      vars.push(`param_${count++}`)
    }
  }
  return vars
}

// Parse response template with @'...' wrapped variables into visual segments
function parseResponseTemplate(template) {
  if (!template) return []
  const segments = []
  let i = 0

  while (i < template.length) {
    if (template.slice(i, i + 2) === "@'") {
      const end = template.indexOf("'", i + 2)
      if (end === -1) break
      const varName = template.slice(i + 2, end)
      segments.push({ id: uid(), type: 'variable', varName })
      i = end + 1
    } else {
      let textEnd = i
      while (textEnd < template.length && template.slice(textEnd, textEnd + 2) !== "@'") {
        textEnd++
      }
      const text = template.slice(i, textEnd)
      if (text) segments.push({ id: uid(), type: 'text', value: text })
      i = textEnd
    }
  }

  return segments
}

// Render preview with sample values
function renderResponsePreview(template, patternVars) {
  if (!template) return ''
  let result = template

  // Replace variables with friendly sample values
  const sampleValues = {
    user: 'username',
    display_name: 'User',
    message: '(message text)',
    channel: '(channel)',
    followage: '30 days',
  }

  // Add sample param values
  patternVars.forEach((varName, i) => {
    sampleValues[varName] = `(value ${i + 1})`
  })

  // Replace @'...' with sample values
  for (const [key, value] of Object.entries(sampleValues)) {
    result = result.replace(new RegExp(`@'${key}'`, 'g'), value)
  }

  return result
}

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_LEVELS = [
  { value: 'anyone',      label: 'Anyone' },
  { value: 'subscriber',  label: 'Subscriber+' },
  { value: 'vip',         label: 'VIP+' },
  { value: 'moderator',   label: 'Mod+' },
  { value: 'broadcaster', label: 'Broadcaster only' },
]

const ANNOUNCEMENT_COLORS = [
  { value: 'primary', label: 'Purple', color: '#9146FF' },
  { value: 'blue',    label: 'Blue',   color: '#3b82f6' },
  { value: 'green',   label: 'Green',  color: '#22c55e' },
  { value: 'orange',  label: 'Orange', color: '#f97316' },
  { value: 'purple',  label: 'Purple', color: '#a855f7' },
]

const BASE_VARS = [
  { token: '{user}',         label: '@user' },
  { token: '{display_name}', label: 'Name' },
  { token: '{message}',      label: 'Message' },
]

const ADVANCED_VARS = [
  { token: '{channel}',   label: 'Channel name' },
  { token: '{followage}', label: "Sender's followage" },
]

// ── DatapillEditor (true inline contentEditable editor) ─────────────────────

function DatapillEditor({ mode, value, onChange, availableDatepills, patternVars, patternDatpillNames }) {
  const editorRef = useRef(null)
  const [deleteMode, setDeleteMode] = useState(null)
  const [selectedPillId, setSelectedPillId] = useState(null)
  const [pillMenuPos, setPillMenuPos] = useState(null)
  const isUpdatingRef = useRef(false)
  let pillIdCounter = useRef(0)

  const updateValue = (newValue) => {
    onChange(newValue)
    setDeleteMode(null)
  }

  // Serialize DOM content: extract text and convert pill elements back to @{...} format
  const serializeDOM = () => {
    if (!editorRef.current) return ''
    let result = ''
    for (const node of editorRef.current.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('datapill')) {
          result += `@{${node.dataset.content}}`
        } else {
          result += node.textContent
        }
      }
    }
    return result
  }

  // Sync value to DOM when it changes externally
  const syncDOMFromValue = () => {
    if (!editorRef.current || isUpdatingRef.current) return

    isUpdatingRef.current = true

    // Only rebuild if needed (value changed, not just user typing)
    const currentSerialized = serializeDOM()
    if (currentSerialized === value) {
      isUpdatingRef.current = false
      return
    }

    // Parse value and rebuild DOM
    const fragment = document.createDocumentFragment()
    let i = 0

    while (i < value.length) {
      if (value.slice(i, i + 2) === '@{') {
        const end = value.indexOf('}', i + 2)
        if (end === -1) {
          // Incomplete pill - treat as text
          const textNode = document.createTextNode(value.slice(i))
          fragment.appendChild(textNode)
          break
        }

        const content = value.slice(i + 2, end)
        const pill = document.createElement('button')
        pill.type = 'button'
        pill.className = 'datapill inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-teal-900/30 border border-teal-700/60 text-teal-400 whitespace-nowrap cursor-pointer hover:bg-teal-900/50 transition-colors'
        pill.dataset.content = content
        pill.contentEditable = 'false'
        pill.textContent = getPillLabel(content)
        pill.title = 'Click to edit'
        pill.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          handlePillClick(pill, content)
        }
        fragment.appendChild(pill)

        i = end + 1
      } else {
        let textEnd = i
        while (textEnd < value.length && value.slice(textEnd, textEnd + 2) !== '@{') {
          textEnd++
        }
        if (i < textEnd) {
          const textNode = document.createTextNode(value.slice(i, textEnd))
          fragment.appendChild(textNode)
        }
        i = textEnd
      }
    }

    editorRef.current.innerHTML = ''
    editorRef.current.appendChild(fragment)

    isUpdatingRef.current = false
  }

  const handlePillClick = (pillEl, content) => {
    setSelectedPillId(content)
    const rect = pillEl.getBoundingClientRect()
    setPillMenuPos({ top: rect.bottom + 5, left: rect.left })
  }

  const updateSelectedPill = (newContent) => {
    if (!selectedPillId) return
    const newValue = value.replace(`@{${selectedPillId}}`, `@{${newContent}}`)
    updateValue(newValue)
    setSelectedPillId(null)
    setPillMenuPos(null)
  }

  useEffect(() => {
    syncDOMFromValue()
  }, [value])

  const getPillLabel = (content) => {
    const parts = content.split('|')
    const type = parts[0]
    if (type === 'choice') {
      const options = parts.slice(2).filter(Boolean)
      return options.length > 0 ? options.join(' / ') : '(empty)'
    }
    if (type === 'capture') {
      const captureType = parts[1]
      return captureType === 'number' ? '🔢' : captureType === 'wildcard' ? '❋' : '📝'
    }
    return content
  }

  const handleInput = () => {
    const serialized = serializeDOM()
    updateValue(serialized)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (!sel.rangeCount) return

      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const offset = range.startOffset

      // Check if cursor is right after a datapill
      const prevNode = offset === 0 ? node.previousSibling : null
      const isAfterPill = prevNode?.classList?.contains('datapill')

      if (isAfterPill) {
        e.preventDefault()
        const pill = prevNode
        const pillContent = pill.dataset.content

        if (deleteMode === pillContent) {
          // Second backspace - delete the pill
          pill.remove()
          handleInput()
          setDeleteMode(null)
        } else {
          // First backspace - mark for deletion and highlight
          setDeleteMode(pillContent)
          pill.classList.add('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        }
      } else {
        // Clear delete mode if not near a pill
        if (deleteMode) {
          setDeleteMode(null)
          // Clear any remaining highlights
          editorRef.current?.querySelectorAll('.datapill.bg-red-900\\/40')?.forEach(p => {
            p.classList.remove('bg-red-900/40', 'border-red-700/60', 'text-red-400')
          })
        }
      }
    } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
      // Clear delete mode on any other key
      if (deleteMode) {
        setDeleteMode(null)
        editorRef.current?.querySelectorAll('.datapill.bg-red-900\\/40')?.forEach(p => {
          p.classList.remove('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        })
      }
    }
  }

  const insertPill = (type) => {
    const additions = {
      choice: 'choice||option1|option2',
      capture_text: 'capture|text|',
      capture_number: 'capture|number|',
      capture_wildcard: 'capture|wildcard|',
      user: 'user',
      display_name: 'display_name',
      message: 'message',
      channel: 'channel',
      followage: 'followage',
    }
    const current = value || ''
    updateValue(current + `@{${additions[type]}}`)
  }

  const getPillMenuContent = () => {
    if (!selectedPillId) return null
    const parts = selectedPillId.split('|')
    const type = parts[0]

    return (
      <div className="fixed bg-twitch-dark border border-twitch-border rounded shadow-lg z-50 min-w-48 p-2 space-y-2" style={{ top: `${pillMenuPos.top}px`, left: `${pillMenuPos.left}px` }}>
        {type === 'choice' && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-twitch-muted block">Options:</label>
              <textarea
                value={parts.slice(2).join('\n')}
                onChange={e => updateSelectedPill(`choice|${parts[1]}|${e.target.value.split('\n').join('|')}`)}
                rows={2}
                className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text resize-none"
              />
            </div>
            {mode === 'pattern' && (
              <div>
                <label className="text-xs text-twitch-muted block mb-1">Name:</label>
                <input
                  value={parts[1] || ''}
                  onChange={e => updateSelectedPill(`choice|${e.target.value}|${parts.slice(2).join('|')}`)}
                  placeholder="e.g. location"
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
                />
              </div>
            )}
          </>
        )}

        {type === 'capture' && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-twitch-muted block">Capture type:</label>
              <select
                value={parts[1]}
                onChange={e => updateSelectedPill(`capture|${e.target.value}|${parts[2] || ''}`)}
                className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
              >
                <option value="text">Text (word)</option>
                <option value="number">Number</option>
                <option value="wildcard">Wildcard</option>
              </select>
            </div>
            {mode === 'pattern' && (
              <div>
                <label className="text-xs text-twitch-muted block mb-1">Name:</label>
                <input
                  value={parts[2] || ''}
                  onChange={e => updateSelectedPill(`capture|${parts[1]}|${e.target.value}`)}
                  placeholder="e.g. days_ago"
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
                />
              </div>
            )}
          </>
        )}

        <button
          onClick={() => setSelectedPillId(null)}
          className="w-full text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text text-center"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          spellCheck="false"
          className="p-3 bg-twitch-dark border border-twitch-border rounded-lg min-h-12 cursor-text focus:outline-none focus:ring-1 focus:ring-teal-600 text-twitch-text break-words"
        />
        {!value && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none text-twitch-muted text-xs select-none">Build here...</div>
        )}
      </div>
      {getPillMenuContent()}
    </div>
  )
}

function DatapillComponent({ mode, content, onUpdate, onDelete, isInDeleteMode, patternDatpillNames }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  // Parse content (e.g., "choice|store|garage" or "capture|number")
  const parts = content.split('|')
  const type = parts[0]

  const getLabelForDatapill = () => {
    if (type === 'choice') return parts.slice(2).filter(Boolean).length > 0 ? parts.slice(2).join(' / ') : '(empty)'
    if (type === 'capture') return parts[1] === 'number' ? '🔢' : parts[1] === 'wildcard' ? '❋' : '📝'
    return type
  }

  // Check if there's anything to configure in the menu
  const hasMenuContent = mode === 'pattern' || type === 'choice' || type === 'capture'

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => hasMenuContent && setShowMenu(!showMenu)}
        className={`px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 transition-all ${
          isInDeleteMode
            ? 'bg-red-900/40 border border-red-700/60 text-red-400'
            : type === 'choice'
            ? 'bg-teal-900/30 border border-teal-700/60 text-teal-400 hover:bg-teal-900/50'
            : type === 'capture'
            ? 'bg-purple-900/30 border border-purple-700/60 text-purple-400 hover:bg-purple-900/50'
            : 'bg-yellow-900/30 border border-yellow-700/60 text-yellow-400 hover:bg-yellow-900/50'
        }`}
      >
        {getLabelForDatapill()}
        {isInDeleteMode && <span className="text-xs ml-1">×</span>}
        {!isInDeleteMode && hasMenuContent && <ChevronDown size={11} />}
      </button>

      {showMenu && hasMenuContent && (
        <div
          className="absolute top-full mt-1 left-0 p-2 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 min-w-48 space-y-2"
          onMouseLeave={() => setShowMenu(false)}
        >
          {type === 'choice' && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-twitch-muted block">Options:</label>
                <textarea
                  value={parts.slice(2).join('\n')}
                  onChange={e => onUpdate(`choice|${parts[1]}|${e.target.value.split('\n').join('|')}`)}
                  rows={2}
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text resize-none"
                />
              </div>
              {mode === 'pattern' && (
                <div>
                  <label className="text-xs text-twitch-muted block mb-1">Name:</label>
                  <input
                    value={parts[1] || ''}
                    onChange={e => onUpdate(`choice|${e.target.value}|${parts.slice(2).join('|')}`)}
                    placeholder="e.g. location"
                    className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
                  />
                </div>
              )}
              {mode === 'pattern' && (
                <button
                  onClick={() => onUpdate(`capture|text|${parts[1]}`)}
                  className="w-full text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text"
                >
                  Switch to capture
                </button>
              )}
            </>
          )}

          {type === 'capture' && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-twitch-muted block">Capture type:</label>
                <select
                  value={parts[1]}
                  onChange={e => onUpdate(`capture|${e.target.value}|${parts[2] || ''}`)}
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
                >
                  <option value="text">Text (word)</option>
                  <option value="number">Number</option>
                  <option value="wildcard">Wildcard</option>
                </select>
              </div>
              {mode === 'pattern' && (
                <div>
                  <label className="text-xs text-twitch-muted block mb-1">Name:</label>
                  <input
                    value={parts[2] || ''}
                    onChange={e => onUpdate(`capture|${parts[1]}|${e.target.value}`)}
                    placeholder="e.g. days_ago"
                    className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text"
                  />
                </div>
              )}
              {mode === 'pattern' && (
                <button
                  onClick={() => onUpdate(`choice||${parts[2] || ''}`)}
                  className="w-full text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text"
                >
                  Switch to choice
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── ResponseEditor (uses DatapillEditor) ────────────────────────────────────

function ResponseEditor({ template, onUpdate, patternVars, triggerPattern, isAnnouncement }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Extract pattern datapill names from pattern
  const patternDatpillNames = {}
  if (triggerPattern) {
    const datapills = triggerPattern.match(/@\{[^}]+\}/g) || []
    datapills.forEach((pill) => {
      const content = pill.slice(2, -1)
      const parts = content.split('|')
      if (parts[0] === 'choice' && parts[1]) {
        patternDatpillNames[parts[1]] = 'choice'
      }
      if (parts[0] === 'capture' && parts[2]) {
        patternDatpillNames[parts[2]] = 'capture'
      }
    })
  }

  const baseVars = [
    { name: 'user', label: '@user' },
    { name: 'display_name', label: 'Name' },
    { name: 'message', label: 'Message' },
  ]

  const advancedVars = [
    { name: 'channel', label: 'Channel' },
    { name: 'followage', label: "Sender's followage" },
  ]

  const insertVar = (varName) => {
    const current = template || ''
    onUpdate(current + (current ? ' ' : '') + `@{${varName}}`)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-twitch-muted text-xs">Click to insert variables:</label>
        <div className="flex flex-wrap gap-1.5">
          {baseVars.map(v => (
            <button key={v.name} onClick={() => insertVar(v.name)} className="text-xs px-2 py-1 rounded border border-teal-700/60 bg-teal-900/20 text-teal-400 hover:bg-teal-900/40">
              {v.label}
            </button>
          ))}
          {!showAdvanced && (
            <button onClick={() => setShowAdvanced(true)} className="text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text">
              More...
            </button>
          )}
        </div>
        {showAdvanced && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {advancedVars.map(v => (
              <button key={v.name} onClick={() => insertVar(v.name)} className="text-xs px-2 py-1 rounded border border-blue-700/60 bg-blue-900/20 text-blue-400 hover:bg-blue-900/40">
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <DatapillEditor mode="response" value={template} onChange={onUpdate} patternDatpillNames={patternDatpillNames} />
    </div>
  )
}

// ── PatternEditor (uses DatapillEditor) ──────────────────────────────────────

function PatternEditor({ pattern, onUpdate }) {
  const insertDatapill = (type) => {
    const additions = {
      choice: 'choice||option1|option2',
      capture_text: 'capture|text|',
      capture_number: 'capture|number|',
      capture_wildcard: 'capture|wildcard|',
    }
    const current = pattern || ''
    onUpdate(current + (current ? ' ' : '') + `@{${additions[type]}}`)
  }

  return (
    <div className="space-y-3">
      <label className="text-twitch-muted text-xs block">Build your pattern — datapills capture or choose from message text:</label>
      <DatapillEditor
        mode="pattern"
        value={pattern}
        onChange={onUpdate}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-twitch-muted text-xs">Insert:</span>
        <button onClick={() => insertDatapill('choice')} className="text-xs px-2 py-1 rounded bg-teal-900/30 border border-teal-700/60 text-teal-400 hover:bg-teal-900/50">Choice</button>
        <button onClick={() => insertDatapill('capture_text')} className="text-xs px-2 py-1 rounded bg-purple-900/30 border border-purple-700/60 text-purple-400 hover:bg-purple-900/50">Text</button>
        <button onClick={() => insertDatapill('capture_number')} className="text-xs px-2 py-1 rounded bg-purple-900/30 border border-purple-700/60 text-purple-400 hover:bg-purple-900/50">Number</button>
        <button onClick={() => insertDatapill('capture_wildcard')} className="text-xs px-2 py-1 rounded bg-purple-900/30 border border-purple-700/60 text-purple-400 hover:bg-purple-900/50">Wildcard</button>
      </div>
    </div>
  )
}

// ── OLD CODE (keeping TemplateSegment for reference)

function TemplateSegmentOld({ segment, onUpdate, onInsertAfter, index }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  if (segment.type === 'text') {
    return (
      <div className="inline-flex items-center gap-0.5 relative">
        <input
          value={segment.value}
          onChange={e => onUpdate({ ...segment, value: e.target.value })}
          placeholder="type..."
          className="bg-transparent text-twitch-text text-sm focus:outline-none focus:bg-twitch-surface/50 px-1 rounded border border-transparent focus:border-teal-600 inline-flex"
          style={{ minWidth: `${Math.max(40, (segment.value?.length || 4) * 8)}px` }}
        />
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-1.5 py-0.5 text-xs rounded bg-teal-900/20 border border-teal-700/50 text-teal-400 hover:bg-teal-900/30 transition-colors shrink-0"
        >
          +
        </button>
        {showMenu && (
          <div className="absolute top-full mt-1 left-0 p-1 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 space-y-1 min-w-32">
            <button onClick={() => { onInsertAfter(emptyChoice()); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-surface text-twitch-text">Choose one</button>
            <button onClick={() => { onInsertAfter(emptyCapture('text')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-surface text-twitch-text">Capture text</button>
            <button onClick={() => { onInsertAfter(emptyCapture('number')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-surface text-twitch-text">Capture number</button>
            <button onClick={() => { onInsertAfter(emptyCapture('wildcard')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-surface text-twitch-text">Wildcard (*)</button>
          </div>
        )}
      </div>
    )
  }

  if (segment.type === 'choice') {
    return (
      <div className="inline-block relative">
        <button
          onClick={() => setShowEdit(!showEdit)}
          className="px-2 py-0.5 rounded bg-teal-900/30 border border-teal-700/60 text-teal-400 text-xs inline-flex items-center gap-1 hover:bg-teal-900/50 transition-colors"
        >
          {segment.options?.filter(Boolean).join(' / ') || 'choose'}
          <ChevronDown size={10} />
        </button>
        {showEdit && (
          <div className="absolute top-full mt-1 left-0 p-2 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 min-w-48 space-y-2">
            <label className="text-xs text-twitch-muted block">Options (one per line):</label>
            <textarea
              value={(segment.options ?? []).join('\n')}
              onChange={e => onUpdate({ ...segment, options: e.target.value.split('\n').map(s => s.trim()) })}
              placeholder="store\ngarage\nhouse"
              rows={3}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600 resize-none"
            />
            <input
              value={segment.paramName || ''}
              onChange={e => onUpdate({ ...segment, paramName: e.target.value })}
              placeholder="Variable name (optional)"
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600"
            />
          </div>
        )}
      </div>
    )
  }

  if (segment.type === 'capture') {
    const label = segment.captureType === 'number' ? '🔢' : segment.captureType === 'wildcard' ? '*' : '📝'
    return (
      <div className="inline-block relative">
        <button
          onClick={() => setShowEdit(!showEdit)}
          className="px-2 py-0.5 rounded bg-purple-900/30 border border-purple-700/60 text-purple-400 text-xs inline-flex items-center gap-1 hover:bg-purple-900/50 transition-colors"
        >
          {label} <ChevronDown size={10} />
        </button>
        {showEdit && (
          <div className="absolute top-full mt-1 left-0 p-2 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 min-w-40 space-y-2">
            <label className="text-xs text-twitch-muted block">Type:</label>
            <select
              value={segment.captureType}
              onChange={e => onUpdate({ ...segment, captureType: e.target.value })}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600"
            >
              <option value="text">Text (word)</option>
              <option value="number">Number</option>
              <option value="wildcard">Wildcard</option>
            </select>
            <input
              value={segment.paramName || ''}
              onChange={e => onUpdate({ ...segment, paramName: e.target.value })}
              placeholder="Variable name"
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600"
            />
          </div>
        )}
      </div>
    )
  }

  return null
}

// ── OLD CODE (keeping ConditionBlock for reference during transition)

function ConditionBlockOld({ block, onChange, onRemove, canRemove }) {
  const [expanded, setExpanded] = useState(false)

  function patch(k, v) { onChange({ ...block, [k]: v }) }

  function toggleListMode() {
    if (block.valueMode === 'single') {
      onChange({ ...block, valueMode: 'list', values: block.value ? [block.value] : [''], value: '' })
    } else {
      onChange({ ...block, valueMode: 'single', value: block.values[0] ?? '' })
    }
  }

  const isText = ['contains','starts_with','ends_with','exact','word','wildcard'].includes(block.type)
  const typeLabel = block.type === 'contains' ? 'Contains' :
                    block.type === 'starts_with' ? 'Starts with' :
                    block.type === 'ends_with' ? 'Ends with' :
                    block.type === 'exact' ? 'Exact' :
                    block.type === 'word' ? 'Has word' :
                    block.type === 'wildcard' ? 'Wildcard' :
                    block.type === 'length' ? 'Length' :
                    block.type === 'user_level' ? 'User is' : 'User in list'

  const displayValue = isText && block.valueMode === 'list'
    ? `${block.values.length} value${block.values.length !== 1 ? 's' : ''}`
    : block.type === 'user_in_list'
    ? `${(block.users ?? '').split('\n').filter(Boolean).length} users`
    : block.value || '(empty)'

  return (
    <div>
      {/* Compact inline chip */}
      <button onClick={() => setExpanded(!expanded)}
        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors inline-flex items-center gap-2 ${
          block.negate
            ? 'bg-red-900/20 border-red-800/60 text-red-400 hover:bg-red-900/30'
            : expanded
            ? 'bg-teal-900/30 border-teal-600 text-teal-400 hover:bg-teal-900/50'
            : 'bg-twitch-surface border-twitch-border text-twitch-text hover:border-teal-600 hover:text-teal-400'
        }`}>
        {block.negate && <span className="text-xs font-bold">NOT</span>}
        <span className="text-xs text-twitch-muted">{typeLabel}:</span>
        <span className="font-mono text-sm">{displayValue}</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Expanded options panel */}
      {expanded && (
        <div className="mt-1.5 p-3 bg-twitch-dark border border-twitch-border rounded-lg space-y-3 mb-2">

          {/* Type selector */}
          <div className="space-y-1">
            <label className="text-twitch-muted text-xs">Type</label>
            <select value={block.type} onChange={e => patch('type', e.target.value)}
              className="w-full bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600">
              <optgroup label="Text">
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="ends_with">Ends with</option>
                <option value="exact">Exact match</option>
                <option value="word">Has word</option>
                <option value="wildcard">Wildcard (*)</option>
              </optgroup>
              <optgroup label="Message">
                <option value="length">Length</option>
              </optgroup>
              <optgroup label="User">
                <option value="user_level">User is</option>
                <option value="user_in_list">User in list</option>
              </optgroup>
            </select>
          </div>

          {/* Value input for text types */}
          {isText && block.valueMode === 'single' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Text to match</label>
              <input value={block.value} onChange={e => patch('value', e.target.value)}
                placeholder={block.type === 'wildcard' ? 'e.g. I * got shiny' : 'Enter text...'}
                className="w-full bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
            </div>
          )}

          {/* Length selector */}
          {block.type === 'length' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Message length</label>
              <div className="flex items-center gap-2">
                <select value={block.operator ?? 'gt'} onChange={e => patch('operator', e.target.value)}
                  className="flex-1 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600">
                  <option value="gt">More than</option>
                  <option value="lt">Less than</option>
                  <option value="eq">Exactly</option>
                </select>
                <input type="number" min={0} value={block.value} onChange={e => patch('value', e.target.value)}
                  className="w-20 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
                <span className="text-twitch-muted text-xs">chars</span>
              </div>
            </div>
          )}

          {/* User level selector */}
          {block.type === 'user_level' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">User type</label>
              <select value={block.userLevel ?? 'anyone'} onChange={e => patch('userLevel', e.target.value)}
                className="w-full bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600">
                {USER_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}

          {/* User list input */}
          {block.type === 'user_in_list' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Usernames (one per line)</label>
              <textarea value={block.users ?? ''} onChange={e => patch('users', e.target.value)}
                rows={2} placeholder="username1\nusername2"
                className="w-full bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-xs font-mono focus:outline-none focus:border-teal-600 resize-none" />
            </div>
          )}

          {/* Position selector (only for "contains") */}
          {block.type === 'contains' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Match position in message</label>
              <div className="flex items-center gap-2">
                <button onClick={() => { patch('anchorStart', false); patch('anchorEnd', false) }}
                  className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${!block.anchorStart && !block.anchorEnd ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'}`}>
                  Anywhere
                </button>
                <button onClick={() => { patch('anchorStart', true); patch('anchorEnd', false) }}
                  className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${block.anchorStart && !block.anchorEnd ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'}`}>
                  Start
                </button>
                <button onClick={() => { patch('anchorStart', false); patch('anchorEnd', true) }}
                  className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${!block.anchorStart && block.anchorEnd ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'}`}>
                  End
                </button>
              </div>
            </div>
          )}

          {/* Case sensitivity toggle */}
          {isText && (
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => patch('caseSensitive', !block.caseSensitive)}
                className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${block.caseSensitive ? 'bg-teal-500' : 'bg-twitch-border'}`}>
                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all" style={{ left: block.caseSensitive ? '18px' : '2px' }} />
              </button>
              <span className="text-twitch-muted text-xs">Match case (uppercase/lowercase)</span>
            </label>
          )}

          {/* Multiple values toggle */}
          {isText && (
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={toggleListMode}
                className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${block.valueMode === 'list' ? 'bg-teal-500' : 'bg-twitch-border'}`}>
                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all" style={{ left: block.valueMode === 'list' ? '18px' : '2px' }} />
              </button>
              <span className="text-twitch-muted text-xs">Match any of multiple values (OR)</span>
            </label>
          )}

          {/* Values list editor */}
          {isText && block.valueMode === 'list' && (
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Values</label>
              <div className="space-y-1">
                {block.values.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={v} onChange={e => { const next = [...block.values]; next[i] = e.target.value; patch('values', next) }}
                      placeholder="Value..."
                      className="flex-1 bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text text-xs focus:outline-none focus:border-teal-600" />
                    <button onClick={() => patch('values', block.values.filter((_, j) => j !== i))}
                      className="text-twitch-border hover:text-red-400 transition-colors"><X size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => patch('values', [...block.values, ''])}
                className="text-teal-500 hover:text-teal-400 text-xs flex items-center gap-1 mt-1">
                <Plus size={10} /> Add value
              </button>
            </div>
          )}

          {/* NOT toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <button type="button" onClick={() => patch('negate', !block.negate)}
              className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${block.negate ? 'bg-red-500' : 'bg-twitch-border'}`}>
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all" style={{ left: block.negate ? '18px' : '2px' }} />
            </button>
            <span className="text-twitch-muted text-xs">Invert (NOT) — match the opposite</span>
          </label>

          {/* Delete button */}
          {canRemove && (
            <button onClick={() => { setExpanded(false); onRemove() }}
              className="w-full text-red-400 hover:text-red-300 text-xs py-1.5 transition-colors border-t border-twitch-border pt-3">
              Delete this condition
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Block connector (AND / OR) ────────────────────────────────────────────────

function BlockConnector({ connector, onChange }) {
  return (
    <div className="flex items-center gap-2 py-0.5 ml-1">
      <button onClick={() => onChange(connector === 'and' ? 'or' : 'and')}
        className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors border ${
          connector === 'or'
            ? 'bg-purple-900/30 border-purple-600 text-purple-400 hover:bg-purple-900/50'
            : 'bg-twitch-surface border-twitch-border text-twitch-muted hover:border-teal-600 hover:text-teal-400'
        }`}>
        {connector.toUpperCase()}
      </button>
    </div>
  )
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({ action, onChange, onRemove, canRemove, hasBot, triggerPattern }) {
  function patch(k, v) { onChange({ ...action, [k]: v }) }
  const isAnnouncement = action.type === 'send_announcement'
  const patternVars = extractPatternVars(triggerPattern)

  return (
    <div className={`border rounded-xl overflow-hidden ${isAnnouncement ? 'border-teal-700/50' : 'border-twitch-border'}`}>
      {/* Header row: message vs announcement selector */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-twitch-border ${isAnnouncement ? 'bg-teal-900/20' : 'bg-twitch-surface'}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-twitch-dark rounded-lg p-0.5">
            <button onClick={() => patch('type', 'send_message')}
              className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${action.type === 'send_message' ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
              Chat message
            </button>
            <button onClick={() => patch('type', 'send_announcement')}
              className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${isAnnouncement ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
              <Megaphone size={11} /> Announcement
            </button>
          </div>
          {isAnnouncement && (
            <div className="flex items-center gap-1.5 ml-1">
              {ANNOUNCEMENT_COLORS.map(c => (
                <button key={c.value} onClick={() => patch('announcementColor', c.value)} title={c.label}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${action.announcementColor === c.value ? 'border-white scale-125' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c.color }} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasBot && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <button type="button" onClick={() => patch('useBot', !action.useBot)}
                className={`w-7 h-3.5 rounded-full relative transition-colors ${action.useBot ? 'bg-teal-500' : 'bg-twitch-border'}`}>
                <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all"
                  style={{ left: action.useBot ? '14px' : '2px' }} />
              </button>
              <Bot size={12} className="text-twitch-muted" />
              <span className="text-twitch-muted text-xs">Bot</span>
            </label>
          )}
          {canRemove && (
            <button onClick={onRemove} className="text-twitch-muted hover:text-red-400 text-xs transition-colors">Remove</button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 bg-twitch-dark">
        <ResponseEditor
          template={action.template}
          onUpdate={template => patch('template', template)}
          triggerPattern={triggerPattern}
          isAnnouncement={isAnnouncement}
        />

        <div className="flex items-center gap-2">
          <label className="text-twitch-muted text-xs">Delay</label>
          <input type="number" min={0} max={300} value={action.delay ?? 0} onChange={e => patch('delay', Number(e.target.value))}
            className="w-16 bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text text-xs focus:outline-none focus:border-teal-600" />
          <span className="text-twitch-muted text-xs">seconds</span>
        </div>
      </div>
    </div>
  )
}

// ── ParamRow ──────────────────────────────────────────────────────────────────

function ParamRow({ param, onChange, onRemove }) {
  function patch(k, v) { onChange({ ...param, [k]: v }) }
  return (
    <div className="flex items-center gap-2 flex-wrap p-2 bg-twitch-dark border border-twitch-border rounded-lg">
      <button onClick={() => patch('optional', !param.optional)}
        className={`shrink-0 text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
          param.optional
            ? 'border-dashed border-twitch-muted text-twitch-muted hover:border-teal-600 hover:text-teal-400'
            : 'bg-teal-900/30 border-teal-600 text-teal-400 hover:bg-twitch-dark'
        }`}>
        {param.optional ? 'optional' : 'required'}
      </button>

      <input value={param.name}
        onChange={e => patch('name', e.target.value.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, ''))}
        placeholder="param_name"
        className="flex-1 min-w-24 font-mono bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text text-xs focus:outline-none focus:border-teal-600" />

      <select value={param.paramType ?? 'text'} onChange={e => patch('paramType', e.target.value)}
        className="bg-twitch-surface border border-twitch-border rounded px-1.5 py-1 text-twitch-muted text-xs focus:outline-none focus:border-teal-600">
        <option value="text">Text</option>
        <option value="number">Number</option>
      </select>

      {param.optional && (
        <input value={param.defaultValue ?? ''} onChange={e => patch('defaultValue', e.target.value)}
          placeholder="Default (e.g. {user})"
          className="flex-1 min-w-28 font-mono bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text text-xs focus:outline-none focus:border-teal-600" />
      )}

      <button onClick={onRemove} className="text-twitch-muted hover:text-red-400 transition-colors shrink-0">
        <X size={12} />
      </button>
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────────────────

export default function ChatTriggerEditor() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isNew = !id

  const [trigger, setTrigger] = useState(emptyTrigger())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [hasBot, setHasBot] = useState(false)
  const [testText, setTestText] = useState('')
  const [testUsername, setTestUsername] = useState('')
  const [testResults, setTestResults] = useState(null)
  const [toast, setToast] = useState(null)
  const optToastShown = useRef(false)

  useEffect(() => {
    window.api.chatTriggers.getBotAccount().then(r => { if (r.ok && r.data) setHasBot(true) })
    if (!isNew) {
      window.api.chatTriggers.list().then(res => {
        if (res.ok) {
          const found = res.data.find(t => t.id === id)
          if (found) {
            if (!found.pattern) found.pattern = migrateToPattern(found.conditions, found.blocks, found.template, found.pattern)
            found.commandParams = (found.commandParams ?? []).map(p => ({
              paramType: 'text', defaultValue: '', ...p,
            }))
            setTrigger(found)
          }
        }
        setLoading(false)
      })
    }
  }, [id, isNew])

  function patch(k, v) { setTrigger(t => ({ ...t, [k]: v })) }

  // pattern
  function updatePattern(newPattern) { patch('pattern', newPattern) }
  function insertChip(chipType) {
    const current = trigger.pattern || ''
    let chip = ''
    if (chipType === 'choice') chip = '[option1|option2]'
    else if (chipType === 'number') chip = '{number}'
    else if (chipType === 'text') chip = '{text}'
    else if (chipType === 'wildcard') chip = '{wildcard}'
    updatePattern(current + chip)
  }

  // params
  function addParam() { patch('commandParams', [...(trigger.commandParams ?? []), emptyParam()]) }
  function removeParam(pid) { patch('commandParams', trigger.commandParams.filter(p => p.id !== pid)) }
  function updateParam(pid, updated) {
    let params = trigger.commandParams.map(p => p.id === pid ? updated : p)
    if (updated.optional) {
      const required = params.filter(p => !p.optional)
      const optional = params.filter(p => p.optional)
      const moved = required.length !== params.filter((p, i) => !p.optional && i < params.findIndex(q => q.optional)).length
      params = [...required, ...optional]
      if (!optToastShown.current && moved) {
        optToastShown.current = true
        setToast('Optional parameters moved to the end automatically.')
        setTimeout(() => setToast(null), 3000)
      }
    }
    patch('commandParams', params)
  }

  // actions
  function addAction() { patch('actions', [...trigger.actions, emptyAction()]) }
  function updateAction(aid, updated) { patch('actions', trigger.actions.map(a => a.id === aid ? updated : a)) }
  function removeAction(aid) { patch('actions', trigger.actions.filter(a => a.id !== aid)) }

  async function handleSave() {
    if (!trigger.name.trim()) return
    setSaving(true)
    const toSave = {
      ...trigger,
      pattern: trigger.type === 'message' ? (trigger.pattern ?? '') : undefined,
    }
    const res = isNew
      ? await window.api.chatTriggers.create(toSave)
      : await window.api.chatTriggers.update(id, toSave)
    setSaving(false)
    if (res.ok) navigate('/chat-triggers')
  }

  async function runTest() {
    const res = await window.api.chatTriggers.testMessage(testText, testUsername)
    if (res.ok) setTestResults(res.data)
  }

  const commandParamNames = (trigger.commandParams ?? []).map(p => p.name).filter(Boolean)

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader size={20} className="animate-spin text-twitch-muted" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-twitch-surface border border-teal-600 text-twitch-text text-sm rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-twitch-border shrink-0">
        <button onClick={() => navigate('/chat-triggers')} className="text-twitch-muted hover:text-twitch-text transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-twitch-text font-semibold">{isNew ? 'New Trigger' : 'Edit Trigger'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Name + enabled */}
        <div className="flex items-center gap-3">
          <input value={trigger.name} onChange={e => patch('name', e.target.value)}
            placeholder="Trigger name..."
            className="flex-1 bg-twitch-surface border border-twitch-border rounded-lg px-3 py-2 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <button type="button" onClick={() => patch('enabled', !trigger.enabled)}
              className={`w-9 h-5 rounded-full relative transition-colors ${trigger.enabled ? 'bg-teal-500' : 'bg-twitch-border'}`}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: trigger.enabled ? '18px' : '2px' }} />
            </button>
            <span className="text-twitch-muted text-xs">{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>

        {/* Type */}
        <div className="flex items-center gap-0.5 bg-twitch-dark rounded-xl p-1 w-fit">
          {[{ value: 'message', label: '# Chat message' }, { value: 'command', label: '! Command' }].map(opt => (
            <button key={opt.value} onClick={() => patch('type', opt.value)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                trigger.type === opt.value
                  ? 'bg-teal-900/30 border-teal-600 text-teal-300'
                  : 'bg-twitch-surface border-twitch-border text-twitch-muted hover:border-twitch-muted'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Command config */}
        {trigger.type === 'command' && (
          <section className="space-y-4 p-4 bg-twitch-surface border border-twitch-border rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-twitch-muted font-mono shrink-0">!</span>
              <input value={(trigger.command ?? '').replace(/^!/, '')}
                onChange={e => patch('command', '!' + e.target.value.replace(/^!+/, ''))}
                placeholder="command"
                className="flex-1 font-mono bg-twitch-dark border border-twitch-border rounded-lg px-3 py-2 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
            </div>

            {/* Params */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-twitch-muted text-xs">Parameters</label>
                <button onClick={addParam} className="text-teal-500 hover:text-teal-400 text-xs flex items-center gap-1">
                  <Plus size={11} /> Add parameter
                </button>
              </div>

              {(trigger.commandParams ?? []).length > 0 && (
                <div className="space-y-2">
                  {/* Preview */}
                  <div className="flex items-center gap-1 font-mono text-sm px-3 py-2 bg-twitch-dark rounded-lg border border-twitch-border flex-wrap">
                    <span className="text-teal-400">{trigger.command || '!command'}</span>
                    {(trigger.commandParams ?? []).map(p => (
                      <span key={p.id} className={p.optional ? 'text-twitch-muted' : 'text-twitch-text'}>
                        {p.optional ? ` [${p.name || 'param'}]` : ` <${p.name || 'param'}>`}
                      </span>
                    ))}
                  </div>
                  {(trigger.commandParams ?? []).map(p => (
                    <ParamRow key={p.id} param={p}
                      onChange={updated => updateParam(p.id, updated)}
                      onRemove={() => removeParam(p.id)} />
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => patch('allowExtraText', !trigger.allowExtraText)}
                className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${trigger.allowExtraText ? 'bg-teal-500' : 'bg-twitch-border'}`}>
                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                  style={{ left: trigger.allowExtraText ? '18px' : '2px' }} />
              </button>
              <span className="text-twitch-muted text-xs">Allow extra text after parameters</span>
            </label>

            <p className="text-twitch-muted text-xs flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              Use <code className="font-mono text-teal-400">{'{param_name}'}</code> in your response to insert a parameter's value.
              Optional params can have a default — e.g. set default to <code className="font-mono text-teal-400">{'{user}'}</code> to fall back to the sender.
            </p>
          </section>
        )}

        {/* Pattern editor */}
        {trigger.type === 'message' && (
          <section className="space-y-2 p-4 bg-twitch-surface border border-twitch-border rounded-xl">
            <h2 className="text-twitch-text text-sm font-medium">When a message...</h2>
            <PatternEditor pattern={trigger.pattern} onUpdate={newPattern => updatePattern(newPattern)} />
          </section>
        )}

        {/* Response actions */}
        <section className="space-y-2">
          <h2 className="text-twitch-text text-sm font-medium">Respond with</h2>
          {trigger.actions.map(action => (
            <ActionRow key={action.id} action={action}
              onChange={updated => updateAction(action.id, updated)}
              onRemove={() => removeAction(action.id)}
              canRemove={trigger.actions.length > 1}
              hasBot={hasBot}
              triggerPattern={trigger.type === 'message' ? trigger.pattern : undefined} />
          ))}
          <button onClick={addAction} className="flex items-center gap-1.5 mt-2 text-teal-500 hover:text-teal-400 text-sm transition-colors">
            <Plus size={13} /> Add another response
          </button>
        </section>

        {/* Cooldowns */}
        <section className="space-y-3 p-4 bg-twitch-surface border border-twitch-border rounded-xl">
          <h2 className="text-twitch-text text-sm font-medium">Cooldowns</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'cooldown', label: 'Global cooldown', desc: 'How long before anyone can trigger it again.' },
              { key: 'userCooldown', label: 'Per-user cooldown', desc: 'How long before each user can trigger it again.' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="space-y-1">
                <label className="text-twitch-muted text-xs">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={3600} value={trigger[key]}
                    onChange={e => patch(key, Number(e.target.value))}
                    className="w-20 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
                  <span className="text-twitch-muted text-xs">seconds</span>
                </div>
                <p className="text-twitch-muted text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Test panel */}
        {!isNew && (
          <section className="space-y-2 p-4 bg-twitch-surface border border-twitch-border rounded-xl">
            <h2 className="text-twitch-text text-sm font-medium">Test</h2>
            <div className="flex items-center gap-2">
              <input value={testText} onChange={e => setTestText(e.target.value)} placeholder="Test message..."
                className="flex-1 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
              <input value={testUsername} onChange={e => setTestUsername(e.target.value)} placeholder="username"
                className="w-28 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-muted text-sm focus:outline-none focus:border-teal-600" />
              <button onClick={runTest} className="bg-teal-700 hover:bg-teal-600 text-white text-sm px-3 py-1.5 rounded transition-colors">Test</button>
            </div>
            {testResults && testResults.map(r => r.id === id && (
              <div key={r.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${r.matches ? 'bg-teal-900/30 text-teal-400' : 'bg-red-900/20 text-red-400'}`}>
                {r.matches ? '✓ Would fire' : '✕ Would not fire'}
              </div>
            ))}
          </section>
        )}

        {/* Save / Cancel */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <button onClick={handleSave} disabled={saving || !trigger.name.trim()}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors">
            {saving && <Loader size={13} className="animate-spin" />}
            {saving ? 'Saving...' : isNew ? 'Create trigger' : 'Save changes'}
          </button>
          <button onClick={() => navigate('/chat-triggers')}
            className="bg-twitch-surface border border-twitch-border hover:bg-twitch-border text-twitch-muted text-sm px-4 py-2 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
