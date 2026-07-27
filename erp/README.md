# PicoERP

Offline-first double-entry accounting ERP in the browser (vanilla JavaScript + IndexedDB).

## Run locally

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765` (not `file://`).

## Stack

- No bundler / no framework
- Hash router, service worker PWA
- Layers: UI → Services → Engine → Repository → IndexedDB (`erpDataStore`)

## Agent / contributor context

Folder-level guidance for humans and coding agents lives in **`AGENTS.md`** files (root and each major directory). Cursor also loads `.cursor/rules/picoerp.mdc`.

## License

To be chosen when publishing to GitHub.
