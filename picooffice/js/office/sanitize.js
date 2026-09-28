const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'b', 'i', 'u', 'a', 'img', 'br', 'pre', 'code', 'blockquote', 'span', 'div', 'sup', 'sub']);

function safeUrl(value, kind) {
  const url = String(value || '').trim();
  if (kind === 'href') return /^(https?:|mailto:)/i.test(url) ? url : '';
  if (kind === 'src') return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url) ? url : '';
  return '';
}

function clean(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED.has(tag)) {
    const fragment = document.createDocumentFragment();
    [...node.childNodes].forEach((child) => {
      const cleaned = clean(child);
      if (cleaned) fragment.append(cleaned);
    });
    return fragment;
  }
  const element = document.createElement(tag);
  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'), 'href');
    if (href) {
      element.setAttribute('href', href);
      element.setAttribute('rel', 'noreferrer noopener');
      element.setAttribute('target', '_blank');
    }
  }
  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'), 'src');
    if (src) element.setAttribute('src', src);
    element.setAttribute('alt', node.getAttribute('alt') || '');
  }
  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const value = Number(node.getAttribute(name));
      if (value > 0 && value < 50) element.setAttribute(name, String(value));
    }
  }
  [...node.childNodes].forEach((child) => {
    const cleaned = clean(child);
    if (cleaned) element.append(cleaned);
  });
  return element;
}

export function sanitizeHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const root = document.createElement('div');
  [...parsed.body.childNodes].forEach((child) => {
    const cleaned = clean(child);
    if (cleaned) root.append(cleaned);
  });
  return root.innerHTML;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
