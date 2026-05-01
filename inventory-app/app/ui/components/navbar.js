export function initNavbar({ container, tabs, initialTab, onChange }) {
    if (!container) throw new Error('Navbar container is required.');

    container.innerHTML = '<div class="navbar"></div>';
    const nav = container.querySelector('.navbar');

    function render(activeTab) {
        nav.innerHTML = '';
        tabs.forEach((tab) => {
            const button = document.createElement('button');
            button.className = `nav-btn ${activeTab === tab.id ? 'active' : ''}`;
            button.textContent = tab.label;
            button.type = 'button';
            button.addEventListener('click', () => {
                activate(tab.id);
            });
            nav.appendChild(button);
        });
    }

    function activate(tabId) {
        render(tabId);
        onChange(tabId);
    }

    activate(initialTab || tabs[0].id);

    return { activate };
}

