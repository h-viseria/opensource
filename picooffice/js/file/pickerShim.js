/**
 * Visible file picker overlay — avoids programmatic input.click(), which many
 * upload extensions break (e.g. upload_fileaccessapi.js).
 */
export function pickFilesWithShim({ multiple = false, accept, title = 'Choose files' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop file-picker-shim';
    backdrop.innerHTML = `
      <div class="modal file-picker-modal" role="dialog" aria-labelledby="file-picker-title">
        <h2 id="file-picker-title">${title}</h2>
        <p class="muted">Your files stay on this device. Use Browse to select from your computer.</p>
        <div class="file-picker-actions">
          <label class="btn primary file-picker-browse" for="pico-file-picker-input">Browse…</label>
          <button type="button" class="btn" data-cancel>Cancel</button>
        </div>
        <input id="pico-file-picker-input" class="file-picker-input" type="file" ${multiple ? 'multiple' : ''} accept="${accept}">
        <ol id="pico-file-picker-list" class="file-picker-list"></ol>
      </div>`;
    document.body.append(backdrop);

    const input = backdrop.querySelector('#pico-file-picker-input');
    const list = backdrop.querySelector('#pico-file-picker-list');
    const finish = (files) => {
      backdrop.remove();
      resolve(files);
    };

    backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish([]));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish([]);
    });

    input.addEventListener('change', () => {
      const files = [...input.files];
      list.innerHTML = files.map((file, index) => `<li>${index + 1}. ${escapeHtml(file.name)}</li>`).join('');
      if (!multiple && files.length === 1) finish(files);
    });

    if (multiple) {
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn primary';
      done.textContent = 'Use selected files';
      done.disabled = true;
      done.addEventListener('click', () => {
        const files = [...input.files];
        if (files.length) finish(files);
      });
      input.addEventListener('change', () => {
        done.disabled = input.files.length === 0;
      });
      backdrop.querySelector('.file-picker-actions').append(done);
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

/** @param {{ multiple?: boolean, accept: string, minCount?: number, listId: string }} spec */
export function multiFileFieldHtml({ accept, minCount = 2, listId, label = 'Browse…', hint }) {
  const need = minCount > 1 ? `Select at least ${minCount} files.` : 'Select one or more files.';
  return `
    <div class="field file-field">
      <label class="btn primary file-picker-browse" for="${listId}-input">${label}</label>
      <input id="${listId}-input" type="file" class="file-picker-input" accept="${accept}" multiple>
      <p class="muted file-picker-hint">${hint || need}</p>
      <ol id="${listId}-list" class="file-picker-list"></ol>
    </div>`;
}

/**
 * @returns {() => File[]} read currently selected files (input + any dropped files)
 */
export function bindMultiFileList(modalRoot, listId, { dropSelector } = {}) {
  const input = modalRoot.querySelector(`#${listId}-input`);
  const list = modalRoot.querySelector(`#${listId}-list`);
  const dropZone = dropSelector ? modalRoot.querySelector(dropSelector) : null;
  /** @type {File[]} */
  let dropped = [];

  const render = (files) => {
    if (list) {
      list.innerHTML = files.map((file, index) => `<li>${index + 1}. ${escapeHtml(file.name)}</li>`).join('');
    }
  };

  const readFiles = () => {
    const fromInput = [...(input?.files || [])];
    const files = fromInput.length ? fromInput : dropped;
    render(files);
    return files;
  };

  input?.addEventListener('change', () => {
    dropped = [];
    readFiles();
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('drag');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('drag');
      dropped = [...event.dataTransfer.files];
      if (input) input.value = '';
      readFiles();
    });
  }

  return readFiles;
}
