// Service Worker untuk PWA
const CACHE_NAME = 'babinsa-monitoring-v2.0';
const APP_SHELL_CACHE = 'babinsa-app-shell-v2.0';

// Assets to cache immediately
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@400;500;700&display=swap'
];

// Install event - cache app shell
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache app shell
      caches.open(APP_SHELL_CACHE)
        .then(cache => {
          console.log('[Service Worker] Caching app shell');
          return cache.addAll(PRECACHE_ASSETS);
        }),
      
      // Skip waiting
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== APP_SHELL_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Claim clients
      self.clients.claim()
    ])
  );
});

// Fetch event - network first, then cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // For same-origin requests
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      networkFirstThenCache(event.request)
    );
  } else {
    // For CDN requests, cache first
    event.respondWith(
      cacheFirstThenNetwork(event.request)
    );
  }
});

// Strategy: Network first, then cache
async function networkFirstThenCache(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, cache it
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseToCache);
        });
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, trying cache:', request.url);
    
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, return app shell for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    
    // Otherwise return error
    return new Response('Network error occurred', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Strategy: Cache first, then network (for CDN)
async function cacheFirstThenNetwork(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background
    fetch(request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(request, responseToCache);
            });
        }
      })
      .catch(() => {
        // Ignore fetch errors for CDN
      });
    
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  return fetch(request);
}

// Background sync for data refresh
self.addEventListener('sync', event => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(refreshDataInBackground());
  }
});

async function refreshDataInBackground() {
  console.log('[Service Worker] Background sync triggered');
  
  try {
    // You could trigger a data refresh here
    // For now, just show a notification
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_REFRESH',
        timestamp: new Date().toISOString()
      });
    });
    
    return self.registration.showNotification('Data diperbarui', {
      body: 'Data monitoring telah disinkronisasi di background',
      icon: './icon-192.png',
      tag: 'data-refresh'
    });
  } catch (error) {
    console.error('[Service Worker] Background sync failed:', error);
  }
}

// Handle push notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Monitoring Babinsa';
  const options = {
    body: data.body || 'Ada update baru dari sistem monitoring',
    icon: './icon-192.png',
    badge: './icon-96.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || './',
      timestamp: new Date().toISOString()
    }
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || './';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Check if there's already a window/tab open with the target URL
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If not, open a new window/tab
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});