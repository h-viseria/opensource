/** Must match `SHARE_CACHE` in sw.js */
export const SHARE_CACHE_NAME = 'picooffice-share-v1';
export const SHARE_CACHE_KEY = 'pending-share';

/**
 * Open a file shared into the app via Web Share Target (Android share sheet, etc.).
 * @param {(file: File) => Promise<void>} openFile
 */
export async function consumePendingShare(openFile) {
  if (!new URLSearchParams(location.search).has('shared')) return;
  if (!window.caches) return;

  try {
    const cache = await caches.open(SHARE_CACHE_NAME);
    const response = await cache.match(SHARE_CACHE_KEY);
    if (!response) return;

    const name = decodeURIComponent(response.headers.get('x-filename') || 'shared');
    const type = response.headers.get('x-mimetype') || 'application/octet-stream';
    const blob = await response.blob();
    await cache.delete(SHARE_CACHE_KEY);

    const cleanUrl = location.pathname + location.hash;
    history.replaceState({}, '', cleanUrl);

    const file = new File([blob], name, { type });
    await openFile(file);
  } catch (error) {
    console.error('[PicoOffice] Shared file failed:', error);
    throw error;
  }
}
