import { detectFormat } from '../office/format.js';

/** Formats Ream can parse and export to PDF (see reamkit Scope). */
export const REAM_CONVERT_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.doc,.xls,.ppt';

const REAM_CONVERT_KINDS = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'legacy']);

/** @param {File | { kind: string, macro?: boolean }} target */
export function canReamConvertToPdf(target) {
  const format = target instanceof File ? detectFormat(target) : target;
  if (format.macro) return false;
  return REAM_CONVERT_KINDS.has(format.kind);
}

export function reamConvertHint(format) {
  if (format?.macro) return 'Macro-enabled Office files cannot be converted here.';
  if (format?.kind === 'unknown') return 'This file type is not supported for PDF conversion.';
  if (!REAM_CONVERT_KINDS.has(format?.kind)) {
    return 'Convert to PDF works with Word, Excel, PowerPoint, and PDF files. Plain text and images use other tools.';
  }
  return '';
}
