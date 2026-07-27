/**
 * Google Drive defaults for PicoERP publishers (NOT for end users).
 *
 * End users never enter Client ID / API keys. Everyday Drive backup uses a
 * guided download + open-Drive flow.
 *
 * Optional: fill these if YOU (the publisher) create a Google Cloud project,
 * so official builds can offer in-app Google sign-in + folder/file picker.
 * Leave empty for open-source / self-hosted copies.
 */
export const GOOGLE_DRIVE_DEFAULTS = Object.freeze({
  /** @type {string} OAuth 2.0 Web Client ID (publisher only) */
  clientId: '',
  /** @type {string} Browser API key for Google Picker (publisher only) */
  apiKey: '',
  /** @type {string} Cloud project number (optional) */
  appId: '',
});
