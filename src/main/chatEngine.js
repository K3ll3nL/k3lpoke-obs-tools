import WebSocket from 'ws'
import fs from 'fs'

// ── IRC connection ─────────────────────────────────────────────────────────

let _ws = null
let _connected = false
let _channel = null
let _username = null
let _token = null
let _reconnectTimer = null
let _mainWindow = null

const _msgHandlers = []
const _connHandlers = []

// Timer and OBS source trigger state
let _engineOpts = {}
const _timerHandles = new Map() // triggerId -> intervalHandle

// ── Stream state polling ───────────────────────────────────────────────────

let _streamState = { isLive: false, gameCategory: null, title: null }
let _streamPollHandle = null

export function onChatMessage(cb) { _msgHandlers.push(cb) }
export function onConnectionChange(cb) { _connHandlers.push(cb) }
export function setEngineWindow(win) { _mainWindow = win }
export function getChatEngineStatus() { return { connected: _connected, channel: _channel } }
export function setEngineOpts(opts) { _engineOpts = opts }

export function startChatEngine(username, token, channelName) {
  _username = username?.toLowerCase()
  _token = token
  _channel = channelName?.toLowerCase()
  stopChatEngine()
  _connect()
}

export function stopChatEngine() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
  if (_ws) { _ws.removeAllListeners(); try { _ws.close() } catch {} ; _ws = null }
  if (_connected) {
    _connected = false
    _connHandlers.forEach(cb => cb({ connected: false }))
    _mainWindow?.webContents.send('chatTriggers:status', { connected: false })
  }
}

function _connect() {
  if (!_token || !_username || !_channel) return
  _ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')

  _ws.on('open', () => {
    _ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    _ws.send(`PASS oauth:${_token}`)
    _ws.send(`NICK ${_username}`)
    _ws.send(`JOIN #${_channel}`)
  })

  _ws.on('message', (raw) => {
    for (const line of raw.toString().split('\r\n').filter(Boolean)) _parseLine(line)
  })

  _ws.on('error', () => {})

  _ws.on('close', () => {
    if (_connected) {
      _connected = false
      _connHandlers.forEach(cb => cb({ connected: false }))
      _mainWindow?.webContents.send('chatTriggers:status', { connected: false })
    }
    _reconnectTimer = setTimeout(_connect, 5000)
  })
}

function _parseLine(line) {
  if (line.startsWith('PING')) { _ws?.send(line.replace('PING', 'PONG')); return }

  let tags = {}, rest = line
  if (line.startsWith('@')) {
    const sp = line.indexOf(' ')
    for (const part of line.slice(1, sp).split(';')) {
      const eq = part.indexOf('=')
      if (eq >= 0) tags[part.slice(0, eq)] = part.slice(eq + 1)
    }
    rest = line.slice(sp + 1)
  }

  const parts = rest.split(' ')
  let prefix = '', command = '', msgParams = []
  if (parts[0].startsWith(':')) {
    prefix = parts[0].slice(1); command = parts[1]; msgParams = parts.slice(2)
  } else {
    command = parts[0]; msgParams = parts.slice(1)
  }

  if (command === '001') {
    _connected = true
    _connHandlers.forEach(cb => cb({ connected: true, channel: _channel }))
    _mainWindow?.webContents.send('chatTriggers:status', { connected: true, channel: _channel })
  }

  if (command === 'PRIVMSG') {
    const msgChannel = msgParams[0]?.replace('#', '') ?? ''
    const trailIdx = msgParams.findIndex(p => p.startsWith(':'))
    const text = msgParams.slice(trailIdx).join(' ').replace(/^:/, '')
    const username = prefix.split('!')[0] ?? ''
    const badgesStr = tags['badges'] ?? ''
    const badges = {}
    badgesStr.split(',').forEach(b => { const [k, v] = b.split('/'); if (k) badges[k] = v ?? '1' })

    const msg = {
      channel: msgChannel,
      username: username.toLowerCase(),
      displayName: tags['display-name'] ?? username,
      userId: tags['user-id'] ?? '',
      text,
      badges,
      msgId: tags['id'] ?? '',
      isMod: tags['mod'] === '1',
      isSubscriber: tags['subscriber'] === '1',
      isVip: !!badges['vip'],
      isBroadcaster: username.toLowerCase() === _channel,
    }
    // Skip messages from the configured bot account to prevent trigger loops
    const botLogin = typeof _engineOpts.botUsername === 'function' ? _engineOpts.botUsername() : _engineOpts.botUsername
    if (botLogin && username.toLowerCase() === botLogin) return

    _msgHandlers.forEach(cb => cb(msg))
    _mainWindow?.webContents.send('chatTriggers:message', msg)
  }
}

// ── Pattern parsing and matching ──────────────────────────────────────────

