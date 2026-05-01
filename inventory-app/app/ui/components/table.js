import { paginate } from '../../core/utils.js';

export function createTable({ container, columns, pageSize = 8, rowActions = [] }) {
    if (!container) throw new Error('Table container is required.');

    container.innerHTML = `
        <div class="toolbar">
            <div class="inline">
                <input type="search" placeholder="Search..." data-role="search" />
            </div>
            <div class="small" data-role="meta"></div>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr></tr></thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="pagination">
            <button type="button" class="ghost" data-role="prev">Prev</button>
            <span class="small" data-role="page"></span>
            <button type="button" class="ghost" data-role="next">Next</button>
        </div>
    `;

    const state = {
        rows: [],
        filtered: [],
        sortKey: columns[0]?.key,
        sortDir: 1,
        page: 1,
    };

    const searchInput = container.querySelector('[data-role="search"]');
    const metaEl = container.querySelector('[data-role="meta"]');
    const pageEl = container.querySelector('[data-role="page"]');
    const prevBtn = container.querySelector('[data-role="prev"]');
    const nextBtn = container.querySelector('[data-role="next"]');
    const headRow = container.querySelector('thead tr');
    const body = container.querySelector('tbody');

    headRow.innerHTML = '';
    columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.addEventListener('click', () => {
            if (state.sortKey === col.key) {
                state.sortDir = state.sortDir * -1;
            } else {
                state.sortKey = col.key;
                state.sortDir = 1;
            }
            refresh();
        });
        headRow.appendChild(th);
    });

    if (rowActions.length) {
        const th = document.createElement('th');
        th.textContent = 'Actions';
        headRow.appendChild(th);
    }

    searchInput.addEventListener('input', () => {
        state.page = 1;
        refresh();
    });

    prevBtn.addEventListener('click', () => {
        state.page = Math.max(1, state.page - 1);
        refresh();
    });

    nextBtn.addEventListener('click', () => {
        state.page += 1;
        refresh();
    });

    function render(rows) {
        state.rows = Array.isArray(rows) ? rows.slice() : [];
        state.page = 1;
        refresh();
    }

    function refresh() {
        const query = searchInput.value.toLowerCase().trim();
        state.filtered = state.rows.filter((row) => {
            if (!query) return true;
            return columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(query));
        });

        const sorted = state.filtered.sort((a, b) => {
            const av = String(a[state.sortKey] ?? '').toLowerCase();
            const bv = String(b[state.sortKey] ?? '').toLowerCase();
            if (av < bv) return -1 * state.sortDir;
            if (av > bv) return 1 * state.sortDir;
            return 0;
        });

        const pageData = paginate(sorted, state.page, pageSize);
        state.page = pageData.page;

        body.innerHTML = '';
        pageData.items.forEach((row) => {
            const tr = document.createElement('tr');
            columns.forEach((col) => {
                const td = document.createElement('td');
                td.textContent = col.formatter ? col.formatter(row[col.key], row) : String(row[col.key] ?? '');
                tr.appendChild(td);
            });

            if (rowActions.length) {
                const td = document.createElement('td');
                const wrap = document.createElement('div');
                wrap.className = 'inline';
                rowActions.forEach((action) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = action.className || 'ghost';
                    btn.textContent = action.label;
                    btn.addEventListener('click', () => action.handler(row));
                    wrap.appendChild(btn);
                });
                td.appendChild(wrap);
                tr.appendChild(td);
            }

            body.appendChild(tr);
        });

        if (!pageData.items.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = columns.length + (rowActions.length ? 1 : 0);
            td.textContent = 'No data available.';
            tr.appendChild(td);
            body.appendChild(tr);
        }

        metaEl.textContent = `${state.filtered.length} record(s)`;
        pageEl.textContent = `Page ${pageData.page} / ${pageData.totalPages}`;
        prevBtn.disabled = pageData.page <= 1;
        nextBtn.disabled = pageData.page >= pageData.totalPages;
    }

    return { render, refresh };
}

