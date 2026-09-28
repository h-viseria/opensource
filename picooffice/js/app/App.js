import { PdfEngine } from '../pdf/PdfEngine.js';
import { pickFiles, saveBytes, safeBaseName, fileBytes } from '../file/fileIO.js';
import { bindMultiFileList, multiFileFieldHtml } from '../file/pickerShim.js';
import {
  addPageNumbers, addWatermark, deletePages, extractPages, imagesToPdf, mergePdfs,
  parsePageRange, reorderPages, rotatePages, updateMetadata, validatePdf, zipFiles,
} from '../pdf/PdfTools.js';
import { applyAnnotations, placeSignature } from '../pdf/PdfAnnotations.js';
import { compressInWorker, transformImagesInWorker } from '../workers/runPdfWorker.js';
import { pdfToImages, transformPdf } from '../pdf/PdfTransform.js';
import { OfficeViewer } from '../office/OfficeViewer.js';
import { detectFormat } from '../office/format.js';
import { canReamConvertToPdf } from '../convert/reamFormats.js';
import { ReamConvertFlow } from '../convert/ReamConvertFlow.js';

const MIN_VIEW_ZOOM = 0.35;
const MAX_VIEW_ZOOM = 3;
const VIEW_ZOOM_STEP = 0.15;

const TOOL_CARDS = [
  ['merge', 'Merge PDFs', 'Combine files locally'],
  ['split', 'Split / extract', 'Export selected pages'],
  ['delete', 'Delete pages', 'Remove selected pages'],
  ['reorder', 'Reorder pages', 'Set a new page order'],
  ['rotate', 'Rotate pages', 'Rotate selected pages'],
  ['compress', 'Compress PDF', 'Downscale internal JPEG images'],
  ['grayscale', 'Grayscale / B&W', 'Printer-friendly colour modes'],
  ['light', 'Light background', 'Save ink on dark scans'],
  ['invert', 'Invert colours', 'Create a negative copy'],
  ['sign', 'Sign PDF', 'Draw or type a signature'],
  ['watermark', 'Watermark', 'Add text to selected pages'],
  ['numbers', 'Page numbers', 'Six standard positions'],
  ['images-to-pdf', 'Images → PDF', 'JPG, PNG and WebP'],
  ['pdf-to-images', 'PDF → Images', 'PNG or JPEG'],
  ['metadata', 'Metadata', 'Title, author and keywords'],
];

export class App {
  constructor(root) {
    this.root = root;
    this.engine = new PdfEngine({
      onPassword: (reason) => this.askPassword(reason),
      onProgress: (value) => this.setStatus(`Opening… ${Math.round(value * 100)}%`),
    });
    this.file = null;
    this.bytes = null;
    this.processBytes = null;
    this.scale = 1.15;
    this.currentPage = 1;
    this.viewMode = 'continuous';
    this.marks = [];
    this.activeAnnotation = null;
    this.previewFilter = '';
    this.searchResults = [];
    this.searchIndex = -1;
    this.office = null;
  }

  async start() {
    this.reamConvert = new ReamConvertFlow({
      setStatus: (message) => this.setStatus(message),
      toast: (message) => this.toast(message),
      formatBytes: (value) => this.formatBytes(value),
      openPdfBytes: (name, bytes) => this.openPdfFromBytes(name, bytes),
      askPassword: (label) => this.askOptionalPassword(label),
    });
    this.renderHome();
    this.bindGlobalDrop();
    this.bindKeyboard();
    this.setBuildStatus();
  }

  shell(content) {
    this.root.innerHTML = `<main class="app">${content}<footer class="status"><span id="status">Ready</span><span>🔒 Processed locally — your files stay on this device.</span></footer></main>`;
  }

  renderHome() {
    this.shell(`
      <section class="empty">
        <div class="hero">
          <div class="brand" style="color:var(--brand)">PicoOffice <small>Lite</small></div>
          <h1>Read. Annotate. Understand. Privately.</h1>
          <p>Read Word, PowerPoint, Excel, and text files. Transform PDFs privately.</p>
          <p class="home-caveat">PicoOffice Lite is a lightweight app for reading documents and editing PDFs in your browser. It is not a full Office suite—has its limits—but your files stay on this device: no subscriptions, no adds, no upload, and no cloud processing.</p>
          <div class="drop" id="drop-zone">
            <strong>Drop a document here</strong><br><span class="muted">PDF, DOCX, PPTX, XLSX, text, or an image</span><br><br>
            <div class="home-actions">
              <button class="btn primary" id="open-file">Open file</button>
              <button class="btn" id="convert-pdf">Convert to PDF</button>
            </div>
            <p class="muted home-convert-note">Convert locally — Word, PowerPoint, Excel or legacy Office files in → PDF out.</p>
          </div>
          <button class="btn" id="show-tools">PDF Tools</button>
          <p class="home-credit">By <a href="https://picoai.org" target="_blank" rel="noopener noreferrer">PicoAI</a></p>
        </div>
      </section>`);
    this.root.querySelector('#open-file').onclick = () => this.openPicker();
    this.root.querySelector('#convert-pdf').onclick = () => this.reamConvert.pickAndConvert();
    this.root.querySelector('#show-tools').onclick = () => this.renderTools();
  }

  renderTools() {
    this.shell(`
      <header class="topbar"><div class="brand">PicoOffice <small>PDF Tools</small></div><button class="btn ghost" id="home">Home</button><span class="privacy">No upload · no account · no server processing</span></header>
      <section class="empty" style="max-width:1050px"><h1>PDF Tools</h1><p class="muted">Every operation runs in this browser. Your original file is never modified.</p>
        <div class="tools-grid">${TOOL_CARDS.map(([id, title, text]) => `<button class="tool-card" data-tool="${id}"><strong>${title}</strong><span class="muted">${text}</span></button>`).join('')}</div>
      </section>`);
    this.root.querySelector('#home').onclick = () => this.renderHome();
    this.root.querySelectorAll('[data-tool]').forEach((button) => button.onclick = () => this.openTool(button.dataset.tool));
  }

