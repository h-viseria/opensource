export function createFileUpload({ container, label = 'Upload Excel', accept = '.xlsx,.xls', onFileSelected }) {
    if (!container) throw new Error('File upload container is required.');

    const wrap = document.createElement('div');
    wrap.className = 'inline';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost';
    button.textContent = label;
    button.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file || !onFileSelected) return;
        await onFileSelected(file);
        input.value = '';
    });

    wrap.append(button, input);
    container.appendChild(wrap);

    return { input };
}

