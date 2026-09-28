const PICK_TYPES = {
  documents: {
    description: 'Documents',
    accept: '.pdf,.docx,.docm,.pptx,.pptm,.xlsx,.xlsm,.txt,.csv,.md,.markdown,.rtf,.png,.jpg,.jpeg,.webp',
    types: [{
      description: 'Documents',
      accept: {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', '.docm'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx', '.pptm'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'],
        'text/plain': ['.txt', '.csv', '.md', '.markdown', '.rtf'],
        'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      },
    }],
  },
  pdf: {
    description: 'PDF',
    accept: '.pdf,application/pdf',
    types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
  },
  images: {
    description: 'Images',
    accept: 'image/png,image/jpeg,image/webp',
    types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }],
  },
};

export async function pickFiles({ multiple = false, kind = 'documents' } = {}) {
  const preset = PICK_TYPES[kind] || PICK_TYPES.documents;
  if ('showOpenFilePicker' in window) {
    const handles = await window.showOpenFilePicker({ multiple, excludeAcceptAllOption: false, types: preset.types });
    return Promise.all(handles.map((handle) => handle.getFile()));
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple, accept: preset.accept });
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}

export async function saveBytes(bytes, filename, mime = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: mime, accept: { [mime]: [`.${filename.split('.').pop()}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function safeBaseName(name) {
  return (name || 'document').replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

export async function fileBytes(file) {
  if (!file?.size) throw new Error('The selected file is empty.');
  if (file.size > 512 * 1024 * 1024) throw new Error('Files larger than 512 MB are not supported in the browser.');
  return new Uint8Array(await file.arrayBuffer());
}
