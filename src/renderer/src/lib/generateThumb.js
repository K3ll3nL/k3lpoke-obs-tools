export async function generateThumbFromVideo(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'metadata'
    video.muted = true
    const cleanup = () => { video.src = '' }
    video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration * 0.1) }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 480; canvas.height = 272
        canvas.getContext('2d').drawImage(video, 0, 0, 480, 272)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) { reject(e) } finally { cleanup() }
    }
    video.onerror = () => { cleanup(); reject(new Error('video load failed')) }
    video.src = videoUrl
  })
}
