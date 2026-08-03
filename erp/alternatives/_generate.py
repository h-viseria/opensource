#!/usr/bin/env python3
"""Generate PicoERP alternative comparison pages under alternatives/."""

from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Shared PicoERP column cells (content identical on every page)
PICO = {
    "cost": "Free — no subscription for the app",
    "hosting": "No hosting server needed — runs entirely in your browser on your device",
    "privacy": "100% private by design — books stay local in the browser",
    "install": "None — open the page and work",
    "platforms": "Windows, Mac, Linux, and Android (modern browser)",
    "signup": "Not required",
    "double_entry": "Yes",
    "multi_book": "Yes (separate books)",
    "coa": "Yes — groups, ledgers, journals / vouchers",
    "invoices": "Yes, plus invoice templates",
    "inventory": "Yes — items, warehouses, movements, stock summary",
    "tax": "Tax codes and tax reports (summary / ledger / payable style)",
    "personal": "Yes — budgets, goals, net worth, budget variance",
    "reports": "Trial balance, P&amp;L, balance sheet, day book, cash flow, ledger",
    "bank": "No",
    "multiuser": "No cloud multi-user (local books on your device)",
    "payroll": "No",
    "offline": "First-class offline-first design",
    "backup": "Export / restore your own JSON book backup",
}

