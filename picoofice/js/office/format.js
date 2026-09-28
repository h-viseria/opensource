const KINDS = {
  pdf: ['pdf'],
  docx: ['docx', 'docm'],
  pptx: ['pptx', 'pptm'],
  xlsx: ['xlsx', 'xlsm'],
  txt: ['txt'],
  csv: ['csv'],
  markdown: ['md', 'markdown'],
  rtf: ['rtf'],
  image: ['png', 'jpg', 'jpeg', 'webp'],
};

export function detectFormat(file) {
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  if (['doc', 'xls', 'ppt'].includes(ext)) return { kind: 'legacy', ext };
  for (const [kind, extensions] of Object.entries(KINDS)) {
    if (extensions.includes(ext)) return { kind, ext, macro: ['docm', 'pptm', 'xlsm'].includes(ext) };
  }
  return { kind: 'unknown', ext };
}
