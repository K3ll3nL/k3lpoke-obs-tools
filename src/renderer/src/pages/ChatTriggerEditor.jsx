import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, X, ArrowLeft, Loader, Info, ChevronDown, ChevronUp,
  Bot, Megaphone, AlertTriangle, Dice6, Music, FileText, Eye,
  Percent, Clock, MessageSquare, Filter, Shuffle, ArrowUp, ArrowDown,
  Radio, Terminal, Zap,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

function emptySegment(type = 'text') { return { id: uid(), type, value: '' } }
function emptyChoice() { return { id: uid(), type: 'choice', paramName: '', options: ['', ''] } }
function emptyCapture(captureType = 'text') { return { id: uid(), type: 'capture', captureType, paramName: '' } }
function emptyParam() { return { id: uid(), name: '', optional: false, paramType: 'text', defaultValue: '' } }

function emptyAction() {
  return { id: uid(), type: 'send_chat_response', responseMode: 'message', template: '', announcementColor: 'primary', useBot: false, delay: 0, lineMode: 'file', lines: [] }
}

function emptyCondition(type) {
  const base = { id: uid(), type }
  switch (type) {
    case 'user_role':      return { ...base, roles: [] }
    case 'language_filter': return { ...base, mode: 'require', words: [], ignoreSpaces: false, ignorePunct: false }
    case 'random':         return { ...base, weight: 1 }
    default:               return base
  }
}

function emptyConsideration(type) {
  const base = { id: uid(), type, enabled: true }
  switch (type) {
    case 'chance':          return { ...base, percent: 100 }
    case 'language_filter': return { ...base, mode: 'require', words: [], ignoreSpaces: false, ignorePunct: false }
    case 'wait':            return { ...base, seconds: 0 }
    case 'chat_activity':   return { ...base, messageCount: 5 }
    case 'obs_source':      return { ...base, source: '', scene: null, state: 'visible', onFail: 'cancel' }
    default:                return base
  }
}

function emptyActivation() {
  return {
    mode: 'manual',
    logic: 'and',
    conditions: { whenLive: false, gameCategories: [], titleContains: [] },
    currentOverride: null,
  }
}

function emptyTrigger() {
  const respId = uid()
  return {
    name: '', enabled: true, type: 'message',
    command: '', commandParams: [], allowExtraText: true,
    pattern: '',
    conditions: [],
    responses: [{ id: respId, actions: [emptyAction()] }],
    routing: [],
    considerations: [],
    cooldown: 0, userCooldown: 0,
    activation: emptyActivation(),
  }
}

function migrateToTemplate(conditions, blocks) {
  if (Array.isArray(conditions) || Array.isArray(blocks)) return [emptySegment('text')]
  return [emptySegment('text')]
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

const CONSIDERATION_META = {
  chance:          { label: 'Only run sometimes',   icon: Percent,       color: 'amber' },
  language_filter: { label: 'Language filter',       icon: Filter,        color: 'blue' },
  wait:            { label: 'Wait a while',          icon: Clock,         color: 'purple' },
  chat_activity:   { label: 'Is chat moving?',       icon: MessageSquare, color: 'teal' },
  obs_source:      { label: 'OBS source state',      icon: Eye,           color: 'blue' },
}

const COLOR_CLASSES = {
  amber:  { chip: 'bg-amber-900/20 border-amber-700/50 text-amber-400',  dot: 'bg-amber-400' },
  blue:   { chip: 'bg-blue-900/20 border-blue-700/50 text-blue-400',    dot: 'bg-blue-400' },
  purple: { chip: 'bg-purple-900/20 border-purple-700/50 text-purple-400', dot: 'bg-purple-400' },
  teal:   { chip: 'bg-teal-900/20 border-teal-700/50 text-teal-400',    dot: 'bg-teal-400' },
  rose:   { chip: 'bg-rose-900/20 border-rose-700/50 text-rose-400',    dot: 'bg-rose-400' },
}

// ── UI Primitives ─────────────────────────────────────────────────────────────

const TOGGLE_SIZES = {
  sm: { outer: 'w-7 h-3.5',  thumb: 'w-2.5 h-2.5', on: '14px', off: '2px' },
  md: { outer: 'w-8 h-4',   thumb: 'w-3 h-3',      on: '18px', off: '2px' },
  lg: { outer: 'w-9 h-5',   thumb: 'w-4 h-4',      on: '18px', off: '2px' },
}

function Toggle({ on, onChange, size = 'md', color = 'teal' }) {
  const s = TOGGLE_SIZES[size]
  const bg = on ? (color === 'red' ? 'bg-red-500' : 'bg-teal-500') : 'bg-twitch-border'
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`${s.outer} rounded-full relative transition-colors shrink-0 ${bg}`}>
      <span className={`absolute top-0.5 ${s.thumb} rounded-full bg-white shadow transition-all`}
        style={{ left: on ? s.on : s.off }} />
    </button>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <section className={`space-y-3 p-4 bg-twitch-surface border border-twitch-border rounded-xl ${className}`}>
      {title && <h2 className="text-twitch-text text-sm font-medium">{title}</h2>}
      {children}
    </section>
  )
}

function DurationInput({ value, onChange, preferenceKey }) {
  const hrs = Math.floor(value / 3600000)
  const mins = Math.floor((value % 3600000) / 60000)
  const secs = Math.floor((value % 60000) / 1000)
  const mils = value % 1000

  const num = v => v === '' ? 0 : Number(v) || 0
  const update = (h, m, s, ms) =>
    onChange((h || 0) * 3600000 + (m || 0) * 60000 + (s || 0) * 1000 + (ms || 0))

  // Determine which fields to show based on the highest unit with a value
  const maxUnit = hrs > 0 ? 'hrs' : mins > 0 ? 'mins' : secs > 0 ? 'secs' : 'mils'
  const showHrs = maxUnit === 'hrs' || hrs > 0
  const showMins = showHrs || mins > 0
  const showSecs = showMins || secs > 0
  const showMils = showSecs || mils > 0 || (hrs === 0 && mins === 0 && secs === 0)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {showHrs && (
        <div className="flex items-center gap-0.5">
          <input type="number" min={0} value={hrs || ''}
            onChange={e => update(num(e.target.value), mins, secs, mils)}
            placeholder="0"
            className="w-10 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden" />
          <span className="text-xs text-twitch-muted">h</span>
        </div>
      )}
      {showMins && (
        <div className="flex items-center gap-0.5">
          <input type="number" min={0} value={mins || ''}
            onChange={e => update(hrs, num(e.target.value), secs, mils)}
            placeholder="0"
            className="w-10 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden" />
          <span className="text-xs text-twitch-muted">m</span>
        </div>
      )}
      {showSecs && (
        <div className="flex items-center gap-0.5">
          <input type="number" min={0} value={secs || ''}
            onChange={e => update(hrs, mins, num(e.target.value), mils)}
            placeholder="0"
            className="w-10 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden" />
          <span className="text-xs text-twitch-muted">s</span>
        </div>
      )}
      {showMils && (
        <div className="flex items-center gap-0.5">
          <input type="number" min={0} value={mils || ''}
            onChange={e => update(hrs, mins, secs, num(e.target.value))}
            placeholder="0"
            className="w-10 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden" />
          <span className="text-xs text-twitch-muted">ms</span>
        </div>
      )}
    </div>
  )
}

function PercentInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={1} max={100} value={value}
        onChange={e => onChange(Math.min(100, Math.max(1, Number(e.target.value))))}
        className="w-16 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
      <span className="text-twitch-muted text-xs">%</span>
    </div>
  )
}

// ── DatapillEditor (true inline contentEditable editor) ─────────────────────

const PILL_COLORS = {
  sky:    'bg-sky-900/30 border-sky-700/60 text-sky-400 hover:bg-sky-900/50',
  teal:   'bg-teal-900/30 border-teal-700/60 text-teal-400 hover:bg-teal-900/50',
  violet: 'bg-violet-900/30 border-violet-700/60 text-violet-400 hover:bg-violet-900/50',
  amber:  'bg-amber-900/30 border-amber-700/60 text-amber-400 hover:bg-amber-900/50',
  orange: 'bg-orange-900/30 border-orange-700/60 text-orange-400 hover:bg-orange-900/50',
  rose:   'bg-rose-900/30 border-rose-700/60 text-rose-400 hover:bg-rose-900/50',
}

function seqPreview(decoded) {
  return decoded
    .replace(/@\{capture\|number\|[^}]*\}/g, '🔢')
    .replace(/@\{capture\|wildcard\|[^}]*\}/g, '✱')
    .replace(/@\{capture\|[^}]*\}/g, '📝')
    .replace(/@\{optional_capture\|number\|[^}]*\}/g, '(🔢?)')
    .replace(/@\{optional_capture\|[^}]*\}/g, '(📝?)')
    .replace(/@\{choice\|[^|]*\|([^}]*)\}/g, (_, o) => `[${o.split('|').filter(Boolean).join('/')}]`)
    .replace(/@\{optional_choice\|[^|]*\|([^}]*)\}/g, (_, o) => `([${o.split('|').filter(Boolean).join('/')}]?)`)
    .replace(/@\{optional\|([^}]*)\}/g, (_, w) => `(${w}?)`)
    .replace(/@\{anyof\|([^}]*)\}/g, (_, o) => `[${o.split('|').filter(Boolean).join('/')}]`)
    .replace(/@\{[^}]*\}/g, '…')
    .trim()
}

function getPillLabel(content) {
  const parts = content.split('|')
  const type = parts[0]
  if (type === 'seq') { const name = parts.length >= 3 ? parts[1] : ''; return name ? `{ ${name} }` : '{ sequence }' }
  if (type === 'choice') {
    const options = parts.slice(2).filter(Boolean)
      .map(o => { try { return decodeURIComponent(o) } catch { return o } })
      .map(o => seqPreview(o) || o)
    return options.length > 0 ? options.join(' / ') : '(empty)'
  }
  if (type === 'capture') { const ct = parts[1]; return ct === 'number' ? '🔢' : ct === 'wildcard' ? '❋' : '📝' }
  if (type === 'optional') return `(${parts.slice(1).join('|') || 'word'}?)`
  if (type === 'optional_capture') { const ct = parts[1]; const n = parts[2]; const icon = ct === 'number' ? '🔢' : '📝'; return n ? `(${icon} ${n}?)` : `(${icon}?)` }
  if (type === 'optional_choice') { const opts = parts.slice(2).filter(Boolean); return opts.length > 0 ? `(${opts.join('/')}?)` : '(choose?)' }
  if (type === 'optional_seq') { try { const p = seqPreview(decodeURIComponent(parts.slice(1).join('|'))); return p ? `(${p}?)` : '(seq?)' } catch { return '(seq?)' } }
  if (type === 'anyof') { const opts = parts.slice(1).filter(Boolean); return opts.length > 0 ? opts.join(' / ') : 'Any of…' }
  if (type === 'minletters') return `≥${parts[1] || '1'} letters`
  if (type === 'mindigits')  return `≥${parts[1] || '1'} numbers`
  if (type === 'msg_start')  return 'Message start'
  if (type === 'msg_end')    return 'Message end'
  return content
}

function makePillNode(content, colorOverride, onClickFn) {
  const pillType = content.split('|')[0]
  const colorKey = colorOverride ?? (
    pillType === 'capture' ? 'violet'
    : pillType === 'choice' ? 'teal'
    : pillType === 'optional' || pillType === 'optional_capture' || pillType === 'optional_choice' || pillType === 'optional_seq' ? 'rose'
    : pillType === 'seq' ? 'amber'
    : pillType === 'anyof' ? 'teal'
    : pillType === 'minletters' || pillType === 'mindigits' ? 'sky'
    : pillType === 'msg_start' || pillType === 'msg_end' ? 'amber'
    : 'violet'
  )
  const pill = document.createElement('button')
  pill.type = 'button'
  pill.className = `datapill inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${PILL_COLORS[colorKey]} whitespace-nowrap cursor-pointer transition-colors`
  pill.dataset.content = content
  pill.contentEditable = 'false'
  pill.textContent = getPillLabel(content)
  if (onClickFn) { pill.title = 'Click to edit'; pill.onclick = onClickFn }
  return pill
}

