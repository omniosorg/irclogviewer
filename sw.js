const staticCacheName = 'site-static-v1';
const assets = [
	'/',
	'/index.html',
	'/favicon.ico',
	'/assets/maskable-logo.png',
	'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,400;0,700;1,400',
];

self.addEventListener('install', evt => {
	evt.waitUntil(
		caches.open(staticCacheName).then((cache) => {
			cache.addAll(assets);
		})
	);
});

self.addEventListener('activate', evt => {
	evt.waitUntil(
		caches.keys().then(keys => {
			return Promise.all(keys
				.filter(key => key !== staticCacheName)
				.map(key => caches.delete(key))
			);
		})
	);
});

self.addEventListener('fetch', evt => {
	evt.respondWith(
		caches.match(evt.request).then(cacheRes => {
			return cacheRes || fetch(evt.request);
		})
	);
});
