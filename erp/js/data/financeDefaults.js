/**
 * Default personal-finance goal templates (spec §8).
 */

import { GOAL_CATEGORIES } from '../core/constants.js';

/** @type {{ name: string, category: string, targetAmount: number }[]} */
export const DEFAULT_GOAL_TEMPLATES = [
  { name: 'Emergency Fund', category: GOAL_CATEGORIES.EMERGENCY, targetAmount: 300000 },
  { name: 'Retirement Nest Egg', category: GOAL_CATEGORIES.RETIREMENT, targetAmount: 5000000 },
  { name: 'Education Fund', category: GOAL_CATEGORIES.EDUCATION, targetAmount: 1000000 },
  { name: 'Vacation', category: GOAL_CATEGORIES.VACATION, targetAmount: 100000 },
  { name: 'House Purchase', category: GOAL_CATEGORIES.HOUSE, targetAmount: 2000000 },
];