PAGES = [
    {
        "slug": "quickbooks-alternative",
        "file": "quickbooks-alternative.html",
        "rival": "QuickBooks",
        "title": "PicoERP — Free Offline QuickBooks Alternative (100% Private)",
        "description": (
            "Compare PicoERP and QuickBooks. PicoERP is a free, 100% private, offline-first "
            "double-entry ERP that runs in your browser—no install, no accounts, works on "
            "Windows, Mac, Linux, and Android."
        ),
        "h1": "PicoERP: a free, private QuickBooks alternative",
        "lead": (
            "QuickBooks is a full-featured small-business accounting suite (cloud and desktop "
            "products). PicoERP is a different bet: double-entry books that stay on your device, "
            "with zero install and no subscription for the app."
        ),
        "rival_cells": {
            "cost": "Subscription (cloud) or license-style (some desktop editions)",
            "hosting": "Primarily cloud-hosted (vendor servers); some desktop product variants",
            "privacy": "Data handled under the vendor’s cloud / account model (product-dependent)",
            "install": "App or account setup depending on product line",
            "platforms": "Product-dependent (typically Windows desktop and web apps)",
            "signup": "Account typically required for cloud products",
            "double_entry": "Yes",
            "multi_book": "Yes (product-dependent)",
            "coa": "Yes",
            "invoices": "Yes (strong invoicing)",
            "inventory": "Yes (product-dependent)",
            "tax": "Country modules and compliance tools (product-dependent)",
            "personal": "Not the core focus for most business plans",
            "reports": "Full report suite; deeper ecosystem tools on paid plans",
            "bank": "Common on cloud products",
            "multiuser": "Yes on cloud multi-user plans",
            "payroll": "Often available as add-ons / partner products",
            "offline": "Varies by product; cloud products need connectivity for full use",
            "backup": "Vendor export / backup tools; cloud retention under account",
        },
        "pico_better": [
            "You want <strong>100% private</strong> books that stay on your device by default",
            "You refuse <strong>recurring license or cloud fees</strong> for day-to-day accounting",
            "You need <strong>no install</strong> and the same app on Windows, Mac, Linux, and Android",
            "You’re a solo operator, small shop, society, or personal + small-business user who needs double-entry, invoices, inventory, tax codes, and core reports",
            "You’re fine managing your own <strong>local backups</strong> instead of vendor-hosted company files",
        ],
        "rival_better": [
            "You need cloud multi-user access and accountant collaboration workflows",
            "You rely on bank feeds, payments connectors, or payroll ecosystems",
            "You want deep country-specific compliance packages and a large partner network",
        ],
        "closing": (
            "PicoERP is not trying to be every QuickBooks add-on. It is a lean, offline-first "
            "double-entry ERP: private, free of app subscriptions, install-free, and usable "
            "across desktops and Android—with no hosting server for you to run."
        ),
    },
    {
        "slug": "tally-alternative",
        "file": "tally-alternative.html",
        "rival": "Tally",
        "title": "PicoERP — Free Offline Tally Alternative (100% Private)",
        "description": (
            "Compare PicoERP and Tally. PicoERP is a free, 100% private, offline-first "
            "double-entry ERP in the browser—no install, no license subscription, works on "
            "Windows, Mac, Linux, and Android."
        ),
        "h1": "PicoERP: a free, private Tally alternative",
        "lead": (
            "Tally is a mature accounting product line known for voucher-style bookkeeping, "
            "inventory, and deep compliance workflows in many markets (especially India). "
            "PicoERP focuses on lean double-entry books that stay private on your device—no install, "
            "no recurring app subscription."
        ),
        "rival_cells": {
            "cost": "License / edition-based product pricing",
            "hosting": "Desktop-centric; optional remote / cloud options in the ecosystem may involve servers",
            "privacy": "Primarily local desktop data; connected features follow that product’s model",
            "install": "Desktop install (classic), or product-specific connected setup",
            "platforms": "Primarily Windows desktop; other access depends on product variant",
            "signup": "License / activation model rather than free browser open access",
            "double_entry": "Yes",
            "multi_book": "Yes (companies)",
            "coa": "Yes — voucher-led masters and ledgers",
            "invoices": "Yes",
            "inventory": "Yes (strong inventory focus)",
            "tax": "Deep statutory / GST-oriented workflows in supported editions",
            "personal": "Not the core focus",
            "reports": "Extensive statutory and management reports",
            "bank": "Partial / product-dependent; often via ecosystem tools",
            "multiuser": "Multi-user / remote configurations available in the ecosystem",
            "payroll": "Available in broader product / add-on ecosystems",
            "offline": "Strong offline on desktop editions",
            "backup": "Product backup tools for company data",
        },
        "pico_better": [
            "You want <strong>100% private</strong> browser books with no desktop install",
            "You want to avoid <strong>recurring license or cloud fees</strong> for everyday books",
            "You need the same UI on <strong>Windows, Mac, Linux, and Android</strong>",
            "You need double-entry, invoices, inventory, tax codes, and classic reports without Tally’s license footprint",
            "You prefer exporting your own <strong>JSON backups</strong> under your control",
        ],
        "rival_better": [
            "You need deep GST / e-invoice and statutory filing workflows",
            "You depend on CA / practice ecosystems and multi-user remote company access",
            "Your team already standardizes on Tally voucher workflows and training",
        ],
        "closing": (
            "PicoERP is not a drop-in replacement for every Tally compliance module. It is a free, "
            "offline-first double-entry ERP for shops, societies, and small books—private, "
            "install-free, and needing no hosting server of your own."
        ),
    },
    {
        "slug": "gnucash-alternative",
        "file": "gnucash-alternative.html",
        "rival": "GnuCash",
        "title": "PicoERP — Browser GnuCash Alternative (100% Private)",
        "description": (
            "Compare PicoERP and GnuCash. PicoERP is a free, 100% private, offline-first "
            "double-entry ERP in the browser—with invoices, inventory, and GnuCash import/export."
        ),
        "h1": "PicoERP: a browser-based GnuCash alternative",
        "lead": (
            "GnuCash is a free, open-source desktop double-entry application long trusted for "
            "personal and small-business books. PicoERP keeps that double-entry spirit but runs "
            "in the browser—no install—with invoices, inventory UI, and a path to import from GnuCash."
        ),
        "rival_cells": {
            "cost": "Free (open source)",
            "hosting": "On-device desktop app — no SaaS cloud subscription; no separate server for basic use",
            "privacy": "Local files on your computer",
            "install": "Desktop application install",
            "platforms": "Windows, Mac, Linux (desktop apps)",
            "signup": "Not required",
            "double_entry": "Yes",
            "multi_book": "Yes (separate books / files)",
            "coa": "Yes — hierarchical accounts and transactions",
            "invoices": "Available with a learning curve; less “invoice-first” than dedicated SMB suites",
            "inventory": "Limited / not as product-centric as dedicated inventory modules",
            "tax": "Manual / schedule-driven approaches common",
            "personal": "Strong personal accounting heritage",
            "reports": "Mature report set for double-entry books",
            "bank": "Import / recon tools; not modern bank feed SaaS",
            "multiuser": "Generally single-user desktop workflows",
            "payroll": "No full payroll suite",
            "offline": "Yes — desktop offline",
            "backup": "File-based backups of your books",
        },
        "pico_better": [
            "You want <strong>no installation</strong> and the same app on desktop <strong>and Android</strong>",
            "You want built-in <strong>sales/purchase invoices</strong>, inventory screens, and tax reports",
            "You want a clear path from GnuCash via <strong>import / export</strong>",
            "You prefer a modern browser UI with optional PWA-style use",
            "You still want <strong>100% private</strong> local data with no cloud account",
        ],
        "rival_better": [
            "You prefer a native desktop app and mature long-term community release history",
            "You need desktop power-user flows or multi-currency depth you already rely on in GnuCash",
            "You want maximum offline fidelity only as a traditional installed program",
        ],
        "closing": (
            "PicoERP complements rather than dismisses GnuCash: free, private, double-entry—with "
            "invoices and inventory in the browser, and no hosting server for you to operate."
        ),
    },
    {
        "slug": "zoho-books-alternative",
        "file": "zoho-books-alternative.html",
        "rival": "Zoho Books",
        "title": "PicoERP — Free Offline Zoho Books Alternative (100% Private)",
        "description": (
            "Compare PicoERP and Zoho Books. PicoERP is a free, 100% private, offline-first "
            "double-entry ERP—no cloud subscription, no install, works on Windows, Mac, Linux, and Android."
        ),
        "h1": "PicoERP: a private, offline Zoho Books alternative",
        "lead": (
            "Zoho Books is a cloud SaaS accounting product with multi-user access, portals, and "
            "integrations. PicoERP takes the opposite posture: double-entry books that never require "
            "a vendor cloud account or a hosting server—just your browser."
        ),
        "rival_cells": {
            "cost": "Subscription (SaaS)",
            "hosting": "Cloud-hosted on vendor servers",
            "privacy": "Data stored and processed under Zoho’s cloud account model",
            "install": "Browser app (account required); mobile apps optional",
            "platforms": "Web and mobile clients across major platforms",
            "signup": "Account required",
            "double_entry": "Yes",
            "multi_book": "Yes (organization / company model)",
            "coa": "Yes",
            "invoices": "Yes (strong cloud invoicing and client portals)",
            "inventory": "Yes",
            "tax": "Country modules and compliance integrations",
            "personal": "Business accounting first",
            "reports": "Broad SaaS report suite",
            "bank": "Yes — bank feeds / reconciliations common",
            "multiuser": "Yes — designed for online collaboration",
            "payroll": "Via broader Zoho ecosystem products",
            "offline": "Limited — cloud product expects connectivity",
            "backup": "Vendor export tools; data residency under cloud account",
        },
        "pico_better": [
            "You want <strong>100% private</strong> books without uploading them to a cloud vendor",
            "You refuse <strong>recurring cloud subscription fees</strong> for core accounting",
            "You need <strong>true offline-first</strong> use with no hosting server of your own",
            "You’re a solo or small operator who wants invoices, inventory, tax codes, and reports in a thin stack",
            "You value <strong>install-free</strong> access on Windows, Mac, Linux, and Android",
        ],
        "rival_better": [
            "You need multi-user cloud collaboration and client portals",
            "You rely on bank feeds, automations, and integration marketplace",
            "You want managed cloud backups and online accountant access by default",
        ],
        "closing": (
            "PicoERP is not a multi-user SaaS suite. It is free, private, offline-first double-entry "
            "accounting—no hosting server required—so your books stay under your control."
        ),
    },
]

