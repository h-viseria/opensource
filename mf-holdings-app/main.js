import { initTabNavigation } from './app/ui/tabNavigation.js';
import { initAppController } from './app/ui/appController.js';

const appRootElement = document.getElementById('app-root');

initTabNavigation({ rootElement: appRootElement });
initAppController();

