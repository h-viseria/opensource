/**
 * PWA File Handling API — "Open with" from the OS file manager (Windows / ChromeOS).
 * Requires an installed PWA and `file_handlers` in the manifest.
 */

/**
 * @param {(file: File) => Promise<void>} openFile
 */
export function installFileLaunchHandler(openFile) {
  if (!('launchQueue' in window)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files?.length) return;
    for (const handle of launchParams.files) {
      try {
        const file = await handle.getFile();
        await openFile(file);
      } catch (error) {
        console.error('[PicoOffice] Open-with file failed:', error);
        throw error;
      }
    }
  });
}
