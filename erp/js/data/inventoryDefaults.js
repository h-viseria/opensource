/**
 * Default inventory masters seeded per book.
 */

/** @type {{ name: string, code: string, symbol: string }[]} */
export const DEFAULT_UNITS = [
  { name: 'Numbers', code: 'NOS', symbol: 'Nos' },
  { name: 'Kilogram', code: 'KG', symbol: 'Kg' },
  { name: 'Litre', code: 'LTR', symbol: 'L' },
  { name: 'Box', code: 'BOX', symbol: 'Box' },
  { name: 'Meter', code: 'MTR', symbol: 'm' },
];

/** @type {{ name: string, code: string }[]} */
export const DEFAULT_CATEGORIES = [
  { name: 'General', code: 'GEN' },
  { name: 'Raw Material', code: 'RM' },
  { name: 'Finished Goods', code: 'FG' },
];

export const DEFAULT_WAREHOUSE = {
  name: 'Main Warehouse',
  code: 'MAIN',
};
