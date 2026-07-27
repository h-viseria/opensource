# css/ — styling

| File | Purpose |
|------|---------|
| `variables.css` | Design tokens (brand `#0f3d3e`, fonts, spacing, z-index) |
| `base.css` | Resets, boot screen, typography |
| `layout.css` | Shell, sidebar, book gate |
| `components.css` | Buttons, forms, panels, modals, reports, user guide, invoices |

## Rules

- Prefer tokens from `variables.css`; avoid one-off hex unless matching brand.
- Modals: `.modal` is flex column with max-height; `.modal__body` scrolls.
- User guide layout: `.user-guide` grid + sticky TOC (see components).
- No CSS framework; keep changes local to existing BEM-ish class names (`block__element`).