function _parsePattern(pattern) {
  if (!pattern) return []
  const segments = []
  let i = 0

  while (i < pattern.length) {
    if (pattern.slice(i, i + 2) === '@{') {
      const end = pattern.indexOf('}', i + 2)
      if (end === -1) break
      const content = pattern.slice(i + 2, end)
      const parts = content.split('|')

      if (parts[0] === 'choice') {
        const name = parts[1] || ''
        const options = parts.slice(2).filter(Boolean)
          .map(o => { try { return decodeURIComponent(o) } catch { return o } })
          .filter(o => o.trim())
        segments.push({ type: 'choice', options, name })
      } else if (parts[0] === 'capture') {
        const captureType = parts[1] || 'text'
        const name = parts[2] || ''
        segments.push({ type: 'capture', captureType, name })
      } else if (parts[0] === 'optional') {
        segments.push({ type: 'optional', value: parts.slice(1).join('|') })
      } else if (parts[0] === 'optional_capture') {
        const captureType = parts[1] || 'text'
        const name = parts[2] || ''
        segments.push({ type: 'optional_capture', captureType, name })
      } else if (parts[0] === 'optional_choice') {
        const name = parts[1] || ''
        const options = parts.slice(2).filter(Boolean)
        segments.push({ type: 'optional_choice', name, options })
      } else if (parts[0] === 'optional_seq') {
        try {
          const subPattern = decodeURIComponent(parts.slice(1).join('|'))
          segments.push({ type: 'optional_seq', subPattern })
        } catch {}
      } else if (parts[0] === 'seq') {
        try {
          // format: seq|LABEL|ENCODED (new) or seq|ENCODED (old)
          const encoded = parts.length >= 3 ? parts[2] : parts[1]
          const subPattern = decodeURIComponent(encoded || '')
          segments.push({ type: 'seq', subPattern })
        } catch {}
      } else if (parts[0] === 'anyof') {
        segments.push({ type: 'anyof', options: parts.slice(1).filter(Boolean) })
      } else if (parts[0] === 'minletters') {
        segments.push({ type: 'minletters', min: parseInt(parts[1]) || 1 })
      } else if (parts[0] === 'mindigits') {
        segments.push({ type: 'mindigits', min: parseInt(parts[1]) || 1 })
      } else if (parts[0] === 'msg_start') {
        segments.push({ type: 'msg_start' })
      } else if (parts[0] === 'msg_end') {
        segments.push({ type: 'msg_end' })
      }
      i = end + 1
    } else {
      let textEnd = i
      while (textEnd < pattern.length && pattern.slice(textEnd, textEnd + 2) !== '@{') {
        textEnd++
      }
      const text = pattern.slice(i, textEnd)
      if (text) segments.push({ type: 'text', value: text })
      i = textEnd
    }
  }

  return segments
}

// Returns { params, remaining } or null. Used by _matchPattern and optional_seq.
function _executeMatch(segments, text) {
  const originalText = text
  let remaining = text
  const params = {}

  for (const segment of segments) {
    if (segment.type === 'text') {
      const lit = segment.value
      if (!remaining.startsWith(lit)) return null
      remaining = remaining.slice(lit.length).trimStart()
    } else if (segment.type === 'choice') {
      const opts = segment.options ?? []
      const paramName = segment.name || `param_${Object.keys(params).length}`
      let matched = false
      for (const opt of opts) {
        const subResult = _executeMatch(_parsePattern(opt), remaining)
        if (subResult !== null) {
          params[paramName] = remaining.slice(0, remaining.length - subResult.remaining.length).trim()
          Object.assign(params, subResult.params)
          remaining = subResult.remaining
          matched = true
          break
        }
      }
      if (!matched) return null
    } else if (segment.type === 'capture') {
      const paramName = segment.name || `param_${Object.keys(params).length}`
      if (segment.captureType === 'number') {
        const m = remaining.match(/^(\d+)/)
        if (!m) return null
        params[paramName] = m[1]
        remaining = remaining.slice(m[1].length).trimStart()
      } else {
        const m = remaining.match(/^(\S+)/)
        if (!m) return null
        params[paramName] = m[1]
        remaining = remaining.slice(m[1].length).trimStart()
      }
    } else if (segment.type === 'optional') {
      const word = segment.value
      if (remaining.startsWith(word)) remaining = remaining.slice(word.length).trimStart()
    } else if (segment.type === 'optional_capture') {
      const paramName = segment.name || `param_${Object.keys(params).length}`
      if (segment.captureType === 'number') {
        const m = remaining.match(/^(\d+)/)
        if (m) { params[paramName] = m[1]; remaining = remaining.slice(m[1].length).trimStart() }
      } else {
        const m = remaining.match(/^(\S+)/)
        if (m) { params[paramName] = m[1]; remaining = remaining.slice(m[1].length).trimStart() }
      }
    } else if (segment.type === 'optional_choice') {
      const opts = segment.options ?? []
      const paramName = segment.name || `param_${Object.keys(params).length}`
      for (const opt of opts) {
        if (remaining.toLowerCase().startsWith(opt.toLowerCase())) {
          params[paramName] = opt
          remaining = remaining.slice(opt.length).trimStart()
          break
        }
      }
    } else if (segment.type === 'optional_seq') {
      const subSegments = _parsePattern(segment.subPattern)
      const result = _executeMatch(subSegments, remaining)
      if (result) { Object.assign(params, result.params); remaining = result.remaining }
    } else if (segment.type === 'seq') {
      const subSegments = _parsePattern(segment.subPattern)
      const result = _executeMatch(subSegments, remaining)
      if (!result) return null
      Object.assign(params, result.params)
      remaining = result.remaining
    } else if (segment.type === 'anyof') {
      const opts = segment.options ?? []
      const low = originalText.toLowerCase()
      if (!opts.some(opt => low.includes(opt.toLowerCase()))) return null
    } else if (segment.type === 'minletters') {
      const count = (originalText.match(/[a-zA-Z]/g) ?? []).length
      if (count < segment.min) return null
    } else if (segment.type === 'mindigits') {
      const count = (originalText.match(/\d/g) ?? []).length
      if (count < segment.min) return null
    } else if (segment.type === 'msg_start') {
      if (remaining !== originalText) return null
    } else if (segment.type === 'msg_end') {
      if (remaining !== '') return null
    }
  }

  return { params, remaining }
}

