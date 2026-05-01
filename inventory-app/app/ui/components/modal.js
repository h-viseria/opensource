export function createModal() {
    const host = document.createElement('div');
    document.body.appendChild(host);

    function close() {
        host.innerHTML = '';
    }

    function show({ title = 'Dialog', bodyNode, onConfirm, confirmLabel = 'Confirm' }) {
        host.innerHTML = '';
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const heading = document.createElement('h3');
        heading.textContent = title;
        modal.appendChild(heading);

        if (bodyNode) {
            modal.appendChild(bodyNode);
        }

        const actions = document.createElement('div');
        actions.className = 'inline';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'ghost';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', close);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'primary';
        confirmBtn.textContent = confirmLabel;
        confirmBtn.addEventListener('click', async () => {
            if (onConfirm) {
                await onConfirm();
            }
            close();
        });

        actions.append(cancelBtn, confirmBtn);
        modal.appendChild(actions);
        backdrop.appendChild(modal);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close();
        });

        host.appendChild(backdrop);
    }

    return { show, close };
}

export function createToastManager({ hostElement }) {
    if (!hostElement) throw new Error('Toast host element is required.');

    function show(message, timeoutMs = 2200) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = message;
        hostElement.appendChild(el);
        setTimeout(() => {
            el.remove();
        }, timeoutMs);
    }

    return { show };
}