FEATURES = [
    ("Cost model", "cost"),
    ("Hosting / infrastructure", "hosting"),
    ("Privacy", "privacy"),
    ("Install", "install"),
    ("Platforms", "platforms"),
    ("Sign-up / account", "signup"),
    ("Double-entry accounting", "double_entry"),
    ("Multi-book / companies", "multi_book"),
    ("Chart of accounts, ledgers, journals", "coa"),
    ("Sales &amp; purchase invoices", "invoices"),
    ("Inventory", "inventory"),
    ("Tax", "tax"),
    ("Personal finance (budgets, goals, net worth)", "personal"),
    ("Classic reports", "reports"),
    ("Bank feeds / auto bank sync", "bank"),
    ("Multi-user cloud collaboration", "multiuser"),
    ("Payroll / payments ecosystem", "payroll"),
    ("Offline use", "offline"),
    ("Backup", "backup"),
]

DIFFS = [
    ("100% privacy", "Books stay local in your browser. Core accounting does not require cloud upload."),
    ("No recurring license or cloud fees", "Use PicoERP free—no monthly subscription fee for the app itself."),
    ("No installation", "Open the page and start. Optional browser / PWA-style use if you want a home screen icon."),
    ("Works on all platforms", "Windows, Mac, Linux, and Android via a modern browser—same product everywhere."),
]


