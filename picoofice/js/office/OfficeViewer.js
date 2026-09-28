import { detectFormat } from './format.js';
import { parseDocx } from './docx.js';
import { parsePptx } from './pptx.js';
import { parseXlsx, sheetHtml } from './xlsx.js';
import { parseCsv, renderMarkdown, renderRtf } from './textFormats.js';
import { escapeHtml, sanitizeHtml } from './sanitize.js';

export class OfficeViewer {
  constructor() {
    this.urls = [];
    this.index = 0;
    this.markdownMode = 'rendered';
  }

  close() {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls = [];
  }

  async load(file, bytes) {
    this.close();
    this.file = file;
    this.text = '';
    this.index = 0;
    const format = detectFormat(file);
    if (format.kind === 'legacy') throw new Error('Older .doc, .xls, and .ppt files are not supported. Save them as .docx, .xlsx, or .pptx first.');
    if (format.kind === 'unknown' || format.kind === 'pdf') throw new Error('Choose a Word, PowerPoint, Excel, text, or image file.');
    this.kind = format.kind;
    this.warning = format.macro ? 'Macros were found and were not run.' : '';
    if (format.kind === 'docx') {
      this.doc = await parseDocx(bytes);
      this.text = this.doc.text;
      if (this.doc.macroIgnored) this.warning = 'Macros were found and were not run.';
    } else if (format.kind === 'pptx') {
      this.deck = parsePptx(bytes);
      this.text = this.deck.slides.map((slide) => slide.text).join('\n');
      if (this.deck.macroIgnored) this.warning = 'Macros were found and were not run.';
    } else if (format.kind === 'xlsx') {
      this.book = parseXlsx(bytes);
      this.text = this.book.sheets.map((sheet) => sheet.rows.flat().map((cell) => cell.value).join('\t')).join('\n');
      if (this.book.macroIgnored) this.warning = 'Macros were found and were not run.';
    } else if (format.kind === 'image') {
      const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/png' }));
      this.urls.push(url);
      this.imageUrl = url;
      this.text = file.name;
    } else {
      this.plain = new TextDecoder().decode(bytes);
      this.text = this.plain;
    }
    return this;
  }

  get items() {
    if (this.kind === 'pptx') return this.deck.slides.map((_, index) => `Slide ${index + 1}`);
    if (this.kind === 'xlsx') return this.book.sheets.map((sheet) => sheet.name);
    return [];
  }

  render(container) {
    this.urls.forEach((url) => { if (url !== this.imageUrl) URL.revokeObjectURL(url); });
    this.urls = this.imageUrl ? [this.imageUrl] : [];
    if (this.kind === 'docx') container.innerHTML = `<article class="doc-page">${this.doc.html}</article>`;
    else if (this.kind === 'pptx') this.renderSlide(container);
    else if (this.kind === 'xlsx') this.renderSheet(container);
    else if (this.kind === 'image') container.innerHTML = `<article class="doc-page image-page"><img src="${this.imageUrl}" alt="${escapeHtml(this.file.name)}"></article>`;
    else if (this.kind === 'csv') this.renderCsv(container);
    else if (this.kind === 'markdown') container.innerHTML = this.markdownMode === 'raw'
      ? `<article class="doc-page"><pre class="plain">${escapeHtml(this.plain)}</pre></article>`
      : `<article class="doc-page">${sanitizeHtml(renderMarkdown(this.plain))}</article>`;
    else if (this.kind === 'rtf') container.innerHTML = `<article class="doc-page">${sanitizeHtml(renderRtf(this.plain))}</article>`;
    else container.innerHTML = `<article class="doc-page"><pre class="plain">${escapeHtml(this.plain)}</pre></article>`;
  }

  renderSlide(container) {
    const slide = this.deck.slides[this.index];
    if (!slide) {
      container.innerHTML = '<article class="doc-page"><p>This presentation has no readable slides.</p></article>';
      return;
    }
    const blocks = slide.blocks.map((block) => {
      const style = `left:${block.x}%;top:${block.y}%;width:${block.w}%;height:${block.h}%`;
      if (block.type === 'image') {
        const url = URL.createObjectURL(new Blob([block.bytes], { type: block.mime }));
        this.urls.push(url);
        return `<img class="slide-block" style="${style}" src="${url}" alt="">`;
      }
      if (block.type === 'vector') {
        return `<div class="slide-block slide-vector" style="${style}">${escapeHtml(block.label || 'Vector graphic')}</div>`;
      }
      if (block.type === 'table') {
        return `<div class="slide-block sheet-wrap" style="${style}"><table class="grid">${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      }
      const textStyle = block.style ? `${block.style};` : '';
      return `<div class="slide-block slide-text" style="${textStyle}${style}">${escapeHtml(block.text).replaceAll('\n', '<br>')}</div>`;
    }).join('');
    container.innerHTML = `<article class="slide-stage" style="aspect-ratio:${this.deck.cx} / ${this.deck.cy}">${blocks}</article>`;
  }

  renderSheet(container) {
    const sheet = this.book.sheets[this.index];
    if (!sheet) {
      container.innerHTML = '<article class="doc-page"><p>This workbook has no readable sheets.</p></article>';
      return;
    }
    const note = sheet.truncated ? '<p class="muted sheet-note">Showing the first 2,000 rows and 64 columns.</p>' : '';
    container.innerHTML = `${note}${sheetHtml(sheet)}`;
  }

  renderCsv(container) {
    const rows = parseCsv(this.plain);
    container.innerHTML = `<div class="sheet-wrap"><table class="grid">${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }

  search(query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    if (this.kind === 'pptx') {
      return this.deck.slides.flatMap((slide, index) => (
        slide.text.toLocaleLowerCase().includes(needle) ? [{ label: `Slide ${index + 1}`, excerpt: slide.text, index }] : []
      ));
    }
    if (this.kind === 'xlsx') {
      const hits = [];
      this.book.sheets.forEach((sheet, sheetIndex) => {
        sheet.rows.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
          if (cell.value.toLocaleLowerCase().includes(needle)) {
            hits.push({ label: `${sheet.name} ${columnName(colIndex)}${rowIndex + 1}`, excerpt: cell.value, index: sheetIndex });
          }
        }));
      });
      return hits;
    }
    const hits = [];
    let from = 0;
    const source = this.text.toLocaleLowerCase();
    while (hits.length < 200 && (from = source.indexOf(needle, from)) !== -1) {
      hits.push({ label: 'Match', excerpt: this.text.slice(Math.max(0, from - 40), from + needle.length + 40), index: 0 });
      from += needle.length;
    }
    return hits;
  }

  highlight(container, query) {
    container.querySelectorAll('mark.hit').forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
    container.normalize();
    const needle = query.trim();
    if (!needle) return [];
    const lowerNeedle = needle.toLocaleLowerCase();
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const hits = [];
    for (const node of nodes) {
      const text = node.textContent;
      const lower = text.toLocaleLowerCase();
      if (!lower.includes(lowerNeedle)) continue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let found = lower.indexOf(lowerNeedle);
      while (found !== -1) {
        fragment.append(text.slice(cursor, found));
        const mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = text.slice(found, found + needle.length);
        fragment.append(mark);
        hits.push(mark);
        cursor = found + needle.length;
        found = lower.indexOf(lowerNeedle, cursor);
      }
      fragment.append(text.slice(cursor));
      node.parentNode.replaceChild(fragment, node);
    }
    return hits;
  }
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