function _matchPattern(pattern, text) {
  if (!pattern) return { match: true, params: {} }
  const result = _executeMatch(_parsePattern(pattern), text.trim())
  return result ? { match: true, params: result.params } : null
}

export function matchTrigger(trigger, msg) {
  if (!trigger.enabled) return null
  // These types fire via their own mechanisms, not chat messages
  if (trigger.type === 'obs_source' || trigger.type === 'timer') return null

  if (trigger.type === 'command') {
    const tokens = msg.text.trim().split(/\s+/)
    const cmd = tokens[0]?.toLowerCase()
    if (cmd !== trigger.command?.toLowerCase()) return null

    const argTokens = tokens.slice(1)
    const params = {}
    const trigParams = trigger.commandParams ?? []

    if (!trigger.allowExtraText && argTokens.length > trigParams.length) return null

    for (let i = 0; i < trigParams.length; i++) {
      const p = trigParams[i]
      if (!p.optional && argTokens[i] == null) return null
      let val = argTokens[i] ?? ''
      if (p.paramType === 'number' && val !== '') {
        if (isNaN(Number(val))) return null
        val = val
      }
      params[p.name] = val
    }
    return { params }
  }

  // New pattern-based conditions
  if (trigger.pattern) {
    const result = _matchPattern(trigger.pattern, msg.text)
    return result ? { params: result.params ?? {} } : null
  }

  // Legacy block-based conditions
  if (trigger.blocks) {
    return _matchBlocks(trigger.blocks, msg) ? { params: {} } : null
  }

  // Legacy condition groups
  const groups = trigger.conditions ?? []
  if (groups.length === 0) return { params: {} }
  for (const group of groups) {
    const results = (group.matchers ?? []).map(m => _evalMatcher(m, msg))
    const passed = group.mode === 'all_of' ? results.every(Boolean) : results.some(Boolean)
    if (!passed) return null
  }
  return { params: {} }
}

function _matchBlocks(blocks, msg) {
  if (!blocks || blocks.length === 0) return true
  let result = _evalBlock(blocks[0], msg)
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    const r = _evalBlock(b, msg)
    result = (b.connector === 'or') ? (result || r) : (result && r)
  }
  return result
}

function _evalBlock(block, msg) {
  let result
  switch (block.type) {
    case 'user_level':
      result = _checkUserLevel(msg, block.userLevel ?? 'anyone')
      break
    case 'user_in_list': {
      const users = Array.isArray(block.users)
        ? block.users.map(u => u.toLowerCase())
        : (block.users ?? '').split('\n').map(u => u.trim().toLowerCase()).filter(Boolean)
      result = users.includes(msg.username)
      break
    }
    case 'length': {
      const len = msg.text.length
      const n = parseInt(block.value ?? 0)
      result = block.operator === 'lt' ? len < n : block.operator === 'eq' ? len === n : len > n
      break
    }
    default:
      result = _evalTextBlock(block, msg.text)
  }
  return block.negate ? !result : result
}

