export function initTabNavigation({ rootElement }) {
    if (!rootElement) {
        return;
    }

    const buttons = Array.from(rootElement.querySelectorAll('[data-tab-button]'));
    const panels = Array.from(rootElement.querySelectorAll('[data-tab-panel]'));

    const activate = (tabKey) => {
        buttons.forEach((button) => {
            const isActive = button.dataset.tabButton === tabKey;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', String(isActive));
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.tabPanel === tabKey;
            panel.classList.toggle('is-active', isActive);
        });
    };

    buttons.forEach((button) => {
        button.addEventListener('click', () => activate(button.dataset.tabButton));
    });

    if (buttons.length > 0) {
        activate(buttons[0].dataset.tabButton);
    }
}

