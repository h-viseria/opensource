import { EVENTS } from '../shared/events.js';

export function initTradeForm({ formElement, errorElement, tradeService, eventBus }) {
    if (!formElement) throw new Error('tradeForm requires a formElement.');
    if (!tradeService) throw new Error('tradeForm requires a tradeService.');
    if (!eventBus) throw new Error('tradeForm requires an eventBus.');

    formElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError(errorElement);

        try {
            const formData = new FormData(formElement);
            const tradeData = {
                commodity: formData.get('commodity'),
                buySell: formData.get('buySell'),
                quantity: Number(formData.get('quantity')),
                price: Number(formData.get('price')),
                counterparty: formData.get('counterparty'),
            };

            const trade = await tradeService.createTrade(tradeData);
            eventBus.publish(EVENTS.TRADE_CREATED, trade);
            formElement.reset();
        } catch (error) {
            showError(errorElement, error.message || 'Failed to create trade.');
        }
    });
}

function showError(errorElement, message) {
    if (!errorElement) return;
    errorElement.textContent = message;
}

function clearError(errorElement) {
    if (!errorElement) return;
    errorElement.textContent = '';
}

