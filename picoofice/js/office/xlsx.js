import { unzipSync, strFromU8 } from '../../vendor/fflate.js';

import { escapeHtml } from './sanitize.js';

import { colorFromPaint, localElements, parseColorScheme } from './ooxmlColor.js';



const MAX_ROWS = 2000;

const MAX_COLS = 64;

const EMPTY_CELL = { value: '', bold: false, italic: false, underline: false, color: '', fill: '', size: '', font: '' };



function xml(bytes) {

  const text = typeof bytes === 'string' ? bytes : strFromU8(bytes);

  const doc = new DOMParser().parseFromString(text, 'application/xml');

  if (!doc.documentElement || doc.documentElement.localName === 'parsererror') throw new Error('The spreadsheet contains invalid XML.');

  return doc;

}



function local(root, name) {

  return localElements(root, name);

}



function columnIndex(cellRef) {

  const letters = String(cellRef || '').replace(/\d/g, '');

  let index = 0;

  for (const letter of letters) index = (index * 26) + letter.charCodeAt(0) - 64;

  return Math.max(0, index - 1);

}



function excelDate(serial) {

  const epoch = Date.UTC(1899, 11, 30);

  const date = new Date(epoch + Number(serial) * 86400000);

  if (Number.isNaN(date.getTime())) return String(serial);

  return date.toISOString().slice(0, 10);

}



function sharedStringText(item) {

  const direct = local(item, 't');

  if (direct.length) return direct.map((node) => node.textContent).join('');

  return local(item, 'r').map((run) => local(run, 't').map((node) => node.textContent).join('')).join('');

}



function readSharedStrings(files) {

  const entry = files['xl/sharedStrings.xml'];

  if (!entry) return [];

  return local(xml(entry), 'si').map(sharedStringText);

}



function columnLetter(index) {

  let value = index + 1;

  let name = '';

  while (value > 0) {

    const remainder = (value - 1) % 26;

    name = String.fromCharCode(65 + remainder) + name;

    value = Math.floor((value - 1) / 26);

  }

  return name;

}



function readTheme(files) {

  const themePath = Object.keys(files).find((name) => /^xl\/theme\/theme\d+\.xml$/.test(name));

  if (!themePath) return {};

  return parseColorScheme(xml(files[themePath]));

}



function fillColor(fill, theme) {

  if (!fill) return '';

  const pattern = local(fill, 'patternFill')[0];

  if (pattern) {

    const type = pattern.getAttribute('patternType') || 'none';

    if (type === 'none') return '';

    const fg = colorFromPaint(local(pattern, 'fgColor')[0], theme);

    if (fg) return fg;

    const bg = colorFromPaint(local(pattern, 'bgColor')[0], theme);

    if (bg) return bg;

  }

  const solid = local(fill, 'solidFill')[0];

  if (solid) return colorFromPaint(solid, theme);

  const gradient = local(fill, 'gradientFill')[0];

  if (gradient) {

    const stop = local(gradient, 'gs')[0];

    if (stop) return colorFromPaint(local(stop, 'srgbClr')[0] || stop, theme);

  }

  return colorFromPaint(local(fill, 'srgbClr')[0], theme);

}



function readStyles(files, theme) {

  const entry = files['xl/styles.xml'];

  if (!entry) return { fonts: [], fills: [], dates: [], cellStyles: [] };

  const doc = xml(entry);

  const fonts = local(doc, 'font').map((font) => ({

    bold: local(font, 'b').length > 0 || font.getAttribute('b') === '1',

    italic: local(font, 'i').length > 0 || font.getAttribute('i') === '1',

    underline: local(font, 'u').length > 0 || font.getAttribute('u') === '1',

    color: colorFromPaint(local(font, 'color')[0], theme),

    size: local(font, 'sz')[0]?.getAttribute('val') || '',

    name: local(font, 'name')[0]?.getAttribute('val') || '',

  }));

  const fills = local(doc, 'fill').map((fill) => fillColor(fill, theme));

  const formats = new Map([[14, true], [15, true], [16, true], [17, true], [22, true]]);

  local(doc, 'numFmt').forEach((format) => {

    if (/[dmy]/i.test(format.getAttribute('formatCode') || '')) formats.set(Number(format.getAttribute('numFmtId')), true);

  });

  const cellXfs = local(doc, 'cellXfs')[0];

  const styles = cellXfs ? local(cellXfs, 'xf') : [];

  return {

    fonts,

    fills,

    dates: styles.map((style) => formats.has(Number(style.getAttribute('numFmtId')))),

    cellStyles: styles.map((style) => ({

      fontId: Number(style.getAttribute('fontId') || 0),

      fillId: Number(style.getAttribute('fillId') || 0),

    })),

  };

}



function cellStyle(styles, index) {

  const style = styles.cellStyles?.[index] ?? { fontId: 0, fillId: 0 };

  const font = styles.fonts[style.fontId] ?? styles.fonts[0] ?? {};

  const fill = styles.fills[style.fillId] || '';

  return {

    bold: font.bold,

    italic: font.italic,

    underline: font.underline,

    color: font.color,

    fill: fill && fill !== '#FFFFFF' ? fill : '',

    size: font.size,

    font: font.name,

  };

}