function _evalTextBlock(block, text) {
  const cs = block.caseSensitive
  const t = cs ? text : text.toLowerCase()

  const checkOne = (raw) => {
    const v = cs ? raw : raw.toLowerCase()
    switch (block.type) {
      case 'contains':
        if (block.anchorStart && block.anchorEnd) return t === v
        if (block.anchorStart) return t.startsWith(v)
        if (block.anchorEnd)   return t.endsWith(v)
        return t.includes(v)
      case 'starts_with': return t.startsWith(v)
      case 'ends_with':   return t.endsWith(v)
      case 'exact':       return t === v
      case 'word': {
        const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        try { return new RegExp(`\\b${escaped}\\b`, cs ? '' : 'i').test(text) } catch { return false }
      }
      case 'wildcard': {
        const pattern = v.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
        try { return new RegExp(`^${pattern}$`, cs ? '' : 'i').test(text) } catch { return false }
      }
      default: return false
    }
  }

  if (block.valueMode === 'list') return (block.values ?? []).some(v => v && checkOne(v))
  return block.value ? checkOne(block.value) : false
}

function _evalMatcher(matcher, msg) {
  const text = matcher.caseSensitive ? msg.text : msg.text.toLowerCase()
  const val  = matcher.caseSensitive ? (matcher.value ?? '') : (matcher.value ?? '').toLowerCase()
  switch (matcher.type) {
    case 'contains': {
      if (matcher.anchorStart && matcher.anchorEnd) return text === val
      if (matcher.anchorStart) return text.startsWith(val)
      if (matcher.anchorEnd)   return text.endsWith(val)
      return text.includes(val)
    }
    case 'starts_with': return text.startsWith(val)
    case 'ends_with':   return text.endsWith(val)
    case 'exact':       return text === val
    case 'user_level':  return _checkUserLevel(msg, matcher.userLevel)
    case 'user_in_list': {
      const list = (matcher.users ?? []).map(u => u.toLowerCase())
      return list.includes(msg.username)
    }
    default: return false
  }
}

function _checkUserLevel(msg, level) {
  switch (level) {
    case 'broadcaster': return msg.isBroadcaster
    case 'moderator':   return msg.isBroadcaster || msg.isMod
    case 'vip':         return msg.isBroadcaster || msg.isMod || msg.isVip
    case 'subscriber':  return msg.isBroadcaster || msg.isMod || msg.isVip || msg.isSubscriber
    default:            return true
  }
}

// ── Template rendering ─────────────────────────────────────────────────────

export function renderTemplate(template, ctx) {
  let result = template

  // Handle @{varname} format (new datapill format)
  result = result.replace(/@\{([^}]+)\}/g, (match, varName) => {
    if (varName === 'user') return ctx.username ?? ''
    if (varName === 'display_name') return ctx.displayName ?? ctx.username ?? ''
    if (varName === 'channel') return ctx.channel ?? ''
    if (varName === 'message') return ctx.text ?? ''
    if (varName === 'followage') return ctx.followage ?? '(unknown)'
    // Named parameter from pattern capture/choice
    if (ctx.params?.[varName]) return ctx.params[varName]
    return match
  })

  // Legacy {varname} format for backward compatibility
  result = result
    .replace(/\{user\}/gi, ctx.username ?? '')
    .replace(/\{display_name\}/gi, ctx.displayName ?? ctx.username ?? '')
    .replace(/\{channel\}/gi, ctx.channel ?? '')
    .replace(/\{message\}/gi, ctx.text ?? '')
    .replace(/\{param_(\w+)\}/gi, (_, name) => ctx.params?.[name] ?? '')
    .replace(/\{followage\}/gi, ctx.followage ?? '(unknown)')
    .replace(/\{followage_of:(\w+)\}/gi, (_, param) => ctx.followageOf?.[param] ?? '(unknown)')

  return result
}

// ── Cooldown tracking (in-memory) ─────────────────────────────────────────

const _globalCooldowns     = {}  // triggerId -> timestamp
const _userCooldowns       = {}  // `${triggerId}:${username}` -> timestamp
const _chatActivityCounters = {} // triggerId -> message count since last fire
const _sceneOnceUsed       = new Set() // sceneName already suppressed this session

export function checkAndSetCooldowns(trigger, username) {
  const now = Date.now()
  const gKey = trigger.id
  const uKey = `${trigger.id}:${username}`

  if (trigger.cooldown > 0) {
    const last = _globalCooldowns[gKey] ?? 0
    if (now - last < trigger.cooldown * 1000) return false
  }
  if (trigger.userCooldown > 0) {
    const last = _userCooldowns[uKey] ?? 0
    if (now - last < trigger.userCooldown * 1000) return false
  }

  _globalCooldowns[gKey] = now
  _userCooldowns[uKey] = now
  return true
}

// ── Considerations ─────────────────────────────────────────────────────────

function normalizeText(text, ignoreSpaces, ignorePunct) {
  let t = text.toLowerCase()
  if (ignoreSpaces) t = t.replace(/\s/g, '')
  if (ignorePunct)  t = t.replace(/[^\w]/g, '')
  return t
}

function normalizeWords(words, ignoreSpaces, ignorePunct) {
  return words.map(w => normalizeText(w, ignoreSpaces, ignorePunct))
}

