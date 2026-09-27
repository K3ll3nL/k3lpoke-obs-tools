// Patterns -> native RegExp (backtracks across alternatives); triggers indexed by command word / first char.
import { parsePattern } from './chatEngine.js'

const NON_CHAT_TYPES = new Set(['obs_source', 'timer', 'channel_point'])
const DIGITS = '0123456789'

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function ciEsc(s) {
  let out = ''
  for (const ch of s) {
    const l = ch.toLowerCase(), u = ch.toUpperCase()
    out += (l !== u && l.length === 1 && u.length === 1) ? `[${esc(l)}${esc(u)}]` : esc(ch)
  }
  return out
}

function addParam(ctx, name, extra) {
  const finalName = name || `param_${ctx.names.size}`
  ctx.names.add(finalName)
  const idx = ++ctx.groups
  ctx.map.push({ idx, name: finalName, ...extra })
  return finalName
}

function captureRe(seg, ctx, optional) {
  addParam(ctx, seg.name)
  const core = seg.captureType === 'number' ? '(\\d+)(?!\\d)' : '(\\S+)(?!\\S)'
  return optional ? `(?:${core}\\s*)?` : `${core}\\s*`
}

// Lookahead checks (anyof/minletters/mindigits) inspect the whole (sub)pattern input in the
// legacy matcher, so they are hoisted to the start of the (sub)pattern here.
function compileSegments(segments, ctx) {
  let look = '', body = ''
  for (const seg of segments) {
    switch (seg.type) {
      case 'text': body += esc(seg.value) + '\\s*'; break
      case 'capture': body += captureRe(seg, ctx, false); break
      case 'optional_capture': body += captureRe(seg, ctx, true); break
      case 'optional': if (seg.value) body += `(?:${esc(seg.value)}\\s*)?`; break
      case 'choice': {
        const name = seg.name || `param_${ctx.names.size}`
        ctx.names.add(name)
        const idx = ++ctx.groups
        ctx.map.push({ idx, name, trim: true })
        const alts = (seg.options ?? []).map(o => `(?:${compileSegments(parsePattern(o), ctx)})`)
        body += alts.length ? `(${alts.join('|')})` : '(?!)'
        break
      }
      case 'optional_choice': {
        const opts = (seg.options ?? []).filter(Boolean)
        if (!opts.length) break
        const name = seg.name || `param_${ctx.names.size}`
        ctx.names.add(name)
        const alts = opts.map(opt => {
          const idx = ++ctx.groups
          ctx.map.push({ idx, name, value: opt })
          return `(${ciEsc(opt)})`
        })
        body += `(?:(?:${alts.join('|')})\\s*)?`
        break
      }
      case 'seq': body += `(?:${compileSegments(parsePattern(seg.subPattern), ctx)})`; break
      case 'optional_seq': body += `(?:${compileSegments(parsePattern(seg.subPattern), ctx)})?`; break
      case 'anyof': {
        const opts = (seg.options ?? []).filter(Boolean)
        look += opts.length ? `(?=[\\s\\S]*?(?:${opts.map(ciEsc).join('|')}))` : '(?!)'
        break
      }
      case 'minletters': look += `(?=(?:[^a-zA-Z]*[a-zA-Z]){${seg.min}})`; break
      case 'mindigits': look += `(?=(?:\\D*\\d){${seg.min}})`; break
      case 'msg_start': body += '^'; break
      case 'msg_end': body += '$'; break
    }
  }
  return look + body
}

// Set of chars a match can start with, or null if it could start with anything / be empty.
function firstChars(segments) {
  const set = new Set()
  const merge = (sub) => { if (!sub) return false; sub.forEach(c => set.add(c)); return true }
  for (const seg of segments) {
    switch (seg.type) {
      case 'text': set.add(seg.value[0]); return set
      case 'capture':
        if (seg.captureType !== 'number') return null
        for (const d of DIGITS) set.add(d)
        return set
      case 'choice':
        for (const o of seg.options ?? []) if (!merge(firstChars(parsePattern(o)))) return null
        return set
      case 'seq':
        return merge(firstChars(parsePattern(seg.subPattern))) ? set : null
      case 'optional':
        if (seg.value) set.add(seg.value[0])
        break
      case 'optional_capture':
        if (seg.captureType !== 'number') return null
        for (const d of DIGITS) set.add(d)
        break
      case 'optional_choice':
        for (const o of seg.options ?? []) if (o) { set.add(o[0].toLowerCase()); set.add(o[0].toUpperCase()) }
        break
      case 'optional_seq':
        if (!merge(firstChars(parsePattern(seg.subPattern)))) return null
        break
      case 'msg_end': return set
      default: break // zero-width: anyof, minletters, mindigits, msg_start
    }
  }
  return null
}

const _compiled = new Map() // pattern string -> { re, map, first } | null

export function compilePattern(pattern) {
  let c = _compiled.get(pattern)
  if (c !== undefined) return c
  try {
    const segments = parsePattern(pattern)
    const ctx = { groups: 0, map: [], names: new Set() }
    c = { re: new RegExp('^' + compileSegments(segments, ctx)), map: ctx.map, first: firstChars(segments) }
  } catch {
    c = null
  }
  if (_compiled.size > 5000) _compiled.clear()
  _compiled.set(pattern, c)
  return c
}

// normText must already be trimmed with NBSPs replaced (same as the legacy matcher).
export function execCompiled(c, normText) {
  const m = c.re.exec(normText)
  if (!m) return null
  const params = {}
  for (const g of c.map) {
    const v = m[g.idx]
    if (v === undefined) continue
    params[g.name] = g.value ?? (g.trim ? v.trim() : v)
  }
  return params
}

function push(map, key, entry) {
  const list = map.get(key)
  if (list) list.push(entry); else map.set(key, [entry])
}

export function buildTriggerIndex(triggers) {
  const byCommand = new Map(), byChar = new Map(), always = []
  triggers.forEach((t, order) => {
    if (!t.enabled || NON_CHAT_TYPES.has(t.type)) return
    const entry = { t, order }
    if (t.type === 'command') {
      if (t.command) push(byCommand, t.command.toLowerCase(), entry)
      return
    }
    if (t.pattern) {
      const c = compilePattern(t.pattern)
      if (c?.first) { for (const ch of c.first) push(byChar, ch, entry); return }
    }
    always.push(entry)
  })
  return { byCommand, byChar, always }
}

const EMPTY = []

// Returns only the triggers that could match `text`, in original trigger order.
export function candidateTriggers(index, text) {
  const trimmed = text.trim()
  const sp = trimmed.search(/\s/)
  const word = (sp < 0 ? trimmed : trimmed.slice(0, sp)).toLowerCase()
  const lists = [index.byCommand.get(word), index.byChar.get(trimmed[0]), index.always]
    .filter(l => l && l.length)
  if (lists.length === 0) return EMPTY
  if (lists.length === 1) return lists[0].map(e => e.t)
  return lists.flat().sort((a, b) => a.order - b.order).map(e => e.t)
}
