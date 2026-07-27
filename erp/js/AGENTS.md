# js/ — application code

ES modules only. Boot: `app.js` opens DB, mounts book gate or shell, registers routes + SW.

## Key files

| File | Purpose |
|------|---------|
| `app.js` | Bootstrap, book gate vs shell, event remount |
| `routes.js` | All hash routes → page renderers |

## Import direction

Pages may import services + UI helpers. Services may import engines + repositories. Engines should not import UI.

## Related

- Domain shapes: `models/AGENTS.md`
- Persistence: `db/AGENTS.md`, `repositories/AGENTS.md`