function checkLanguageFilter(text, { mode, words = [], ignoreSpaces, ignorePunct }) {
  const norm = normalizeText(text, ignoreSpaces, ignorePunct)
  const normWords = normalizeWords(words, ignoreSpaces, ignorePunct).filter(Boolean)
  if (normWords.length === 0) return true
  if (mode === 'require') return normWords.every(w => norm.includes(w))
  if (mode === 'blacklist') return !normWords.some(w => norm.includes(w))
  return true
}

async function evaluateConsiderations(considerations, msg, triggerId, opts) {
  let waitMs = 0
  for (const c of considerations) {
    if (!c.enabled) continue
    switch (c.type) {
      case 'chance':
        if (Math.random() * 100 >= c.percent) return { pass: false }
        break
      case 'language_filter':
        if (!checkLanguageFilter(msg.text, c)) return { pass: false }
        break
      case 'wait':
        waitMs = Math.max(waitMs, (c.seconds ?? 0) * 1000)
        break
      case 'chat_activity': {
        const count = _chatActivityCounters[triggerId] ?? 0
        if (count < (c.messageCount ?? 1)) return { pass: false }
        _chatActivityCounters[triggerId] = 0
        break
      }
      case 'obs_source': {
        const scene = c.scene ?? opts.getCurrentScene?.()
        if (!scene) break
        const poll = async () => {
          const items = await opts.obsGetSceneItemList?.(scene) ?? []
          const item = items.find(i => i.sourceName === c.source)
          const isVisible = item?.sceneItemEnabled ?? false
          return c.state === 'visible' ? isVisible : !isVisible
        }
        const ok = await poll()
        if (!ok) {
          if (c.onFail === 'wait') {
            const deadline = Date.now() + 30000
            let passed = false
            while (Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 1000))
              if (await poll()) { passed = true; break }
            }
            if (!passed) return { pass: false }
          } else {
            return { pass: false }
          }
        }
        break
      }
    }
  }
  return { pass: true, waitMs }
}

// ── Response selection ────────────────────────────────────────────────────

async function selectResponse(responses, conditions, routing, msg, opts) {
  const { fetchFollowage, mainUser } = opts

  // Check routing: evaluate each condition and find matching response
  for (const route of routing) {
    const condition = conditions.find(c => c.id === route.conditionId)
    if (!condition) continue

    const matches = await evaluateConditionForResponse(condition, msg, opts)
    if (matches) {
      return responses.find(r => r.id === route.responseId)
    }
  }

  // Fallback: return first response (unconditioned)
  return responses[0]
}

// Legacy fallback for old responseGroups structure
async function selectResponseGroup(groups, msg, opts) {
  const { fetchFollowage, mainUser } = opts

  // Phase 1: Check deterministic conditions (user role, language filter)
  for (const group of groups) {
    const cond = group.condition
    if (!cond || cond.type === 'random') continue

    if (cond.type === 'user_role') {
      const roles = cond.roles ?? []
      let match = false
      if (roles.includes('moderator') && msg.isMod) match = true
      if (roles.includes('vip') && msg.isVip) match = true
      if (roles.includes('subscriber') && msg.isSubscriber) match = true
      if (roles.includes('follower') && !match && mainUser?.id) {
        try {
          const fa = await fetchFollowage?.(msg.userId, mainUser.id)
          if (fa && fa !== '(unknown)') match = true
        } catch {}
      }
      if (match) return group
    }

    if (cond.type === 'language_filter') {
      if (checkLanguageFilter(msg.text, cond)) return group
    }
  }

  // Phase 2: Weighted random
  const randomGroups = groups.filter(g => g.condition?.type === 'random')
  if (randomGroups.length > 0) {
    const totalWeight = randomGroups.reduce((sum, g) => sum + (g.condition.weight ?? 1), 0)
    let random = Math.random() * totalWeight
    for (const group of randomGroups) {
      random -= (group.condition.weight ?? 1)
      if (random <= 0) return group
    }
    return randomGroups[randomGroups.length - 1]
  }

  // Fallback
  return groups.find(g => g.condition === null) ?? groups[0]
}

async function evaluateConditionForResponse(condition, msg, opts) {
  const { fetchFollowage, mainUser } = opts

  if (condition.type === 'user_role') {
    const roles = condition.roles ?? []
    let match = false
    if (roles.includes('moderator') && msg.isMod) match = true
    if (roles.includes('vip') && msg.isVip) match = true
    if (roles.includes('subscriber') && msg.isSubscriber) match = true
    if (roles.includes('follower') && !match && mainUser?.id) {
      try {
        const fa = await fetchFollowage?.(msg.userId, mainUser.id)
        if (fa && fa !== '(unknown)') match = true
      } catch {}
    }
    return match
  }

  if (condition.type === 'language_filter') {
    return checkLanguageFilter(msg.text, condition)
  }

  if (condition.type === 'random') {
    const weight = condition.weight ?? 1
    const totalWeight = weight // For single condition, weight is the total
    return Math.random() < (weight / totalWeight)
  }

  return false
}