const DatapillEditor = forwardRef(function DatapillEditor({ mode, value, onChange, varColors = {}, onEnter, onBackspaceAtStart, onArrowUp, onArrowDown, onFocus, inputClassName }, ref) {
  const editorRef = useRef(null)
  const [deleteMode, setDeleteMode] = useState(null)
  const [selectedPillId, setSelectedPillId] = useState(null)
  const [pillMenuPos, setPillMenuPos] = useState(null)
  const isUpdatingRef = useRef(false)
  const savedRangeRef = useRef(null)
  const pendingCursorRef = useRef(null)
  const lastBackspaceRef = useRef(false)

  const getInsertOffset = (range) => {
    const editor = editorRef.current
    if (!editor || !range) return null
    let offset = 0
    for (let i = 0; i < editor.childNodes.length; i++) {
      const node = editor.childNodes[i]
      if (range.startContainer === editor && range.startOffset === i) break
      if (range.startContainer === node) { offset += range.startOffset; break }
      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent.length
      } else if (node.classList?.contains('datapill')) {
        offset += `@{${node.dataset.content}}`.length
      }
    }
    return offset
  }

  const positionCursorAtOffset = (targetOffset) => {
    const editor = editorRef.current
    if (!editor) return
    let offset = 0
    const sel = window.getSelection()
    const range = document.createRange()
    for (const node of editor.childNodes) {
      const nodeLen = node.nodeType === Node.TEXT_NODE
        ? node.textContent.length
        : node.classList?.contains('datapill') ? `@{${node.dataset.content}}`.length : 0
      if (offset + nodeLen >= targetOffset) {
        if (node.nodeType === Node.TEXT_NODE) {
          range.setStart(node, targetOffset - offset)
        } else {
          range.setStartAfter(node)
        }
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        editor.focus()
        return
      }
      offset += nodeLen
    }
    range.selectNodeContents(editor)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    editor.focus()
  }

  useImperativeHandle(ref, () => ({
    insertAtCursor(pillText) {
      const offset = getInsertOffset(savedRangeRef.current)
      const current = value || ''
      const newValue = offset !== null
        ? current.slice(0, offset) + pillText + current.slice(offset)
        : current + (current ? ' ' : '') + pillText
      pendingCursorRef.current = offset !== null ? offset + pillText.length : newValue.length
      savedRangeRef.current = null
      onChange(newValue)
    },
    focus() { editorRef.current?.focus() },
  }), [value, onChange])

  const updateValue = (newValue) => {
    onChange(newValue)
    setDeleteMode(null)
  }

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

  const handlePillClick = (pillEl, content) => {
    setSelectedPillId(content)
    const rect = pillEl.getBoundingClientRect()
    setPillMenuPos({ top: rect.bottom + 5, left: rect.left })
  }

  const syncDOMFromValue = () => {
    if (!editorRef.current || isUpdatingRef.current) return
    isUpdatingRef.current = true
    const currentSerialized = serializeDOM()
    if (currentSerialized === value) { isUpdatingRef.current = false; return }

    const fragment = document.createDocumentFragment()
    let i = 0
    const v = value || ''
    while (i < v.length) {
      if (v.slice(i, i + 2) === '@{') {
        const end = v.indexOf('}', i + 2)
        if (end === -1) { fragment.appendChild(document.createTextNode(v.slice(i))); break }
        const content = v.slice(i + 2, end)
        const colorOverride = varColors[content] ?? null
        const pill = makePillNode(content, colorOverride,
          (e) => { e.preventDefault(); e.stopPropagation(); handlePillClick(pill, content) })
        fragment.appendChild(pill)
        i = end + 1
      } else {
        let textEnd = i
        while (textEnd < v.length && v.slice(textEnd, textEnd + 2) !== '@{') textEnd++
        if (i < textEnd) fragment.appendChild(document.createTextNode(v.slice(i, textEnd)))
        i = textEnd
      }
    }
    editorRef.current.innerHTML = ''
    editorRef.current.appendChild(fragment)
    isUpdatingRef.current = false
  }

  const commitPillEdit = (originalContent, newContent) => {
    updateValue((value || '').replace(`@{${originalContent}}`, `@{${newContent}}`))
    setSelectedPillId(null)
    setPillMenuPos(null)
  }

  useEffect(() => {
    syncDOMFromValue()
    if (pendingCursorRef.current !== null) {
      positionCursorAtOffset(pendingCursorRef.current)
      pendingCursorRef.current = null
    }
  }, [value])

  const handleInput = () => updateValue(serializeDOM())

  const handleBlur = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).startContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const closePillMenu = () => { setSelectedPillId(null); setPillMenuPos(null) }

  useEffect(() => {
    if (!selectedPillId) return
    window.addEventListener('scroll', closePillMenu, true)
    return () => window.removeEventListener('scroll', closePillMenu, true)
  }, [selectedPillId])

  const handleKeyDown = (e) => {
    if (selectedPillId !== null && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      closePillMenu()
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); return }
    }
    if (e.key === 'ArrowUp' && onArrowUp) { e.preventDefault(); onArrowUp(); return }
    if (e.key === 'ArrowDown' && onArrowDown) { e.preventDefault(); onArrowDown(); return }
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault()
      const sel = window.getSelection()
      const offset = sel?.rangeCount ? getInsertOffset(sel.getRangeAt(0)) : null
      const cur = value || ''
      onEnter(cur.slice(0, offset ?? cur.length), cur.slice(offset ?? cur.length))
      return
    }
    if (e.key === 'Backspace' && onBackspaceAtStart && !value) {
      e.preventDefault()
      onBackspaceAtStart()
      return
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (!sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const editor = editorRef.current
      let prevNode = null
      if (range.startContainer === editor) {
        if (range.startOffset > 0) prevNode = editor.childNodes[range.startOffset - 1]
      } else if (range.startOffset === 0) {
        prevNode = range.startContainer.previousSibling
      }
      const isAfterPill = prevNode?.classList?.contains('datapill')
      if (isAfterPill) {
        e.preventDefault()
        const pill = prevNode
        const pillContent = pill.dataset.content
        // Delete immediately unless mid-sequence backspace arriving at a new pill
        if (!lastBackspaceRef.current || deleteMode === pillContent) {
          pill.remove(); handleInput(); setDeleteMode(null)
        } else {
          setDeleteMode(pillContent)
          pill.classList.add('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        }
      } else if (deleteMode) {
        setDeleteMode(null)
        editorRef.current?.querySelectorAll('.datapill.bg-red-900\\/40')?.forEach(p => {
          p.classList.remove('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        })
      }
      lastBackspaceRef.current = true
    } else if (!['Shift','Control','Alt','Meta'].includes(e.key)) {
      lastBackspaceRef.current = false
      if (deleteMode) {
        setDeleteMode(null)
        editorRef.current?.querySelectorAll('.datapill.bg-red-900\\/40')?.forEach(p => {
          p.classList.remove('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        })
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={editorRef} contentEditable suppressContentEditableWarning
          onInput={handleInput} onKeyDown={handleKeyDown} onBlur={handleBlur} onFocus={onFocus} spellCheck="false"
          className={inputClassName ?? 'p-3 bg-twitch-dark border border-twitch-border rounded-lg min-h-12 cursor-text focus:outline-none focus:ring-1 focus:ring-teal-600 text-twitch-text break-words'} />
        {!value && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none text-twitch-muted text-xs select-none">
            Build here...
          </div>
        )}
      </div>
      {selectedPillId && pillMenuPos && (
        <PillEditMenu
          key={selectedPillId}
          content={selectedPillId}
          mode={mode}
          pos={pillMenuPos}
          onCommit={(newContent) => commitPillEdit(selectedPillId, newContent)}
          onClose={() => { setSelectedPillId(null); setPillMenuPos(null) }}
        />
      )}
    </div>
  )
})

const CHOICE_OPTION_PILLS = [
  { label: 'Word',             pill: '@{capture|text|}',                      color: 'violet' },
  { label: 'Number',           pill: '@{capture|number|}',                    color: 'violet' },
  { label: 'Wildcard',         pill: '@{capture|wildcard|}',                  color: 'violet' },
  { label: 'Choice',           pill: '@{choice||option1|option2}',            color: 'teal'   },
  { label: 'Optional word',    pill: '@{optional|word}',                      color: 'rose'   },
  { label: 'Optional capture', pill: '@{optional_capture|text|}',             color: 'rose'   },
  { label: 'Optional number',  pill: '@{optional_capture|number|}',           color: 'rose'   },
  { label: 'Optional choice',  pill: '@{optional_choice||option1|option2}',   color: 'rose'   },
  { label: 'Any of',           pill: '@{anyof|option1|option2}',              color: 'teal'   },
  { label: 'Min letters',      pill: '@{minletters|3}',                       color: 'sky'    },
  { label: 'Min numbers',      pill: '@{mindigits|1}',                        color: 'sky'    },
  { label: 'Message start',    pill: '@{msg_start}',                        color: 'amber'    },
  { label: 'Message end',      pill: '@{msg_end}',                        color: 'amber'    },
]

const ChoiceEditor = forwardRef(function ChoiceEditor({ options, onChange }, ref) {
  const editorRef = useRef(null)
  const isUpdatingRef = useRef(false)
  const savedRangeRef = useRef(null)
  const lastBackspaceRef = useRef(false)
  const [deleteMode, setDeleteMode] = useState(null)

  const serializeDOM = () => {
    const editor = editorRef.current
    if (!editor) return ['']
    const lines = [[]]
    for (const node of editor.childNodes) {
      if (node.nodeName === 'BR') { lines.push([]) }
      else if (node.nodeType === Node.TEXT_NODE) { lines[lines.length - 1].push(node.textContent) }
      else if (node.classList?.contains('datapill')) { lines[lines.length - 1].push(`@{${node.dataset.content}}`) }
    }
    const result = lines.map(l => l.join(''))
    while (result.length > 1 && result[result.length - 1] === '') result.pop()
    return result.length ? result : ['']
  }

  const syncDOM = () => {
    const editor = editorRef.current
    if (!editor || isUpdatingRef.current) return
    isUpdatingRef.current = true
    const opts = options?.length ? options : ['']
    if (JSON.stringify(serializeDOM()) === JSON.stringify(opts)) { isUpdatingRef.current = false; return }
    const frag = document.createDocumentFragment()
    opts.forEach((opt, idx) => {
      if (idx > 0) frag.appendChild(document.createElement('br'))
      let i = 0
      while (i < opt.length) {
        if (opt.slice(i, i + 2) === '@{') {
          const end = opt.indexOf('}', i + 2)
          if (end === -1) { frag.appendChild(document.createTextNode(opt.slice(i))); break }
          frag.appendChild(makePillNode(opt.slice(i + 2, end)))
          i = end + 1
        } else {
          let end = i
          while (end < opt.length && opt.slice(end, end + 2) !== '@{') end++
          frag.appendChild(document.createTextNode(opt.slice(i, end)))
          i = end
        }
      }
    })
    editor.innerHTML = ''
    editor.appendChild(frag)
    isUpdatingRef.current = false
  }

  useEffect(() => { syncDOM() }, [options])

  const handleInput = () => { if (!isUpdatingRef.current) onChange(serializeDOM()) }

  const handleBlur = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).startContainer))
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
  }

  const clearDeleteMode = () => {
    setDeleteMode(null)
    editorRef.current?.querySelectorAll('.datapill.bg-red-900\\/40')?.forEach(p =>
      p.classList.remove('bg-red-900/40', 'border-red-700/60', 'text-red-400'))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const br = document.createElement('br')
        range.insertNode(br)
        range.setStartAfter(br)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        handleInput()
      }
      return
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      const editor = editorRef.current
      let prevNode = null
      if (range.startContainer === editor) {
        if (range.startOffset > 0) prevNode = editor.childNodes[range.startOffset - 1]
      } else if (range.startOffset === 0) {
        prevNode = range.startContainer.previousSibling
      }
      if (prevNode?.classList?.contains('datapill')) {
        e.preventDefault()
        const pillContent = prevNode.dataset.content
        if (!lastBackspaceRef.current || deleteMode === pillContent) {
          prevNode.remove(); handleInput(); setDeleteMode(null)
        } else {
          setDeleteMode(pillContent)
          prevNode.classList.add('bg-red-900/40', 'border-red-700/60', 'text-red-400')
        }
      } else if (deleteMode) { clearDeleteMode() }
      lastBackspaceRef.current = true
    } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      lastBackspaceRef.current = false
      if (deleteMode) clearDeleteMode()
    }
  }

  useImperativeHandle(ref, () => ({
    insertAtCursor(pillText) {
      const editor = editorRef.current
      if (!editor) return
      const sel = window.getSelection()
      const saved = savedRangeRef.current
      const range = saved && editor.contains(saved.startContainer)
        ? saved.cloneRange()
        : (() => { const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false); return r })()
      const content = pillText.replace(/^@\{/, '').replace(/\}$/, '')
      const pill = makePillNode(content)
      range.deleteContents()
      range.insertNode(pill)
      range.setStartAfter(pill)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      editor.focus()
      handleInput()
      savedRangeRef.current = null
    }
  }), [onChange])

  return (
    <div ref={editorRef} contentEditable suppressContentEditableWarning
      onInput={handleInput} onKeyDown={handleKeyDown} onBlur={handleBlur} spellCheck="false"
      className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:ring-1 focus:ring-teal-600 min-h-10 cursor-text break-words leading-6" />
  )
})

