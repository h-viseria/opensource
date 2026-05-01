# PWA Installation Quick Start

## For Android Users

### Install the App (30 seconds)

1. **Open in Chrome**
   - Visit: `https://your-domain.com/mf-holdings-app`
   - Or locally: `http://localhost:8080/index.html`

2. **Tap Install**
   - Chrome will show "Install app" in address bar
   - Tap the install icon
   - Confirm installation

3. **Done!**
   - App appears on home screen
   - Tap to open fullscreen (no browser UI)
   - Works like a native app

### What You Get

✅ **Install on Home Screen**
- Fast app launcher
- Dedicated app icon
- Fullscreen experience

✅ **Offline Support**
- Browse cached reports offline
- View previously loaded holdings
- API calls fail gracefully

✅ **Fast Loading**
- Service Worker caches assets
- First visit: 3-5 seconds
- Subsequent visits: 1 second

✅ **Mobile Optimized**
- Touch-friendly interface
- Works portrait & landscape
- Responsive design

---

## Technical Requirements

| Requirement | Details |
|-------------|---------|
| **Browser** | Chrome 90+, Firefox, Edge, Samsung Internet |
| **OS** | Android 5.0+ |
| **Connection** | HTTPS (production) or localhost (testing) |
| **Storage** | ~2-5MB for app cache |

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | App metadata (Android reads this) |
| `service-worker.js` | Offline support & caching |
| `icon-192.svg` | App icon |
| `index.html` | Updated with PWA meta tags |

---

## Troubleshooting

### "Install app" prompt not showing?
- Ensure HTTPS (or localhost for testing)
- Use Chrome 90 or newer
- App must be visited for 30+ seconds
- Refresh page

### Can't install after PWA is updated?
- Clear browser cache
- Uninstall and reinstall
- DevTools → Application → Clear storage

### Offline mode not working?
- Wait for Service Worker to install (~10 sec)
- Refresh page after first visit
- Check DevTools → Application → Cache Storage

---

## Local Testing Setup

### 1. Start a Local Server
```bash
# If you have Python installed
python -m http.server 8000

# Or use Node.js
npx http-server -p 8000
```

### 2. Open in Chrome
```
http://localhost:8000/index.html
```

### 3. Check Service Worker
- DevTools (F12) → Application → Service Workers
- Should show "active" status

### 4. Test Offline Mode
- DevTools Network → Offline checkbox
- Refresh page
- App displays cached version

---

## Production Deployment

### Deploy to HTTPS
1. Use a CDN (Vercel, Netlify, GitHub Pages)
2. Or configure SSL on your server
3. PWA requires HTTPS (except localhost)

### Steps
1. Upload all files to server/CDN
2. Ensure HTTPS is enabled
3. Visit your domain
4. Install prompt appears automatically
5. Users can install app

---

## For Developers

### Key PWA Files
- `manifest.json` — Web app manifest (JSON)
- `service-worker.js` — Offline support & caching (JavaScript)
- `index.html` — Links manifest + registers service worker

### Service Worker Caching Strategy
```
- Network-first: API calls (use network, fall back to cache)
- Cache-first: Static assets (use cache, fall back to network)
- Graceful offline fallback with error messages
```

### Testing on Android Device
1. Connect via USB
2. Open Chrome: `chrome://inspect`
3. Select device
4. Install app from notification
5. Test offline mode

---

## Android App Details

**In Android Settings → Apps:**
- App name: "MF Holdings"
- Default storage: ~2-5MB
- Permissions: None required
- Internet access: Used for API calls only

---

✅ **Your MF Holdings app is now installable as a native app on Android!**

For more details, see `PWA_SETUP.md`