// ── Random line reader ─────────────────────────────────────────────────────

function readRandomLine(filePath, randomize = true, weights = []) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return ''
    if (!randomize) return lines[0]
    if (weights.length === lines.length) {
      const total = weights.reduce((s, w) => s + (w || 1), 0)
      let r = Math.random() * total
      for (let i = 0; i < lines.length; i++) {
        r -= (weights[i] || 1)
        if (r <= 0) return lines[i]
      }
    }
    return lines[Math.floor(Math.random() * lines.length)]
  } catch { return '' }
}

// ── Full trigger run ───────────────────────────────────────────────────────

export async function runTriggers(msg, triggers, opts = {}) {
  const {
    sendChatMessage, sendAnnouncement, fetchFollowage, fetchUserByLogin,
    mainUser, botAccount,
    obsGetSceneItemList, obsSetSourceVisibility, obsPlayVideoInSource, getCurrentScene,
    globalSceneBlacklist = {}
  } = opts
  const fired = []

  // Increment chat activity counters for all triggers
  for (const t of triggers) {
    _chatActivityCounters[t.id] = (_chatActivityCounters[t.id] ?? 0) + 1
  }

  for (const trigger of triggers) {
    // Scene blacklist check
    const currentScene = getCurrentScene?.()
    if (currentScene && globalSceneBlacklist[currentScene]) {
      if (globalSceneBlacklist[currentScene] === 'always') continue
      if (globalSceneBlacklist[currentScene] === 'once' && !_sceneOnceUsed.has(currentScene)) {
        _sceneOnceUsed.add(currentScene)
        continue
      }
    }

    const match = matchTrigger(trigger, msg)
    if (!match) continue
    if (!checkAndSetCooldowns(trigger, msg.username)) continue

    // Evaluate considerations
    const { pass, waitMs = 0 } = await evaluateConsiderations(
      trigger.considerations ?? [], msg, trigger.id,
      { getCurrentScene, obsGetSceneItemList }
    )
    if (!pass) continue

    // Build context
    const ctx = {
      username: msg.username,
      displayName: msg.displayName,
      channel: msg.channel,
      text: msg.text,
      params: { ...match.params },
    }

    for (const p of trigger.commandParams ?? []) {
      if (p.optional && !ctx.params[p.name] && p.defaultValue) {
        ctx.params[p.name] = renderTemplate(p.defaultValue, { ...ctx, params: {} })
      }
    }

    // Select response using new structure
    const conditions = trigger.conditions ?? []
    const responses = trigger.responses ?? []
    const routing = trigger.routing ?? []

    // Fallback for old structure
    let actionsToRun = []
    if (responses.length > 0) {
      const response = await selectResponse(responses, conditions, routing, msg, { fetchFollowage, mainUser })
      actionsToRun = response?.actions ?? []
    } else if (trigger.responseGroups) {
      // Old structure fallback
      const groups = trigger.responseGroups
      const group = await selectResponseGroup(groups, msg, { fetchFollowage, mainUser })
      actionsToRun = group?.actions ?? []
    }

    if (!actionsToRun || actionsToRun.length === 0) continue

    // Prefetch followage if any chat action needs it
    const allTemplates = actionsToRun.map(a => a.template ?? '').join(' ')
    if (/\{followage[_}]/.test(allTemplates) && mainUser?.id) {
      ctx.followage = await fetchFollowage?.(msg.userId, mainUser.id).catch(() => null) ?? '(unknown)'
    }
    const followageOfParams = new Set()
    for (const m of allTemplates.matchAll(/\{followage_of:(\w+)\}/gi)) followageOfParams.add(m[1])
    if (followageOfParams.size > 0 && mainUser?.id) {
      ctx.followageOf = {}
      for (const param of followageOfParams) {
        const targetUsername = match.params[param]
        if (targetUsername) {
          ctx.followageOf[param] = '(unknown)'
          try {
            const user = fetchUserByLogin ? await fetchUserByLogin(targetUsername) : null
            if (user) ctx.followageOf[param] = await fetchFollowage?.(user.id, mainUser.id) ?? '(unknown)'
          } catch {}
        }
      }
    }

    // Apply wait consideration delay before first action
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))

    // Execute actions
    for (const action of actionsToRun) {
      if (action.delay > 0) await new Promise(r => setTimeout(r, action.delay * 1000))

      try {
        if (action.type === 'obs_set_source') {
          await obsSetSourceVisibility?.({ sceneName: action.scene ?? null, sourceName: action.source, visible: action.visible ?? true })
          _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: trigger.id, triggerName: trigger.name, action: action.type })
        } else if (action.type === 'play_media') {
          if ((action.mediaType ?? 'audio') === 'video') {
            await obsPlayVideoInSource?.(action.obsSource, action.filePath)
          } else {
            _mainWindow?.webContents.send('chatTriggers:playMedia', {
              filePath: action.filePath, device: action.device ?? '', volume: action.volume ?? 1.0
            })
          }
          _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: trigger.id, triggerName: trigger.name, action: action.type })
        } else if (action.type === 'random_line') {
          let line = ''
          if (action.lineMode === 'manual') {
            const lines = action.lines ?? []
            if (lines.length === 0) continue
            if (!action.randomize) line = lines[0]
            else line = lines[Math.floor(Math.random() * lines.length)]
          } else {
            line = readRandomLine(action.filePath, action.randomize ?? true, action.weights ?? [])
            if (!line) continue
          }
          const text = renderTemplate(line, ctx)
          const useBot = action.useBot && botAccount
          const senderToken = useBot ? botAccount.token : null
          const senderId = useBot ? botAccount.user?.id : mainUser?.id
          await sendChatMessage?.(mainUser?.id, senderId, text, senderToken ?? undefined)
          _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: trigger.id, triggerName: trigger.name, action: action.type, text })
        } else {
          const text = renderTemplate(action.template ?? '', ctx)
          if (!text.trim()) continue
          const useBot = action.useBot && botAccount
          const senderToken = useBot ? botAccount.token : null
          const senderId = useBot ? botAccount.user?.id : mainUser?.id
          if (action.type === 'send_chat_response' && action.responseMode === 'announcement') {
            await sendAnnouncement?.(mainUser?.id, mainUser?.id, text, action.announcementColor ?? 'primary', senderToken ?? undefined)
          } else if (action.type === 'send_chat_response') {
            await sendChatMessage?.(mainUser?.id, senderId, text, senderToken ?? undefined)
          }
          const actionLabel = action.type === 'send_chat_response' ? (action.responseMode === 'announcement' ? 'send_announcement' : 'send_message') : action.type
          _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: trigger.id, triggerName: trigger.name, action: actionLabel, text })
        }
      } catch (err) {
        _mainWindow?.webContents.send('chatTriggers:log', { level: 'error', msg: `Action failed for "${trigger.name}": ${err.message}` })
      }
    }

    fired.push(trigger.id)
  }

  return fired
}

