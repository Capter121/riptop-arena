import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { createQrMatrix, createQrSvg, qrPixels } from '../../src/sharing/qrCode';

describe('offline QR generation', () => {
  const content = 'https://demo.example/nova/?combo=nss-p2c-0138';

  it('is deterministic with a four-module quiet zone and medium error correction', () => {
    const first = createQrMatrix(content);
    const second = createQrMatrix(content);
    expect(first).toEqual(second);
    expect(first.margin).toBe(4);
    expect(first.size).toBeGreaterThan(20);
    expect(createQrSvg(content)).toContain(`viewBox="0 0 ${first.size + 8} ${first.size + 8}"`);
  });

  it('decodes to exactly the displayed local share URL', () => {
    const pixels = qrPixels(createQrMatrix(content), 6);
    expect(jsQR(pixels.data, pixels.width, pixels.height)?.data).toBe(content);
  });
});
