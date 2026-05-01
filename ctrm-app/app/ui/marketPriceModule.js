import { EVENTS } from '../shared/events.js';

const SIMULATION_MS = 2000;

export function initMarketPriceModule({
    formElement,
    simulateButtonElement,
    errorElement,
    statusElement,
    marketPriceService,
    tradeService,
    eventBus,
}) {
    if (!formElement) throw new Error('marketPriceModule requires a formElement.');
    if (!simulateButtonElement) throw new Error('marketPriceModule requires a simulateButtonElement.');
    if (!marketPriceService) throw new Error('marketPriceModule requires a marketPriceService.');
    if (!tradeService) throw new Error('marketPriceModule requires a tradeService.');
    if (!eventBus) throw new Error('marketPriceModule requires an eventBus.');

    let simulationTimer = null;
    let simulationBusy = false;

    formElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        setError(errorElement, '');

        try {
            const formData = new FormData(formElement);
            const updated = await marketPriceService.updateMarketPrice({
                commodity: formData.get('commodity'),
                marketPrice: formData.get('marketPrice'),
            });

            eventBus.publish(EVENTS.MARKET_PRICE_UPDATED, {
                source: 'MANUAL',
                updates: [updated],
            });

            formElement.reset();
            setStatus(statusElement, `Updated ${updated.commodity} to ${formatNumber(updated.marketPrice)}.`);
        } catch (error) {
            setError(errorElement, error.message || 'Failed to update market price.');
        }
    });

    simulateButtonElement.addEventListener('click', () => {
        if (simulationTimer) {
            stopSimulation();
            return;
        }

        simulationTimer = setInterval(async () => {
            if (simulationBusy) return;
            simulationBusy = true;
            try {
                const updates = await runSimulationTick({ marketPriceService, tradeService });
                if (!updates.length) {
                    setError(errorElement, 'Add a trade or market price first to simulate market updates.');
                    stopSimulation();
                    return;
                }

                setError(errorElement, '');
                eventBus.publish(EVENTS.MARKET_PRICE_UPDATED, {
                    source: 'SIMULATION',
                    updates,
                });
                setStatus(statusElement, `Simulation updated ${updates.length} commodity price(s).`);
            } catch (error) {
                setError(errorElement, error.message || 'Simulation failed.');
                stopSimulation();
            } finally {
                simulationBusy = false;
            }
        }, SIMULATION_MS);

        simulateButtonElement.textContent = 'Stop Simulate Market';
        setStatus(statusElement, 'Market simulation started (2s interval).');
    });

    function stopSimulation() {
        if (simulationTimer) {
            clearInterval(simulationTimer);
            simulationTimer = null;
        }
        simulateButtonElement.textContent = 'Simulate Market';
        setStatus(statusElement, 'Market simulation stopped.');
    }

    return {
        stopSimulation,
    };
}

async function runSimulationTick({ marketPriceService, tradeService }) {
    const [latestPrices, trades] = await Promise.all([
        marketPriceService.getLatestPrices(),
        tradeService.getAllTrades(),
    ]);

    const commodities = new Set(Object.keys(latestPrices || {}));
    (trades || []).forEach((trade) => {
        const commodity = String(trade.commodity || '').trim().toUpperCase();
        if (commodity) commodities.add(commodity);
    });

    const updates = [];
    for (const commodity of commodities) {
        const current = Number(latestPrices[commodity]);
        const basePrice = Number.isFinite(current) && current > 0 ? current : randomBetween(50, 150);
        const shifted = Math.max(0.01, basePrice * (1 + randomBetween(-0.03, 0.03)));
        const updated = await marketPriceService.updateMarketPrice({
            commodity,
            marketPrice: roundTo(shifted, 4),
        });
        updates.push(updated);
    }

    return updates;
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function roundTo(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function setError(errorElement, message) {
    if (!errorElement) return;
    errorElement.textContent = message;
}

function setStatus(statusElement, message) {
    if (!statusElement) return;
    statusElement.textContent = message;
}