// ── Timer triggers ─────────────────────────────────────────────────────────

async function _fireTimerTrigger(trigger) {
  const { sendChatMessage, sendAnnouncement, getChatTriggers, mainUser, botAccount } = _engineOpts
  const fresh = (getChatTriggers?.() ?? []).find(t => t.id === trigger.id)
  if (!fresh?.enabled) return

  const ctx = { username: _channel ?? '', displayName: '', channel: _channel ?? '', text: '', params: {} }
  const response = fresh.responses?.[0]
  if (!response) return

  for (const action of response.actions ?? []) {
    if (action.delay > 0) await new Promise(r => setTimeout(r, action.delay * 1000))
    try {
      if (action.type === 'send_chat_response') {
        const text = renderTemplate(action.template ?? '', ctx)
        if (!text.trim()) continue
        const mu = typeof mainUser === 'function' ? mainUser() : mainUser
        const ba = typeof botAccount === 'function' ? botAccount() : botAccount
        const useBot = action.useBot && ba
        const senderToken = useBot ? ba.token : null
        const senderId = useBot ? ba.user?.id : mu?.id
        if (action.responseMode === 'announcement') {
          await sendAnnouncement?.(mu?.id, mu?.id, text, action.announcementColor ?? 'primary', senderToken ?? undefined)
        } else {
          await sendChatMessage?.(mu?.id, senderId, text, senderToken ?? undefined)
        }
        _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: fresh.id, triggerName: fresh.name, action: 'timer', text })
      }
    } catch (err) {
      _mainWindow?.webContents.send('chatTriggers:log', { level: 'error', msg: `Timer action failed for "${fresh.name}": ${err.message}` })
    }
  }
}

function _startTimer(trigger) {
  const ms = (trigger.interval ?? 15) * (trigger.intervalUnit === 'hours' ? 3600000 : 60000)
  const handle = setInterval(() => _fireTimerTrigger(trigger), ms)
  _timerHandles.set(trigger.id, handle)
}

export function startTimerTriggers(triggers) {
  for (const t of triggers) {
    if (t.type === 'timer' && t.enabled && !_timerHandles.has(t.id)) _startTimer(t)
  }
}

export function stopTimerTriggers() {
  for (const handle of _timerHandles.values()) clearInterval(handle)
  _timerHandles.clear()
}

export function syncTimerTrigger(trigger) {
  if (_timerHandles.has(trigger.id)) {
    clearInterval(_timerHandles.get(trigger.id))
    _timerHandles.delete(trigger.id)
  }
  // Only start if engine is currently connected
  if (trigger.type === 'timer' && trigger.enabled && _connected) _startTimer(trigger)
}

