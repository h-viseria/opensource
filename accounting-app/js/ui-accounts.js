/**
 * ui-accounts.js — Renders the account hierarchy table
 */

import { buildAccountTree } from './accounts.js';
import { formatCurrency } from './models.js';

export async function renderAccountTree(onAccountClick) {
    const container = document.getElementById('account-tree-container');
    container.innerHTML = '<p class="loading">Loading accounts...</p>';

    const { roots } = await buildAccountTree();

    if (roots.length === 0) {
        container.innerHTML = '<p class="empty-state">No accounts found. Please upload a Chart of Accounts.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'acc-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Account Name</th>
                <th>Short Code</th>
                <th>Type</th>
                <th>Description</th>
                <th class="num">Balance</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');

    function renderNode(node, depth) {
        const tr = document.createElement('tr');
        tr.className = 'acc-row' + (node.children.length > 0 ? ' has-children' : ' leaf');
        tr.dataset.shortcode = node.shortCode;
        tr.dataset.depth = depth;
        const typeLabel = String(node.type || 'Unknown');
        const typeClass = String(node.type || 'unknown').toLowerCase();

        const balance = node.aggregateBalance;
        const balClass = balance < 0 ? 'negative' : 'positive';

        tr.innerHTML = `
            <td>
                <span class="indent" style="padding-left:${depth * 20}px"></span>
                ${node.children.length > 0 ? '<span class="toggle-icon">&#9660;</span>' : '<span class="leaf-icon">&#9679;</span>'}
                <span class="acc-name">${escHtml(node.name)}</span>
            </td>
            <td><code>${escHtml(node.shortCode)}</code></td>
            <td><span class="badge badge-${typeClass}">${escHtml(typeLabel)}</span></td>
            <td class="desc">${escHtml(node.description)}</td>
            <td class="num ${balClass}">${formatCurrency(balance)}</td>
        `;

        tr.addEventListener('click', () => {
            // Toggle children visibility
            if (node.children.length > 0) {
                const expanded = tr.dataset.expanded === 'true';
                tr.dataset.expanded = !expanded;
                const icon = tr.querySelector('.toggle-icon');
                if (expanded) {
                    icon.innerHTML = '&#9654;';
                    hideDescendants(node.shortCode);
                } else {
                    icon.innerHTML = '&#9660;';
                    showDirectChildren(node.shortCode);
                }
            }
            // Always allow ledger view
            onAccountClick(node.shortCode);
            document.querySelectorAll('.acc-row').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
        });

        tr.dataset.expanded = 'true';
        tbody.appendChild(tr);

        node.children.forEach(child => renderNode(child, depth + 1));
    }

    function hideDescendants(parentCode) {
        tbody.querySelectorAll('.acc-row').forEach(row => {
            if (row.dataset.shortcode === parentCode) return;
            // Check ancestry
            if (isDescendantOf(row.dataset.shortcode, parentCode)) {
                row.style.display = 'none';
                row.dataset.expanded = 'false';
                const icon = row.querySelector('.toggle-icon');
                if (icon) icon.innerHTML = '&#9654;';
            }
        });
    }

    function showDirectChildren(parentCode) {
        tbody.querySelectorAll('.acc-row').forEach(row => {
            if (row.dataset.parentcode === parentCode) {
                row.style.display = '';
            }
        });
    }

    roots.forEach(node => renderNode(node, 0));

    // Tag each row with its parent for show/hide logic
    function tagParents(node) {
        node.children.forEach(child => {
            const row = tbody.querySelector(`[data-shortcode="${child.shortCode}"]`);
            if (row) row.dataset.parentcode = node.shortCode;
            tagParents(child);
        });
    }
    roots.forEach(tagParents);

    // Build ancestry map for hide logic
    const ancestryMap = {};
    function buildAncestry(node, ancestors) {
        ancestryMap[node.shortCode] = ancestors;
        node.children.forEach(c => buildAncestry(c, [...ancestors, node.shortCode]));
    }
    roots.forEach(r => buildAncestry(r, []));

    function isDescendantOf(code, ancestorCode) {
        return (ancestryMap[code] || []).includes(ancestorCode);
    }

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

