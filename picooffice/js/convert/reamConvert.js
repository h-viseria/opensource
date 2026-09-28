/**
 * Ream-based Office/PDF → PDF conversion (vendor bundle loaded on demand).
 */

let reamModulePromise;

function loadReam() {
  reamModulePromise ||= import('../../vendor/reamkit.esm.js');
  return reamModulePromise;
}

/**
 * @param {Uint8Array} bytes
 * @param {{ password?: string, onProgress?: (message: string) => void }} [options]
 * @returns {Promise<{ pdf: Uint8Array, losses: unknown[], format: string }>}
 */
export async function convertBytesToPdfWithReam(bytes, options = {}) {
  const onProgress = options.onProgress || (() => {});
  onProgress('Loading converter…');
  const { Ream } = await loadReam();
  onProgress('Parsing document…');
  const parseOptions = options.password ? { password: options.password } : undefined;
  const doc = Ream.parse(bytes, parseOptions);
  onProgress('Building PDF…');
  const { bytes: pdf, losses } = await doc.convertWithReport('pdf');
  return { pdf, losses: losses || [], format: doc.format };
}

export function summarizeReamLosses(losses) {
  if (!losses?.length) return '';
  const substituted = losses.filter((entry) => entry?.severity === 'substituted').length;
  const degraded = losses.filter((entry) => entry?.severity === 'degraded').length;
  const dropped = losses.filter((entry) => entry?.severity === 'dropped').length;
  const parts = [];
  if (substituted) parts.push(`${substituted} font substitution${substituted > 1 ? 's' : ''}`);
  if (degraded) parts.push(`${degraded} layout adjustment${degraded > 1 ? 's' : ''}`);
  if (dropped) parts.push(`${dropped} unsupported element${dropped > 1 ? 's' : ''}`);
  return parts.length ? `Conversion note: ${parts.join(', ')}.` : `Conversion completed with ${losses.length} note(s).`;
}
