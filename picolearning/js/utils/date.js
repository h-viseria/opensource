export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param {string} iso
 * @param {number} days
 */
export function addDaysIso(iso, days) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