function PillEditMenu({ content, mode, pos, onCommit, onClose }) {
  const [draft, setDraft] = useState(content)
  const parts = draft.split('|')
  const type = parts[0]

  const choiceEditorRef = useRef(null)
  const [insertMenuOpen, setInsertMenuOpen] = useState(false)
  const insertMenuRef = useRef(null)

  useEffect(() => {
    if (!insertMenuOpen) return
    const close = (e) => { if (!insertMenuRef.current?.contains(e.target)) setInsertMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [insertMenuOpen])

  function commit() { onCommit(draft); onClose() }

  return (
    <div className={`fixed bg-twitch-dark border border-twitch-border rounded shadow-lg z-50 p-2 space-y-2 ${type === 'choice' ? 'w-80' : 'min-w-48'}`}
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}>
      {type === 'choice' && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs text-twitch-muted block">Options:</label>
            <ChoiceEditor
              ref={choiceEditorRef}
              options={parts.slice(2).map(enc => { try { return decodeURIComponent(enc) } catch { return enc } })}
              onChange={opts => setDraft(`choice|${parts[1]}|${opts.map(encodeURIComponent).join('|')}`)}
            />
            <div className="relative" ref={insertMenuRef}>
              <button type="button" onClick={() => setInsertMenuOpen(o => !o)}
                className="flex items-center gap-0.5 text-xs text-twitch-muted hover:text-twitch-text px-1.5 py-0.5 rounded border border-twitch-border/60 hover:border-twitch-muted transition-colors">
                Insert <ChevronDown size={10} />
              </button>
              {insertMenuOpen && (
                <div className="absolute top-full left-0 mt-1 z-[60] bg-twitch-dark border border-twitch-border rounded shadow-lg py-1 min-w-36">
                  {CHOICE_OPTION_PILLS.map(({ label, pill, color }) => (
                    <button key={label} type="button" onClick={() => { choiceEditorRef.current?.insertAtCursor(pill); setInsertMenuOpen(false) }}
                      className={`w-full text-left text-xs px-2.5 py-1 hover:bg-twitch-mid transition-colors ${PILL_COLORS[color].split(' ').find(c => c.startsWith('text-'))}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {mode === 'pattern' && (
            <div>
              <label className="text-xs text-twitch-muted block mb-1">Name:</label>
              <input value={parts[1] || ''} onChange={e => setDraft(`choice|${e.target.value}|${parts.slice(2).join('|')}`)}
                placeholder="e.g. location" className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
            </div>
          )}
        </>
      )}
      {type === 'capture' && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-twitch-muted block">Capture type:</label>
            <select value={parts[1]} onChange={e => setDraft(`capture|${e.target.value}|${parts[2] || ''}`)}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text">
              <option value="text">Text (word)</option>
              <option value="number">Number</option>
              <option value="wildcard">Wildcard</option>
            </select>
          </div>
          {mode === 'pattern' && (
            <div>
              <label className="text-xs text-twitch-muted block mb-1">Name:</label>
              <input value={parts[2] || ''} onChange={e => setDraft(`capture|${parts[1]}|${e.target.value}`)}
                placeholder="e.g. days_ago" className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
            </div>
          )}
        </>
      )}
      {type === 'optional' && (
        <div className="space-y-1">
          <label className="text-xs text-twitch-muted block">Optional word/phrase:</label>
          <input value={parts.slice(1).join('|')} onChange={e => setDraft(`optional|${e.target.value}`)}
            placeholder="e.g. please" className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
        </div>
      )}
      {type === 'anyof' && (
        <div className="space-y-1">
          <label className="text-xs text-twitch-muted block">Words (one per line — matches any):</label>
          <textarea value={parts.slice(1).join('\n')}
            onChange={e => setDraft(`anyof|${e.target.value.split('\n').filter(Boolean).join('|')}`)}
            rows={3} className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text resize-none" />
        </div>
      )}
      {type === 'minletters' && (
        <div className="space-y-1">
          <label className="text-xs text-twitch-muted block">Minimum letters in message:</label>
          <input type="number" min={1} value={parts[1] || '1'} onChange={e => setDraft(`minletters|${e.target.value}`)}
            className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
        </div>
      )}
      {type === 'mindigits' && (
        <div className="space-y-1">
          <label className="text-xs text-twitch-muted block">Minimum digits in message:</label>
          <input type="number" min={1} value={parts[1] || '1'} onChange={e => setDraft(`mindigits|${e.target.value}`)}
            className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
        </div>
      )}
      {type === 'optional_capture' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-twitch-muted block">Capture type:</label>
            <select value={parts[1] || 'text'} onChange={e => setDraft(`optional_capture|${e.target.value}|${parts[2] || ''}`)}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text">
              <option value="text">Text (word)</option>
              <option value="number">Number</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-twitch-muted block">Variable name:</label>
            <input value={parts[2] || ''} onChange={e => setDraft(`optional_capture|${parts[1] || 'text'}|${e.target.value}`)}
              placeholder="e.g. item" className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
          </div>
        </div>
      )}
      {type === 'optional_seq' && (() => {
        let decoded = ''
        try { decoded = decodeURIComponent(parts.slice(1).join('|')) } catch {}
        return (
          <div className="space-y-2">
            <label className="text-xs text-twitch-muted block">Sequence:</label>
            <DatapillEditor mode="pattern" value={decoded}
              onChange={v => setDraft(`optional_seq|${encodeURIComponent(v)}`)} />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-twitch-muted text-xs">Insert:</span>
              <button onClick={() => { let d = ''; try { d = decodeURIComponent(parts.slice(1).join('|')) } catch {} setDraft(`optional_seq|${encodeURIComponent(d + (d ? ' ' : '') + '@{choice||option1|option2}')}`) }} className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.teal}`}>Choice</button>
              <button onClick={() => { let d = ''; try { d = decodeURIComponent(parts.slice(1).join('|')) } catch {} setDraft(`optional_seq|${encodeURIComponent(d + (d ? ' ' : '') + '@{capture|text|}')}`) }} className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.violet}`}>Word</button>
              <button onClick={() => { let d = ''; try { d = decodeURIComponent(parts.slice(1).join('|')) } catch {} setDraft(`optional_seq|${encodeURIComponent(d + (d ? ' ' : '') + '@{capture|number|}')}`) }} className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.violet}`}>Number</button>
            </div>
          </div>
        )
      })()}
      {type === 'seq' && (() => {
        const seqLabel = parts.length >= 3 ? parts[1] : ''
        const encodedPart = parts.length >= 3 ? parts[2] : (parts[1] || '')
        let decoded = ''
        try { decoded = decodeURIComponent(encodedPart) } catch {}
        const rebuild = (newLabel, newDecoded) => setDraft(`seq|${newLabel}|${encodeURIComponent(newDecoded)}`)
        const appSeq = (raw) => rebuild(seqLabel, decoded + (decoded ? ' ' : '') + raw)
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-twitch-muted block">Label:</label>
              <input value={seqLabel} onChange={e => rebuild(e.target.value, decoded)} placeholder="e.g. location"
                className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600" />
            </div>
            <label className="text-xs text-twitch-muted block">Sequence:</label>
            <DatapillEditor mode="pattern" value={decoded} onChange={v => rebuild(seqLabel, v)} />
            <div className="flex flex-wrap gap-1">
              <button onClick={() => appSeq('@{choice||option1|option2}')}   className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.teal}`}>Choice</button>
              <button onClick={() => appSeq('@{capture|text|}')}             className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.violet}`}>Word</button>
              <button onClick={() => appSeq('@{capture|number|}')}           className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.violet}`}>Number</button>
              <button onClick={() => appSeq('@{capture|wildcard|}')}         className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.violet}`}>Wildcard</button>
              <button onClick={() => appSeq('@{optional|word}')}             className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.rose}`}>Optional</button>
              <button onClick={() => appSeq('@{anyof|option1|option2}')}     className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.teal}`}>Any of</button>
              <button onClick={() => appSeq('@{minletters|3}')}              className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.sky}`}>Min letters</button>
              <button onClick={() => appSeq('@{mindigits|1}')}               className={`text-xs px-1.5 py-0.5 rounded border ${PILL_COLORS.sky}`}>Min numbers</button>
            </div>
          </div>
        )
      })()}
      {type === 'optional_choice' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-twitch-muted block">Options:</label>
            <textarea value={parts.slice(2).join('\n')}
              onChange={e => setDraft(`optional_choice|${parts[1] || ''}|${e.target.value.split('\n').join('|')}`)}
              rows={3} className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text resize-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-twitch-muted block">Variable name (optional):</label>
            <input value={parts[1] || ''} onChange={e => setDraft(`optional_choice|${e.target.value}|${parts.slice(2).join('|')}`)}
              placeholder="e.g. location" className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text" />
          </div>
        </div>
      )}
      <button onClick={commit}
        className="w-full text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text text-center">
        Done
      </button>
    </div>
  )
}

// ── PatternEditor ─────────────────────────────────────────────────────────────

// ── PatternPillModal ──────────────────────────────────────────────────────────

function PatternPillModal({ onInsert, onClose }) {
  const [subPattern, setSubPattern] = useState('')
  const [label, setLabel] = useState('')
  const editorRef = useRef(null)

  function append(raw) {
    editorRef.current?.insertAtCursor(`@{${raw}}`)
  }

  function handleInsert() {
    if (subPattern.trim()) onInsert(`@{seq|${label.trim()}|${encodeURIComponent(subPattern)}}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-twitch-mid border border-twitch-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-twitch-border shrink-0">
          <h2 className="text-twitch-text text-sm font-semibold">Build advanced sequence</h2>
          <button onClick={onClose} className="text-twitch-muted hover:text-twitch-text transition-colors"><X size={14} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          <p className="text-twitch-muted text-xs">Compose a sequence of pills and text. Click a pill type to append it, then click any pill in the editor to configure it.</p>

          <DatapillEditor ref={editorRef} mode="pattern" value={subPattern} onChange={setSubPattern} />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-twitch-muted text-xs font-medium uppercase tracking-wider">Captures &amp; choices</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => append('choice||option1|option2')} className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.teal}`}>Choice</button>
                <button onClick={() => append('capture|text|')}           className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Capture word</button>
                <button onClick={() => append('capture|number|')}         className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Capture number</button>
                <button onClick={() => append('capture|wildcard|')}       className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Wildcard</button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-twitch-muted text-xs font-medium uppercase tracking-wider">Optional</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => append('optional|word')}                    className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.rose}`}>Optional word</button>
                <button onClick={() => append('optional_capture|text|')}           className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.rose}`}>Optional capture</button>
                <button onClick={() => append('optional_capture|number|')}         className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.rose}`}>Optional number</button>
                <button onClick={() => append('optional_choice||option1|option2')} className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.rose}`}>Optional choice</button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-twitch-muted text-xs font-medium uppercase tracking-wider">Constraints</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => append('anyof|option1|option2')} className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.teal}`}>Any of these words</button>
                <button onClick={() => append('minletters|3')}          className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.sky}`}>Min letters</button>
                <button onClick={() => append('mindigits|1')}           className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.sky}`}>Min numbers</button>
                <button onClick={() => append('msg_start')}             className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.amber}`}>Message Start</button>
                <button onClick={() => append('msg_end')}               className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.amber}`}>Message End</button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-twitch-border shrink-0 space-y-3">
          <div className="space-y-1">
            <label className="text-twitch-muted text-xs">Pill label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. location, amount…"
              className="w-full text-xs bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600" />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-twitch-border text-twitch-muted hover:text-twitch-text transition-colors">
              Cancel
            </button>
            <button onClick={handleInsert} disabled={!subPattern.trim()}
              className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-2 rounded-lg transition-colors">
              Insert into pattern
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PatternEditor({ pattern, onUpdate }) {
  const [modalOpen, setModalOpen] = useState(false)
  const editorRef = useRef(null)

  function insertRaw(content) {
    editorRef.current?.insertAtCursor(`@{${content}}`)
  }

  function insertPill(pill) {
    editorRef.current?.insertAtCursor(pill)
  }

  return (
    <div className="space-y-3">
      <DatapillEditor ref={editorRef} mode="pattern" value={pattern} onChange={onUpdate} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-twitch-muted text-xs">Insert:</span>
        <button onClick={() => insertRaw('choice||option1|option2')}
          className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.teal}`}>Choice</button>
        <button onClick={() => insertRaw('capture|text|')}
          className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Word</button>
        <button onClick={() => insertRaw('capture|number|')}
          className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Number</button>
        <button onClick={() => insertRaw('capture|wildcard|')}
          className={`text-xs px-2 py-1 rounded border ${PILL_COLORS.violet}`}>Wildcard</button>
        <button onClick={() => setModalOpen(true)}
          className="text-xs px-2 py-1 rounded border border-twitch-border text-twitch-muted hover:text-twitch-text hover:border-twitch-muted transition-colors">
          Advanced…
        </button>
      </div>
      {modalOpen && (
        <PatternPillModal onInsert={insertPill} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}

// ── TemplateSegment ──────────────────────────────────────────────────────────

function TemplateSegment({ segment, onUpdate, onInsertAfter }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  if (segment.type === 'text') {
    return (
      <span className="inline relative">
        <input value={segment.value} onChange={e => onUpdate({ ...segment, value: e.target.value })}
          placeholder="Type text..."
          className="bg-transparent text-twitch-text text-sm focus:outline-none focus:bg-twitch-surface/50 px-0.5 rounded min-w-8" />
        <button onClick={() => setShowMenu(!showMenu)}
          className="ml-0.5 px-1.5 py-0.5 text-xs rounded bg-teal-900/20 border border-teal-700/50 text-teal-400 hover:bg-teal-900/30 transition-colors">
          +
        </button>
        {showMenu && (
          <div className="absolute mt-1 p-1 bg-twitch-surface border border-twitch-border rounded shadow-lg z-10 space-y-1 min-w-32">
            <button onClick={() => { onInsertAfter(emptyChoice()); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-dark text-twitch-text">List</button>
            <button onClick={() => { onInsertAfter(emptyCapture('text')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-dark text-twitch-text">Capture text</button>
            <button onClick={() => { onInsertAfter(emptyCapture('number')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-dark text-twitch-text">Capture number</button>
            <button onClick={() => { onInsertAfter(emptyCapture('wildcard')); setShowMenu(false) }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-twitch-dark text-twitch-text">Wildcard (*)</button>
          </div>
        )}
      </span>
    )
  }

  if (segment.type === 'choice') {
    return (
      <div className="inline-block relative">
        <button onClick={() => setShowEdit(!showEdit)}
          className="px-2 py-0.5 mx-1 rounded-lg bg-teal-900/30 border border-teal-700/60 text-teal-400 text-xs inline-flex items-center gap-1 hover:bg-teal-900/50 transition-colors">
          {segment.options?.filter(Boolean).join(' / ') || 'choose'} <ChevronDown size={10} />
        </button>
        {showEdit && (
          <div className="absolute mt-1 p-2 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 min-w-48 space-y-2">
            <label className="text-xs text-twitch-muted block">Options (one per line):</label>
            <textarea value={(segment.options ?? []).join('\n')}
              onChange={e => onUpdate({ ...segment, options: e.target.value.split('\n').map(s => s.trim()) })}
              placeholder="store\ngarage\nhouse" rows={3}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600 resize-none" />
            <input value={segment.paramName || ''} onChange={e => onUpdate({ ...segment, paramName: e.target.value })}
              placeholder="Variable name (optional)"
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600" />
          </div>
        )}
      </div>
    )
  }

  if (segment.type === 'capture') {
    const label = segment.captureType === 'number' ? '🔢' : segment.captureType === 'wildcard' ? '*' : '📝'
    return (
      <div className="inline-block relative">
        <button onClick={() => setShowEdit(!showEdit)}
          className="px-2 py-0.5 mx-1 rounded-lg bg-purple-900/30 border border-purple-700/60 text-purple-400 text-xs inline-flex items-center gap-1 hover:bg-purple-900/50 transition-colors">
          {label} <ChevronDown size={10} />
        </button>
        {showEdit && (
          <div className="absolute mt-1 p-2 bg-twitch-dark border border-twitch-border rounded shadow-lg z-20 min-w-40 space-y-2">
            <label className="text-xs text-twitch-muted block">Type:</label>
            <select value={segment.captureType} onChange={e => onUpdate({ ...segment, captureType: e.target.value })}
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600">
              <option value="text">Text (word)</option>
              <option value="number">Number</option>
              <option value="wildcard">Wildcard</option>
            </select>
            <input value={segment.paramName || ''} onChange={e => onUpdate({ ...segment, paramName: e.target.value })}
              placeholder="Variable name"
              className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1 text-twitch-text focus:outline-none focus:border-teal-600" />
          </div>
        )}
      </div>
    )
  }

  return null
}

// ── BlockConnector ────────────────────────────────────────────────────────────

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

// ── Language filter shared panel ──────────────────────────────────────────────

function LanguageFilterPanel({ mode, words, ignoreSpaces, ignorePunct, onChange }) {
  function p(k, v) { onChange({ mode, words, ignoreSpaces, ignorePunct, [k]: v }) }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {['require','blacklist'].map(m => (
          <button key={m} onClick={() => p('mode', m)}
            className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors capitalize ${
              mode === m ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
            }`}>
            {m === 'require' ? 'Require words' : 'Blacklist words'}
          </button>
        ))}
      </div>
      <textarea value={(words ?? []).join('\n')}
        onChange={e => p('words', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        rows={3} placeholder="One word or phrase per line..."
        className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600 resize-none" />
      <label className="flex items-center gap-2 cursor-pointer">
        <Toggle on={ignoreSpaces} onChange={v => p('ignoreSpaces', v)} size="sm" />
        <span className="text-twitch-muted text-xs">Ignore spaces (catches "w o r d")</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <Toggle on={ignorePunct} onChange={v => p('ignorePunct', v)} size="sm" />
        <span className="text-twitch-muted text-xs">Ignore punctuation (catches "w.o.r.d")</span>
      </label>
    </div>
  )
}

