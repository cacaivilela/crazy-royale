// Service worker do Crazy Royale — cache do app para funcionar offline.
const CACHE = 'crazy-royale-v1'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', clone))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    )
    return
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || net
    })
  )
})
