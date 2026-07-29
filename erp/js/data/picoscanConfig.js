/**
 * PicoScan embed URL for the floating iframe widget.
 *
 * Sibling folders on the same host, e.g.:
 *   .../opensource/erp/
 *   .../opensource/picoscan/widget.html
 */

/** @returns {string} */
export function getPicoScanWidgetUrl() {
  return new URL('../picoscan/widget.html', window.location.href).href;
}
