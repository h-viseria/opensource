/**
 * Tally XML import — parse, validate (no writes), then post via coa/voucher services.
 * Masters first, then vouchers. Replace chart when the book has no vouchers.
 */

import { ACCOUNT_NATURES, NATURE_ORDER } from '../core/accountTypes.js';
import { VOUCHER_TYPES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso, suggestFyLabel } from '../utils/date.js';
import { roundMoney, moneyEquals } from '../utils/money.js';
import { isKnownVoucherType, VOUCHER_TYPE_LIST } from '../engine/accountingEngine.js';
import { financialYearRepository } from '../repositories/financialYearRepository.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import * as bookService from './bookService.js';
import * as coaService from './coaService.js';
import * as voucherService from './voucherService.js';
import {
  TALLY_GROUP_NATURE,
  TALLY_PRIMARY_PARENTS,
  TALLY_SKIP_VOUCHER_TYPES,
  TALLY_VOUCHER_TYPE,
} from '../data/tallyMaps.js';

export { VOUCHER_TYPE_LIST, NATURE_ORDER };

const TALLY_TAG = 'tally:';
const TALLY_VCH_TAG = 'tally-vch:';

const SKIP_TYPE_SET = new Set(TALLY_SKIP_VOUCHER_TYPES);

/**
 * @typedef {{ name: string, parent: string, guid: string, reserved: string, synthetic?: boolean }} RawTallyGroup
 * @typedef {{ name: string, parent: string, guid: string, opening: number, openingType: 'debit'|'credit' }} RawTallyLedger
 * @typedef {{
 *   guid: string,
 *   number: string,
 *   date: string,
 *   dateRaw: string,
 *   tallyType: string,
 *   voucherType: string,
 *   narration: string,
 *   cancelled: boolean,
 *   optional: boolean,
 *   lines: { ledgerName: string, debit: number, credit: number }[]
 * }} RawTallyVoucher
 *
 * @typedef {{
 *   include: boolean,
 *   name: string,
 *   parent: string,
 *   nature: string,
 *   guid: string,
 *   synthetic: boolean,
 *   action: 'create'|'reuse'|'skip',
 *   errors: string[],
 *   warnings: string[]
 * }} TallyGroupRow
 *
 * @typedef {{
 *   include: boolean,
 *   name: string,
 *   group: string,
 *   opening: number,
 *   openingType: 'debit'|'credit',
 *   guid: string,
 *   action: 'create'|'reuse'|'skip',
 *   errors: string[],
 *   warnings: string[]
 * }} TallyLedgerRow
 *
 * @typedef {{
 *   include: boolean,
 *   guid: string,
 *   number: string,
 *   date: string,
 *   tallyType: string,
 *   voucherType: string,
 *   narration: string,
 *   lines: { ledgerName: string, debit: number, credit: number }[],
 *   errors: string[],
 *   warnings: string[]
 * }} TallyVoucherRow
 */

/* ── File / XML helpers ─────────────────────────────────── */

/**
 * Read Tally XML, including UTF-16 dumps without relying on FileReader encoding.
 * @param {File} file
 */
export async function readTallyXmlFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[2] !== 0 && bytes[3] === 0) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * @param {string} name
 */
export function isPrimaryParent(name) {
  return TALLY_PRIMARY_PARENTS.includes(normName(name));
}

/**
 * @param {string} name
 */
