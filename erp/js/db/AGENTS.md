# js/db/ — IndexedDB

| File | Purpose |
|------|---------|
| `database.js` | Open DB, transactions (`withTransaction`), delete DB |
| `schema.js` | Object store + index definitions per `DB_VERSION` |
| `idb.js` | Low-level get/put/getAll/index helpers |

## Rules

- Database name comes from `DB_NAME` (`erpDataStore`). Renaming wipes local books.
- Schema upgrades: increment `DB_VERSION`, add stores/indexes in `schema.js` upgrade path.
- Always go through repositories for domain writes; avoid ad-hoc store access from UI.
- Backup/restore (`backupService`) dumps store contents; keep store names in sync with `STORES`.
