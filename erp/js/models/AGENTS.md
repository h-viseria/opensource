# js/models/ — entity shapes

`types.js` holds JSDoc `@typedef` for Book, Ledger, Voucher, Item, CatalogueType, Invoice, etc.

Runtime objects are plain POJOs; typedefs are for editor/intellisense only.

## Rules

- When adding fields (e.g. `Book.templateId`, item `attributes`), update typedefs here and any create/update paths in services.
- Do not put logic in this folder.
