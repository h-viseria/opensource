export function initTabNavigation({ rootElement }) {
    if (!rootElement) throw new Error('tabNavigation requires a rootElement.');

    const buttons = Array.from(rootElement.querySelectorAll('[data-tab-button]'));
    const panels = Array.from(rootElement.querySelectorAll('[data-tab-panel]'));

    if (!buttons.length || !panels.length) return;

    function activate(tabName) {
        buttons.forEach((button) => {
            const isActive = button.dataset.tabButton === tabName;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', String(isActive));
            button.tabIndex = isActive ? 0 : -1;
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.tabPanel === tabName;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });
    }

    buttons.forEach((button) => {
        button.addEventListener('click', () => activate(button.dataset.tabButton));
    });

    const firstTab = buttons[0].dataset.tabButton;
    activate(firstTab);
}

