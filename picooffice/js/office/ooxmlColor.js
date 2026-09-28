const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

export function localElements(root, name) {
  return [...root.getElementsByTagName('*')].filter((element) => element.localName === name);
}

export function parseColorScheme(doc) {
  const scheme = {};
  if (!doc) return scheme;
  for (const slot of localElements(doc, 'clrScheme')[0]?.children || []) {
    const key = slot.localName;
    if (!key || key === 'extLst') continue;
    const hex = colorFromPaint(slot, scheme);
    if (hex) scheme[key] = hex;
  }
  return scheme;
}

export function colorFromPaint(node, theme = {}) {
  if (!node) return '';
  const srgb = localElements(node, 'srgbClr')[0];
  if (srgb?.getAttribute('val')) return normalizeHex(srgb.getAttribute('val'));
  const sys = localElements(node, 'sysClr')[0];
  if (sys?.getAttribute('lastClr')) return normalizeHex(sys.getAttribute('lastClr'));
  const scheme = localElements(node, 'schemeClr')[0];
  if (scheme) {
    const base = theme[scheme.getAttribute('val')] || '';
    if (base) return base;
  }
  const indexed = localElements(node, 'indexedClr')[0];
  if (indexed) {
    const index = Number(indexed.getAttribute('val') || 0);
    return INDEXED[index] ? `#${INDEXED[index]}` : '';
  }
  if (node.getAttribute?.('rgb')) return normalizeHex(node.getAttribute('rgb').slice(-6));
  if (node.getAttribute?.('indexed')) {
    const index = Number(node.getAttribute('indexed'));
    return INDEXED[index] ? `#${INDEXED[index]}` : '';
  }
  if (node.getAttribute?.('theme')) {
    const base = theme[`accent${Number(node.getAttribute('theme'))}`] || theme.lt1 || '';
    return base;
  }
  return '';
}

function normalizeHex(value) {
  const hex = String(value || '').replace(/^#/, '').slice(-6);
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : '';
}
