import { unzipSync, strFromU8 } from '../../vendor/fflate.js';
import { colorFromPaint, localElements, parseColorScheme } from './ooxmlColor.js';

function xml(bytes) {
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (!doc.documentElement || doc.documentElement.localName === 'parsererror') throw new Error('The presentation contains invalid XML.');
  return doc;
}

function local(root, name) {
  return localElements(root, name);
}

function emuPercent(value, total) {
  const number = Number(value || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, (number / total) * 100));
}

function transformBox(element, slide) {
  const xfrm = local(element, 'xfrm').find((node) => {
    const off = local(node, 'off').find((item) => item.getAttribute('x') != null);
    const ext = local(node, 'ext').find((item) => item.getAttribute('cx'));
    return off && ext;
  });
  if (!xfrm) return { x: 8, y: 8, w: 84, h: 16 };
  const off = local(xfrm, 'off').find((item) => item.getAttribute('x') != null) || local(xfrm, 'off')[0];
  const ext = local(xfrm, 'ext').find((item) => item.getAttribute('cx')) || local(xfrm, 'ext')[0];
  return {
    x: emuPercent(off.getAttribute('x'), slide.cx),
    y: emuPercent(off.getAttribute('y'), slide.cy),
    w: Math.max(2, emuPercent(ext.getAttribute('cx'), slide.cx)),
    h: Math.max(2, emuPercent(ext.getAttribute('cy'), slide.cy)),
  };
}

function textOf(element) {
  const direct = local(element, 't').map((node) => node.textContent).join('');
  if (direct.trim()) return direct;
  return local(element, 'p')
    .map((paragraph) => local(paragraph, 't').map((node) => node.textContent).join(''))
    .filter(Boolean)
    .join('\n');
}

function slideText(doc) {
  return local(doc, 't').map((node) => node.textContent).filter(Boolean).join('\n');
}

function textStyle(shape, theme) {
  const rPr = local(shape, 'rPr')[0];
  if (!rPr) return '';
  const parts = [];
  if (rPr.getAttribute('b') === '1' || local(rPr, 'b').length) parts.push('font-weight:700');
  if (rPr.getAttribute('i') === '1' || local(rPr, 'i').length) parts.push('font-style:italic');
  const size = Number(rPr.getAttribute('sz') || 0);
  if (size) parts.push(`font-size:${size / 100}pt`);
  const latin = local(rPr, 'latin')[0]?.getAttribute('typeface');
  if (latin) parts.push(`font-family:${latin},Segoe UI,sans-serif`);
  const fill = local(rPr, 'solidFill')[0];
  const color = colorFromPaint(fill || rPr, theme);
  if (color) parts.push(`color:${color}`);
  return parts.join(';');
}

function partPath(target) {
  return `ppt/${String(target || '').replace(/^\.\.\//, '')}`;
}

function mimeForExtension(extension) {
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'emf') return 'image/x-emf';
  if (extension === 'wmf') return 'image/x-wmf';
  return 'application/octet-stream';
}

function collectBlocks(doc, slideSize, relationships, files, theme, blocks) {
  for (const shape of local(doc, 'sp')) {
    const text = textOf(shape);
    if (!text) continue;
    blocks.push({ type: 'text', ...transformBox(shape, slideSize), text, style: textStyle(shape, theme) });
  }
  for (const picture of local(doc, 'pic')) {
    const embed = local(picture, 'blip')[0];
    const id = embed?.getAttribute('r:embed') || [...(embed?.attributes || [])].find((attr) => attr.localName === 'embed')?.value;
    const target = relationships.get(id) || '';
    const media = partPath(target);
    const data = files[media];
    if (!data) continue;
    const extension = media.split('.').pop().toLowerCase();
    const mime = mimeForExtension(extension);
    const box = transformBox(picture, slideSize);
    if (mime === 'image/x-emf' || mime === 'image/x-wmf') {
      blocks.push({ type: 'vector', ...box, label: 'Embedded diagram (EMF/WMF) — open in PowerPoint for full fidelity.' });
      continue;
    }
    blocks.push({ type: 'image', ...box, mime, bytes: data });
  }
  for (const frame of local(doc, 'graphicFrame')) {
    const table = local(frame, 'tbl')[0];
    if (!table) continue;
    const rows = local(table, 'tr').map((row) => local(row, 'tc').map((cell) => textOf(cell)));
    if (rows.length) blocks.push({ type: 'table', ...transformBox(frame, slideSize), rows });
  }
}

function readTheme(files) {
  const themePath = Object.keys(files).find((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name));
  if (!themePath) return {};
  return parseColorScheme(xml(files[themePath]));
}

export function parsePptx(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This presentation could not be opened. Password-protected PowerPoint files are not supported.');
  }
  const theme = readTheme(files);
  const presentation = files['ppt/presentation.xml'] ? xml(files['ppt/presentation.xml']) : null;
  const size = local(presentation || xml('<a/>'), 'sldSz')[0];
  const slideSize = { cx: Number(size?.getAttribute('cx') || 9144000), cy: Number(size?.getAttribute('cy') || 5143500) };
  const names = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const slides = names.map((name, index) => {
    const doc = xml(files[name]);
    const relPath = name.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const rels = files[relPath] ? xml(files[relPath]) : null;
    const relationships = new Map((rels ? local(rels, 'Relationship') : []).map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
    const blocks = [];
    collectBlocks(doc, slideSize, relationships, files, theme, blocks);
    for (const target of relationships.values()) {
      if (!target || !target.includes('diagrams/drawing')) continue;
      const path = partPath(target);
      if (!files[path]) continue;
      collectBlocks(xml(files[path]), slideSize, relationships, files, theme, blocks);
    }
    if (!blocks.length) {
      const fallback = slideText(doc);
      if (fallback.trim()) {
        blocks.push({ type: 'text', x: 6, y: 6, w: 88, h: 88, text: fallback, style: '' });
      }
    }
    return {
      index,
      text: blocks.map((block) => (block.type === 'table' ? block.rows.flat().join(' ') : block.text || block.label || '')).join('\n'),
      blocks,
    };
  });
  return {
    slides,
    cx: slideSize.cx,
    cy: slideSize.cy,
    macroIgnored: Object.keys(files).some((name) => name.toLowerCase().endsWith('vbaproject.bin')),
  };
}
