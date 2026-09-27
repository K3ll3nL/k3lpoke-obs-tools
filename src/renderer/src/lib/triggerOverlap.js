// Command triggers accept a range of argument counts; two with the same word collide if the ranges overlap.
function argRange(t) {
  const params = t.commandParams ?? []
  let required = 0
  params.forEach((p, i) => { if (!p.optional) required = i + 1 })
  return [required, t.allowExtraText ? Infinity : params.length]
}

const normPattern = p => p.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

function signature(t) {
  if (t.type === 'command' && t.command) return 'cmd:' + t.command.trim().toLowerCase()
  if (t.type === 'message' && t.pattern) return 'pat:' + normPattern(t.pattern)
  return null
}

function collides(a, b) {
  if (a.type !== 'command') return true
  const [aMin, aMax] = argRange(a), [bMin, bMax] = argRange(b)
  return aMin <= bMax && bMin <= aMax
}

// Returns Map<triggerId, trigger[]> of enabled triggers that would fire on the same messages.
export function findCollisions(triggers) {
  const groups = new Map()
  for (const t of triggers) {
    if (!t.enabled) continue
    const sig = signature(t)
    if (!sig) continue
    if (groups.has(sig)) groups.get(sig).push(t); else groups.set(sig, [t])
  }
  const out = new Map()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const a of group) {
      const others = group.filter(b => b !== a && collides(a, b))
      if (others.length) out.set(a.id, others)
    }
  }
  return out
}
