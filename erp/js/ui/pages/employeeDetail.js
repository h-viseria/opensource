/**
 * Employee profile — info, custom fields, documents, attendance/leave summaries.
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import * as payrollService from '../../services/payrollService.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { formatDisplayDate, toDateInput } from '../../utils/date.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderEmployeeDetail(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }
  const id = ctx.params?.id;
  const emp = id ? await peopleService.getEmployee(id) : null;
  if (!emp || emp.bookId !== book.id) {
    outlet.innerHTML = `<p class="muted">Employee not found. <a href="#/people/employees">Back to list</a></p>`;
    return;
  }

  const month = toDateInput(new Date()).slice(0, 7);
  const [fields, docs, settings, attSummary, leaveBalances] = await Promise.all([
    peopleService.listCustomFields(book.id, { activeOnly: false }),
    peopleService.listEmployeeDocuments(emp.id),
    peopleService.getAttendanceSettings(book.id),
    peopleService.getEmployeeAttendanceSummary(book.id, emp.id, month),
    peopleService.getEmployeeLeaveBalances(book.id, emp.id),
  ]);

  const activeFields = fields.filter((f) => f.isActive !== false);
  const docTypes = settings?.documentTypes || ['Other'];

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/people">People</a> / <a href="#/people/employees">Employees</a> / ${escapeHtml(emp.employeeCode)}</p>
        <h1 class="page-header__title">${escapeHtml(emp.name)}</h1>
        <p class="page-header__desc">
          <span class="mono">${escapeHtml(emp.employeeCode)}</span>
          · <span class="badge ${emp.status === 'Active' ? 'badge--success' : 'badge--muted'}">${escapeHtml(emp.status)}</span>
          · Joined ${escapeHtml(formatDisplayDate(emp.joiningDate))}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/payroll/structures?employeeId=${encodeURIComponent(emp.id)}">Salary structure</a>
        <a class="btn btn--secondary" href="#/people/employees">Back</a>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Employee information</h2>
      <dl class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0.75rem">
        <div><dt class="muted">Mobile</dt><dd>${escapeHtml(emp.mobile || '—')}</dd></div>
        <div><dt class="muted">Email</dt><dd>${escapeHtml(emp.email || '—')}</dd></div>
        <div><dt class="muted">Date of birth</dt><dd>${escapeHtml(emp.dateOfBirth ? formatDisplayDate(emp.dateOfBirth) : '—')}</dd></div>
        <div><dt class="muted">Gender</dt><dd>${escapeHtml(emp.gender || '—')}</dd></div>
        <div><dt class="muted">Address</dt><dd>${escapeHtml(emp.address || '—')}</dd></div>
        <div><dt class="muted">Notes</dt><dd>${escapeHtml(emp.notes || '—')}</dd></div>
      </dl>
    </div>

    <div class="panel">
      <h2 class="panel__title">Employment</h2>
      <dl class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0.75rem">
        <div><dt class="muted">Designation</dt><dd>${escapeHtml(emp.designation || '—')}</dd></div>
        <div><dt class="muted">Department</dt><dd>${escapeHtml(emp.department || '—')}</dd></div>
        <div><dt class="muted">Employment type</dt><dd>${escapeHtml(emp.employmentType || '—')}</dd></div>
        <div><dt class="muted">Status</dt><dd>${escapeHtml(emp.status)}</dd></div>
      </dl>
    </div>

    <div class="panel">
      <h2 class="panel__title">Custom information</h2>
      ${
        activeFields.length
          ? `<dl class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0.75rem">
            ${activeFields
              .map((f) => {
                const v = emp.customValues?.[f.id];
                let display = '—';
                if (f.fieldType === 'Checkbox') display = v === true || v === 'true' ? 'Yes' : 'No';
                else if (v != null && v !== '') display = String(v);
                return `<div><dt class="muted">${escapeHtml(f.name)}</dt><dd>${escapeHtml(display)}</dd></div>`;
              })
              .join('')}
          </dl>`
          : `<p class="muted">No custom fields. <a href="#/settings/employee-fields">Configure fields</a></p>`
      }
    </div>

    <div class="panel">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Documents</h2>
        <button type="button" class="btn btn--secondary btn--sm" id="btn-doc">Upload document</button>
      </div>
      <div class="list">
        ${
          docs.length
            ? docs
                .map((d) => {
                  const badge = peopleService.getDocumentExpiryBadge(d, settings);
                  const badgeCls =
                    badge === 'Expired'
                      ? 'badge--danger'
                      : badge === 'Expiring soon'
                        ? 'badge--warning'
                        : 'badge--success';
                  return `
              <div class="list-item">
                <div class="list-item__body">
                  <div class="list-item__title">${escapeHtml(d.name)}
                    <span class="badge badge--muted">${escapeHtml(d.documentType)}</span>
                    ${d.expiryDate ? `<span class="badge ${badgeCls}">${escapeHtml(badge)}</span>` : ''}
                  </div>
                  <div class="list-item__meta">
                    ${d.issueDate ? `Issued ${escapeHtml(formatDisplayDate(d.issueDate))} · ` : ''}
                    ${d.expiryDate ? `Expires ${escapeHtml(formatDisplayDate(d.expiryDate))} · ` : ''}
                    ${d.fileName ? escapeHtml(d.fileName) : ''}
                    ${d.notes ? ` · ${escapeHtml(d.notes)}` : ''}
                  </div>
                </div>
                <div class="list-item__actions">
                  ${d.dataUrl ? `<a class="btn btn--ghost btn--sm" href="${d.dataUrl}" download="${escapeHtml(d.fileName || d.name)}">Download</a>` : ''}
                  <button type="button" class="btn btn--ghost btn--sm" data-del-doc="${d.id}">Delete</button>
                </div>
              </div>`;
                })
                .join('')
            : `<p class="muted">No documents yet.</p>`
        }
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Attendance summary <span class="muted" style="font-weight:400">(${escapeHtml(month)})</span></h2>
      ${
        attSummary
          ? `<dl class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:0.75rem">
              <div><dt class="muted">Working days</dt><dd class="mono">${attSummary.workingDays}</dd></div>
              <div><dt class="muted">Present</dt><dd class="mono">${attSummary.present}</dd></div>
              <div><dt class="muted">Absent</dt><dd class="mono">${attSummary.absent}</dd></div>
              <div><dt class="muted">Leave days</dt><dd class="mono">${attSummary.leave}</dd></div>
              <div><dt class="muted">Overtime hrs</dt><dd class="mono">${attSummary.overtimeHours}</dd></div>
            </dl>
            <p style="margin-top:0.75rem"><a href="#/people/attendance?month=${encodeURIComponent(month)}">Open attendance</a></p>`
          : `<p class="muted">No attendance this month yet.</p>`
      }
    </div>

    <div class="panel">
      <h2 class="panel__title">Leave summary</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Leave type</th><th>Entitlement</th><th>Used</th><th>Remaining</th></tr></thead>
          <tbody>
            ${leaveBalances
              .map(
                (b) => `
              <tr>
                <td>${escapeHtml(b.leaveType.name)}</td>
                <td class="mono">${b.entitlement}</td>
                <td class="mono">${b.used}</td>
                <td class="mono">${b.remaining}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p style="margin-top:0.75rem"><a href="#/people/leave?employeeId=${encodeURIComponent(emp.id)}">Leave records</a></p>
    </div>

    ${
      emp.status === 'Inactive'
        ? `<div class="panel">
            <h2 class="panel__title">Final settlement</h2>
            <p class="muted">Create a single-employee payroll draft for exit processing (salary due, OT, unpaid leave, adjustments). No statutory gratuity rules — use salary heads if needed.</p>
            <button type="button" class="btn btn--secondary" id="btn-final-settle">Start final payroll</button>
          </div>`
        : ''
    }
  `;

  outlet.querySelector('#btn-doc')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Upload document',
      confirmLabel: 'Save',
      fieldsHtml: `
        <label class="field"><span class="field__label">Document name</span>
          <input class="input" name="name" required /></label>
        <label class="field"><span class="field__label">Document type</span>
          <select class="input" name="documentType">
            ${docTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </select></label>
        <label class="field"><span class="field__label">Issue date</span>
          <input class="input" type="date" name="issueDate" /></label>
        <label class="field"><span class="field__label">Expiry date</span>
          <input class="input" type="date" name="expiryDate" /></label>
        <label class="field"><span class="field__label">File</span>
          <input class="input" type="file" name="file" /></label>
        <label class="field"><span class="field__label">Notes</span>
          <textarea class="input" name="notes" rows="2"></textarea></label>
      `,
    });
    if (!fd) return;
    try {
      const file = /** @type {File|null} */ (fd.get('file'));
      let dataUrl = null;
      let fileName = null;
      let mimeType = null;
      let sizeBytes = null;
      if (file && file.size) {
        if (file.size > 4 * 1024 * 1024) {
          showToast('File too large (max 4 MB for local storage)', 'error');
          return;
        }
        dataUrl = await readFileAsDataUrl(file);
        fileName = file.name;
        mimeType = file.type;
        sizeBytes = file.size;
      }
      await peopleService.addEmployeeDocument(book.id, emp.id, {
        name: String(fd.get('name') || fileName || 'Document'),
        documentType: String(fd.get('documentType') || 'Other'),
        issueDate: String(fd.get('issueDate') || '') || null,
        expiryDate: String(fd.get('expiryDate') || '') || null,
        notes: String(fd.get('notes') || ''),
        fileName,
        mimeType,
        sizeBytes,
        dataUrl,
      });
      showToast('Document saved', 'success');
      await renderEmployeeDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-del-doc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete document?',
        bodyHtml: '<p>This removes the local copy from this browser.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await peopleService.deleteEmployeeDocument(btn.getAttribute('data-del-doc'));
        showToast('Document deleted', 'success');
        await renderEmployeeDetail(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  outlet.querySelector('#btn-final-settle')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Final settlement payroll',
      confirmLabel: 'Create draft',
      fieldsHtml: `
        <label class="field"><span class="field__label">Month (YYYY-MM)</span>
          <input class="input" name="month" value="${escapeHtml(month)}" pattern="\\d{4}-\\d{2}" required /></label>
        <p class="muted" style="font-size:var(--text-sm)">Creates a draft run for this employee only. Calculate and finalize from Payroll → Runs.</p>
      `,
    });
    if (!fd) return;
    try {
      const run = await payrollService.createFinalSettlementRun(
        book.id,
        emp.id,
        String(fd.get('month') || month),
      );
      showToast('Final settlement draft created', 'success');
      window.location.hash = `#/payroll/runs/${run.id}`;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}
