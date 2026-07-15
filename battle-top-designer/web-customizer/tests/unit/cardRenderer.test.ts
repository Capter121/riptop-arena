import { describe, expect, it } from 'vitest';
import { flipPixelsVertically, validateCardInput } from '../../src/sharing/cardRenderer';
import { stormAttack } from '../../src/domain';

describe('combination card renderer', () => {
  it('flips WebGL rows without changing channel order', () => {
    const source = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8,
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect([...flipPixelsVertically(source, 2, 2)]).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16,
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('requires exact scene pixels and a canonical share URL', () => {
    expect(validateCardInput({ combination: stormAttack, shareUrl: 'https://example.test/?combo=nss-p2c-0138', sceneWidth: 2, sceneHeight: 2, pixels: new Uint8Array(16) })).toEqual([]);
    expect(validateCardInput({ combination: stormAttack, shareUrl: 'https://example.test/', sceneWidth: 2, sceneHeight: 2, pixels: new Uint8Array(15) })).toEqual(['PIXEL_LENGTH', 'SHARE_URL']);
  });
});
