/**
 * Compare local activity log vs the log embedded in the Google Drive backup zip.
 */

import * as activityLogService from '../../services/activityLogService.js';
import * as driveSyncService from '../../services/driveSyncService.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { showToast } from '../toast.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderDriveActivityCompare(_ctx, outlet) {
  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/settings">Settings</a> / Activity compare</p>
        <h1 class="page-header__title">Local vs Google Drive activity</h1>
        <p class="page-header__desc">
          Last ${activityLogService.ACTIVITY_LOG_MAX} meaningful actions on this browser,
          compared with the activity log inside the synced Drive backup zip.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/settings">Back to Settings</a>
        <button type="button" class="btn btn--primary" id="btn-refresh-compare">Refresh from Drive</button>
      </div>
    </div>
    <div id="activity-compare-body" class="panel">
      <p class="muted">Loading…</p>
    </div>
  `;

  const body = /** @type {HTMLElement} */ (outlet.querySelector('#activity-compare-body'));
  outlet.querySelector('#btn-refresh-compare')?.addEventListener('click', () => {
    loadCompare(body).catch((err) => {
      showToast(err instanceof Error ? err.message : 'Compare failed', 'error');
    });
  });

  try {
    await loadCompare(body);
  } catch (err) {
    body.innerHTML = `<p class="muted">${escapeHtml(err instanceof Error ? err.message : 'Compare failed')}</p>`;
  }
}

/**
 * @param {HTMLElement} body
 */
async function loadCompare(body) {
  body.innerHTML = `<p class="muted">Loading local and Drive activity logs…</p>`;

  const local = await activityLogService.getActivityLog();
  const sync = await driveSyncService.getSyncState();

  if (!sync.enabled || !sync.folderId) {
    body.innerHTML = `
      <p>Google Drive sync is not connected yet, so there is no Drive backup log to compare.</p>
      <p class="muted" style="margin-top:0.75rem">Connect a folder under Settings → Google Drive sync, then return here.</p>
      <div style="margin-top:1rem">
        <a class="btn btn--primary" href="#/settings">Open Settings</a>
      </div>
      ${renderSingleColumn('This browser', local)}
    `;
    return;
  }

  if (!(await driveSyncService.isDriveApiConfigured())) {
    body.innerHTML = `<p class="muted">Google Drive API is not configured.</p>`;
    return;
  }

  let driveLog = [];
  let exportedAt = null;
  let driveError = '';
  try {
    if (!navigator.onLine) throw new Error('You are offline — cannot read Drive');
    const remote = await driveSyncService.loadDriveActivityLog();
    driveLog = remote.activityLog;
    exportedAt = remote.exportedAt;
  } catch (err) {
    driveError = err instanceof Error ? err.message : String(err);
  }

  const folderLabel = sync.parentFolderName
    ? `${sync.parentFolderName} / ${sync.folderName}`
    : sync.folderName || 'Drive';

  if (driveError) {
    body.innerHTML = `
      <p class="badge badge--warning" style="margin-bottom:0.75rem">Could not load Drive log: ${escapeHtml(driveError)}</p>
      <p class="muted">Showing local activity only. Folder: <strong>${escapeHtml(folderLabel)}</strong></p>
      ${renderSingleColumn('This browser', local)}
    `;
    return;
  }

  const compared = activityLogService.compareActivityLogs(local, driveLog);
  const { summary } = compared;

  body.innerHTML = `
    <p class="muted" style="margin-bottom:1rem">
      Folder <strong>${escapeHtml(folderLabel)}</strong>
      · Drive backup exported ${exportedAt ? escapeHtml(formatWhen(exportedAt)) : '—'}
    </p>
    <div class="stat-grid" style="margin-bottom:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Only on this browser</div>
        <div class="stat-tile__value">${summary.onlyLocal}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Only on Drive</div>
        <div class="stat-tile__value">${summary.onlyDrive}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">On both</div>
        <div class="stat-tile__value">${summary.shared}</div>
      </div>
    </div>

    <div class="activity-compare-grid">
      <div>
        <h2 class="panel__title">This browser (${summary.localCount})</h2>
        ${renderEntryList(local, 'local')}
      </div>
      <div>
        <h2 class="panel__title">Google Drive backup (${summary.driveCount})</h2>
        ${renderEntryList(driveLog, 'drive')}
      </div>
    </div>

    <div style="margin-top:1.25rem">
      <h2 class="panel__title">Differences</h2>
      ${
        compared.rows.length === 0
          ? `<p class="muted">No activity recorded yet on either side.</p>`
          : `<div class="table-wrap"><table class="data-table">
              <thead>
                <tr><th>Where</th><th>When</th><th>Activity</th></tr>
              </thead>
              <tbody>
                ${compared.rows
                  .map((row) => {
                    const entry = row.local || row.remote;
                    const where =
                      row.kind === 'both'
                        ? '<span class="badge badge--success">Both</span>'
                        : row.kind === 'local-only'
                          ? '<span class="badge badge--info">Only local</span>'
                          : '<span class="badge badge--warning">Only Drive</span>';
                    return `<tr>
                      <td>${where}</td>
                      <td class="mono" style="white-space:nowrap">${escapeHtml(formatWhen(entry?.at))}</td>
                      <td>
                        <div>${escapeHtml(entry?.message || '')}</div>
                        <div class="muted" style="font-size:var(--text-xs)">${escapeHtml(entry?.category || '')}${
                          entry?.bookName ? ` · ${escapeHtml(entry.bookName)}` : ''
                        }</div>
                      </td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table></div>`
      }
    </div>
  `;
}

/**
 * @param {string} title
 * @param {import('../../services/activityLogService.js').ActivityLogEntry[]} entries
 */
function renderSingleColumn(title, entries) {
  return `
    <div style="margin-top:1.25rem">
      <h2 class="panel__title">${escapeHtml(title)}</h2>
      ${renderEntryList(entries, 'local')}
    </div>`;
}

/**
 * @param {import('../../services/activityLogService.js').ActivityLogEntry[]} entries
 * @param {string} _side
 */
function renderEntryList(entries, _side) {
  if (!entries.length) {
    return `<p class="muted">No recent activity yet. Post an invoice or voucher to start the log.</p>`;
  }
  return `<ul class="activity-log-list">
    ${entries
      .map(
        (e) => `<li class="activity-log-list__item">
          <div class="activity-log-list__when">${escapeHtml(formatWhen(e.at))}</div>
          <div class="activity-log-list__msg">${escapeHtml(e.message)}</div>
          <div class="activity-log-list__meta muted">${escapeHtml(e.category)}${
            e.bookName ? ` · ${escapeHtml(e.bookName)}` : ''
          }</div>
        </li>`
      )
      .join('')}
  </ul>`;
}

/** @param {string} [iso] */
function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${formatDisplayDate(d.toISOString().slice(0, 10))} ${d.toLocaleTimeString()}`;
  } catch {
    return iso;
  }
}
