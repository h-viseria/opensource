import { escapeHtml } from './sanitize.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

export function renderMarkdown(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let list = '';
  const flush = () => {
    if (list) html.push(`<${list}>${html.items.join('')}</${list}>`);
    list = '';
    html.items = [];
  };
  html.items = [];
  const inline = (value) => escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => (
      /^(https?:|mailto:)/i.test(url) ? `<a href="${url}" rel="noreferrer noopener" target="_blank">${label}</a>` : label
    ));
  for (const line of lines) {
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (item || numbered) {
      const next = item ? 'ul' : 'ol';
      if (list && list !== next) flush();
      list = next;
      html.items.push(`<li>${inline((item || numbered)[1])}</li>`);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (line.startsWith('> ')) html.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
    else html.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return html.filter((part) => typeof part === 'string').join('');
}

export function renderRtf(text) {
  const source = String(text || '').replace(/^\{\\rtf1\s?/, '{');
  let output = '';
  let bold = false;
  let italic = false;
  let skip = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      if (/^\{\\\*/.test(source.slice(index, index + 3)) || /^\{\\(?:fonttbl|colortbl|stylesheet|info)/.test(source.slice(index, index + 20))) {
        let depth = 0;
        for (; index < source.length; index += 1) {
          if (source[index] === '{') depth += 1;
          else if (source[index] === '}') depth -= 1;
          if (depth === 0) break;
        }
      }
      continue;
    }
    if (char === '}') continue;
    if (char === '\\') {
      if (source[index + 1] === '\\' || source[index + 1] === '{' || source[index + 1] === '}') {
        output += escapeHtml(source[index + 1]);
        index += 1;
        continue;
      }
      const unicode = source.slice(index).match(/^\\u(-?\d+)\??/);
      if (unicode) {
        let code = Number(unicode[1]);
        if (code < 0) code += 65536;
        output += escapeHtml(String.fromCodePoint(code));
        index += unicode[0].length - 1;
        continue;
      }
      const word = source.slice(index).match(/^\\([a-z]+)(-?\d+)? ?/i);
      if (word) {
        const command = word[1];
        if (command === 'par' || command === 'line') output += '<br>';
        if (command === 'b') bold = word[2] !== '0';
        if (command === 'i') italic = word[2] !== '0';
        if (command === 'tab') output += ' ';
        index += word[0].length - 1;
        continue;
      }
      continue;
    }
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    let piece = escapeHtml(char);
    if (bold) piece = `<strong>${piece}</strong>`;
    if (italic) piece = `<em>${piece}</em>`;
    output += piece;
  }
  return `<p>${output}</p>`;
}
