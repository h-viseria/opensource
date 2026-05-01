# PWA Wrapper — Debug Guide

## Issue Fixed ✅

**Problem**: Clicking "Load App" didn't show the app loading or iframe content

**Root Cause**: Event listeners (onload/onerror) were being attached AFTER the iframe started loading in showAppPanel(), causing them to be too late to catch the load event.

**Solution**: Attach event listeners BEFORE calling showAppPanel() (which sets iframe.src)

---

## Testing the Fix

### 1. Open the App
```
http://localhost:8000/index.html
```

### 2. Open DevTools
Press **F12** → Go to **Console** tab

You should see logs like:
```
✅ Generic PWA Wrapper script loaded
Storage key: pwa-wrapper-url
⏳ DOM still loading, waiting for DOMContentLoaded...
🚀 Initializing Generic PWA Wrapper
DOM elements check:
  configPanel: true
  appPanel: true
  appIframe: true
  urlForm: true
ℹ️ No saved URL, showing configuration panel
```

### 3. Enter a URL
Try: `https://example.com` (or `github.com` and hit Enter, system auto-adds https://)

You should see in console:
```
📝 Form submitted
Input URL: github.com
🔄 Loading app: https://github.com
📱 Showing app panel and setting iframe src
```

### 4. Loading Starts
- Loading overlay appears (spinner)
- Status shows "Loading..."
- Console shows iframe loading...

### 5. App Loads
When iframe loads successfully:
```
✓ App loaded successfully
```

If it fails (CORS blocked):
```
Failed to load iframe: https://github.com
❌ Failed to load the app. The URL may be blocked by CORS...
```

---

## Console Logs Explained

| Log | Meaning |
|-----|---------|
| `✅ Generic PWA Wrapper script loaded` | Script initialized |
| `⏳ DOM still loading...` | HTML not fully parsed yet |
| `🚀 Initializing Generic PWA Wrapper` | Init function started |
| `DOM elements check: true/true...` | HTML elements found |
| `ℹ️ No saved URL` | First time, no localStorage data |
| `📝 Form submitted` | User clicked "Load App" |
| `Input URL: ...` | User's input value |
| `🔄 Loading app: https://...` | Starting to load |
| `📱 Showing app panel` | UI switching to app view |
| `✓ App loaded successfully` | iframe onload fired |
| `Failed to load iframe` | iframe onerror fired |

---

## Common Issues & Solutions

### Issue 1: "Invalid URL" Error
**Symptoms**: Red error says "Invalid URL"

**Cause**: URL doesn't start with http:// or https://

**Fix**: 
- Try: `https://example.com` (full URL)
- Or: `example.com` (will auto-add https://)

### Issue 2: "Failed to load the app. CORS blocked"
**Symptoms**: Error message mentions CORS

**Cause**: Website blocks embedding in iframes

**Fix**:
- Try a different URL that allows embedding
- Test: `https://example.com`, `https://httpbin.org`, `https://httpstat.us`
- Local sites often work better than public ones

### Issue 3: App loads but is blank
**Symptoms**: Iframe shows but no content

**Possible Causes**:
1. Site requires authentication
2. Site takes time to load (try waiting 5-10 sec)
3. Site uses JavaScript that breaks in iframe context

**Fix**: 
- Check browser console for errors (F12 → Console)
- Try a simpler website first

### Issue 4: Iframe not showing at all
**Symptoms**: Config panel disappears but nothing appears

**Cause**: Possible JavaScript error or DOM mismatch

**Fix**:
1. Open DevTools (F12)
2. Check Console for red errors
3. Check Application → Local Storage for `pwa-wrapper-url`
4. Try refreshing (Ctrl+R)

---

## How to Check Console Logs

### Chrome/Edge/Firefox
1. Press **F12** to open DevTools
2. Click **Console** tab
3. You'll see all console.log() messages
4. Red messages = errors
5. Blue messages = logs
6. Yellow warnings = console.warn()

### Mobile (Android Chrome)
1. Connect phone via USB
2. On computer: Open Chrome → `chrome://inspect`
3. Select your device
4. Click "Inspect" next to the app
5. DevTools appears with console

---

## Testing Different URLs

### URLs That Should Work
- `https://example.com` — Simple static site
- `https://httpbin.org` — Test API service
- `https://httpstat.us/200` — Simple status page

### URLs That May Fail (CORS)
- `https://github.com` — Blocks embedding
- `https://google.com` — Blocks embedding
- `https://facebook.com` — Blocks embedding

### URLs That Require Setup
- Internal/localhost sites — Need to be running
- Password-protected sites — Won't work
- Heavy JavaScript apps — May take longer to load

---

## Advanced Debugging

### Check localStorage
```javascript
// In DevTools Console:
localStorage.getItem('pwa-wrapper-url')
// Should return URL if saved, or null
```

### Test URL Validation
```javascript
// In DevTools Console:
new URL('github.com')  // Will throw error
new URL('https://github.com')  // OK
```

### Manually Trigger Load
```javascript
// In DevTools Console:
loadApp('https://example.com')
// Should start loading process
```

### Clear All Data
```javascript
// In DevTools Console:
localStorage.removeItem('pwa-wrapper-url')
location.reload()
// App resets to initial state
```

---

## If Still Not Working

1. **Check Console (F12)** for error messages
2. **Verify HTML** has correct element IDs:
   - `config-panel`
   - `app-panel`
   - `app-iframe`
   - `url-form`
3. **Try simpler URL**: `https://example.com`
4. **Check Service Worker**: DevTools → Application → Service Workers
5. **Test in different browser**: Firefox, Edge, etc.

---

## File Changes Made

**Updated**: `main.js`
- Fixed event listener order (lines 128-165)
- Added detailed console logging for debugging
- Improved error messages

**Result**: iframe loads correctly now ✅

---

Test now and check DevTools Console for logs!

