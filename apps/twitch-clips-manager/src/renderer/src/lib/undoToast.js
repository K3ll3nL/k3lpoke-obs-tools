let listeners = []

export function showUndo(message, undoFn, clipIds = null) {
  listeners.forEach(fn => fn({ message, undoFn, id: Date.now(), duration: 10000, clipIds }))
}

export function showNotice(message) {
  listeners.forEach(fn => fn({ message, undoFn: null, id: Date.now(), duration: 3000 }))
}

export function subscribe(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}