def render_page(page: dict, filename: str) -> str:
    rival = page["rival"]
    rows = []
    for label, key in FEATURES:
        pico_val = PICO[key]
        rival_val = page["rival_cells"][key]
        rows.append(
            f"""          <tr>
            <th scope="row">{label}</th>
            <td class="col-pico">{pico_val}</td>
            <td class="col-rival">{rival_val}</td>
          </tr>"""
        )

    pico_list = "\n".join(f"          <li>{item}</li>" for item in page["pico_better"])
    rival_list = "\n".join(f"          <li>{item}</li>" for item in page["rival_better"])
    diff_html = "\n".join(
        f"""      <div class="diff__item">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>"""
        for title, body in DIFFS
    )

    # Footer links relative within alternatives/*
    nav_others = [
        ("quickbooks-alternative", "vs QuickBooks"),
        ("tally-alternative", "vs Tally"),
        ("gnucash-alternative", "vs GnuCash"),
        ("zoho-books-alternative", "vs Zoho Books"),
    ]
    footer_links = []
    for slug, label in nav_others:
        href = f"../{slug}/"
        current = ' aria-current="page"' if slug == page["slug"] else ""
        footer_links.append(f'        <a href="{href}"{current}>{label}</a>')
    footer_links_html = "\n".join(footer_links)

    # Canonical path per file
    if filename == "index.html":
        canonical = f"https://picoai.org/erp/alternatives/{page['slug']}/"
    else:
        canonical = f"https://picoai.org/erp/alternatives/{page['slug']}/{filename}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f3d3e" />
  <meta name="description" content="{page['description']}" />
  <meta name="robots" content="index, follow" />
  <meta name="author" content="PicoAI / PicoERP Team" />
  <link rel="canonical" href="{canonical}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:site_name" content="PicoERP" />
  <meta property="og:title" content="{page['title']}" />
  <meta property="og:description" content="{page['description']}" />

  <meta name="twitter:title" content="{page['title']}" />
  <meta name="twitter:description" content="{page['description']}" />

  <title>{page['title']}</title>
  <link rel="icon" type="image/png" sizes="32x32" href="../../icons/favicon.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="../../icons/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../alternatives.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap nav">
      <a class="brand" href="../../index.html">
        <img class="brand__logo" src="../../icons/icon-192.png" width="36" height="36" alt="" />
        <span class="brand__text">
          <span class="brand__name">PicoERP</span>
          <span class="brand__tag">vs {rival}</span>
        </span>
      </a>
      <div class="nav-links">
        <a class="nav-link nav-link--hide-sm" href="../">All alternatives</a>
        <a class="cta" href="../../index.html">Launch PicoERP →</a>
      </div>
    </div>
  </header>

  <main>
    <div class="wrap hero">
      <p class="hero__eyebrow">Feature comparison</p>
      <h1>{page['h1']}</h1>
      <p class="hero__lead">{page['lead']}</p>
      <a class="cta cta--lg" href="../../index.html">Launch PicoERP →</a>

      <div class="diff" aria-label="Key PicoERP differentiators">
{diff_html}
      </div>
    </div>

    <section class="wrap section" aria-labelledby="compare-heading">
      <h2 id="compare-heading">PicoERP vs {rival}</h2>
      <p>Two-column comparison of cost model, hosting, privacy, and day-to-day accounting features. No dollar prices—just how each product is typically licensed and hosted.</p>
      <div class="table-wrap">
        <table class="compare">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col" class="col-pico">PicoERP</th>
              <th scope="col">{rival}</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="wrap section" aria-labelledby="choose-heading">
      <h2 id="choose-heading">Which should you choose?</h2>
      <div class="choose-grid">
        <div class="choose-card choose-card--pico">
          <h3>Choose PicoERP when…</h3>
          <ul>
{pico_list}
          </ul>
        </div>
        <div class="choose-card">
          <h3>Choose {rival} when…</h3>
          <ul>
{rival_list}
          </ul>
        </div>
      </div>
    </section>

    <div class="wrap">
      <div class="cta-block">
        <h2>Start private books in your browser</h2>
        <p>{page['closing']}</p>
        <a class="cta cta--lg" href="../../index.html">Launch PicoERP →</a>
      </div>
    </div>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <p>PicoERP — offline-first double-entry accounting. Free, private, no install.</p>
      <nav class="footer-links" aria-label="Other comparisons">
{footer_links_html}
        <a href="../../index.html">Launch PicoERP</a>
      </nav>
    </div>
  </footer>
