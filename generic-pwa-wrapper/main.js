/**
 * Generic PWA Wrapper - Main Application Logic
 * Handles URL caching, loading, and settings management
 */

const STORAGE_KEY = 'pwa-wrapper-url';

// DOM Elements
const configPanel = document.getElementById('config-panel');
const appPanel = document.getElementById('app-panel');
const urlForm = document.getElementById('url-form');
const appUrlInput = document.getElementById('app-url');
const configStatus = document.getElementById('config-status');
const configError = document.getElementById('config-error');

const appTitle = document.getElementById('app-title');
const appIframe = document.getElementById('app-iframe');
const settingsBtn = document.getElementById('settings-btn');
const loadingOverlay = document.getElementById('loading-overlay');

const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const settingsUrlInput = document.getElementById('settings-url');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const settingsStatus = document.getElementById('settings-status');
const settingsError = document.getElementById('settings-error');

// ─── Utility Functions ─────────────────────────────────────────────────────

function setStatus(element, message) {
    element.textContent = message;
    element.style.display = message ? 'block' : 'none';
}

function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return 'Web App';
    }
}

function validateUrl(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function normalizeUrl(urlString) {
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        return `https://${urlString}`;
    }
    return urlString;
}

// ─── Storage Management ────────────────────────────────────────────────────

function getSavedUrl() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveUrl(url) {
    try {
        localStorage.setItem(STORAGE_KEY, url);
        return true;
    } catch {
        return false;
    }
}

function clearSavedUrl() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

// ─── UI Management ────────────────────────────────────────────────────────

function showLoadingOverlay(show = true) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showConfigPanel() {
    configPanel.style.display = 'flex';
    appPanel.style.display = 'none';
    settingsModal.style.display = 'none';
    appUrlInput.focus();
}

function showAppPanel(url) {
    configPanel.style.display = 'none';
    appPanel.style.display = 'flex';
    settingsModal.style.display = 'none';

    // Update title
    appTitle.textContent = extractDomain(url);

    // Load URL in iframe
    appIframe.src = url;
}

function showSettingsModal(currentUrl) {
    settingsModal.style.display = 'flex';
    settingsUrlInput.value = currentUrl;
    settingsUrlInput.focus();
    setStatus(settingsStatus, '');
    setStatus(settingsError, '');
}

function hideSettingsModal() {
    settingsModal.style.display = 'none';
}

// ─── App Loading ──────────────────────────────────────────────────────────

function loadApp(url) {
    const normalizedUrl = normalizeUrl(url);

    console.log('🔄 Loading app:', normalizedUrl);

    if (!validateUrl(normalizedUrl)) {
        console.error('Invalid URL:', normalizedUrl);
        setStatus(configError, '❌ Invalid URL. Please enter a valid web address.');
        return;
    }

    showLoadingOverlay(true);
    setStatus(configStatus, 'Loading...');
    setStatus(configError, '');

    // Add timeout to detect if iframe fails to load
    const timeout = setTimeout(() => {
        console.warn('App load timeout - may be blocked by CORS or server error');
        showLoadingOverlay(false);
        setStatus(configError, '❌ Load timeout. The app may be blocked by CORS policy.');
    }, 15000);

    // Setup event handlers BEFORE showing app panel (before iframe loads)
    appIframe.onload = () => {
        clearTimeout(timeout);
        console.log('✓ App loaded successfully');
        showLoadingOverlay(false);
        if (saveUrl(normalizedUrl)) {
            setStatus(configStatus, '✓ App loaded successfully');
        } else {
            setStatus(configError, 'Warning: Could not save URL to localStorage.');
        }
    };

    appIframe.onerror = () => {
        clearTimeout(timeout);
        console.error('Failed to load iframe:', normalizedUrl);
        showLoadingOverlay(false);
        setStatus(configError, `❌ Failed to load the app. The URL may be blocked by CORS, the server may be down, or the address may be incorrect.`);
    };

    // NOW show the app panel and set iframe src
    console.log('📱 Showing app panel and setting iframe src');
    showAppPanel(normalizedUrl);
}

// ─── Event Handlers ────────────────────────────────────────────────────────

urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('📝 Form submitted');
    const url = appUrlInput.value.trim();
    console.log('Input URL:', url);
    if (url) {
        loadApp(url);
    } else {
        console.warn('Empty URL input');
        setStatus(configError, '❌ Please enter a URL');
    }
});

settingsBtn.addEventListener('click', () => {
    const currentUrl = appIframe.src;
    showSettingsModal(currentUrl);
});

closeModalBtn.addEventListener('click', hideSettingsModal);
cancelBtn.addEventListener('click', hideSettingsModal);

settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUrl = settingsUrlInput.value.trim();
    if (newUrl && validateUrl(normalizeUrl(newUrl))) {
        loadApp(newUrl);
        hideSettingsModal();
    } else {
        setStatus(settingsError, '❌ Invalid URL. Please check and try again.');
    }
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Clear all saved data and reset to initial state?')) {
        clearSavedUrl();
        appUrlInput.value = '';
        setStatus(settingsStatus, '✓ Data cleared');
        setTimeout(() => {
            hideSettingsModal();
            showConfigPanel();
        }, 1000);
    }
});

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        hideSettingsModal();
    }
});

// ─── Initialization ────────────────────────────────────────────────────────

function init() {
    console.log('🚀 Initializing Generic PWA Wrapper');
    console.log('DOM elements check:');
    console.log('  configPanel:', !!configPanel);
    console.log('  appPanel:', !!appPanel);
    console.log('  appIframe:', !!appIframe);
    console.log('  urlForm:', !!urlForm);

    const savedUrl = getSavedUrl();
    console.log('Saved URL:', savedUrl);

    if (savedUrl) {
        // Load saved URL automatically
        console.log('✓ Found saved URL, loading automatically:', savedUrl);
        loadApp(savedUrl);
    } else {
        // Show configuration panel
        console.log('ℹ️ No saved URL, showing configuration panel');
        showConfigPanel();
    }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    console.log('⏳ DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', init);
} else {
    console.log('✓ DOM already loaded, initializing...');
    init();
}

// Log app initialization
console.log('✅ Generic PWA Wrapper script loaded');
console.log('Storage key:', STORAGE_KEY);

