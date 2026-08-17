/**
 * IndexedDB schema migrations. Version 1 creates all current stores.
 * Never delete/recreate the database on app update.
 */

export { migrate, createV1Stores } from './schema.js';
