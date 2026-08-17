/**
 * HTML escaping — never inject merchant/description without this.
 * @param {string} str
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} str
 */
export function escapeAttr(str) {
  return escapeHtml(str);
}
