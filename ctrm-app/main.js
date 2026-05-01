import { TradeService } from './app/application/services/TradeService.js';
import { MarketPriceService } from './app/application/services/MarketPriceService.js';
import { RiskService } from './app/application/services/RiskService.js';
import { seedInitialData } from './app/application/services/seedData.js';
import { InMemoryTradeRepository } from './app/infrastructure/repositories/InMemoryTradeRepository.js';
import { InMemoryMarketPriceRepository } from './app/infrastructure/repositories/InMemoryMarketPriceRepository.js';
import { createEventBus } from './app/shared/eventBus.js';
import { EVENTS } from './app/shared/events.js';
import { initTradeForm } from './app/ui/tradeForm.js';
import { initPositionsDashboard } from './app/ui/positionsDashboard.js';
import { initPnlView } from './app/ui/pnlView.js';
import { initMarketPriceModule } from './app/ui/marketPriceModule.js';
import { initTabNavigation } from './app/ui/tabNavigation.js';

const tradeRepository = new InMemoryTradeRepository();
const marketPriceRepository = new InMemoryMarketPriceRepository();
const tradeService = new TradeService(tradeRepository);
const marketPriceService = new MarketPriceService(marketPriceRepository);
const riskService = new RiskService(tradeRepository, marketPriceRepository);
const eventBus = createEventBus();

const tradeFormElement = document.getElementById('trade-form');
const tradeFormErrorElement = document.getElementById('trade-form-error');
const tabRootElement = document.getElementById('tab-root');
const marketPriceFormElement = document.getElementById('market-price-form');
const simulateMarketButtonElement = document.getElementById('simulate-market-btn');
const marketPriceErrorElement = document.getElementById('market-price-error');
const marketPriceStatusElement = document.getElementById('market-price-status');
const positionsBodyElement = document.getElementById('positions-body');
const pnlBodyElement = document.getElementById('pnl-body');

initTabNavigation({ rootElement: tabRootElement });

const seedResult = await seedInitialData({ tradeService, marketPriceService });
if (seedResult.seededTrades) {
    eventBus.publish(EVENTS.TRADE_CREATED, { source: 'SEED' });
}
if (seedResult.seededPrices) {
    eventBus.publish(EVENTS.MARKET_PRICE_UPDATED, { source: 'SEED' });
}

initTradeForm({
    formElement: tradeFormElement,
    errorElement: tradeFormErrorElement,
    tradeService,
    eventBus,
});

initMarketPriceModule({
    formElement: marketPriceFormElement,
    simulateButtonElement: simulateMarketButtonElement,
    errorElement: marketPriceErrorElement,
    statusElement: marketPriceStatusElement,
    marketPriceService,
    tradeService,
    eventBus,
});

initPositionsDashboard({
    tableBodyElement: positionsBodyElement,
    riskService,
    eventBus,
});

initPnlView({
    tableBodyElement: pnlBodyElement,
    riskService,
    eventBus,
});

