import values from './data/concept-attributes.json';
import { families, type Combination } from './domain';

export const attributeNames = ['attack', 'defense', 'stamina', 'balance', 'weight', 'height'] as const;
export type Attributes = Record<(typeof attributeNames)[number], number>;

export function conceptAttributes(combination: Combination): Attributes {
  const rows = families.map(family => (values as Record<string, number[]>)[combination[family]]);
  if (rows.some(row => !row || row.length !== attributeNames.length)) throw new Error('Concept attribute data is incomplete.');
  return Object.fromEntries(attributeNames.map((name, index) => [
    name,
    Math.round(rows.reduce((total, row) => total + row[index], 0) / rows.length),
  ])) as Attributes;
}
