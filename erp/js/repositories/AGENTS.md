# js/repositories/ — persistence adapters

Each file wraps one object store. Extend `BaseRepository` (`baseRepository.js`) for CRUD + `findByIndex` / `deleteByBook`.

## Patterns

- Methods return plain objects (no classes for entities).
- Book-scoped data: filter/index on `bookId`; implement `deleteByBook` when purge/delete book needs it.
- Do not call engines or show toasts from repositories.
- New entity → new repo + `STORES` entry + schema + optional backup list.

## Notable stores

Catalogue types, invoices, invoice templates, inventory transactions, vouchers/lines, tax codes, budgets, goals, audit logs.
