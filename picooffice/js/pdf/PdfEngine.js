import * as pdfjsLib from '../../vendor/pdfjs/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export { pdfjsLib };

export class PdfEngine {
  constructor({ onPassword, onProgress } = {}) {
    this.onPassword = onPassword;
    this.onProgress = onProgress;
    this.document = null;
    this.bytes = null;
    this.passwordRequested = false;
  }

  async open(bytes) {
    await this.close();
    this.bytes = new Uint8Array(bytes);
    this.passwordRequested = false;
    const task = pdfjsLib.getDocument({
      data: this.bytes.slice(),
      enableScripting: false,
      isEvalSupported: false,
      stopAtErrors: false,
      useWorkerFetch: false,
    });
    task.onProgress = ({ loaded, total }) => this.onProgress?.(total ? loaded / total : 0);
    task.onPassword = async (updatePassword, reason) => {
      this.passwordRequested = true;
      const password = await this.onPassword?.(reason);
      if (password == null) {
        task.destroy();
        return;
      }
      updatePassword(password);
    };
    this.document = await task.promise;
    return this.document;
  }

  async renderPage(pageNumber, canvas, scale = 1.25, rotation = 0) {
    const page = await this.document.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
    return { page, viewport };
  }

  async renderTextLayer(page, viewport, container) {
    container.replaceChildren();
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
    const text = await page.getTextContent();
    for (const item of text.items) {
      if (!item.str) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const angle = Math.atan2(tx[1], tx[0]);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.fontFamily = text.styles[item.fontName]?.fontFamily || 'sans-serif';
      span.style.transform = `rotate(${angle}rad)`;
      container.append(span);
    }
    return text;
  }

  async find(query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const results = [];
    for (let pageNumber = 1; pageNumber <= this.document.numPages; pageNumber += 1) {
      const page = await this.document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(' ');
      let from = 0;
      while ((from = text.toLocaleLowerCase().indexOf(normalized, from)) !== -1) {
        results.push({ pageNumber, index: from, excerpt: text.slice(Math.max(0, from - 30), from + normalized.length + 30) });
        from += normalized.length;
      }
    }
    return results;
  }

  async saveDocument() {
    return new Uint8Array(await this.document.saveDocument());
  }

  async metadata() {
    return this.document.getMetadata();
  }

  async close() {
    if (this.document) await this.document.destroy();
    this.document = null;
  }
}