</body>
</html>
"""


def hub_page() -> str:
    cards = []
    for page in PAGES:
        cards.append(
            f"""      <article class="choose-card">
        <h3>{page['rival']}</h3>
        <p>{page['h1']}</p>
        <p><a class="cta" href="{page['slug']}/">Compare →</a></p>
      </article>"""
        )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f3d3e" />
  <meta name="description" content="Compare PicoERP with QuickBooks, Tally, GnuCash, and Zoho Books. Free, 100% private, offline-first accounting in the browser." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://picoai.org/erp/alternatives/" />
  <title>PicoERP Alternatives — Compare Online Accounting Tools</title>
  <link rel="icon" type="image/png" sizes="32x32" href="../icons/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="alternatives.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap nav">
      <a class="brand" href="../index.html">
        <img class="brand__logo" src="../icons/icon-192.png" width="36" height="36" alt="" />
        <span class="brand__text">
          <span class="brand__name">PicoERP</span>
          <span class="brand__tag">Alternatives</span>
        </span>
      </a>
      <a class="cta" href="../index.html">Launch PicoERP →</a>
    </div>
  </header>
  <main class="wrap hero">
    <p class="hero__eyebrow">Comparisons</p>
    <h1>PicoERP alternatives</h1>
    <p class="hero__lead">
      See how PicoERP compares on privacy, cost model, hosting, and features—with QuickBooks, Tally, GnuCash, and Zoho Books.
    </p>
    <div class="choose-grid" style="margin-top: 2rem;">
{chr(10).join(cards)}
    </div>
  </main>
  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <p>PicoERP — offline-first double-entry accounting. Free, private, no install.</p>
      <nav class="footer-links">
        <a href="../index.html">Launch PicoERP</a>
      </nav>
    </div>
  </footer>
</body>
</html>
"""


def main() -> None:
    for page in PAGES:
        folder = ROOT / page["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        html = render_page(page, "index.html")
        (folder / "index.html").write_text(html, encoding="utf-8")
        named = render_page(page, page["file"])
        (folder / page["file"]).write_text(named, encoding="utf-8")
        print(f"Wrote {page['slug']}/index.html and {page['file']}")

    (ROOT / "index.html").write_text(hub_page(), encoding="utf-8")
    print("Wrote alternatives/index.html hub")


if __name__ == "__main__":
    main()
