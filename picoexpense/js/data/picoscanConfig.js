/**
 * PicoScan embed URL — sibling folder on the same host as PicoERP.
 * @returns {string}
 */
export function getPicoScanWidgetUrl() {
  return new URL('../picoscan/widget.html', window.location.href).href;
}
