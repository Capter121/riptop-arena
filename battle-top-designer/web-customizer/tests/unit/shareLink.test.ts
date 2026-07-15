import { describe, expect, it, vi } from 'vitest';
import { copyShareLink } from '../../src/sharing/shareLink';

describe('share link clipboard handling', () => {
  it('reports successful local clipboard writes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyShareLink('https://example.test/', { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.test/');
  });

  it('returns false so the UI can provide manual copy fallback', async () => {
    expect(await copyShareLink('https://example.test/', { writeText: vi.fn().mockRejectedValue(new Error('denied')) })).toBe(false);
    expect(await copyShareLink('https://example.test/', undefined)).toBe(false);
  });
});
