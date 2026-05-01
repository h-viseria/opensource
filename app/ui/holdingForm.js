import { EVENTS } from '../shared/events.js';

export function initHoldingForm({ formElement, errorElement, holdingsService, eventBus }) {
    if (!formElement || !errorElement) {
        return;
    }

    formElement.addEventListener('submit', (event) => {
        event.preventDefault();
        errorElement.textContent = '';

        const formData = new FormData(formElement);
        const payload = {
            schemeCode: formData.get('schemeCode'),
            schemeName: formData.get('schemeName'),
            units: formData.get('units'),
            avgCost: formData.get('avgCost'),
        };

        try {
            const holding = holdingsService.createHolding(payload);
            formElement.reset();
            eventBus.publish(EVENTS.HOLDING_CREATED, { source: 'UI', holding });
        } catch (error) {
            errorElement.textContent = error.message;
        }
    });
}