export function normName(name) {
  return String(name || '')
    .replace(/\u0004.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} raw
 */
export function cleanTallyName(raw) {
  let s = String(raw || '');
  const cut = s.indexOf('\u0004');
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 */
export function parseTallyXml(text) {
  const xml = String(text || '').replace(/^\uFEFF/, '');
  if (!xml.trim()) throw new Error('File is empty');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    const msg = (err.textContent || 'Invalid XML').replace(/\s+/g, ' ').trim();
    throw new Error(`Could not parse Tally XML. ${msg.slice(0, 240)}`);
  }

  const root = doc.documentElement;
  if (!root) throw new Error('Could not parse Tally XML (no root element)');

  const groups = [];
  const seenGroup = new Set();
  for (const el of byTag(root, 'GROUP')) {
    const name = elementName(el);
    if (!name || isPrimaryParent(name)) continue;
    const key = normName(name);
    if (seenGroup.has(key)) continue;
    seenGroup.add(key);
    groups.push({
      name,
      parent: cleanTallyName(childText(el, 'PARENT')),
      guid: childText(el, 'GUID'),
      reserved: cleanTallyName(el.getAttribute('RESERVEDNAME') || ''),
    });
  }

  const ledgers = [];
  const seenLedger = new Set();
  for (const el of byTag(root, 'LEDGER')) {
    const name = elementName(el);
    if (!name) continue;
    const key = normName(name);
    if (seenLedger.has(key)) continue;
    seenLedger.add(key);
    const openingParsed = parseOpening(childText(el, 'OPENINGBALANCE'));
    ledgers.push({
      name,
      parent: cleanTallyName(childText(el, 'PARENT')),
      guid: childText(el, 'GUID'),
      opening: openingParsed.amount,
      openingType: openingParsed.type,
    });
  }

  const vouchers = [];
  for (const el of byTag(root, 'VOUCHER')) {
    const cancelled =
      isYes(childText(el, 'ISCANCELLED')) ||
      isYes(childText(el, 'ISDELETED')) ||
      el.getAttribute('ACTION') === 'Delete';
    const optional = isYes(childText(el, 'ISOPTIONAL'));
    const tallyType =
      cleanTallyName(el.getAttribute('VCHTYPE') || '') ||
      cleanTallyName(childText(el, 'VOUCHERTYPENAME')) ||
      'Journal';
    const dateRaw =
      childText(el, 'DATE') || childText(el, 'EFFECTIVEDATE') || el.getAttribute('DATE') || '';
    const date = parseTallyDate(dateRaw);
    const guid = childText(el, 'GUID') || childText(el, 'REMOTEID') || '';
    const number =
      childText(el, 'VOUCHERNUMBER') || childText(el, 'REFERENCE') || '';
    const narration = childText(el, 'NARRATION');
    const lines = collectVoucherLines(el);
    vouchers.push({
      guid,
      number,
      date: date || '',
      dateRaw,
      tallyType,
      voucherType: mapVoucherType(tallyType),
      narration,
      cancelled,
      optional,
      lines,
    });
  }

  return {
    groups,
    ledgers,
    vouchers,
    stats: {
      groups: groups.length,
      ledgers: ledgers.length,
      vouchers: vouchers.length,
    },
  };
}

/* ── Draft builders ─────────────────────────────────────── */

/**
 * @param {ReturnType<typeof parseTallyXml>} parsed
 * @param {{
 *   existingGroups?: { name: string }[],
 *   existingLedgers?: { name: string }[],
 *   replaceChart?: boolean
 * }} [ctx]
 */
export function buildMasterDraft(parsed, ctx = {}) {
  const replaceChart = Boolean(ctx.replaceChart);
  const existingGroups = indexByName(ctx.existingGroups || []);
  const existingLedgers = indexByName(ctx.existingLedgers || []);

  /** @type {Map<string, RawTallyGroup>} */
  const rawByName = new Map();
  for (const g of parsed.groups || []) {
    rawByName.set(normName(g.name), { ...g });
  }

  for (const led of parsed.ledgers || []) {
    const parent = led.parent;
    if (!parent || isPrimaryParent(parent)) continue;
    const key = normName(parent);
    if (!rawByName.has(key)) {
      rawByName.set(key, {
        name: parent,
        parent: '',
        guid: '',
        reserved: '',
        synthetic: true,
      });
    }
  }

  for (const g of [...rawByName.values()]) {
    const parent = g.parent;
    if (!parent || isPrimaryParent(parent)) continue;
    const key = normName(parent);
    if (!rawByName.has(key)) {
      rawByName.set(key, {
        name: parent,
        parent: '',
        guid: '',
        reserved: '',
        synthetic: true,
      });
    }
  }

  /** @type {TallyGroupRow[]} */
  const groups = [...rawByName.values()].map((g) => {
    const nature = inferGroupNature(g, rawByName);
    const existing = !replaceChart ? existingGroups.get(normName(g.name)) : null;
    return {
      include: true,
      name: g.name,
      parent: isPrimaryParent(g.parent) ? '' : g.parent,
      nature,
      guid: g.guid || '',
      synthetic: Boolean(g.synthetic),
      action: existing ? 'reuse' : 'create',
      errors: [],
      warnings: [],
    };
  });

  groups.sort((a, b) => groupDepth(a, groups) - groupDepth(b, groups) || a.name.localeCompare(b.name));

  /** @type {TallyLedgerRow[]} */
  const ledgers = (parsed.ledgers || []).map((led) => {
    const existing = !replaceChart ? existingLedgers.get(normName(led.name)) : null;
    return {
      include: true,
      name: led.name,
      group: isPrimaryParent(led.parent) ? '' : led.parent,
      opening: led.opening,
      openingType: led.openingType,
      guid: led.guid || '',
      action: existing ? 'reuse' : 'create',
      errors: [],
      warnings: [],
    };
  });

  ledgers.sort((a, b) => a.name.localeCompare(b.name));
  return annotateMasters(groups, ledgers, { replaceChart });
}

/**
 * @param {ReturnType<typeof parseTallyXml>} parsed
 * @param {{ existingGuids?: Set<string> }} [ctx]
 */
export function buildVoucherDraft(parsed, ctx = {}) {
  const existingGuids = ctx.existingGuids || new Set();
  /** @type {TallyVoucherRow[]} */
  const rows = (parsed.vouchers || []).map((v) => {
    const skipType = SKIP_TYPE_SET.has(normName(v.tallyType));
    const isOpening = v.voucherType === VOUCHER_TYPES.OPENING;
    const dup = v.guid && existingGuids.has(v.guid);
    let include = true;
    /** @type {string[]} */
    const warnings = [];
    if (v.cancelled) {
      include = false;
      warnings.push('Cancelled / deleted in Tally — skipped');
    } else if (v.optional) {
      include = false;
      warnings.push('Optional voucher — skipped');
    } else if (skipType) {
      include = false;
      warnings.push(`Tally type "${v.tallyType}" is not a GL voucher — skipped`);
    } else if (isOpening) {
      include = false;
      warnings.push('Opening voucher skipped (opening is taken from ledger masters)');
    } else if (dup) {
      include = false;
      warnings.push('Already imported (matching Tally GUID)');
    }
    return {
      include,
      guid: v.guid,
      number: v.number,
      date: v.date,
      tallyType: v.tallyType,
      voucherType: isKnownVoucherType(v.voucherType) ? v.voucherType : VOUCHER_TYPES.JOURNAL,
      narration: v.narration,
      lines: v.lines.map((l) => ({ ...l })),
      errors: [],
      warnings,
    };
  });
  return rows;
}

/**
 * Unique ledger names used on included voucher lines.
 * @param {TallyVoucherRow[]} vouchers
 */
export function voucherLedgerNames(vouchers) {
  const names = new Set();
  for (const v of vouchers) {
    if (!v.include) continue;
    for (const line of v.lines) {
      const n = String(line.ledgerName || '').trim();
      if (n) names.add(n);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Default mapping: Tally name → matching included master or existing book ledger.
 * @param {string[]} names
 * @param {string[]} availableNames
 */
export function defaultLedgerMapping(names, availableNames) {
  const avail = indexKeys(availableNames);
  /** @type {Record<string, string>} */
  const mapping = {};
  for (const name of names) {
    const hit = avail.get(normName(name));
    mapping[name] = hit || '';
  }
  return mapping;
}

/**
 * Names the user can map voucher lines onto (included incoming ledgers + existing if merge).
 * @param {TallyLedgerRow[]} ledgers
 * @param {{ name: string }[]} existingLedgers
 * @param {boolean} replaceChart
 */
export function availableLedgerTargets(ledgers, existingLedgers, replaceChart) {
  const names = [];
  const seen = new Set();
  function add(name) {
    const n = String(name || '').trim();
    if (!n) return;
    const k = normName(n);
    if (seen.has(k)) return;
    seen.add(k);
    names.push(n);
  }
  for (const led of ledgers) {
    if (led.include) add(led.name);
  }
  if (!replaceChart) {
    for (const led of existingLedgers || []) add(led.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/* ── Validation (pure) ──────────────────────────────────── */

/**
 * @param {TallyGroupRow[]} groups
 * @param {TallyLedgerRow[]} ledgers
 * @param {{ replaceChart?: boolean }} [opts]
 */
export function annotateMasters(groups, ledgers, opts = {}) {
  const replaceChart = Boolean(opts.replaceChart);
  const includedGroups = groups.filter((g) => g.include);
  const groupByName = indexByName(includedGroups);

  for (const g of groups) {
    g.errors = [];
    g.warnings = [];
    if (!g.include) {
      g.action = 'skip';
      continue;
    }
    if (!String(g.name || '').trim()) g.errors.push('Name is required');
    const parent = String(g.parent || '').trim();
    if (parent && !groupByName.has(normName(parent))) {
      g.errors.push(`Parent group "${parent}" is missing or not included`);
    }
    if (parent && normName(parent) === normName(g.name)) {
      g.errors.push('Group cannot be its own parent');
    }
    const nature = resolvedNature(g, groupByName);
    if (g.nature && !isNature(g.nature)) {
      g.errors.push('Pick a valid nature (Asset, Liability, Equity, Income, Expense)');
    } else if (!isPrimaryGroup(g) && nature) {
      g.nature = nature;
    }
    if (isPrimaryGroup(g) && !isNature(g.nature)) {
      g.errors.push('Top-level group needs a nature');
    }
    if (g.synthetic) {
      g.warnings.push('Not in the XML — created because a ledger/group points here');
    }
    if (!replaceChart && g.action === 'reuse') {
      g.warnings.push('Matches an existing group — will keep the PicoERP group');
    } else {
      g.action = 'create';
    }
  }

  detectGroupCycles(groups);

  const groupNameCounts = countNames(includedGroups.map((g) => g.name));
  for (const g of includedGroups) {
    if (groupNameCounts.get(normName(g.name)) > 1) {
      g.errors.push('Duplicate group name in this file');
    }
  }

  const includedLedgers = ledgers.filter((l) => l.include);
  for (const led of ledgers) {
    led.errors = [];
    led.warnings = [];
    if (!led.include) {
      led.action = 'skip';
      continue;
    }
    if (!String(led.name || '').trim()) led.errors.push('Name is required');
    const groupName = String(led.group || '').trim();
    if (!groupName) {
      led.errors.push('Parent group is required');
    } else if (!groupByName.has(normName(groupName))) {
      led.errors.push(`Group "${groupName}" is missing or not included`);
    }
    if (led.openingType !== 'debit' && led.openingType !== 'credit') {
      led.errors.push('Opening type must be debit or credit');
    }
    if (!replaceChart && led.action === 'reuse') {
      led.warnings.push('Matches an existing ledger — will keep the PicoERP ledger');
    } else {
      led.action = 'create';
    }
  }

  const ledgerNameCounts = countNames(includedLedgers.map((l) => l.name));
  for (const led of includedLedgers) {
    if (ledgerNameCounts.get(normName(led.name)) > 1) {
      led.errors.push('Duplicate ledger name in this file');
    }
  }

  return { groups, ledgers };
}

/**
 * @param {TallyVoucherRow[]} vouchers
 * @param {Record<string, string>} mapping source name → target ledger name
 * @param {Set<string>} available lowercased target names
 */
export function annotateVouchers(vouchers, mapping, available) {
  for (const v of vouchers) {
    v.errors = [];
    if (!v.include) continue;
    if (!v.date) v.errors.push('Date is missing or not YYYYMMDD / YYYY-MM-DD');
    if (!isKnownVoucherType(v.voucherType)) {
      v.errors.push(`Unknown voucher type "${v.voucherType}"`);
    }
    const activeLines = [];
    for (const line of v.lines) {
      const source = String(line.ledgerName || '').trim();
      const mapped = String(mapping[source] || '').trim() || source;
      const debit = roundMoney(line.debit);
      const credit = roundMoney(line.credit);
      if (!source && debit === 0 && credit === 0) continue;
      if (!mapped) {
        v.errors.push('A line has no ledger');
        continue;
      }
      if (!available.has(normName(mapped))) {
        v.errors.push(`Ledger "${mapped}" is not in the chart (map it below)`);
      }
      if (debit < 0 || credit < 0) v.errors.push('Amounts cannot be negative');
      if (debit === 0 && credit === 0) continue;
      activeLines.push({ debit, credit });
    }
    if (activeLines.length < 2) {
      v.errors.push('Need at least two non-zero lines');
    }
    const debitTotal = roundMoney(activeLines.reduce((s, l) => s + l.debit, 0));
    const creditTotal = roundMoney(activeLines.reduce((s, l) => s + l.credit, 0));
    if (activeLines.length >= 2 && !moneyEquals(debitTotal, creditTotal)) {
      v.errors.push(`Not balanced (Dr ${debitTotal.toFixed(2)} / Cr ${creditTotal.toFixed(2)})`);
    }
  }
  return vouchers;
}

/**
 * @param {TallyGroupRow[]} groups
 * @param {TallyLedgerRow[]} ledgers
 */
export function masterSummary(groups, ledgers) {
  const gInc = groups.filter((g) => g.include);
  const lInc = ledgers.filter((l) => l.include);
  const gErr = gInc.filter((g) => g.errors.length).length;
  const lErr = lInc.filter((l) => l.errors.length).length;
  return {
    groups: gInc.length,
    ledgers: lInc.length,
    groupErrors: gErr,
    ledgerErrors: lErr,
    blocking: gErr + lErr,
    ok: gErr + lErr === 0 && gInc.length + lInc.length > 0,
  };
}

/**
 * @param {TallyVoucherRow[]} vouchers
 */
export function voucherSummary(vouchers) {
  const inc = vouchers.filter((v) => v.include);
  const err = inc.filter((v) => v.errors.length).length;
  const skipped = vouchers.length - inc.length;
  return {
    total: vouchers.length,
    included: inc.length,
    skipped,
    errors: err,
    blocking: err,
    ok: err === 0 && inc.length > 0,
  };
}

/* ── Import (writes) ────────────────────────────────────── */

/**
 * @param {string} bookId
 * @param {TallyGroupRow[]} groups
 * @param {TallyLedgerRow[]} ledgers
 * @param {{
 *   replaceChart: boolean,
 *   onProgress?: (msg: string) => void
 * }} opts
 */
export async function importTallyMasters(bookId, groups, ledgers, opts) {
  const replaceChart = Boolean(opts.replaceChart);
  const result = {
    mode: replaceChart ? 'replace' : 'merge',
    createdGroups: 0,
    createdLedgers: 0,
    reusedGroups: 0,
    reusedLedgers: 0,
    purgedGroups: 0,
    purgedLedgers: 0,
    failed: 0,
    errors: /** @type {string[]} */ ([]),
  };

  if (replaceChart) {
    const existingVouchers = await voucherRepository.findByBook(bookId);
    if (existingVouchers.length > 0) {
      throw new Error(
        `Cannot replace the chart while ${existingVouchers.length} voucher(s) exist. Delete vouchers first.`
      );
    }
    opts.onProgress?.('Removing existing chart of accounts…');
    const purged = await coaService.purgeChartOfAccounts(bookId);
    result.purgedGroups = purged.groups || 0;
    result.purgedLedgers = purged.ledgers || 0;
  }

  const existingGroups = await coaService.listGroups(bookId);
  const existingLedgers = await coaService.listLedgers(bookId);
  /** @type {Map<string, string>} */
  const groupIdByName = new Map();
  for (const g of existingGroups) groupIdByName.set(normName(g.name), g.id);
  /** @type {Map<string, string>} */
  const ledgerIdByName = new Map();
  for (const l of existingLedgers) ledgerIdByName.set(normName(l.name), l.id);

  const toCreateGroups = groups.filter((g) => g.include).sort((a, b) => groupDepth(a, groups) - groupDepth(b, groups));

  let i = 0;
  for (const row of toCreateGroups) {
    i += 1;
    if (i % 20 === 0) {
      opts.onProgress?.(`Importing groups… ${i}/${toCreateGroups.length}`);
      await yieldUi();
    }
    try {
      const key = normName(row.name);
      const existingId = groupIdByName.get(key);
      if (existingId && !replaceChart) {
        result.reusedGroups += 1;
        continue;
      }
      const parentName = String(row.parent || '').trim();
      const parentId = parentName ? groupIdByName.get(normName(parentName)) || null : null;
      if (parentName && !parentId) {
        throw new Error(`Parent group "${parentName}" was not created`);
      }
      const created = await coaService.createGroup({
        bookId,
        name: row.name.trim(),
        nature: isPrimaryGroup(row)
          ? row.nature
          : ACCOUNT_NATURES.ASSET,
        parentId,
        sortOrder: i,
      });
      groupIdByName.set(key, created.id);
      result.createdGroups += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(
        `Group "${row.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const toCreateLedgers = ledgers.filter((l) => l.include);
  i = 0;
  for (const row of toCreateLedgers) {
    i += 1;
    if (i % 20 === 0) {
      opts.onProgress?.(`Importing ledgers… ${i}/${toCreateLedgers.length}`);
      await yieldUi();
    }
    try {
      const key = normName(row.name);
      if (ledgerIdByName.has(key) && !replaceChart) {
        result.reusedLedgers += 1;
        continue;
      }
      const groupId = groupIdByName.get(normName(row.group));
      if (!groupId) throw new Error(`Group "${row.group}" not found`);
      const notes = row.guid ? `${TALLY_TAG}${row.guid}` : '';
      const created = await coaService.createLedger({
        bookId,
        groupId,
        name: row.name.trim(),
        openingBalance: roundMoney(row.opening),
        openingBalanceType: row.openingType,
        notes,
      });
      ledgerIdByName.set(key, created.id);
      result.createdLedgers += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(
        `Ledger "${row.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (replaceChart) {
    try {
      opts.onProgress?.('Ensuring inventory and tax system ledgers…');
      await (await import('./inventoryService.js')).ensureInventoryMasters(bookId);
      await (await import('./taxService.js')).ensureTaxMasters(bookId);
    } catch (err) {
      result.errors.push(
        `System masters: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  opts.onProgress?.(
    `Chart done — ${result.createdGroups} groups, ${result.createdLedgers} ledgers`
  );
  return result;
}

/**
 * @param {string} bookId
 * @param {TallyVoucherRow[]} vouchers
 * @param {Record<string, string>} mapping
 * @param {{ onProgress?: (msg: string, done?: number, total?: number) => void }} [opts]
 */
export async function importTallyVouchers(bookId, vouchers, mapping, opts = {}) {
  const book = await bookService.getBook(bookId);
  if (!book) throw new Error('Book not found');

  const ledgers = await coaService.listLedgers(bookId);
  /** @type {Map<string, string>} */
  const ledgerIdByName = new Map();
  for (const l of ledgers) ledgerIdByName.set(normName(l.name), l.id);

  const existingGuids = await loadImportedGuids(bookId);

  const result = {
    created: 0,
    failed: 0,
    skipped: 0,
    errors: /** @type {string[]} */ ([]),
  };

  const rows = vouchers.filter((v) => v.include);
  const total = rows.length;
  /** @type {Map<string, string>} */
  const fyCache = new Map();
  let index = 0;

  for (const row of rows) {
    index += 1;
    if (index % 10 === 0 || index === total) {
      opts.onProgress?.(`Importing vouchers… ${index}/${total}`, index, total);
      await yieldUi();
    }
    try {
      if (row.guid && existingGuids.has(row.guid)) {
        result.skipped += 1;
        continue;
      }
      const lines = [];
      for (const line of row.lines) {
        const source = String(line.ledgerName || '').trim();
        const mapped = String(mapping[source] || '').trim() || source;
        const debit = roundMoney(line.debit);
        const credit = roundMoney(line.credit);
        if (!mapped || (debit === 0 && credit === 0)) continue;
        const ledgerId = ledgerIdByName.get(normName(mapped));
        if (!ledgerId) throw new Error(`Ledger "${mapped}" not found in the book`);
        lines.push({
          ledgerId,
          debit,
          credit,
          taxCodeId: null,
          costCenterId: null,
          narration: '',
        });
      }

      let fyId = fyCache.get(row.date);
      if (!fyId) {
        const fy = await ensureFyForDate(bookId, row.date, book.fyStartMonth || 4);
        fyId = fy.id;
        fyCache.set(row.date, fyId);
      }

      const tag = row.guid ? `${TALLY_VCH_TAG}${row.guid}` : '';
      const body = String(row.narration || '').trim();
      const narration = tag ? (body ? `${body.slice(0, 420)}\n${tag}` : tag) : body;

      await voucherService.createVoucher({
        bookId,
        financialYearId: fyId,
        voucherType: row.voucherType,
        voucherNumber: String(row.number || '').trim() || undefined,
        date: row.date,
        narration,
        lines,
      });
      result.created += 1;
      if (row.guid) existingGuids.add(row.guid);
    } catch (err) {
      result.failed += 1;
      if (result.errors.length < 40) {
        const label = row.number || row.guid || row.date || `#${index}`;
        result.errors.push(
          `${label} (${row.date}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  opts.onProgress?.(`Vouchers done — ${result.created} created`, total, total);
  return result;
}

/**
 * @param {string} bookId
 */
export async function loadImportedGuids(bookId) {
  const vouchers = await voucherRepository.findByBook(bookId);
  const set = new Set();
  for (const v of vouchers) {
    const m = String(v.narration || '').match(/(?:^|\n)tally-vch:([^\n\r]+)/i);
    if (m) set.add(m[1].trim());
  }
  return set;
}

/* ── Internals ──────────────────────────────────────────── */

function yieldUi() {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * @param {string} bookId
 * @param {string} dateIso
 * @param {number} fyStartMonth
 */
async function ensureFyForDate(bookId, dateIso, fyStartMonth = 4) {
  const years = await financialYearRepository.findByBook(bookId);
  const hit = years.find((y) => y.startDate <= dateIso && y.endDate >= dateIso);
  if (hit) return hit;

  const d = new Date(`${dateIso}T12:00:00`);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const startYear = month >= fyStartMonth ? year : year - 1;
  const startDate = `${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`;
  const end = new Date(startYear + 1, fyStartMonth - 1, 1);
  end.setDate(end.getDate() - 1);
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
    end.getDate()
  ).padStart(2, '0')}`;

  const now = nowIso();
  const fy = {
    id: uuid(),
    bookId,
    name: suggestFyLabel(new Date(`${startDate}T12:00:00`)),
    startDate,
    endDate,
    isActive: false,
    isClosed: false,
    createdAt: now,
  };
  await financialYearRepository.create(fy);
  return fy;
}

/**
 * @param {Element} root
 * @param {string} tag
 */
function byTag(root, tag) {
  return [...root.getElementsByTagName(tag)];
}

/**
 * @param {Element} el
 * @param {string} tag
 */
function childText(el, tag) {
  for (const child of el.children) {
    if (child.tagName === tag) return (child.textContent || '').trim();
  }
  return '';
}

/**
 * @param {Element} el
 */
function elementName(el) {
  return (
    cleanTallyName(el.getAttribute('NAME') || '') ||
    cleanTallyName(childText(el, 'NAME'))
  );
}

/**
 * @param {string} v
 */
function isYes(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

/**
 * @param {string} raw
 */
export function parseTallyDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const compact = s.replace(/[^\d]/g, '');
  if (/^\d{8}$/.test(compact) && compact === s.replace(/\s/g, '')) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}

/**
 * @param {string} raw
 */
function parseOpening(raw) {
  const s = String(raw || '').trim();
  if (!s) return { amount: 0, type: /** @type {'debit'|'credit'} */ ('debit') };
  const cr = /\bcr\b/i.test(s);
  const dr = /\bdr\b/i.test(s);
  const n = parseTallyAmount(s);
  if (cr) return { amount: Math.abs(n), type: 'credit' };
  if (dr) return { amount: Math.abs(n), type: 'debit' };
  if (n < 0) return { amount: Math.abs(n), type: 'credit' };
  return { amount: n, type: 'debit' };
}

/**
 * @param {string} raw
 */
function parseTallyAmount(raw) {
  let s = String(raw || '').trim();
  if (!s) return 0;
  s = s.replace(/,/g, '').replace(/[^\d.\-()]/g, '');
  if (s.startsWith('(') && s.endsWith(')')) {
    s = `-${s.slice(1, -1)}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

/**
 * @param {Element} voucherEl
 */
function collectVoucherLines(voucherEl) {
  /** @type {{ ledgerName: string, debit: number, credit: number }[]} */
  const lines = [];
  const ledgerLists = [
    ...byTag(voucherEl, 'ALLLEDGERENTRIES.LIST'),
    ...byTag(voucherEl, 'LEDGERENTRIES.LIST'),
  ];
  const inventoryAllocations = [...byTag(voucherEl, 'INVENTORYENTRIES.LIST')].flatMap((inv) =>
    byTag(inv, 'ACCOUNTINGALLOCATIONS.LIST')
  );
  const lists = ledgerLists.length
    ? [...ledgerLists, ...inventoryAllocations]
    : byTag(voucherEl, 'ACCOUNTINGALLOCATIONS.LIST');
  for (const entry of lists) {
    const ledgerName = cleanTallyName(childText(entry, 'LEDGERNAME'));
    if (!ledgerName) continue;
    const amount = parseTallyAmount(childText(entry, 'AMOUNT'));
    const deemed = childText(entry, 'ISDEEMEDPOSITIVE');
    let debit = 0;
    let credit = 0;
    if (deemed) {
      const abs = Math.abs(amount);
      if (isYes(deemed)) debit = abs;
      else credit = abs;
    } else if (amount < 0) {
      debit = Math.abs(amount);
    } else if (amount > 0) {
      credit = amount;
    }
    if (debit === 0 && credit === 0) continue;
    lines.push({ ledgerName, debit, credit });
  }
  return lines;
}

/**
 * @param {string} tallyType
 */
function mapVoucherType(tallyType) {
  const key = normName(tallyType);
  if (TALLY_VOUCHER_TYPE[key]) return TALLY_VOUCHER_TYPE[key];
  if (SKIP_TYPE_SET.has(key)) return VOUCHER_TYPES.JOURNAL;
  return VOUCHER_TYPES.JOURNAL;
}

/**
 * @param {RawTallyGroup} group
 * @param {Map<string, RawTallyGroup>} byName
 */
function inferGroupNature(group, byName) {
  const direct =
    TALLY_GROUP_NATURE[normName(group.name)] ||
    TALLY_GROUP_NATURE[normName(group.reserved)];
  if (direct) return direct;
  let parent = group.parent;
  const seen = new Set();
  while (parent && !isPrimaryParent(parent)) {
    const key = normName(parent);
    if (seen.has(key)) break;
    seen.add(key);
    const mapped = TALLY_GROUP_NATURE[key];
    if (mapped) return mapped;
    parent = byName.get(key)?.parent || '';
  }
  return '';
}

/**
 * @param {TallyGroupRow} group
 */
function isPrimaryGroup(group) {
  return !String(group.parent || '').trim();
}

/**
 * @param {string} nature
 */
function isNature(nature) {
  return NATURE_ORDER.includes(nature);
}

/**
 * @param {TallyGroupRow} group
 * @param {Map<string, TallyGroupRow>} byName
 */
function resolvedNature(group, byName) {
  if (isNature(group.nature) && isPrimaryGroup(group)) return group.nature;
  const parent = String(group.parent || '').trim();
  if (!parent) return isNature(group.nature) ? group.nature : '';
  const p = byName.get(normName(parent));
  if (!p) return isNature(group.nature) ? group.nature : '';
  return resolvedNature(p, byName) || (isNature(group.nature) ? group.nature : '');
}

/**
 * @param {TallyGroupRow} group
 * @param {TallyGroupRow[]} all
 */
function groupDepth(group, all) {
  const byName = indexByName(all);
  let depth = 0;
  let parent = group.parent;
  const seen = new Set();
  while (parent) {
    const key = normName(parent);
    if (seen.has(key)) return 99;
    seen.add(key);
    depth += 1;
    parent = byName.get(key)?.parent || '';
  }
  return depth;
}

/**
 * @param {TallyGroupRow[]} groups
 */
function detectGroupCycles(groups) {
  const byName = indexByName(groups.filter((g) => g.include));
  for (const g of groups) {
    if (!g.include) continue;
    const seen = new Set();
    let parent = g.parent;
    while (parent) {
      const key = normName(parent);
      if (normName(g.name) === key) {
        g.errors.push('Parent chain loops back to this group');
        break;
      }
      if (seen.has(key)) break;
      seen.add(key);
      parent = byName.get(key)?.parent || '';
    }
  }
}

/**
 * @param {{ name: string }[]} rows
 * @returns {Map<string, any>}
 */
function indexByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normName(row.name);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

/**
 * @param {string[]} names
 */
function indexKeys(names) {
  const map = new Map();
  for (const name of names) {
    const key = normName(name);
    if (key && !map.has(key)) map.set(key, name);
  }
  return map;
}

/**
 * @param {string[]} names
 */
function countNames(names) {
  const map = new Map();
  for (const name of names) {
    const key = normName(name);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}
