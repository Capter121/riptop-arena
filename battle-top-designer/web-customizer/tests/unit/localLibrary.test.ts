import { describe, expect, it } from 'vitest';
import { enumerateCombinations, stormAttack } from '../../src/domain';
import {
  addRecent, emptyLibrary, normalizeNickname, parseLibrary, removeFavorite, setNickname,
  toggleFavorite, writeLibrary,
} from '../../src/library/localLibrary';

describe('versioned local combination library', () => {
  it('normalizes optional nicknames without changing technical identity', () => {
    expect(normalizeNickname('  My\n  Combo\u0000  ')).toBe('My Combo');
    expect(normalizeNickname('x'.repeat(60))).toHaveLength(40);
    expect(normalizeNickname('   ')).toBeUndefined();
  });

  it('deduplicates recent entries, orders newest first, and caps at 12', () => {
    let library = emptyLibrary();
    enumerateCombinations().slice(0, 14).forEach((combination, index) => {
      library = addRecent(library, combination, `2026-07-15T00:00:${String(index).padStart(2, '0')}Z`);
    });
    expect(library.recent).toHaveLength(12);
    expect(library.recent[0].combination).toEqual(enumerateCombinations()[13]);
    library = addRecent(library, enumerateCombinations()[5], '2026-07-15T00:01:00Z');
    expect(library.recent[0].combination).toEqual(enumerateCombinations()[5]);
    expect(new Set(library.recent.map(entry => entry.id)).size).toBe(12);
  });

  it('adds, renames, and removes unique favorites without changing IDs', () => {
    let library = toggleFavorite(emptyLibrary(), stormAttack, '2026-07-15T00:00:00Z');
    expect(library.favorites).toHaveLength(1);
    const id = library.favorites[0].id;
    library = setNickname(library, id, '  Alpha  ');
    expect(library.favorites[0]).toMatchObject({ id, nickname: 'Alpha' });
    library = removeFavorite(library, id);
    expect(library.favorites).toEqual([]);
  });

  it('isolates malformed data and storage denial', () => {
    expect(parseLibrary('{broken')).toEqual(emptyLibrary());
    expect(parseLibrary(JSON.stringify({ schemaVersion: 99 }))).toEqual(emptyLibrary());
    expect(writeLibrary(emptyLibrary(), { setItem: () => { throw new Error('denied'); } })).toBe(false);
  });
});