export function parseXlsx(bytes) {

  let files;

  try {

    files = unzipSync(bytes);

  } catch {

    throw new Error('This spreadsheet could not be opened. Password-protected Excel files are not supported.');

  }

  const theme = readTheme(files);

  const workbook = xml(files['xl/workbook.xml']);

  const rels = xml(files['xl/_rels/workbook.xml.rels']);

  const targets = new Map(local(rels, 'Relationship').map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]));

  const shared = readSharedStrings(files);

  const styles = readStyles(files, theme);

  const sheets = local(workbook, 'sheet').map((sheet) => {

    const target = targets.get(sheet.getAttribute('r:id') || [...sheet.attributes].find((attr) => attr.localName === 'id')?.value || '');

    const path = `xl/${String(target || '').replace(/^\/?xl\//, '')}`;

    const sheetXml = files[path] || files[`xl/${target}`];

    if (!sheetXml) return { name: sheet.getAttribute('name') || 'Sheet', rows: [], columns: 0, freeze: { rows: 0, cols: 0 }, truncated: false };

    const doc = xml(sheetXml);

    const pane = local(doc, 'pane')[0];

    const freeze = {

      rows: Number(pane?.getAttribute('ySplit') || 0),

      cols: Number(pane?.getAttribute('xSplit') || 0),

    };

    const matrix = [];

    let truncated = false;

    for (const cell of local(doc, 'c')) {

      const ref = cell.getAttribute('r') || 'A1';

      const rowIndex = Math.max(0, Number(ref.replace(/\D/g, '')) - 1);

      const colIndex = columnIndex(ref);

      if (rowIndex >= MAX_ROWS || colIndex >= MAX_COLS) {

        truncated = true;

        continue;

      }

      const type = cell.getAttribute('t');

      const styleIndex = Number(cell.getAttribute('s') || 0);

      const raw = local(cell, 'v')[0]?.textContent ?? local(cell, 't')[0]?.textContent ?? '';

      let value = raw;

      if (type === 's') value = shared[Number(raw)] || '';

      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';

      else if (type === 'inlineStr') {

        const inline = local(cell, 'is')[0];

        value = inline

          ? local(inline, 't').map((node) => node.textContent).join('')

          : local(cell, 't').map((node) => node.textContent).join('');

      }

      else if (!type && styles.dates[styleIndex] && raw !== '') value = excelDate(raw);

      matrix[rowIndex] ||= [];

      matrix[rowIndex][colIndex] = { value: String(value), ...cellStyle(styles, styleIndex) };

    }

    const columns = matrix.reduce((max, row) => Math.max(max, row?.length || 0), 0);

    return {

      name: sheet.getAttribute('name') || 'Sheet',

      rows: matrix.map((row) => Array.from({ length: columns }, (_, index) => row?.[index] || { ...EMPTY_CELL })),

      columns,

      freeze,

      truncated,

    };

  });

  return { sheets, macroIgnored: Object.keys(files).some((name) => name.toLowerCase().endsWith('vbaproject.bin')) };

}



function cellCss(cell) {

  const parts = [];

  if (cell.bold) parts.push('font-weight:700');

  if (cell.italic) parts.push('font-style:italic');

  if (cell.underline) parts.push('text-decoration:underline');

  if (cell.color) parts.push(`color:${cell.color}`);

  if (cell.fill) parts.push(`background:${cell.fill}`);

  if (cell.size) parts.push(`font-size:${Number(cell.size)}pt`);

  if (cell.font) parts.push(`font-family:${cell.font},Segoe UI,sans-serif`);

  return parts.join(';');

}



export function sheetHtml(sheet) {

  const freezeRows = Math.max(0, sheet.freeze.rows || 0);

  const headerDataRows = freezeRows > 0 ? freezeRows : (sheet.rows.length > 0 ? 1 : 0);

  const headRows = Math.min(headerDataRows, sheet.rows.length);

  const body = sheet.rows.slice(headRows);

  const letterRow = sheet.columns

    ? `<tr><th class="row-head col-corner"></th>${Array.from({ length: sheet.columns }, (_, col) => `<th class="col-head">${columnLetter(col)}</th>`).join('')}</tr>`

    : '';

  const renderRow = (row, rowIndex, headerCells = false) => `<tr><th class="row-head">${rowIndex + 1}</th>${row.map((cell, col) => {

    const tag = headerCells ? 'th' : 'td';

    const sticky = col < sheet.freeze.cols ? ' freeze-col' : '';

    const style = cellCss(cell);

    return `<${tag} class="${sticky.trim()}"${style ? ` style="${style}"` : ''}>${escapeHtml(cell.value)}</${tag}>`;

  }).join('')}</tr>`;

  return `<div class="sheet-wrap"><table class="grid"><thead>${letterRow}${sheet.rows.slice(0, headRows).map((row, index) => renderRow(row, index, true)).join('')}</thead><tbody>${body.map((row, index) => renderRow(row, index + headRows)).join('')}</tbody></table></div>`;

}