  async openPicker() {
    try {
      const [file] = await pickFiles();
      if (file) await this.openFile(file);
    } catch (error) {
      if (error.name !== 'AbortError') this.toast(error.message);
    }
  }

  async openPdfFromBytes(name, bytes) {
    const file = new File([bytes], name, { type: 'application/pdf' });
    await this.openFile(file);
  }

  async openFile(file) {
    const format = detectFormat(file);
    if (format.kind !== 'pdf') {
      await this.openOfficeFile(file);
      return;
    }
    this.office?.close();
    this.office = null;
    this.file = file;
    this.bytes = await fileBytes(file);
    this.marks = [];
    await this.engine.open(this.bytes);
    this.processBytes = this.engine.passwordRequested ? await this.engine.saveDocument() : this.bytes;
    if (this.engine.passwordRequested) this.toast('Opened with a password. Tool exports will be unprotected copies.');
    if (await this.engine.document.hasJSActions?.()) this.toast('Embedded PDF scripts were disabled for safety.');
    const fields = await this.engine.document.getFieldObjects?.();
    if (fields && Object.values(fields).flat().some((field) => String(field.type).toLowerCase().includes('signature'))) {
      this.toast('This PDF contains a digital signature. Exporting changes can invalidate it.');
    }
    await this.renderReader();
    this.setStatus(`${file.name} · ${this.engine.document.numPages} pages · ${this.formatBytes(file.size)}`);
  }

  async openOfficeFile(file) {
    await this.engine.close();
    this.scale = 1;
    this.file = file;
    this.bytes = await fileBytes(file);
    this.office ||= new OfficeViewer();
    await this.office.load(file, this.bytes);
    if (this.office.warning) this.toast(this.office.warning);
    this.renderOffice();
    this.setStatus(`${file.name} · read only · ${this.formatBytes(file.size)}`);
  }

  setBuildStatus() {
    if (this.build) this.setStatus(`Ready · ${this.build}`);
  }

  zoomToolbarHtml({ fit = true, viewToggle = false } = {}) {
    const viewButton = viewToggle
      ? `<button class="btn ghost" data-action="view">${this.viewMode === 'continuous' ? 'Single' : 'Continuous'}</button>`
      : '';
    const fitButton = fit ? '<button class="btn ghost" data-action="fit">Fit</button>' : '<button class="btn ghost" data-action="fit">Fit width</button>';
    return `<div class="toolbar-group zoom-toolbar"><button class="btn ghost" data-action="zoom-out" title="Zoom out">−</button><span id="zoom-label">${Math.round(this.scale * 100)}%</span><button class="btn ghost" data-action="zoom-in" title="Zoom in">+</button>${fitButton}${viewButton}</div>`;
  }

  bindViewerZoomActions() {
    this.root.querySelectorAll('[data-action="zoom-in"], [data-action="zoom-out"], [data-action="fit"]').forEach((button) => {
      button.onclick = () => {
        if (button.dataset.action === 'zoom-in') return this.changeViewZoom(VIEW_ZOOM_STEP);
        if (button.dataset.action === 'zoom-out') return this.changeViewZoom(-VIEW_ZOOM_STEP);
        return this.fitViewer();
      };
    });
  }

  updateZoomLabel() {
    const label = this.root.querySelector('#zoom-label');
    if (label) label.textContent = `${Math.round(this.scale * 100)}%`;
  }

  applyOfficeZoom() {
    const host = this.root.querySelector('#viewer-zoom');
    if (!host) return;
    host.style.transform = `scale(${this.scale})`;
    host.style.transformOrigin = 'top center';
  }

