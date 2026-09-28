import { strFromU8, unzipSync } from '../../vendor/fflate.js';

export function openPackage(bytes, label) {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error(`This ${label} could not be opened. Password-protected Office files are not supported.`);
  }
}

export function parseXml(bytes, label = 'document') {
  const text = typeof bytes === 'string' ? bytes : strFromU8(bytes);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.localName === 'parsererror' || doc.getElementsByTagName('parsererror').length) {
    throw new Error(`The ${label} contains invalid XML.`);
  }
  return doc;
}

export function kids(el, name) {
  if (!el?.children) return [];
  return [...el.children].filter((child) => !name || child.localName === name);
}

export function kid(el, ...names) {
  let current = el;
  for (const name of names) {
    current = kids(current, name)[0] || null;
    if (!current) return null;
  }
  return current;
}

export function all(el, name) {
  if (!el?.getElementsByTagName) return [];
  return [...el.getElementsByTagName('*')].filter((child) => child.localName === name);
}

export function attr(el, name) {
  if (!el?.getAttribute) return null;
  return el.getAttribute(name);
}

export function relId(el, name = 'id') {
  if (!el?.attributes) return null;
  for (const attribute of el.attributes) {
    if (attribute.localName === name && (attribute.prefix || attribute.name.includes(':'))) return attribute.value;
  }
  return null;
}

export function resolvePath(from, target) {
  let clean = target;
  try {
    clean = decodeURIComponent(target);
  } catch {
    clean = target;
  }
  if (clean.startsWith('/')) return clean.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const segment of clean.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function relsPath(part) {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

export function readRels(files, part) {
  const map = new Map();
  const path = relsPath(part);
  if (!files[path]) return map;
  let doc;
  try {
    doc = parseXml(files[path]);
  } catch {
    return map;
  }
  for (const rel of all(doc, 'Relationship')) {
    const target = attr(rel, 'Target') || '';
    const external = attr(rel, 'TargetMode') === 'External';
    map.set(attr(rel, 'Id'), {
      type: (attr(rel, 'Type') || '').split('/').pop(),
      target: external ? target : resolvePath(part, target),
      external,
    });
  }
  return map;
}

export function hasMacros(files) {
  return Object.keys(files).some((name) => name.toLowerCase().endsWith('vbaproject.bin'));
}
