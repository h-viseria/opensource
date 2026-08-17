/**
 * Seed currencies, default category tree, and optional sample people/tags.
 */

import { ACCOUNT_TYPES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { CURRENCY_DECIMALS } from '../utils/money.js';

export const DEFAULT_CURRENCIES = Object.freeze(
  Object.entries(CURRENCY_DECIMALS).map(([code, decimals]) => ({
    code,
    name: code,
    decimals,
    active: true,
  }))
);

/**
 * Hierarchical default categories. kind: expense | income | transfer
 */
export const DEFAULT_CATEGORY_TREE = Object.freeze([
  {
    name: 'Housing',
    color: '#2F6F6A',
    icon: 'home',
    children: ['Rent', 'Electricity', 'Water', 'Internet', 'Maintenance'],
  },
  {
    name: 'Food',
    color: '#C44536',
    icon: 'food',
    children: ['Groceries', 'Restaurants', 'Delivery', 'Coffee', 'Snacks'],
  },
  {
    name: 'Transport',
    color: '#3D5A80',
    icon: 'car',
    children: ['Fuel', 'Taxi', 'Public Transport', 'Parking', 'Maintenance', 'Insurance'],
  },
  {
    name: 'Family',
    color: '#6B4C9A',
    icon: 'family',
    children: ['Education', 'Medical', 'Clothing', 'Gifts'],
  },
  {
    name: 'Shopping',
    color: '#B08968',
    icon: 'bag',
    children: ['Electronics', 'Clothing', 'Household', 'Other'],
  },
  {
    name: 'Health',
    color: '#2A9D8F',
    icon: 'health',
    children: ['Pharmacy', 'Doctor', 'Insurance'],
  },
  {
    name: 'Entertainment',
    color: '#E9C46A',
    icon: 'play',
    children: ['Streaming', 'Movies', 'Hobbies'],
  },
  {
    name: 'Personal Care',
    color: '#E07A5F',
    icon: 'care',
    children: ['Salon', 'Gym'],
  },
  {
    name: 'Subscriptions',
    color: '#457B9D',
    icon: 'repeat',
    children: ['Software', 'Memberships'],
  },
  {
    name: 'Travel',
    color: '#1D3557',
    icon: 'globe',
    children: ['Flights', 'Hotels', 'Local'],
  },
  {
    name: 'Income',
    color: '#2D6A4F',
    icon: 'in',
    kind: 'income',
    children: ['Salary', 'Bonus', 'Interest', 'Other income'],
  },
  {
    name: 'Transfer',
    color: '#6D7570',
    icon: 'swap',
    kind: 'transfer',
    children: ['Account transfer', 'Credit card payment', 'Cash'],
  },
]);

export const DEFAULT_PEOPLE = Object.freeze([
  { name: 'Self', relationship: 'self' },
  { name: 'Spouse', relationship: 'spouse' },
  { name: 'Child', relationship: 'child' },
  { name: 'Parent', relationship: 'parent' },
]);

export const DEFAULT_TAGS = Object.freeze([
  'Vacation',
  'India',
  'UAE',
  'Family',
  'Business',
  'Education',
  'Tax',
  'Reimbursable',
  'One-Time',
]);

export const DEFAULT_RULES = Object.freeze([
  { pattern: 'carrefour', categoryName: 'Groceries' },
  { pattern: 'lulu', categoryName: 'Groceries' },
  { pattern: 'adnoc', categoryName: 'Fuel' },
  { pattern: 'enoc', categoryName: 'Fuel' },
  { pattern: 'uber', categoryName: 'Taxi' },
  { pattern: 'careem', categoryName: 'Taxi' },
  { pattern: 'netflix', categoryName: 'Streaming' },
  { pattern: 'amazon', categoryName: 'Shopping' },
  { pattern: 'spinneys', categoryName: 'Groceries' },
]);

export const ACCOUNT_TYPE_LABELS = Object.freeze({
  [ACCOUNT_TYPES.BANK]: 'Bank account',
  [ACCOUNT_TYPES.SAVINGS]: 'Savings account',
  [ACCOUNT_TYPES.CURRENT]: 'Current account',
  [ACCOUNT_TYPES.CASH]: 'Cash',
  [ACCOUNT_TYPES.WALLET]: 'Wallet',
  [ACCOUNT_TYPES.DEBIT_CARD]: 'Debit card',
  [ACCOUNT_TYPES.CREDIT_CARD]: 'Credit card',
  [ACCOUNT_TYPES.PREPAID]: 'Prepaid card',
  [ACCOUNT_TYPES.OTHER_ASSET]: 'Other asset',
  [ACCOUNT_TYPES.OTHER_LIABILITY]: 'Other liability',
});

/**
 * @param {string} name
 */
export function normalizeMerchantName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export { uuid };