  async changeViewZoom(change) {
    this.scale = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, this.scale + change));
    this.updateZoomLabel();
    if (this.engine.document) await this.renderReader();
    else this.applyOfficeZoom();
  }

  async fitViewer() {
    if (this.engine.document) {
      await this.fitWidth();
      return;
    }
    const view = this.root.querySelector('#office-view');
    const viewer = this.root.querySelector('#viewer');
    const content = view?.firstElementChild;
    if (!viewer || !content) return;
    const available = Math.max(240, viewer.clientWidth - 44);
    const contentWidth = content.getBoundingClientRect().width / Math.max(this.scale, 0.01);
    if (contentWidth > 0) {
      this.scale = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, available / contentWidth));
      this.updateZoomLabel();
      this.applyOfficeZoom();
    }
  }

  renderOffice() {
    const markdown = this.office.kind === 'markdown';
    const items = this.office.items;
    this.shell(`
      <header class="topbar">
        <div class="brand">PicoOffice</div>
        <div class="toolbar-group"><button class="btn ghost" data-action="open">Open</button>${canReamConvertToPdf(this.file) ? '<button class="btn ghost" data-action="convert-pdf">Convert to PDF</button>' : ''}<button class="btn ghost" data-action="home">Home</button><button class="btn ghost" data-action="tools">PDF Tools</button></div>
        ${items.length ? `<div class="toolbar-group secondary pages-toolbar"><button class="btn ghost icon-btn" data-action="prev">‹</button><span id="office-position">${this.office.index + 1} / ${items.length}</span><button class="btn ghost icon-btn" data-action="next">›</button></div>` : ''}
        ${this.zoomToolbarHtml({ fit: true, viewToggle: false })}
        ${markdown ? '<div class="toolbar-group"><button class="btn ghost" data-action="markdown-rendered">Rendered</button><button class="btn ghost" data-action="markdown-raw">Raw</button></div>' : ''}
        <div class="toolbar-group"><button class="btn ghost" data-action="search">Search</button></div>
        <span class="privacy">🔒 Read only · local</span>
      </header>
      <section class="workspace office-workspace ${items.length ? '' : 'office-workspace--solo'}">
        <aside class="sidebar ${items.length ? '' : 'hidden'}"><div class="sidebar-head">${this.office.kind === 'xlsx' ? 'Sheets' : 'Slides'}</div><div class="thumb-list" id="office-items"></div></aside>
        <div class="viewer-wrap office-view" id="viewer"><div class="viewer-zoom" id="viewer-zoom"><div id="office-view"></div></div></div>
        <aside class="properties hidden" id="properties"></aside>
      </section>`);
    this.root.querySelector('[data-action="open"]').onclick = () => this.openPicker();
    this.root.querySelector('[data-action="convert-pdf"]')?.addEventListener('click', () => this.convertOpenDocumentToPdf());
    this.root.querySelector('[data-action="home"]').onclick = () => this.renderHome();
    this.root.querySelector('[data-action="tools"]').onclick = () => this.renderTools();
    this.root.querySelector('[data-action="search"]').onclick = () => this.showSearch();
    this.root.querySelector('[data-action="prev"]')?.addEventListener('click', () => this.moveOffice(-1));
    this.root.querySelector('[data-action="next"]')?.addEventListener('click', () => this.moveOffice(1));
    this.root.querySelector('[data-action="markdown-rendered"]')?.addEventListener('click', () => this.setMarkdown('rendered'));
    this.root.querySelector('[data-action="markdown-raw"]')?.addEventListener('click', () => this.setMarkdown('raw'));
    const list = this.root.querySelector('#office-items');
    items.forEach((label, index) => {
      const button = document.createElement('button');
      button.className = `thumb ${index === this.office.index ? 'active' : ''}`;
      button.textContent = label;
      button.onclick = () => this.moveOffice(index, true);
      list.append(button);
    });
    this.bindViewerZoomActions();
    this.refreshOfficeView();
  }

  refreshOfficeView() {
    const view = this.root.querySelector('#office-view');
    if (!view) return;
    this.office.render(view);
    const position = this.root.querySelector('#office-position');
    if (position) position.textContent = `${this.office.index + 1} / ${this.office.items.length}`;
    this.root.querySelectorAll('#office-items .thumb').forEach((button, index) => button.classList.toggle('active', index === this.office.index));
    this.applyOfficeZoom();
  }

  moveOffice(step, absolute = false) {
    const count = this.office.items.length;
    if (!count) return;
    this.office.index = absolute ? step : Math.max(0, Math.min(count - 1, this.office.index + step));
    this.refreshOfficeView();
  }

  setMarkdown(mode) {
    this.office.markdownMode = mode;
    this.office.render(this.root.querySelector('#office-view'));
    this.applyOfficeZoom();
  }

  renderReaderShell() {
    const pageCount = this.engine.document.numPages;
    this.shell(`
      <header class="topbar">
        <div class="brand">PicoOffice</div>
        <div class="toolbar-group"><button class="btn ghost" data-action="open">Open</button><button class="btn primary" data-action="save">Save copy</button><button class="btn ghost" data-action="tools">Tools</button></div>
        <div class="toolbar-group secondary pages-toolbar"><button class="btn ghost icon-btn" data-action="prev">‹</button><input class="page-input" id="page-number" type="number" min="1" max="${pageCount}" value="${this.currentPage}"><span>/ ${pageCount}</span><button class="btn ghost icon-btn" data-action="next">›</button></div>
        ${this.zoomToolbarHtml({ fit: true, viewToggle: true })}
        <div class="toolbar-group"><button class="btn ghost" data-action="search">Search</button><button class="btn ghost" data-action="annotate">Annotate</button></div>
        <span class="privacy">🔒 Local</span>
      </header>
      <section class="workspace">
        <aside class="sidebar"><div class="sidebar-head">Pages</div><div class="thumb-list" id="thumb-list"></div></aside>
        <div class="viewer-wrap" id="viewer"><div class="pages ${this.previewFilter}" id="pages"></div></div>
        <aside class="properties hidden" id="properties"></aside>
      </section>`);
  }

  async renderReader() {
    this.renderReaderShell();
    this.bindReaderActions();
    await Promise.all([this.renderPages(), this.renderThumbnails()]);
    this.observePages();
  }

  async renderPages() {
    const container = this.root.querySelector('#pages');
    const pageNumbers = this.viewMode === 'single' ? [this.currentPage] : Array.from({ length: this.engine.document.numPages }, (_, i) => i + 1);
    for (const pageNumber of pageNumbers) {
      const page = await this.engine.document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.scale });
      const shell = document.createElement('section');
      shell.className = 'page-shell';
      shell.dataset.page = pageNumber;
      shell.innerHTML = '<canvas></canvas><div class="textLayer"></div><div class="markup-layer"></div>';
      shell.style.width = `${viewport.width}px`;
      shell.style.height = `${viewport.height}px`;
      container.append(shell);
      if (this.viewMode === 'single' || Math.abs(pageNumber - this.currentPage) <= 1) await this.renderPageShell(shell);
    }
    if (this.viewMode === 'continuous') {
      const lazy = new IntersectionObserver((entries) => {
        entries.filter((entry) => entry.isIntersecting).forEach((entry) => this.renderPageShell(entry.target));
      }, { root: this.root.querySelector('#viewer'), rootMargin: '900px 0px' });
      container.querySelectorAll('.page-shell').forEach((page) => lazy.observe(page));
    }
  }

  async renderPageShell(shell) {
    if (shell.dataset.rendered || shell.dataset.rendering) return;
    shell.dataset.rendering = 'true';
    const pageNumber = Number(shell.dataset.page);
    const { page, viewport } = await this.engine.renderPage(pageNumber, shell.querySelector('canvas'), this.scale);
    await this.engine.renderTextLayer(page, viewport, shell.querySelector('.textLayer'));
    shell.dataset.rendered = 'true';
    delete shell.dataset.rendering;
    this.renderMarksForPage(pageNumber);
    this.bindMarkupDrawing(shell);
  }

  async renderThumbnails() {
    const list = this.root.querySelector('#thumb-list');
    for (let pageNumber = 1; pageNumber <= this.engine.document.numPages; pageNumber += 1) {
      const button = document.createElement('button');
      button.className = `thumb ${pageNumber === this.currentPage ? 'active' : ''}`;
      button.dataset.page = pageNumber;
      button.innerHTML = `<canvas></canvas><span>Page ${pageNumber}</span>`;
      list.append(button);
      await this.engine.renderPage(pageNumber, button.querySelector('canvas'), 0.2);
      button.onclick = () => this.goToPage(pageNumber);
    }
  }

  bindReaderActions() {
    this.root.querySelectorAll('[data-action]').forEach((button) => {
      button.onclick = async () => {
        const action = button.dataset.action;
        if (action === 'open') return this.openPicker();
        if (action === 'save') return this.exportAnnotated();
        if (action === 'tools') return this.renderTools();
        if (action === 'prev') return this.goToPage(this.currentPage - 1);
        if (action === 'next') return this.goToPage(this.currentPage + 1);
        if (action === 'zoom-in') return this.changeViewZoom(VIEW_ZOOM_STEP);
        if (action === 'zoom-out') return this.changeViewZoom(-VIEW_ZOOM_STEP);
        if (action === 'fit') return this.fitViewer();
        if (action === 'view') return this.toggleView();
        if (action === 'search') return this.showSearch();
        if (action === 'annotate') return this.showAnnotations();
      };
    });
    this.root.querySelector('#page-number').onchange = (event) => this.goToPage(Number(event.target.value));
    this.bindViewerZoomActions();
  }

  observePages() {
    if (this.viewMode !== 'continuous') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) this.updateCurrentPage(Number(visible.target.dataset.page));
    }, { root: this.root.querySelector('#viewer'), threshold: [0.3, 0.6] });
    this.root.querySelectorAll('.page-shell').forEach((page) => observer.observe(page));
  }

  goToPage(pageNumber) {
    this.currentPage = Math.max(1, Math.min(this.engine.document.numPages, pageNumber));
    if (this.viewMode === 'single') return this.renderReader();
    this.root.querySelector(`.page-shell[data-page="${this.currentPage}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.updateCurrentPage(this.currentPage);
  }

  updateCurrentPage(pageNumber) {
    this.currentPage = pageNumber;
    const input = this.root.querySelector('#page-number');
    if (input) input.value = pageNumber;
    this.root.querySelectorAll('.thumb').forEach((thumb) => thumb.classList.toggle('active', Number(thumb.dataset.page) === pageNumber));
  }

  async fitWidth() {
    const page = await this.engine.document.getPage(this.currentPage);
    const base = page.getViewport({ scale: 1 });
    this.scale = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, (this.root.querySelector('#viewer').clientWidth - 52) / base.width));
    this.updateZoomLabel();
    await this.renderReader();
  }

  async toggleView() {
    this.viewMode = this.viewMode === 'continuous' ? 'single' : 'continuous';
    await this.renderReader();
  }

  async showSearch() {
    const panel = this.showProperties(`<h3>Search</h3><div class="field"><input id="search-query" type="search" placeholder="Find in document"></div><div class="row"><button class="btn primary" id="find">Find</button><button class="btn" id="previous-result">Previous</button><button class="btn" id="next-result">Next</button></div><p class="muted" id="search-status" style="margin-top:12px"></p>`);
    panel.querySelector('#find').onclick = async () => {
      this.setStatus('Searching…');
      const query = panel.querySelector('#search-query').value;
      this.searchResults = this.office ? this.office.search(query) : await this.engine.find(query);
      this.searchQuery = query;
      this.searchIndex = this.searchResults.length ? 0 : -1;
      this.showSearchResult(panel);
      this.setStatus('Ready');
    };
    panel.querySelector('#next-result').onclick = () => {
      if (!this.searchResults.length) return;
      this.searchIndex = (this.searchIndex + 1) % this.searchResults.length;
      this.showSearchResult(panel);
    };
    panel.querySelector('#previous-result').onclick = () => {
      if (!this.searchResults.length) return;
      this.searchIndex = (this.searchIndex - 1 + this.searchResults.length) % this.searchResults.length;
      this.showSearchResult(panel);
    };
  }

  showSearchResult(panel) {
    const result = this.searchResults[this.searchIndex];
    const location = result?.pageNumber ? `Page ${result.pageNumber}` : result?.label || 'Match';
    panel.querySelector('#search-status').textContent = result ? `${this.searchIndex + 1} of ${this.searchResults.length} · ${location}\n${result.excerpt || ''}` : 'No results.';
    if (!result) return;
    if (result.pageNumber) this.goToPage(result.pageNumber);
    if (this.office) {
      if (Number.isInteger(result.index) && result.index !== this.office.index && this.office.items.length) {
        this.office.index = result.index;
        this.refreshOfficeView();
      }
      const hits = this.office.highlight(this.root.querySelector('#office-view'), this.searchQuery || '');
      const mark = hits[this.office.kind === 'pptx' || this.office.kind === 'xlsx' ? 0 : this.searchIndex] || hits[0];
      mark?.scrollIntoView({ block: 'center' });
    }
  }

  showAnnotations() {
    const panel = this.showProperties(`
      <h3>Annotate</h3><p class="muted">Choose a tool, then drag on a page.</p>
      <div class="field"><label>Tool</label><select id="annotation-tool">
        <option value="highlight">Highlight</option><option value="underline">Underline</option><option value="strikeout">Strikethrough</option>
        <option value="ink">Freehand pen</option><option value="freeText">Text box</option><option value="note">Sticky note</option>
        <option value="square">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option><option value="arrow">Arrow</option>
      </select></div>
      <div class="field"><label>Colour</label><input id="annotation-color" type="color" value="#c45c26"></div>
      <div class="field"><label>Line width</label><input id="annotation-width" type="range" min="1" max="8" value="2"></div>
      <button class="btn danger" id="clear-marks">Delete all new annotations</button><p class="muted" style="margin-top:12px">${this.marks.length} pending annotation(s)</p>`);
    const setActive = () => {
      this.activeAnnotation = {
        type: panel.querySelector('#annotation-tool').value,
        color: panel.querySelector('#annotation-color').value,
        widthPx: Number(panel.querySelector('#annotation-width').value),
      };
      this.root.querySelectorAll('.markup-layer').forEach((layer) => { layer.style.pointerEvents = 'auto'; });
    };
    panel.querySelectorAll('select,input').forEach((input) => input.oninput = setActive);
    setActive();
    panel.querySelector('#clear-marks').onclick = () => {
      this.marks = [];
      this.root.querySelectorAll('.markup-layer').forEach((layer) => layer.replaceChildren());
      this.showAnnotations();
    };
  }

  bindMarkupDrawing(shell) {
    const layer = shell.querySelector('.markup-layer');
    layer.style.pointerEvents = this.activeAnnotation ? 'auto' : 'none';
    let start = null;
    let points = [];
    layer.onpointerdown = (event) => {
      if (!this.activeAnnotation || event.target !== layer) return;
      const rect = layer.getBoundingClientRect();
      start = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      points = [start];
      layer.setPointerCapture(event.pointerId);
    };
    layer.onpointermove = (event) => {
      if (!start || this.activeAnnotation?.type !== 'ink') return;
      const rect = layer.getBoundingClientRect();
      points.push({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    };
    layer.onpointerup = (event) => {
      if (!start) return;
      const rect = layer.getBoundingClientRect();
      const finish = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      const type = this.activeAnnotation.type;
      const text = ['note', 'freeText'].includes(type) ? prompt(type === 'note' ? 'Note text' : 'Text') || '' : '';
      const mark = {
        ...this.activeAnnotation, id: crypto.randomUUID(), page: Number(shell.dataset.page), text,
        x: Math.max(0, Math.min(start.x, finish.x)), y: Math.max(0, Math.min(start.y, finish.y)),
        width: Math.max(type === 'note' ? 0.03 : 0.01, Math.abs(finish.x - start.x)),
        height: Math.max(type === 'note' ? 0.03 : 0.008, Math.abs(finish.y - start.y)), points,
      };
      this.marks.push(mark);
      start = null;
      this.renderMarksForPage(mark.page);
    };
  }

  renderMarksForPage(pageNumber) {
    const layer = this.root.querySelector(`.page-shell[data-page="${pageNumber}"] .markup-layer`);
    if (!layer) return;
    layer.replaceChildren();
    for (const mark of this.marks.filter((item) => item.page === pageNumber)) {
      const element = document.createElement('div');
      element.className = `markup ${mark.type}`;
      Object.assign(element.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.width * 100}%`, height: `${mark.height * 100}%`, borderColor: mark.color, color: mark.color, borderWidth: `${mark.widthPx}px` });
      if (mark.type === 'freeText') element.textContent = mark.text;
      element.title = mark.text || `${mark.type} — double-click to delete`;
      element.ondblclick = () => {
        this.marks = this.marks.filter((item) => item.id !== mark.id);
        this.renderMarksForPage(pageNumber);
      };
      layer.append(element);
    }
  }

  async exportAnnotated() {
    try {
      let output = await this.engine.saveDocument();
      if (this.marks.length) output = await applyAnnotations(output, this.marks);
      await validatePdf(output);
      await saveBytes(output, `${safeBaseName(this.file.name)}-annotated.pdf`);
      this.toast('PDF saved with annotations.');
    } catch (error) {
      this.toast(error.message);
    }
  }

  showProperties(html) {
    const panel = this.root.querySelector('#properties');
    panel.innerHTML = `<button class="btn" style="float:right" aria-label="Close">×</button>${html}`;
    panel.classList.remove('hidden');
    panel.querySelector('button').onclick = () => {
      panel.classList.add('hidden');
      this.activeAnnotation = null;
      this.root.querySelectorAll('.markup-layer').forEach((layer) => { layer.style.pointerEvents = 'none'; });
    };
    return panel;
  }

  async openTool(id) {
    const needsCurrent = !['merge', 'images-to-pdf'].includes(id);
    if (needsCurrent && !this.engine.document) {
      try {
        const [file] = await pickFiles({ kind: 'pdf' });
        if (!file) return;
        this.office?.close();
        this.office = null;
        this.file = file;
        this.bytes = await fileBytes(file);
        await this.engine.open(this.bytes);
        this.processBytes = this.engine.passwordRequested ? await this.engine.saveDocument() : this.bytes;
      } catch (error) {
        if (error.name !== 'AbortError') this.toast(error.message);
        return;
      }
    }
    const handlers = {
      merge: () => this.toolMerge(), split: () => this.toolRange('extract'), delete: () => this.toolRange('delete'),
      reorder: () => this.toolReorder(), rotate: () => this.toolRotate(), compress: () => this.toolCompress(),
      grayscale: () => this.toolTransform('grayscale'), light: () => this.toolTransform('light'), invert: () => this.toolTransform('invert'),
      sign: () => this.toolSign(), watermark: () => this.toolWatermark(), numbers: () => this.toolNumbers(),
      'images-to-pdf': () => this.toolImagesToPdf(), 'pdf-to-images': () => this.toolPdfToImages(), metadata: () => this.toolMetadata(),
    };
    return handlers[id]?.();
  }

  toolModal(title, body, onProcess) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<form class="modal"><h2>${title}</h2>${body}<div class="progress hidden"><i style="width:0"></i></div><p class="muted" id="tool-status"></p><div class="row" style="justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary">Process locally</button></div></form>`;
    document.body.append(backdrop);
    backdrop.querySelector('[data-cancel]').onclick = () => backdrop.remove();
    backdrop.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const submit = backdrop.querySelector('.primary');
      submit.disabled = true;
      try {
        await onProcess(new FormData(event.currentTarget), backdrop);
        backdrop.remove();
      } catch (error) {
        backdrop.querySelector('#tool-status').textContent = error.message;
        submit.disabled = false;
      }
    };
    return backdrop;
  }

  progress(modal, { index, total }, label = 'Processing') {
    const bar = modal.querySelector('.progress');
    bar.classList.remove('hidden');
    const percent = total ? Math.round((index / total) * 100) : 0;
    bar.querySelector('i').style.width = `${percent}%`;
    modal.querySelector('#tool-status').textContent = `${label}… ${percent}%`;
  }

  toolMerge() {
    const backdrop = this.toolModal(
      'Merge PDFs',
      `<p class="muted">PDFs are combined in the order shown below (first file = first pages).</p>
       ${multiFileFieldHtml({
         listId: 'merge-pdfs',
         accept: '.pdf,application/pdf',
         minCount: 2,
         label: 'Choose PDFs…',
         hint: 'Select two or more PDFs, or drop them below, then click Process locally.',
       })}
       <div class="drop file-drop-mini" id="merge-pdf-drop"><strong>Drop PDFs here</strong></div>`,
      async () => {
        const files = getMergeFiles();
        if (files.length < 2) throw new Error('Choose at least two PDFs.');
        const output = await mergePdfs(await Promise.all(files.map(fileBytes)));
        await validatePdf(output);
        await saveBytes(output, 'merged.pdf', 'application/pdf', { preferDownload: true });
      },
    );
    const getMergeFiles = bindMultiFileList(backdrop, 'merge-pdfs', { dropSelector: '#merge-pdf-drop' });
  }

  rangeField(extra = '') {
    return `<p>${this.escape(this.file?.name || 'Current PDF')} · ${this.engine.document.numPages} pages</p><div class="field"><label>Pages (example: 1-3,5)</label><input name="pages" required value="1-${this.engine.document.numPages}"></div>${extra}`;
  }

  toolRange(mode) {
    const title = mode === 'delete' ? 'Delete pages' : 'Split / extract pages';
    this.toolModal(title, this.rangeField(mode === 'extract' ? '<div class="field"><label>Output</label><select name="output"><option value="combined">One PDF with selected pages</option><option value="individual">One PDF per selected page (ZIP)</option></select></div>' : ''), async (data) => {
      const indexes = parsePageRange(data.get('pages'), this.engine.document.numPages);
      if (mode === 'extract' && data.get('output') === 'individual') {
        const files = [];
        for (const index of indexes) files.push({ name: `page-${index + 1}.pdf`, bytes: await extractPages(this.processBytes, [index]) });
        return saveBytes(zipFiles(files), `${safeBaseName(this.file.name)}-split.zip`, 'application/zip');
      }
      const output = mode === 'delete' ? await deletePages(this.processBytes, indexes) : await extractPages(this.processBytes, indexes);
      await saveBytes(output, `${safeBaseName(this.file.name)}-${mode === 'delete' ? 'trimmed' : 'pages'}.pdf`);
    });
  }

  toolReorder() {
    const items = Array.from({ length: this.engine.document.numPages }, (_, index) => `<li draggable="true" data-page="${index}" class="btn" style="display:flex;justify-content:space-between"><span>Page ${index + 1}</span><span>↕ drag</span></li>`).join('');
    const modal = this.toolModal('Reorder pages', `<p class="muted">Drag pages into the required order.</p><ol id="reorder-list" class="stack">${items}</ol>`, async () => {
      const order = [...modal.querySelectorAll('[data-page]')].map((item) => Number(item.dataset.page));
      const output = await reorderPages(this.processBytes, order);
      await saveBytes(output, `${safeBaseName(this.file.name)}-reordered.pdf`);
    });
    let dragged;
    modal.querySelectorAll('[draggable]').forEach((item) => {
      item.ondragstart = () => { dragged = item; };
      item.ondragover = (event) => event.preventDefault();
      item.ondrop = (event) => {
        event.preventDefault();
        if (dragged !== item) item.parentElement.insertBefore(dragged, item);
      };
    });
  }

  toolRotate() {
    this.toolModal('Rotate pages', this.rangeField(`<div class="field"><label>Angle</label><select name="angle"><option>90</option><option>180</option><option>270</option></select></div>`), async (data) => {
      const output = await rotatePages(this.processBytes, parsePageRange(data.get('pages'), this.engine.document.numPages), data.get('angle'));
      await saveBytes(output, `${safeBaseName(this.file.name)}-rotated.pdf`);
    });
  }

  toolCompress() {
    this.toolModal('Compress PDF', `<p class="muted">Downscales compatible internal JPEG images. Text and vectors remain selectable.</p><div class="field"><label>Preset</label><select name="preset"><option value="quality">Maximum quality</option><option value="balanced" selected>Balanced</option><option value="small">Smaller file</option><option value="maximum">Maximum compression</option></select></div>`, async (data, modal) => {
      const { bytes, report } = await compressInWorker(this.processBytes, { preset: data.get('preset') }, (value) => this.progress(modal, value, 'Compressing'));
      await saveBytes(bytes, `${safeBaseName(this.file.name)}-compressed.pdf`);
      this.toast(report.replaced ? `Reduced ${this.formatBytes(report.originalSize)} to ${this.formatBytes(report.outputSize)}.` : 'No compatible oversized JPEG images were found; original preserved.');
    });
  }

  toolTransform(mode) {
    const title = mode === 'light' ? 'Light background' : mode === 'invert' ? 'Invert colours' : 'Grayscale / black & white';
    const modal = this.toolModal(title, `${this.rangeField(`<div class="field"><label>Output</label><select name="variant">${mode === 'grayscale' ? '<option value="grayscale">Grayscale</option><option value="monochrome">True black & white</option>' : `<option value="${mode}">${title}</option>`}</select></div>`)}
      <div class="field"><label>Resolution</label><select name="dpi"><option value="100">100 DPI — small</option><option value="150" selected>150 DPI — balanced</option><option value="220">220 DPI — print</option></select></div>
      <div class="field"><label>Method</label><select name="strategy"><option value="pages">Whole selected pages (reliable, flattened)</option><option value="images">Embedded JPEG images only (keeps text/vectors; whole document)</option></select></div>
      ${mode === 'light' ? '<div class="field"><label>Brightness</label><input name="brightness" type="range" min="1" max="2" step=".05" value="1.25"></div><div class="field"><label>Contrast</label><input name="contrast" type="range" min="1" max="2.5" step=".05" value="1.4"></div><div class="field"><label>Threshold</label><input name="threshold" type="range" min="80" max="230" value="170"></div>' : ''}
      <button class="btn" type="button" id="preview-transform">Preview current reader</button>
      <p class="muted">Whole-page mode creates a flattened print copy and rasterizes selected pages. Image-only mode preserves text/vectors but cannot recolor vector backgrounds. The original remains unchanged.</p>`, async (data, modal) => {
      let output;
      if (data.get('strategy') === 'images') {
        const result = await transformImagesInWorker(this.processBytes, {
          mode: data.get('variant'), dpi: Number(data.get('dpi')),
          brightness: data.get('brightness'), contrast: data.get('contrast'), threshold: data.get('threshold'),
        }, (value) => this.progress(modal, value, 'Transforming images'));
        output = result.bytes;
        if (!result.report.replaced) this.toast('No compatible embedded JPEG images were found. Try whole-page mode.');
      } else {
        output = await transformPdf(this.processBytes, {
          mode: data.get('variant'), pages: parsePageRange(data.get('pages'), this.engine.document.numPages),
          dpi: Number(data.get('dpi')), settings: { brightness: data.get('brightness'), contrast: data.get('contrast'), threshold: data.get('threshold') },
          onProgress: (value) => this.progress(modal, value, 'Transforming'),
        });
      }
      await saveBytes(output, `${safeBaseName(this.file.name)}-${mode}.pdf`);
    });
    modal.querySelector('#preview-transform').onclick = () => {
      const pages = this.root.querySelector('#pages');
      if (!pages) return this.toast('Open this tool from the reader to preview.');
      pages.classList.remove('ink-filter', 'invert-filter', 'light-filter');
      pages.classList.add(mode === 'invert' ? 'invert-filter' : mode === 'light' ? 'light-filter' : 'ink-filter');
      this.toast('Preview only — export settings may differ.');
    };
  }

  toolSign() {
    const modal = this.toolModal('Sign PDF', `${this.rangeField(`<div class="field"><label>Typed signature (leave blank to draw)</label><input name="signature" placeholder="Your name"></div><div class="field"><label>Draw signature</label><canvas id="signature-pad" width="500" height="150" style="width:100%;background:white;border:1px solid var(--line);touch-action:none"></canvas></div>`)}
      <div class="row"><div class="field"><label>X %</label><input name="x" type="number" min="0" max="90" value="60"></div><div class="field"><label>Y %</label><input name="y" type="number" min="0" max="90" value="80"></div><div class="field"><label>Width %</label><input name="width" type="number" min="5" max="80" value="25"></div></div>`, async (data) => {
      const page = parsePageRange(data.get('pages'), this.engine.document.numPages)[0] + 1;
      const text = data.get('signature');
      const pad = modal.querySelector('#signature-pad');
      const hasInk = pad.dataset.ink === 'true';
      const output = await placeSignature(this.processBytes, {
        page, text, dataUrl: !text && hasInk ? pad.toDataURL('image/png') : null,
        x: Number(data.get('x')) / 100, y: Number(data.get('y')) / 100, width: Number(data.get('width')) / 100, height: 0.08,
      });
      await saveBytes(output, `${safeBaseName(this.file.name)}-signed.pdf`);
    });
    this.bindSignaturePad(modal.querySelector('#signature-pad'));
  }

  bindSignaturePad(canvas) {
    const context = canvas.getContext('2d');
    context.lineWidth = 3; context.lineCap = 'round'; context.strokeStyle = '#142a55';
    let drawing = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
    };
    canvas.onpointerdown = (event) => { drawing = true; canvas.dataset.ink = 'true'; context.beginPath(); context.moveTo(...point(event)); canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = (event) => { if (drawing) { context.lineTo(...point(event)); context.stroke(); } };
    canvas.onpointerup = () => { drawing = false; };
  }

  toolWatermark() {
    this.toolModal('Text watermark', this.rangeField(`<div class="field"><label>Text</label><input name="text" value="CONFIDENTIAL" required></div><div class="row"><div class="field"><label>Opacity</label><input name="opacity" type="number" min=".05" max="1" step=".05" value=".2"></div><div class="field"><label>Rotation</label><input name="rotation" type="number" value="45"></div></div>`), async (data) => {
      const output = await addWatermark(this.processBytes, { indexes: parsePageRange(data.get('pages'), this.engine.document.numPages), text: data.get('text'), opacity: Number(data.get('opacity')), rotation: Number(data.get('rotation')) });
      await saveBytes(output, `${safeBaseName(this.file.name)}-watermarked.pdf`);
    });
  }

  toolNumbers() {
    this.toolModal('Page numbers', this.rangeField(`<div class="field"><label>Position</label><select name="position">${['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'].map((x) => `<option>${x}</option>`).join('')}</select></div><div class="row"><div class="field"><label>Start at</label><input name="start" type="number" value="1"></div><div class="field"><label>Font size</label><input name="size" type="number" value="11"></div></div>`), async (data) => {
      const output = await addPageNumbers(this.processBytes, { indexes: parsePageRange(data.get('pages'), this.engine.document.numPages), position: data.get('position'), start: Number(data.get('start')), size: Number(data.get('size')) });
      await saveBytes(output, `${safeBaseName(this.file.name)}-numbered.pdf`);
    });
  }

  toolImagesToPdf() {
    const backdrop = this.toolModal(
      'Images → PDF',
      `${multiFileFieldHtml({
        listId: 'images-pdf',
        accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp',
        minCount: 1,
        label: 'Choose images…',
      })}
      <div class="field"><label>Page sizing</label><select name="pageSize"><option value="image">Fit page to image</option><option value="a4">Fit on A4</option></select></div>
      <div class="field"><label>Margin (points)</label><input name="margin" type="number" min="0" value="0"></div>`,
      async (data, modal) => {
        const files = [...modal.querySelector('#images-pdf-input').files];
        if (!files.length) throw new Error('Choose at least one image.');
        const output = await imagesToPdf(files, { pageSize: data.get('pageSize'), margin: Number(data.get('margin')) });
        await saveBytes(output, 'images.pdf', 'application/pdf', { preferDownload: true });
      },
    );
    bindMultiFileList(backdrop, 'images-pdf');
  }

  toolPdfToImages() {
    this.toolModal('PDF → Images', this.rangeField(`<div class="row"><div class="field"><label>Format</label><select name="format"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></div><div class="field"><label>DPI</label><input name="dpi" type="number" value="150" min="72" max="300"></div></div>`), async (data, modal) => {
      const files = await pdfToImages(this.processBytes, { pages: parsePageRange(data.get('pages'), this.engine.document.numPages), dpi: Number(data.get('dpi')), format: data.get('format'), onProgress: (value) => this.progress(modal, value, 'Rendering') });
      if (files.length === 1) await saveBytes(files[0].bytes, files[0].name, data.get('format'));
      else await saveBytes(zipFiles(files), `${safeBaseName(this.file.name)}-images.zip`, 'application/zip');
    });
  }

  async toolMetadata() {
    const { info = {} } = await this.engine.metadata();
    this.toolModal('Document metadata', `<div class="field"><label>Title</label><input name="title" value="${this.escape(info.Title || '')}"></div><div class="field"><label>Author</label><input name="author" value="${this.escape(info.Author || '')}"></div><div class="field"><label>Subject</label><input name="subject" value="${this.escape(info.Subject || '')}"></div><div class="field"><label>Keywords (comma separated)</label><input name="keywords" value="${this.escape(info.Keywords || '')}"></div>`, async (data) => {
      const output = await updateMetadata(this.processBytes, Object.fromEntries(data.entries()));
      await saveBytes(output, `${safeBaseName(this.file.name)}-metadata.pdf`);
    });
  }

  bindGlobalDrop() {
    window.addEventListener('dragover', (event) => { event.preventDefault(); this.root.querySelector('#drop-zone')?.classList.add('drag'); });
    window.addEventListener('dragleave', () => this.root.querySelector('#drop-zone')?.classList.remove('drag'));
    window.addEventListener('drop', async (event) => {
      event.preventDefault();
      this.root.querySelector('#drop-zone')?.classList.remove('drag');
      const [file] = event.dataTransfer.files;
      if (file) {
        try { await this.openFile(file); } catch (error) { this.toast(error.message); }
      }
    });
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        this.openPicker();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && (this.engine.document || this.office)) {
        event.preventDefault();
        this.showSearch();
      } else if (!typing && this.office?.items.length && ['PageDown', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        this.moveOffice(1);
      } else if (!typing && this.office?.items.length && ['PageUp', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        this.moveOffice(-1);
      } else if (!typing && this.engine.document && ['PageDown', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        this.goToPage(this.currentPage + 1);
      } else if (!typing && this.engine.document && ['PageUp', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        this.goToPage(this.currentPage - 1);
      } else if (!typing && (this.engine.document || this.office) && ['+', '='].includes(event.key)) {
        event.preventDefault();
        this.changeViewZoom(VIEW_ZOOM_STEP);
      } else if (!typing && (this.engine.document || this.office) && event.key === '-') {
        event.preventDefault();
        this.changeViewZoom(-VIEW_ZOOM_STEP);
      }
    });
  }

  askPassword(reason) {
    return Promise.resolve(prompt(reason === 2 ? 'Incorrect password. Try again:' : 'This PDF is password protected:'));
  }

  askOptionalPassword(label) {
    const value = prompt(label);
    if (value === null) return null;
    return value.trim();
  }

  async convertOpenDocumentToPdf() {
    if (!this.file) return;
    try {
      await this.reamConvert.convertFile(this.file);
    } catch (error) {
      this.toast(error.message);
      this.setBuildStatus();
    }
  }

  setStatus(message) {
    const status = this.root.querySelector('#status');
    if (status) status.textContent = message;
  }

  toast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.querySelector('#toast-root').append(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
}