// ── Stream-aware activation ────────────────────────────────────────────────

export function getStreamState() { return { ..._streamState } }

function _evaluateActivation(activation, state) {
  if (!activation || activation.mode !== 'auto') return null
  const { conditions, logic } = activation
  const checks = []
  if (conditions.whenLive) checks.push(state.isLive)
  if (conditions.gameCategories?.length > 0)
    checks.push(conditions.gameCategories.some(g => g.toLowerCase() === (state.gameCategory ?? '').toLowerCase()))
  if (conditions.titleContains?.length > 0)
    checks.push(conditions.titleContains.some(p => (state.title ?? '').toLowerCase().includes(p.toLowerCase())))
  if (checks.length === 0) return false
  return logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
}

async function _pollStreamState() {
  const { fetchStream, getChatTriggers, updateTrigger } = _engineOpts
  if (!fetchStream || !_username) return
  const newState = await fetchStream(_username)
  const prev = _streamState
  const changed = newState.isLive !== prev.isLive ||
    newState.gameCategory !== prev.gameCategory ||
    newState.title !== prev.title
  _streamState = newState
  _mainWindow?.webContents.send('stream:stateChanged', newState)
  if (!changed) return

  const triggers = getChatTriggers?.() ?? []
  for (const trigger of triggers) {
    if (trigger.activation?.mode !== 'auto') continue
    const shouldEnable = _evaluateActivation(trigger.activation, newState)
    const newActivation = { ...trigger.activation, currentOverride: null }
    if (trigger.enabled !== shouldEnable || trigger.activation.currentOverride !== null) {
      updateTrigger?.(trigger.id, { enabled: shouldEnable, activation: newActivation })
      syncTimerTrigger({ ...trigger, enabled: shouldEnable })
      _mainWindow?.webContents.send('chatTriggers:activationChanged', { id: trigger.id, enabled: shouldEnable })
    }
  }
}

export function startStreamPolling() {
  if (_streamPollHandle) return
  _pollStreamState()
  _streamPollHandle = setInterval(_pollStreamState, 60000)
}

export function stopStreamPolling() {
  if (_streamPollHandle) { clearInterval(_streamPollHandle); _streamPollHandle = null }
  _streamState = { isLive: false, gameCategory: null, title: null }
}

// ── OBS source triggers ────────────────────────────────────────────────────

export async function handleOBSSourceChange(event) {
  const { getChatTriggers, obsGetSceneItemList, sendChatMessage, sendAnnouncement, mainUser, botAccount } = _engineOpts
  const triggers = (getChatTriggers?.() ?? []).filter(t => t.type === 'obs_source' && t.enabled)
  if (triggers.length === 0) return

  // Look up source name from sceneItemId
  const items = await obsGetSceneItemList?.(event.sceneName) ?? []
  const item = items.find(i => i.sceneItemId === event.sceneItemId)
  if (!item) return

  for (const trigger of triggers) {
    const sceneMatch = !trigger.obsScene || trigger.obsScene === event.sceneName
    const sourceMatch = !trigger.obsSource || trigger.obsSource === item.sourceName
    const stateMatch = (trigger.obsState === 'visible') === event.sceneItemEnabled
    if (!sceneMatch || !sourceMatch || !stateMatch) continue
    if (!checkAndSetCooldowns(trigger, 'obs')) continue

    const ctx = { username: _channel ?? '', displayName: '', channel: _channel ?? '', text: '', params: {} }
    const response = trigger.responses?.[0]
    if (!response) continue

    for (const action of response.actions ?? []) {
      if (action.delay > 0) await new Promise(r => setTimeout(r, action.delay * 1000))
      try {
        if (action.type === 'send_chat_response') {
          const text = renderTemplate(action.template ?? '', ctx)
          if (!text.trim()) continue
          const mu = typeof mainUser === 'function' ? mainUser() : mainUser
          const ba = typeof botAccount === 'function' ? botAccount() : botAccount
          const useBot = action.useBot && ba
          const senderToken = useBot ? ba.token : null
          const senderId = useBot ? ba.user?.id : mu?.id
          if (action.responseMode === 'announcement') {
            await sendAnnouncement?.(mu?.id, mu?.id, text, action.announcementColor ?? 'primary', senderToken ?? undefined)
          } else {
            await sendChatMessage?.(mu?.id, senderId, text, senderToken ?? undefined)
          }
          _mainWindow?.webContents.send('chatTriggers:fired', { triggerId: trigger.id, triggerName: trigger.name, action: 'obs_source', text })
        }
      } catch (err) {
        _mainWindow?.webContents.send('chatTriggers:log', { level: 'error', msg: `OBS action failed for "${trigger.name}": ${err.message}` })
      }
    }
  }
}