// ── ObsSourceTriggerConfig ────────────────────────────────────────────────────

function ObsSourceTriggerConfig({ trigger, patch }) {
  const [obsScenes, setObsScenes] = useState([])
  const [obsSources, setObsSources] = useState([])

  useEffect(() => {
    window.api.obs.getScenes().then(r => { if (r?.ok) setObsScenes(r.data?.scenes ?? []) }).catch(() => {})
    window.api.shiny.getSourceList().then(r => { if (r?.ok) setObsSources(r.data ?? []) }).catch(() => {})
  }, [])

  return (
    <section className="space-y-3">
      <h2 className="text-twitch-text text-sm font-medium">When an OBS source changes...</h2>
      <Card>
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-20 shrink-0">Scene</label>
          <select value={trigger.obsScene ?? ''} onChange={e => patch('obsScene', e.target.value || null)}
            className="flex-1 text-xs bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
            <option value="">Any scene</option>
            {obsScenes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-20 shrink-0">Source</label>
          {Array.isArray(obsSources) && obsSources.length > 0 ? (
            <select value={trigger.obsSource ?? ''} onChange={e => patch('obsSource', e.target.value)}
              className="flex-1 text-xs bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
              <option value="">(entire scene)</option>
              {obsSources.filter(s => s?.name).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          ) : (
            <input value={trigger.obsSource ?? ''} onChange={e => patch('obsSource', e.target.value)}
              placeholder="Source name"
              className="flex-1 text-xs bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-20 shrink-0">Becomes</label>
          <div className="flex gap-2 flex-1">
            {['visible','hidden'].map(state => (
              <button key={state} onClick={() => patch('obsState', state)}
                className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors capitalize ${
                  (trigger.obsState ?? 'visible') === state
                    ? 'bg-teal-900/30 border-teal-600 text-teal-400'
                    : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
                }`}>
                {state}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </section>
  )
}

// ── ConsiderationRow ──────────────────────────────────────────────────────────

function ConsiderationRow({ consideration, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const [obsSources, setObsSources] = useState([])
  const [obsScenes, setObsScenes] = useState([])
  const [wordsDraft, setWordsDraft] = useState(null)
  const meta = CONSIDERATION_META[consideration.type] ?? { label: consideration.type, icon: Info, color: 'teal' }
  const colors = COLOR_CLASSES[meta.color] ?? COLOR_CLASSES.teal
  const Icon = meta.icon

  function p(k, v) { onChange({ ...consideration, [k]: v }) }

  useEffect(() => {
    if (consideration.type === 'obs_source' && obsSources.length === 0) {
      window.api.shiny.getSourceList().then(r => { if (r?.ok) setObsSources(r.data ?? []) }).catch(() => {})
    }
  }, [consideration.type])

  useEffect(() => {
    if (consideration.type === 'obs_source' && obsScenes.length === 0) {
      window.api.obs.getScenes().then(r => { if (r?.ok) setObsScenes(r.data?.scenes ?? []) }).catch(() => {})
    }
  }, [consideration.type])

  return (
    <div className="border border-twitch-border rounded-lg p-3 bg-twitch-dark space-y-3">
      <div className="flex items-center gap-2">
        <Toggle on={consideration.enabled} onChange={v => p('enabled', v)} size="sm" />
        <div className={`flex-1 px-2.5 py-1 rounded border inline-flex items-center gap-2 text-xs font-medium ${colors.chip}`}>
          <Icon size={11} />
          <span>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={!canMoveUp} className={`p-1 rounded transition-colors ${canMoveUp ? 'hover:bg-twitch-surface text-twitch-muted hover:text-teal-400' : 'text-twitch-border opacity-50 cursor-not-allowed'}`}>
            <ArrowUp size={13} />
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className={`p-1 rounded transition-colors ${canMoveDown ? 'hover:bg-twitch-surface text-twitch-muted hover:text-teal-400' : 'text-twitch-border opacity-50 cursor-not-allowed'}`}>
            <ArrowDown size={13} />
          </button>
          <button onClick={onRemove} className="p-1 rounded text-twitch-muted hover:text-red-400 hover:bg-twitch-surface transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {consideration.type === 'chance' && (
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-24 shrink-0">Probability</label>
          <PercentInput value={consideration.percent} onChange={v => p('percent', v)} />
          <span className="text-twitch-muted text-xs text-right flex-1">fires {consideration.percent}% of the time</span>
        </div>
      )}

      {consideration.type === 'language_filter' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {['require','blacklist'].map(m => (
              <button key={m} onClick={() => p('mode', m)}
                className={`flex-1 text-xs px-2 py-1 rounded border transition-colors capitalize ${
                  consideration.mode === m ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
                }`}>
                {m === 'require' ? 'Require' : 'Blacklist'}
              </button>
            ))}
          </div>
          <textarea
            value={wordsDraft ?? (consideration.words ?? []).join('\n')}
            onFocus={() => setWordsDraft((consideration.words ?? []).join('\n'))}
            onChange={e => setWordsDraft(e.target.value)}
            onBlur={e => { p('words', e.target.value.split('\n').map(s => s.trim()).filter(Boolean)); setWordsDraft(null) }}
            rows={Math.max(2, (wordsDraft ?? (consideration.words ?? []).join('\n')).split('\n').length)} placeholder="One word per line..."
            className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600 resize-none" />
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Toggle on={consideration.ignoreSpaces ?? false} onChange={v => p('ignoreSpaces', v)} size="sm" />
              <span className="text-twitch-muted">Ignore spaces</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Toggle on={consideration.ignorePunct ?? false} onChange={v => p('ignorePunct', v)} size="sm" />
              <span className="text-twitch-muted">Ignore punctuation</span>
            </label>
          </div>
        </div>
      )}

      {consideration.type === 'wait' && (
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-24 shrink-0">Delay</label>
          <DurationInput value={consideration.seconds} onChange={v => p('seconds', v)} preferenceKey="consideration_wait_unit" />
          <span className="text-twitch-muted text-xs text-right flex-1">before sending response</span>
        </div>
      )}

      {consideration.type === 'chat_activity' && (
        <div className="flex items-center gap-3">
          <label className="text-twitch-muted text-xs w-24 shrink-0">Min messages</label>
          <input type="number" min={1} value={consideration.messageCount}
            onChange={e => p('messageCount', Number(e.target.value))}
            className="w-16 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
          <span className="text-twitch-muted text-xs text-right flex-1">messages since last trigger</span>
        </div>
      )}

      {consideration.type === 'obs_source' && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-twitch-muted text-xs w-20 shrink-0">Scene</label>
            <select value={consideration.scene ?? ''} onChange={e => p('scene', e.target.value || null)}
              className="flex-1 text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
              <option value="">Active scene</option>
              {obsScenes.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-twitch-muted text-xs w-20 shrink-0">Source</label>
            {Array.isArray(obsSources) && obsSources.length > 0 ? (
              <select value={consideration.source ?? ''} onChange={e => p('source', e.target.value)}
                className="flex-1 text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
                <option value="">(entire scene)</option>
                {obsSources.filter(s => s?.name).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            ) : (
              <input value={consideration.source ?? ''} onChange={e => p('source', e.target.value)}
                placeholder="Source name or leave blank"
                className="flex-1 text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600" />
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-twitch-muted text-xs w-20 shrink-0">State</label>
            <div className="flex gap-2 flex-1">
              {['visible','hidden'].map(state => (
                <button key={state} onClick={() => p('state', state)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors capitalize ${
                    consideration.state === state ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
                  }`}>
                  {state}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-twitch-muted text-xs w-20 shrink-0">If not met</label>
            <div className="flex gap-2 flex-1">
              {[['cancel','Quit'],[`wait_${consideration.state}`,`Wait until ${consideration.state}`]].map(([v, lbl]) => (
                <button key={v} onClick={() => p('onFail', v === 'cancel' ? 'cancel' : 'wait')}
                  className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                    (v === 'cancel' ? consideration.onFail === 'cancel' : consideration.onFail === 'wait') ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
                  }`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({ action, onChange, onRemove, canRemove, hasBot, params, pattern }) {
  const [advOpen, setAdvOpen] = useState(false)
  const [obsSources, setObsSources] = useState([])
  const [obsScenes, setObsScenes] = useState([])
  const [audioDevices, setAudioDevices] = useState([])

  function patch(k, v) { onChange({ ...action, [k]: v }) }
  function insertVar(varName) { patch('template', (action.template ?? '') + `@{${varName}}`) }

  // Extract named variables from the pattern with their source type
  const { patternVars, varColors } = React.useMemo(() => {
    const vars = []
    const colors = {}
    // Built-in Twitch vars
    const builtIns = ['user','display_name','message','channel','followage']
    builtIns.forEach(n => { colors[n] = 'sky' })
    if (pattern) {
      const matches = pattern.match(/@\{[^}]+\}/g) ?? []
      for (const m of matches) {
        const parts = m.slice(2, -1).split('|')
        if (parts[0] === 'capture' && parts[2]) { vars.push(parts[2]); colors[parts[2]] = 'violet' }
        if (parts[0] === 'choice' && parts[1])  { vars.push(parts[1]); colors[parts[1]] = 'teal' }
      }
    }
    if (params) params.forEach(p => { vars.push(p); colors[p] = colors[p] ?? 'purple' })
    return { patternVars: vars, varColors: colors }
  }, [pattern, params])
  const isAnnouncement = action.type === 'send_chat_response' && action.responseMode === 'announcement'
  const isChat = action.type === 'send_chat_response'
  const isMedia = action.type === 'play_media'
  const isAudio = isMedia && (action.mediaType ?? 'audio') === 'audio'
  const isVideo = isMedia && (action.mediaType ?? 'audio') === 'video'
  const isObs = action.type === 'obs_set_source'
  const isLine = action.type === 'random_line'
  const isLineFile = action.lineMode === 'file'

  function loadObsData() {
    if (obsScenes.length === 0) window.api.obs.getScenes().then(r => { if (r?.ok) setObsScenes(r.data?.scenes ?? []) }).catch(() => {})
    window.api.shiny.getSceneItemList(action.scene || null).then(r => { if (r?.ok) setObsSources(r.data ?? []) }).catch(() => {})
  }

  function loadAudioDevices() {
    if (audioDevices.length === 0) {
      navigator.mediaDevices.enumerateDevices().then(devices =>
        setAudioDevices(devices.filter(d => d.kind === 'audiooutput'))
      ).catch(() => {})
    }
  }

  useEffect(() => {
    if (action.type === 'obs_set_source' && obsScenes.length === 0) {
      window.api.obs.getScenes().then(r => { if (r?.ok) setObsScenes(r.data?.scenes ?? []) }).catch(() => {})
    }
  }, [action.type])

  useEffect(() => {
    if (action.type === 'obs_set_source') {
      window.api.shiny.getSceneItemList(action.scene || null).then(r => { if (r?.ok) setObsSources(r.data ?? []) }).catch(() => {})
    }
  }, [action.type, action.scene])

  async function browsFile(filters) {
    const path = await window.api.app.openFile(filters)
    if (path) patch('filePath', path)
  }

  const ACTION_TYPES = [
    { value: 'send_chat_response',label: 'Chat response' },
    { value: 'play_media',       label: 'Play audio/video' },
    { value: 'random_line',      label: 'Random line' },
    { value: 'obs_set_source',   label: 'OBS source' },
  ]

  return (
    <div className={`border rounded-xl overflow-hidden ${isAnnouncement ? 'border-teal-700/50' : isMedia ? 'border-amber-700/40' : isObs ? 'border-rose-700/40' : isLine ? 'border-purple-700/40' : 'border-twitch-border'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-twitch-border ${isAnnouncement ? 'bg-teal-900/20' : 'bg-twitch-surface'}`}>
        <div className="flex items-center gap-1 bg-twitch-dark rounded-lg p-0.5 flex-wrap">
          {ACTION_TYPES.map(t => (
            <button key={t.value} onClick={() => {
              patch('type', t.value)
              if (t.value === 'obs_set_source' || t.value === 'play_media') loadObsData()
              if (t.value === 'play_media') loadAudioDevices()
            }}
              className={`text-xs px-2 py-1 rounded transition-colors ${action.type === t.value ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {canRemove && (
            <button onClick={onRemove} className="text-twitch-muted hover:text-red-400 text-xs transition-colors">Remove</button>
          )}
        </div>
      </div>

      {/* Play media type selector */}
      {isMedia && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-twitch-border bg-twitch-surface">
          <div className="flex items-center gap-1 bg-twitch-dark rounded-lg p-0.5">
            {[{ value: 'audio', label: 'Audio' }, { value: 'video', label: 'Video' }].map(m => (
              <button key={m.value} onClick={() => patch('mediaType', m.value)}
                className={`text-xs px-2 py-1 rounded transition-colors ${(action.mediaType ?? 'audio') === m.value ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat response mode selector */}
      {isChat && (
        <div className={`flex items-center gap-2 px-3 py-2 border-b border-twitch-border ${isAnnouncement ? 'bg-teal-900/20' : 'bg-twitch-surface'}`}>
          <div className="flex items-center gap-1 bg-twitch-dark rounded-lg p-0.5">
            {[{ value: 'message', label: 'Chat message' }, { value: 'announcement', label: 'Announcement' }].map(m => (
              <button key={m.value} onClick={() => patch('responseMode', m.value)}
                className={`text-xs px-2 py-1 rounded transition-colors ${(action.responseMode ?? 'message') === m.value ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {isAnnouncement && (
              <div className="flex items-center gap-1">
                {ANNOUNCEMENT_COLORS.map(c => (
                  <button key={c.value} onClick={() => patch('announcementColor', c.value)} title={c.label}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${action.announcementColor === c.value ? 'border-white scale-125' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c.color }} />
                ))}
              </div>
            )}
            {hasBot && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Toggle on={action.useBot} onChange={v => patch('useBot', v)} size="sm" />
                <Bot size={12} className="text-twitch-muted" />
                <span className="text-twitch-muted text-xs">Bot</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="p-3 space-y-3 bg-twitch-dark">
        {/* Chat / Announcement body */}
        {isChat && (
          <>
            <DatapillEditor mode="response" value={action.template ?? ''} onChange={v => patch('template', v)} varColors={varColors} />
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1 items-center">
                {BASE_VARS.map(v => (
                  <button key={v.token} type="button" onClick={() => insertVar(v.token.slice(1, -1))}
                    className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${PILL_COLORS.sky} border`}>
                    {v.label}
                  </button>
                ))}
                {patternVars.map(p => {
                  const c = PILL_COLORS[varColors[p] ?? 'violet']
                  return (
                    <button key={p} type="button" onClick={() => insertVar(p)}
                      className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${c} border`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setAdvOpen(o => !o)}
                  className="text-xs text-twitch-muted hover:text-twitch-text flex items-center gap-0.5 transition-colors ml-1">
                  More {advOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>
              {advOpen && (
                <div className="flex flex-wrap gap-1.5 px-2 py-1.5 bg-twitch-surface border border-twitch-border rounded-lg">
                  {ADVANCED_VARS.map(v => (
                    <button key={v.token} type="button" onClick={() => insertVar(v.token.slice(1, -1))}
                      className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${PILL_COLORS.sky} border`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Play media body */}
        {isMedia && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">File</label>
              <div className="flex gap-2">
                <input value={action.filePath ?? ''} onChange={e => patch('filePath', e.target.value)}
                  placeholder={isVideo ? 'Path to video file...' : 'Path to audio file...'}
                  className="flex-1 text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600" />
                <button onClick={() => isVideo
                  ? browsFile([{ name: 'Video', extensions: ['mp4','mov','webm','mkv'] }])
                  : browsFile([{ name: 'Audio', extensions: ['mp3','wav','ogg','m4a'] }])}
                  className="text-xs px-2.5 py-1.5 bg-twitch-surface border border-twitch-border rounded hover:border-teal-600 text-twitch-muted hover:text-teal-400 transition-colors">
                  Browse…
                </button>
              </div>
            </div>
            {isAudio && (
              <>
                <div className="space-y-1">
                  <label className="text-twitch-muted text-xs">Output device</label>
                  {audioDevices.length > 0 ? (
                    <select value={action.device ?? ''} onChange={e => patch('device', e.target.value)}
                      className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
                      <option value="">Default device</option>
                      {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                    </select>
                  ) : (
                    <button onClick={loadAudioDevices}
                      className="text-xs text-teal-500 hover:text-teal-400 transition-colors">
                      Load audio devices…
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-twitch-muted text-xs">Volume</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} value={Math.round((action.volume ?? 1) * 100)}
                      onChange={e => patch('volume', Number(e.target.value) / 100)}
                      className="flex-1 accent-teal-500" />
                    <span className="text-twitch-muted text-xs w-8">{Math.round((action.volume ?? 1) * 100)}%</span>
                  </div>
                </div>
              </>
            )}
            {isVideo && (
              <div className="space-y-1">
                <label className="text-twitch-muted text-xs">OBS source</label>
                <select value={action.obsSource ?? ''} onChange={e => patch('obsSource', e.target.value)}
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
                  <option value="">(select a media source)</option>
                  {obsSources.filter(s => s?.sourceName).map(s => (
                    <option key={s.sourceName} value={s.sourceName}>{s.sourceName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Random line mode selector */}
        {isLine && (
          <div className={`flex items-center gap-2 px-3 py-2 border-b border-twitch-border ${isLineFile ? 'bg-twitch-surface' : 'bg-twitch-surface'}`}>
            <div className="flex items-center gap-1 bg-twitch-dark rounded-lg p-0.5">
              {[{ value: 'file', label: 'From file' }, { value: 'manual', label: 'Manual' }].map(m => (
                <button key={m.value} onClick={() => patch('lineMode', m.value)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${(action.lineMode ?? 'file') === m.value ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Random line body */}
        {isLine && (
          <div className="space-y-3">
            {isLineFile && (
              <>
                <div className="space-y-1">
                  <label className="text-twitch-muted text-xs">Text file (one line per entry)</label>
                  <div className="flex gap-2">
                    <input value={action.filePath ?? ''} onChange={e => patch('filePath', e.target.value)}
                      placeholder="Path to .txt file..."
                      className="flex-1 text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600" />
                    <button onClick={() => browsFile([{ name: 'Text files', extensions: ['txt','csv'] }])}
                      className="text-xs px-2.5 py-1.5 bg-twitch-surface border border-twitch-border rounded hover:border-teal-600 text-twitch-muted hover:text-teal-400 transition-colors">
                      Browse…
                    </button>
                  </div>
                </div>
              </>
            )}
            {!isLineFile && (
              <div className="space-y-1">
                <label className="text-twitch-muted text-xs">Lines (one per line)</label>
                <textarea value={(action.lines ?? []).join('\n')} onChange={e => patch('lines', e.target.value.split('\n').filter(l => l.trim()))}
                  placeholder="Enter each line on a new line..."
                  rows={6}
                  className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600 resize-none" />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <Toggle on={action.randomize ?? true} onChange={v => patch('randomize', v)} size="sm" />
              <span className="text-twitch-muted text-xs">Pick randomly (disable for sequential)</span>
            </label>
          </div>
        )}

        {/* OBS set source body */}
        {isObs && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Scene</label>
              <select value={action.scene ?? ''} onChange={e => patch('scene', e.target.value || null)}
                className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
                <option value="">Active scene</option>
                {obsScenes.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Source</label>
              <select value={action.source ?? ''} onChange={e => patch('source', e.target.value)}
                className="w-full text-xs bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text focus:outline-none focus:border-teal-600">
                <option value="">(entire scene)</option>
                {obsSources.filter(s => s?.sourceName).map(s => (
                  <option key={s.sourceName} value={s.sourceName}>{s.sourceName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-twitch-muted text-xs">Visibility</label>
              <div className="flex gap-2">
                <button onClick={() => patch('visible', true)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${action.visible ?? true ? 'bg-teal-700 text-white' : 'bg-twitch-surface border border-twitch-border text-twitch-muted hover:text-twitch-text'}`}>
                  Visible
                </button>
                <button onClick={() => patch('visible', false)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${!(action.visible ?? true) ? 'bg-teal-700 text-white' : 'bg-twitch-surface border border-twitch-border text-twitch-muted hover:text-twitch-text'}`}>
                  Hidden
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delay row — all action types */}
        <div className="flex items-center gap-2 pt-1 border-t border-twitch-border/50">
          <label className="text-twitch-muted text-xs">Delay</label>
          <DurationInput value={action.delay ?? 0} onChange={v => patch('delay', v)} preferenceKey="action_delay_unit" />
        </div>
      </div>
    </div>
  )
}

// ── ConditionEditor (inside ResponseGroup) ────────────────────────────────────

function ConditionEditor({ condition, onChange }) {
  function p(k, v) { onChange({ ...condition, [k]: v }) }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-twitch-dark rounded-lg p-0.5 w-fit">
        {[['random','Random'],['user_role','User role'],['language_filter','Language']].map(([t, lbl]) => (
          <button key={t} onClick={() => onChange(t === condition?.type ? condition : { type: t, weight: 1, roles: [], mode: 'require', words: [], ignoreSpaces: false, ignorePunct: false })}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${condition?.type === t ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {condition?.type === 'random' && (
        <div className="space-y-1">
          <label className="text-twitch-muted text-xs">Relative weight</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={condition.weight ?? 1} onChange={e => p('weight', Number(e.target.value))}
              className="w-16 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
            <span className="text-twitch-muted text-xs">Higher = fires more often relative to other random groups</span>
          </div>
        </div>
      )}

      {condition?.type === 'user_role' && (
        <div className="space-y-2">
          <label className="text-twitch-muted text-xs">Fire when sender is...</label>
          <div className="flex flex-wrap gap-2">
            {['moderator','vip','subscriber','follower'].map(role => {
              const checked = (condition.roles ?? []).includes(role)
              return (
                <button key={role} onClick={() => p('roles', checked ? condition.roles.filter(r => r !== role) : [...(condition.roles ?? []), role])}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors capitalize ${checked ? 'bg-teal-900/30 border-teal-600 text-teal-400' : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'}`}>
                  {role}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {condition?.type === 'language_filter' && (
        <LanguageFilterPanel
          mode={condition.mode ?? 'require'} words={condition.words ?? []}
          ignoreSpaces={condition.ignoreSpaces ?? false} ignorePunct={condition.ignorePunct ?? false}
          onChange={v => onChange({ ...condition, ...v })}
        />
      )}
    </div>
  )
}

// ── ActivationCard ────────────────────────────────────────────────────────────

function ActivationCard({ activation, onChange }) {
  const act = activation ?? emptyActivation()
  const conds = act.conditions ?? {}
  const gameCategories = conds.gameCategories ?? []
  const titleContains = conds.titleContains ?? []

  const [gameQuery, setGameQuery] = useState('')
  const [gameResults, setGameResults] = useState([])
  const [gameSearching, setGameSearching] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const gameSearchRef = useRef(null)
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false)

  function setMode(mode) { onChange({ ...act, mode }) }
  function setLogic(logic) { onChange({ ...act, logic }) }
  function setCond(k, v) { onChange({ ...act, conditions: { ...conds, [k]: v } }) }

  function addGame(name) {
    if (!name || gameCategories.includes(name)) return
    setCond('gameCategories', [...gameCategories, name])
    setGameQuery(''); setGameResults([]); setGameDropdownOpen(false)
  }
  function removeGame(name) { setCond('gameCategories', gameCategories.filter(g => g !== name)) }

  function addTitle() {
    const v = titleInput.trim()
    if (!v || titleContains.includes(v)) return
    setCond('titleContains', [...titleContains, v])
    setTitleInput('')
  }
  function removeTitle(v) { setCond('titleContains', titleContains.filter(t => t !== v)) }

  useEffect(() => {
    if (!gameQuery || gameQuery.length < 2) { setGameResults([]); setGameDropdownOpen(false); return }
    setGameSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.twitch.searchCategories(gameQuery)
        setGameResults(res?.data ?? [])
        setGameDropdownOpen(true)
      } catch { setGameResults([]) }
      finally { setGameSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [gameQuery])

  // close dropdown on outside click
  useEffect(() => {
    function handler(e) { if (gameSearchRef.current && !gameSearchRef.current.contains(e.target)) setGameDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <Card title={<span className="flex items-center gap-1.5"><Zap size={13} className="text-teal-400" />Activation</span>}>
      <div className="flex items-center gap-2">
        <label className="text-twitch-muted text-xs w-14 shrink-0">Mode</label>
        <div className="flex gap-1 bg-twitch-dark rounded-lg p-0.5">
          {[['manual', 'Manual'], ['auto', 'Auto (stream rules)']].map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setMode(v)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${act.mode === v ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {act.mode === 'auto' && (
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-2">
            <label className="text-twitch-muted text-xs w-14 shrink-0">Logic</label>
            <div className="flex gap-1 bg-twitch-dark rounded-lg p-0.5">
              {[['and', 'All conditions (AND)'], ['or', 'Any condition (OR)']].map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setLogic(v)}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${act.logic === v ? 'bg-teal-700 text-white' : 'text-twitch-muted hover:text-twitch-text'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Live condition */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Toggle on={!!conds.whenLive} onChange={v => setCond('whenLive', v)} size="sm" />
              <span className="text-twitch-text text-xs font-medium">Stream is live</span>
            </label>
          </div>

          {/* Game categories */}
          <div className="space-y-2">
            <span className="text-twitch-text text-xs font-medium block">Game category is any of</span>
            <div ref={gameSearchRef} className="relative">
              <div className="flex gap-2">
                <input
                  value={gameQuery}
                  onChange={e => setGameQuery(e.target.value)}
                  placeholder="Search games..."
                  className="flex-1 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-xs focus:outline-none focus:border-teal-600"
                />
                {gameSearching && <Loader size={12} className="animate-spin text-twitch-muted self-center shrink-0" />}
              </div>
              {gameDropdownOpen && gameResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-twitch-surface border border-twitch-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                  {gameResults.map(g => (
                    <button key={g.id} type="button" onMouseDown={() => addGame(g.name)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-twitch-border transition-colors text-left">
                      {g.box_art_url && <img src={g.box_art_url} alt="" className="w-6 h-8 rounded object-cover shrink-0" />}
                      <span className="text-twitch-text text-xs">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {gameCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {gameCategories.map(g => (
                  <span key={g} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-700/50 text-purple-300">
                    {g}
                    <button type="button" onClick={() => removeGame(g)} className="hover:text-red-400 transition-colors ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Title contains */}
          <div className="space-y-2">
            <span className="text-twitch-text text-xs font-medium block">Title contains any of</span>
            <div className="flex gap-2">
              <input
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTitle())}
                placeholder="Type a phrase and press Enter..."
                className="flex-1 bg-twitch-surface border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-xs focus:outline-none focus:border-teal-600"
              />
              <button type="button" onClick={addTitle}
                className="px-2.5 py-1 bg-twitch-surface border border-twitch-border rounded text-twitch-muted hover:text-teal-400 hover:border-teal-600 transition-colors text-xs">
                Add
              </button>
            </div>
            {titleContains.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {titleContains.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/50 text-blue-300">
                    {t}
                    <button type="button" onClick={() => removeTitle(t)} className="hover:text-red-400 transition-colors ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {act.currentOverride !== null && (
            <p className="text-amber-400 text-xs flex items-center gap-1">
              <AlertTriangle size={11} />
              Manual override active — auto rules paused until stream state changes.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// ── ResponseGroup ─────────────────────────────────────────────────────────────

function ResponseGroup({ group, onChange, onRemove, canRemove, hasBot, params, pattern, groupIndex, isMultiResponse }) {
  function patchGroup(k, v) { onChange({ ...group, [k]: v }) }
  function addAction() { patchGroup('actions', [...group.actions, emptyAction()]) }
  function updateAction(aid, updated) { patchGroup('actions', group.actions.map(a => a.id === aid ? updated : a)) }
  function removeAction(aid) { patchGroup('actions', group.actions.filter(a => a.id !== aid)) }
  const isDefault = group.condition === null

  return (
    <div className="border border-twitch-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-twitch-surface border-b border-twitch-border px-3 py-2 flex items-center justify-between">
        <span className="text-twitch-text text-xs font-medium">
          {isDefault ? 'Default' : `Response ${groupIndex + 1}`}
        </span>
        {canRemove && (
          <button onClick={onRemove} className="text-twitch-muted hover:text-red-400 text-xs">
            Remove
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="bg-twitch-dark p-3 space-y-3">
        <div className="space-y-2">
          {group.actions.map(action => (
            <ActionRow key={action.id} action={action}
              onChange={updated => updateAction(action.id, updated)}
              onRemove={() => removeAction(action.id)}
              canRemove={group.actions.length > 1}
              hasBot={hasBot} params={params} pattern={pattern} />
          ))}
        </div>
        <button onClick={addAction} className="flex items-center gap-1.5 text-teal-500 hover:text-teal-400 text-xs transition-colors">
          <Plus size={12} /> Add action
        </button>
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
  const [addConsidMenu, setAddConsidMenu] = useState(false)
  const [addConditionMenu, setAddConditionMenu] = useState(false)
  const [editingConditionId, setEditingConditionId] = useState(null)
  const optToastShown = useRef(false)

  useEffect(() => {
    window.api.chatTriggers.getBotAccount().then(r => { if (r.ok && r.data) setHasBot(true) })

    if (!isNew) {
      window.api.chatTriggers.list().then(res => {
        if (res.ok) {
          const found = res.data.find(t => t.id === id)
          if (found) {
            // migrate template
            if (!found.template) found.template = migrateToTemplate(found.conditions, found.blocks)
            if (!found.template) found.template = [emptySegment('text')]

            // migrate responseGroups → conditions/responses/routing
            if (found.responseGroups && !found.conditions) {
              const conditions = []
              const responses = []
              const routing = []

              found.responseGroups.forEach((group, idx) => {
                const respId = uid()
                responses.push({ id: respId, actions: group.actions || [emptyAction()] })

                if (group.condition) {
                  const condId = uid()
                  conditions.push({ id: condId, ...group.condition })
                  routing.push({ conditionId: condId, responseId: respId })
                } else {
                  // Unconditioned = fallback, no routing entry
                }
              })

              found.conditions = conditions
              found.responses = responses
              found.routing = routing
              delete found.responseGroups
            }

            found.conditions ??= []
            found.responses ??= [{ id: uid(), actions: [emptyAction()] }]
            found.routing ??= []
            found.considerations ??= []
            found.activation ??= emptyActivation()
            found.activation.conditions ??= emptyActivation().conditions
            // migrate single-string fields to arrays
            const ac = found.activation.conditions
            if (typeof ac.gameCategory === 'string') { ac.gameCategories = ac.gameCategory ? [ac.gameCategory] : []; delete ac.gameCategory }
            ac.gameCategories ??= []
            if (typeof ac.titleContains === 'string') { ac.titleContains = ac.titleContains ? [ac.titleContains] : [] }
            ac.titleContains ??= []
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
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // template
  function updateTemplate(updated) { patch('template', updated) }
  function updateSegment(segId, updated) { updateTemplate(trigger.template.map(s => s.id === segId ? updated : s)) }
  function insertSegmentAfter(segId, newSeg) {
    const idx = trigger.template.findIndex(s => s.id === segId)
    if (idx >= 0) {
      const next = [...trigger.template]; next.splice(idx + 1, 0, newSeg); updateTemplate(next)
    }
  }

  // params
  function addParam() { patch('commandParams', [...(trigger.commandParams ?? []), emptyParam()]) }
  function removeParam(pid) { patch('commandParams', trigger.commandParams.filter(p => p.id !== pid)) }
  function updateParam(pid, updated) {
    let params = trigger.commandParams.map(p => p.id === pid ? updated : p)
    if (updated.optional) {
      const req = params.filter(p => !p.optional)
      const opt = params.filter(p => p.optional)
      const moved = req.length !== params.filter((p, i) => !p.optional && i < params.findIndex(q => q.optional)).length
      params = [...req, ...opt]
      if (!optToastShown.current && moved) {
        optToastShown.current = true
        showToast('Optional parameters moved to the end automatically.')
      }
    }
    patch('commandParams', params)
  }

  // considerations
  function addConsideration(type) {
    patch('considerations', [...(trigger.considerations ?? []), emptyConsideration(type)])
    setAddConsidMenu(false)
  }
  function updateConsideration(cid, updated) {
    patch('considerations', trigger.considerations.map(c => c.id === cid ? updated : c))
  }
  function removeConsideration(cid) {
    patch('considerations', trigger.considerations.filter(c => c.id !== cid))
  }
  function moveConsiderationUp(cid) {
    const idx = trigger.considerations.findIndex(c => c.id === cid)
    if (idx > 0) {
      const next = [...trigger.considerations]
      ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      patch('considerations', next)
    }
  }
  function moveConsiderationDown(cid) {
    const idx = trigger.considerations.findIndex(c => c.id === cid)
    if (idx < trigger.considerations.length - 1) {
      const next = [...trigger.considerations]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      patch('considerations', next)
    }
  }

  // response groups
  // Conditions
  function getConditionLabel(cond) {
    if (cond.type === 'user_role') {
      const roles = (cond.roles ?? []).length > 0 ? cond.roles.map(r => r.split('_').join(' ')).join(', ') : '(no roles)'
      return `User is: ${roles}`
    } else if (cond.type === 'language_filter') {
      const mode = cond.mode === 'require' ? 'contains' : 'excludes'
      const words = (cond.words ?? []).join(', ') || '(no words)'
      return `Message ${mode}: "${words}"`
    } else if (cond.type === 'random') {
      return `Random (weight: ${cond.weight ?? 1})`
    }
    return 'Condition'
  }

  function addCondition(type) {
    const newCondition = emptyCondition(type)
    patch('conditions', [...(trigger.conditions ?? []), newCondition])
    return newCondition.id
  }
  function updateCondition(cid, updated) {
    patch('conditions', (trigger.conditions ?? []).map(c => c.id === cid ? updated : c))
  }
  function removeCondition(cid) {
    patch('conditions', (trigger.conditions ?? []).filter(c => c.id !== cid))
    patch('routing', (trigger.routing ?? []).filter(r => r.conditionId !== cid))
  }

  // Responses
  function addResponse() {
    const newResponse = { id: uid(), actions: [emptyAction()] }
    patch('responses', [...(trigger.responses ?? []), newResponse])
    return newResponse.id
  }
  function updateResponse(rid, updated) {
    patch('responses', (trigger.responses ?? []).map(r => r.id === rid ? updated : r))
  }
  function removeResponse(rid) {
    patch('responses', (trigger.responses ?? []).filter(r => r.id !== rid))
    patch('routing', (trigger.routing ?? []).filter(r => r.responseId !== rid))
  }

  // Routing
  function setResponseCondition(responseId, conditionId) {
    const routing = trigger.routing ?? []
    const existingRoute = routing.find(r => r.responseId === responseId)
    if (conditionId === null) {
      // Remove routing (make it fallback)
      patch('routing', routing.filter(r => r.responseId !== responseId))
    } else if (existingRoute) {
      patch('routing', routing.map(r => r.responseId === responseId ? { ...r, conditionId } : r))
    } else {
      patch('routing', [...routing, { responseId, conditionId }])
    }
  }

  async function handleSave() {
    if (!trigger.name.trim()) return
    setSaving(true)
    const toSave = {
      ...trigger,
      pattern: trigger.type === 'message' ? (trigger.pattern ?? '') : undefined,
      template: undefined,
      actions: undefined,
      // Timer-specific defaults
      interval: trigger.type === 'timer' ? (trigger.interval ?? 15) : undefined,
      intervalUnit: trigger.type === 'timer' ? (trigger.intervalUnit ?? 'minutes') : undefined,
      onlyWhenLive: trigger.type === 'timer' ? (trigger.onlyWhenLive ?? true) : undefined,
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
        <h1 className="text-twitch-text font-semibold flex-1">{isNew ? 'New Trigger' : 'Edit Trigger'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Name + enabled */}
        <div className="flex items-center gap-3">
          <input value={trigger.name} onChange={e => patch('name', e.target.value)}
            placeholder="Trigger name..."
            className="flex-1 bg-twitch-surface border border-twitch-border rounded-lg px-3 py-2 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <Toggle on={trigger.enabled} onChange={v => patch('enabled', v)} size="lg" />
            <span className="text-twitch-muted text-xs">{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>

        {/* Type */}
        <div className="flex items-center gap-0.5 bg-twitch-dark rounded-xl p-1 w-fit flex-wrap">
          {[
            { value: 'message',    label: '# Chat message' },
            { value: 'command',    label: '! Command' },
            { value: 'obs_source', label: '📡 OBS Source' },
            { value: 'timer',      label: '⏱ Timer' },
          ].map(opt => (
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
          <Card>
            <div className="flex items-center gap-2">
              <span className="text-twitch-muted font-mono shrink-0">!</span>
              <input value={(trigger.command ?? '').replace(/^!/, '')}
                onChange={e => patch('command', '!' + e.target.value.replace(/^!+/, ''))}
                placeholder="command"
                className="flex-1 font-mono bg-twitch-dark border border-twitch-border rounded-lg px-3 py-2 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-twitch-muted text-xs">Parameters</label>
                <button onClick={addParam} className="text-teal-500 hover:text-teal-400 text-xs flex items-center gap-1">
                  <Plus size={11} /> Add parameter
                </button>
              </div>
              {(trigger.commandParams ?? []).length > 0 && (
                <div className="space-y-2">
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
              <Toggle on={trigger.allowExtraText} onChange={v => patch('allowExtraText', v)} size="md" />
              <span className="text-twitch-muted text-xs">Allow extra text after parameters</span>
            </label>

            <p className="text-twitch-muted text-xs flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              Use <code className="font-mono text-teal-400">{'{param_name}'}</code> in your response to insert a parameter's value.
            </p>
          </Card>
        )}

        {/* Template builder */}
        {trigger.type === 'message' && (
          <section className="space-y-3">
            <h2 className="text-twitch-text text-sm font-medium">When a message...</h2>
            <div className="border border-twitch-border rounded-xl overflow-hidden">
              <div className="flex items-center px-3 py-2 bg-twitch-surface border-b border-twitch-border">
                <span className="text-twitch-muted text-xs font-medium">Message pattern</span>
              </div>
              <div className="p-3 bg-twitch-dark">
                <PatternEditor pattern={trigger.pattern ?? ''} onUpdate={v => patch('pattern', v)} />
              </div>
            </div>
          </section>
        )}

        {/* OBS Source trigger config */}
        {trigger.type === 'obs_source' && (
          <ObsSourceTriggerConfig trigger={trigger} patch={patch} />
        )}

        {/* Timer trigger config */}
        {trigger.type === 'timer' && (
          <section className="space-y-3">
            <h2 className="text-twitch-text text-sm font-medium">Timer settings</h2>
            <Card>
              <div className="flex items-center gap-3">
                <label className="text-twitch-muted text-xs w-24 shrink-0">Fire every</label>
                <input type="number" min={1} value={trigger.interval ?? 15}
                  onChange={e => patch('interval', Math.max(1, Number(e.target.value)))}
                  className="w-20 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
                <div className="flex gap-1">
                  {['minutes','hours'].map(unit => (
                    <button key={unit} onClick={() => patch('intervalUnit', unit)}
                      className={`text-xs px-3 py-1.5 rounded border transition-colors capitalize ${
                        (trigger.intervalUnit ?? 'minutes') === unit
                          ? 'bg-teal-900/30 border-teal-600 text-teal-400'
                          : 'border-twitch-border text-twitch-muted hover:border-twitch-muted'
                      }`}>
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Toggle on={trigger.onlyWhenLive ?? true} onChange={v => patch('onlyWhenLive', v)} size="md" />
                <span className="text-twitch-muted text-xs">Only fire when stream is live</span>
              </label>
            </Card>
          </section>
        )}

        {/* Special Considerations */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-twitch-text text-sm font-medium">Special Considerations</h2>
              {(trigger.considerations ?? []).length > 1 && (
                <p className="text-twitch-muted text-xs mt-1">Executed in order from top to bottom</p>
              )}
            </div>
          </div>
          <div className="flex justify-center mt-2">
            <div className="relative">
              <button onClick={() => setAddConsidMenu(o => !o)}
                className="flex items-center gap-1 text-xs text-teal-500 border border-teal-500 hover:border-teal-400 hover:text-teal-400 rounded-full px-4 py-1 transition-colors">
                <Plus size={12} /> Add consideration
              </button>
              {addConsidMenu && (
                <div className="absolute right-0 mt-1 bg-twitch-surface border border-twitch-border rounded-lg shadow-lg z-20 py-1 min-w-44">
                  {Object.entries(CONSIDERATION_META).map(([type, meta]) => {
                    const Icon = meta.icon
                    return (
                      <button key={type} onClick={() => addConsideration(type)}
                        className="flex items-center gap-2 w-full text-left text-xs px-3 py-2 hover:bg-twitch-dark text-twitch-text transition-colors">
                        <Icon size={11} className="text-twitch-muted" /> {meta.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {(trigger.considerations ?? []).map((c, idx) => (
              <ConsiderationRow key={c.id} consideration={c}
                onChange={updated => updateConsideration(c.id, updated)}
                onRemove={() => removeConsideration(c.id)}
                onMoveUp={() => moveConsiderationUp(c.id)}
                onMoveDown={() => moveConsiderationDown(c.id)}
                canMoveUp={idx > 0}
                canMoveDown={idx < (trigger.considerations ?? []).length - 1} />
            ))}
          </div>
        </section>

        {/* Response routing logic */}
        {(() => {
          const conditions = trigger.conditions ?? []
          const responses = trigger.responses ?? []
          const routing = trigger.routing ?? []
          const hasMultipleResponses = responses.length > 1 || conditions.length > 0

          if (!hasMultipleResponses) return null

          return (
            <section className="space-y-3">
              <h2 className="text-twitch-text text-sm font-medium">Response Logic</h2>

              <div className="bg-twitch-dark border border-twitch-border rounded-lg p-4 space-y-4">
                {/* Conditions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-twitch-muted text-xs font-medium">Conditions</p>
                    <div className="relative">
                      <button onClick={() => setAddConditionMenu(o => !o)}
                        className="text-teal-400 hover:text-teal-300 text-xs px-2 py-1 rounded border border-twitch-border hover:border-teal-600 transition-colors">
                        + Add
                      </button>
                      {addConditionMenu && (
                        <div className="absolute right-0 mt-1 bg-twitch-surface border border-twitch-border rounded-lg shadow-lg z-20 py-1 min-w-40">
                          <button onClick={() => { addCondition('user_role'); setAddConditionMenu(false) }}
                            className="flex items-center gap-2 w-full text-left text-xs px-3 py-2 hover:bg-twitch-dark text-twitch-text transition-colors">
                            User role
                          </button>
                          <button onClick={() => { addCondition('language_filter'); setAddConditionMenu(false) }}
                            className="flex items-center gap-2 w-full text-left text-xs px-3 py-2 hover:bg-twitch-dark text-twitch-text transition-colors">
                            Message filter
                          </button>
                          <button onClick={() => { addCondition('random'); setAddConditionMenu(false) }}
                            className="flex items-center gap-2 w-full text-left text-xs px-3 py-2 hover:bg-twitch-dark text-twitch-text transition-colors">
                            Random
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {conditions.length === 0 ? (
                    <p className="text-twitch-muted text-xs italic">No conditions — all responses are unconditioned</p>
                  ) : (
                    <div className="space-y-1.5">
                      {conditions.map((cond) => {
                        const isEditing = editingConditionId === cond.id
                        return (
                          <div key={cond.id} className="bg-twitch-surface rounded border border-twitch-border p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-twitch-muted text-xs flex-1">{getConditionLabel(cond)}</span>
                              <div className="flex gap-1">
                                <button onClick={() => setEditingConditionId(isEditing ? null : cond.id)}
                                  className="text-teal-400 hover:text-teal-300 text-xs px-2 py-1 rounded border border-twitch-border hover:border-teal-500 transition-colors">
                                  {isEditing ? 'Done' : 'Edit'}
                                </button>
                                <button onClick={() => removeCondition(cond.id)}
                                  className="text-twitch-muted hover:text-red-400 text-xs px-2 py-1 rounded border border-twitch-border hover:border-red-600 transition-colors">
                                  Remove
                                </button>
                              </div>
                            </div>
                            {isEditing && (
                              <div className="mt-2 pt-2 border-t border-twitch-border">
                                <ConditionEditor condition={cond} onChange={c => updateCondition(cond.id, c)} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Responses and routing */}
                <div className="pt-3 border-t border-twitch-border space-y-2">
                  <p className="text-twitch-muted text-xs font-medium">Responses</p>
                  <div className="space-y-2">
                    {responses.map((resp, idx) => {
                      const routeForThisResp = routing.find(r => r.responseId === resp.id)
                      const conditionForThisResp = conditions.find(c => c.id === routeForThisResp?.conditionId)
                      const isFallback = !routeForThisResp

                      // Only show unclaimed conditions + the one currently assigned to this response
                      const claimedConditionIds = new Set(routing.filter(r => r.responseId !== resp.id).map(r => r.conditionId))
                      const availableConditions = conditions.filter(c => !claimedConditionIds.has(c.id))

                      return (
                        <div key={resp.id} className="bg-twitch-surface rounded border border-twitch-border p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-teal-300 text-xs font-medium">Response {idx + 1}</p>
                              {isFallback ? (
                                <p className="text-twitch-muted text-xs mt-0.5">Fallback (no condition)</p>
                              ) : conditionForThisResp ? (
                                <p className="text-twitch-muted text-xs mt-0.5">
                                  When: {getConditionLabel(conditionForThisResp)}
                                </p>
                              ) : (
                                <p className="text-twitch-muted text-xs mt-0.5 text-amber-400">⚠ No condition assigned</p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {availableConditions.length > 0 && (
                                <select onChange={(e) => setResponseCondition(resp.id, e.target.value || null)}
                                  value={routeForThisResp?.conditionId ?? ''}
                                  className="text-xs px-2 py-1 rounded bg-twitch-dark border border-twitch-border text-twitch-text">
                                  <option value="">Fallback</option>
                                  {availableConditions.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {getConditionLabel(c)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => addResponse()}
                    className="text-teal-400 hover:text-teal-300 text-xs px-2 py-1 rounded border border-twitch-border hover:border-teal-600 transition-colors">
                    + Add response
                  </button>
                </div>

                {/* Logic gaps - only warn if there's no fallback */}
                {(() => {
                  const roleConditions = conditions.filter(c => c.type === 'user_role')
                  const langConditions = conditions.filter(c => c.type === 'language_filter')
                  const hasUnroutedResponse = responses.some(r => !routing.find(rt => rt.responseId === r.id))
                  const failures = []

                  // If there's a fallback, no warnings needed
                  if (hasUnroutedResponse) return null

                  // Check role coverage
                  if (roleConditions.length > 0) {
                    const allRoles = ['moderator', 'vip', 'subscriber', 'follower']
                    const coveredRoles = new Set()
                    roleConditions.forEach(c => (c.roles ?? []).forEach(r => coveredRoles.add(r)))
                    const uncoveredRoles = allRoles.filter(r => !coveredRoles.has(r))

                    if (uncoveredRoles.length > 0) {
                      failures.push(`Users who are ${uncoveredRoles.join(' or ')}`)
                    }
                  }

                  // Check language filter coverage
                  if (langConditions.length > 0) {
                    langConditions.forEach(lc => {
                      const mode = lc.mode === 'require' ? 'containing' : 'not containing'
                      const words = (lc.words ?? []).join(', ')
                      failures.push(`Messages ${mode} "${words}"`)
                    })
                  }

                  // If there are both role and language conditions, check combinations
                  if (roleConditions.length > 0 && langConditions.length > 0) {
                    const allRoles = ['moderator', 'vip', 'subscriber', 'follower']
                    const coveredRoles = new Set()
                    roleConditions.forEach(c => (c.roles ?? []).forEach(r => coveredRoles.add(r)))
                    const uncoveredRoles = allRoles.filter(r => !coveredRoles.has(r))

                    if (uncoveredRoles.length > 0) {
                      langConditions.forEach(lc => {
                        const mode = lc.mode === 'require' ? 'containing' : 'not containing'
                        failures.push(`${uncoveredRoles.join(' or ')} users with messages ${mode} "${(lc.words ?? []).join(', ')}"`)
                      })
                    }
                  }

                  return failures.length > 0 ? (
                    <div className="pt-3 border-t border-twitch-border">
                      <div className="bg-red-900/20 border border-red-700/30 rounded p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-twitch-text text-xs font-medium">Trigger will NOT fire for:</p>
                            <ul className="text-twitch-muted text-xs space-y-0.5 mt-1.5 ml-4 list-disc">
                              {failures.map((scenario, idx) => (
                                <li key={idx}>{scenario}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null
                })()}

                {/* Execution order explainer */}
                {(() => {
                  const routedResponses = responses.filter(r => routing.find(rt => rt.responseId === r.id))
                  const fallbackResponse = responses.find(r => !routing.find(rt => rt.responseId === r.id))
                  const fallbackIsFirst = fallbackResponse && responses.indexOf(fallbackResponse) === 0

                  return (
                    <div className="pt-3 border-t border-twitch-border space-y-2">
                      <p className="text-twitch-muted text-xs font-medium">Execution order:</p>
                      <div className={`rounded p-3 space-y-1.5 text-xs ${
                        fallbackIsFirst ? 'bg-red-900/20 border border-red-700/30' : 'bg-twitch-surface border border-twitch-border'
                      }`}>
                        {fallbackIsFirst && (
                          <div className="flex items-start gap-2 mb-2 pb-2 border-b border-red-700/30">
                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-200">Fallback is first — nothing else will trigger!</p>
                          </div>
                        )}
                        {routedResponses.length === 0 && !fallbackResponse ? (
                          <p className="text-twitch-muted italic">No responses configured</p>
                        ) : (
                          <>
                            {routedResponses.map((resp, idx) => {
                              const route = routing.find(rt => rt.responseId === resp.id)
                              const cond = conditions.find(c => c.id === route?.conditionId)
                              return (
                                <div key={resp.id} className="text-twitch-muted">
                                  <span className="text-amber-300 font-medium">Step {idx + 1}:</span> If {getConditionLabel(cond)} → <span className="text-teal-300 font-medium">Response {responses.indexOf(resp) + 1}</span>
                                </div>
                              )
                            })}
                            {fallbackResponse && (
                              <div className="text-twitch-muted">
                                <span className="text-amber-300 font-medium">Fallback:</span> If nothing matched → <span className="text-teal-300 font-medium">Response {responses.indexOf(fallbackResponse) + 1}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </section>
          )
        })()}

        {/* Response details */}
        <section className="space-y-3">
          <h2 className="text-twitch-text text-sm font-medium">Response Details</h2>
          <div className="space-y-3">
            {(trigger.responses ?? []).map((response, i) => (
              <ResponseGroup key={response.id} group={{ actions: response.actions }} groupIndex={i}
                onChange={updated => updateResponse(response.id, { ...response, actions: updated.actions ?? updated })}
                onRemove={() => removeResponse(response.id)}
                canRemove={(trigger.responses ?? []).length > 1}
                hasBot={hasBot} params={commandParamNames} pattern={trigger.pattern}
                isMultiResponse={(trigger.responses ?? []).length > 1} />
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={addResponse}
              className="flex items-center gap-1.5 text-sm text-twitch-muted hover:text-teal-400 border border-twitch-border hover:border-teal-600 px-3 py-1.5 rounded-lg transition-colors">
              <Shuffle size={13} /> Add response
            </button>
          </div>
        </section>

        {/* Cooldowns */}
        <Card title="Cooldowns">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'cooldown',     label: 'Global cooldown',   desc: 'How long before anyone can trigger it again.',         prefKey: 'cooldown_unit' },
              { key: 'userCooldown', label: 'Per-user cooldown', desc: 'How long before each user can trigger it again.', prefKey: 'userCooldown_unit' },
            ].map(({ key, label, desc, prefKey }) => (
              <div key={key} className="space-y-1">
                <label className="text-twitch-muted text-xs">{label}</label>
                <DurationInput value={trigger[key]} onChange={v => patch(key, v)} preferenceKey={prefKey} />
                <p className="text-twitch-muted text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Activation */}
        <ActivationCard activation={trigger.activation} onChange={v => patch('activation', v)} />

        {/* Test panel */}
        {!isNew && (
          <Card title="Test">
            <div className="flex items-center gap-2">
              <input value={testText} onChange={e => setTestText(e.target.value)} placeholder="Test message..."
                className="flex-1 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-text text-sm focus:outline-none focus:border-teal-600" />
              <input value={testUsername} onChange={e => setTestUsername(e.target.value)} placeholder="username"
                className="w-28 bg-twitch-dark border border-twitch-border rounded px-2 py-1.5 text-twitch-muted text-sm focus:outline-none focus:border-teal-600" />
              <button onClick={runTest} className="bg-teal-700 hover:bg-teal-600 text-white text-sm px-3 py-1.5 rounded transition-colors">Test</button>
            </div>
            <p className="text-twitch-muted text-xs flex items-center gap-1">
              <Info size={10} /> Test only checks message/command matching — not considerations or response group conditions.
            </p>
            {testResults && testResults.map(r => r.id === id && (
              <div key={r.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${r.matches ? 'bg-teal-900/30 text-teal-400' : 'bg-red-900/20 text-red-400'}`}>
                {r.matches ? '✓ Would fire' : '✕ Would not fire'}
              </div>
            ))}
          </Card>
        )}

        {/* Cyclical trigger warning */}
        {!hasBot && (() => {
          const allTemplates = (trigger.responses ?? []).flatMap(r => (r.actions ?? []).map(a => a.template ?? '')).join(' ')
          const hasChatAction = (trigger.responses ?? []).some(r => (r.actions ?? []).some(a => a.type === 'send_chat_response'))
          const looksRecursive = hasChatAction && allTemplates.trim().length > 0
          if (!looksRecursive) return null
          return (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-900/20 border border-amber-700/40 rounded-xl">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-amber-300 text-xs font-medium">No bot account set up</p>
                <p className="text-amber-400/80 text-xs">Without a bot account, your main account sends responses — which may trigger your own triggers again and create a loop. Set up a bot account in Settings to prevent this.</p>
              </div>
            </div>
          )
        })()}

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
