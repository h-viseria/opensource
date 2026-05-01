export function createForm({ container, fields, submitLabel = 'Save', onSubmit }) {
    if (!container) throw new Error('Form container is required.');

    const form = document.createElement('form');
    form.className = 'form-grid';

    fields.forEach((field) => {
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = field.type === 'select' ? document.createElement('select') : document.createElement('input');
        input.name = field.name;

        if (field.type && field.type !== 'select') {
            input.type = field.type;
        }

        if (field.required) {
            input.required = true;
        }

        if (field.min !== undefined) {
            input.min = field.min;
        }

        if (field.step !== undefined) {
            input.step = field.step;
        }

        if (field.options && field.type === 'select') {
            field.options.forEach((opt) => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                input.appendChild(option);
            });
        }

        label.appendChild(input);
        form.appendChild(label);
    });

    const actionWrap = document.createElement('div');
    actionWrap.className = 'inline';
    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.type = 'submit';
    submit.textContent = submitLabel;
    actionWrap.appendChild(submit);
    form.appendChild(actionWrap);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!onSubmit) return;
        const payload = readValues(form, fields);
        await onSubmit(payload, form);
    });

    container.appendChild(form);

    return {
        form,
        setValues(values = {}) {
            fields.forEach((field) => {
                const input = form.elements[field.name];
                if (!input) return;
                input.value = values[field.name] ?? '';
            });
        },
        getValues() {
            return readValues(form, fields);
        },
        reset() {
            form.reset();
        },
        setOptions(fieldName, options) {
            const input = form.elements[fieldName];
            if (!input || input.tagName !== 'SELECT') return;
            input.innerHTML = '';
            (options || []).forEach((opt) => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                input.appendChild(option);
            });
        },
    };
}

function readValues(form, fields) {
    const values = {};
    fields.forEach((field) => {
        values[field.name] = form.elements[field.name]?.value;
    });
    return values;
}

