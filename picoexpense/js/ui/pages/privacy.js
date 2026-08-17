export async function renderPrivacy() {
  const outlet = document.getElementById('outlet');
  outlet.innerHTML = `
    <section class="page prose">
      <h2>Privacy</h2>
      <p>Your financial data stays on this device in IndexedDB database <strong>PicoPersonalFinance</strong>.</p>
      <ul>
        <li>No account or login is required.</li>
        <li>No analytics, advertising, or telemetry is built into PicoExpense.</li>
        <li>OCR runs locally through PicoScan on this origin. Receipt images are not uploaded to a PicoExpense server.</li>
        <li>Backups are files you download or optionally sync to a Google Drive folder you choose. That is under your control.</li>
        <li>Google Drive sign-in (if you use it) sends backup files only to your Drive via Google’s APIs — not to PicoExpense servers.</li>
        <li>You can delete all local data from Backup.</li>
      </ul>
      <p>See the <a href="#/guide">user guide</a> for how backups, Drive, and OCR work in practice.</p>
      <p>This app does not claim third-party certifications. Offline operation is enforced by keeping core logic in the browser; Drive and font/network requests are optional.</p>
    </section>
  `;
}
