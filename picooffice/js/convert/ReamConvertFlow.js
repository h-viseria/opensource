import { detectFormat } from '../office/format.js';
import { fileBytes, safeBaseName } from '../file/fileIO.js';
import { canReamConvertToPdf, reamConvertHint } from './reamFormats.js';
import { summarizeReamLosses } from './reamConvert.js';
import { pickReamConvertFile } from './reamPick.js';
import { convertToPdfInWorker } from '../workers/runReamWorker.js';

/**
 * UI-facing convert flow; keeps App.js free of Ream details.
 */
export class ReamConvertFlow {
  /**
   * @param {{ setStatus: (msg: string) => void, toast: (msg: string) => void, openPdfBytes: (name: string, bytes: Uint8Array) => Promise<void>, askPassword?: () => Promise<string|null> }} host
   */
  constructor(host) {
    this.host = host;
  }

  async pickAndConvert() {
    try {
      const file = await pickReamConvertFile();
      if (file) await this.convertFile(file);
    } catch (error) {
      if (error.name !== 'AbortError') this.host.toast(error.message);
    }
  }

  async convertFile(file) {
    const format = detectFormat(file);
    const hint = reamConvertHint(format);
    if (!canReamConvertToPdf(format)) {
      throw new Error(hint || 'This file cannot be converted to PDF here.');
    }
    const bytes = await fileBytes(file);
    let password;
    if (format.kind === 'pdf') {
      password = await this.host.askPassword?.('PDF password (leave blank if none):');
      if (password === null) return;
      if (password === '') password = undefined;
    }
    const { pdf, losses } = await convertToPdfInWorker(bytes, {
      password,
      onProgress: (message) => this.host.setStatus(message),
    });
    const outName = `${safeBaseName(file.name)}.pdf`;
    const lossMessage = summarizeReamLosses(losses);
    if (lossMessage) this.host.toast(lossMessage);
    await this.host.openPdfBytes(outName, pdf);
    this.host.setStatus(`${outName} · converted locally · ${this.host.formatBytes(pdf.byteLength)}`);
  }
}
