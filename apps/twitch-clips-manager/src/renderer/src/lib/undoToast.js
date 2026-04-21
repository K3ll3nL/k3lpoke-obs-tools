let listeners = []

export function showUndo(message, undoFn) {
  listeners.forEach(fn => fn({ message, undoFn, id: Date.now(), duration: 10000 }))
}

export function showNotice(message) {
  listeners.forEach(fn => fn({ message, undoFn: null, id: Date.now(), duration: 3000 }))
}

export function subscribe(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}
