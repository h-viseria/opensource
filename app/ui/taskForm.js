import { EVENTS } from '../shared/events.js';

export function initTaskForm({ formElement, errorElement, taskService, eventBus }) {
    if (!formElement || !errorElement) {
        return;
    }

    formElement.addEventListener('submit', (event) => {
        event.preventDefault();
        errorElement.textContent = '';

        const formData = new FormData(formElement);
        const payload = {
            title: formData.get('title'),
            priority: formData.get('priority'),
            owner: formData.get('owner'),
        };

        try {
            const task = taskService.createTask(payload);
            formElement.reset();
            eventBus.publish(EVENTS.TASK_CREATED, { source: 'UI', task });
        } catch (error) {
            errorElement.textContent = error.message;
        }
    });
}

