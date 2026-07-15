import { conceptAttributes } from '../attributes';
import { combinationId, families, partById, type Combination } from '../domain';
import { createQrMatrix } from './qrCode';

export interface CardInput {
  combination: Combination;
  shareUrl: string;
  sceneWidth: number;
  sceneHeight: number;
  pixels: Uint8Array | Uint8ClampedArray;
}

export function flipPixelsVertically(source: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(source.length);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    result.set(source.subarray(row * rowBytes, (row + 1) * rowBytes), (height - row - 1) * rowBytes);
  }
  return result;
}

export function validateCardInput(input: CardInput): string[] {
  const errors: string[] = [];
  if (input.pixels.length !== input.sceneWidth * input.sceneHeight * 4) errors.push('PIXEL_LENGTH');
  try {
    const url = new URL(input.shareUrl);
    if (url.searchParams.get('combo') !== combinationId(input.combination)) errors.push('SHARE_URL');
  } catch {
    errors.push('SHARE_URL');
  }
  return errors;
}

function drawQr(context: CanvasRenderingContext2D, content: string, x: number, y: number, size: number) {
  const matrix = createQrMatrix(content);
  const extent = matrix.size + matrix.margin * 2;
  const scale = size / extent;
  context.fillStyle = '#fff';
  context.fillRect(x, y, size, size);
  context.fillStyle = '#05070b';
  matrix.modules.forEach((dark, index) => {
    if (!dark) return;
    const moduleX = index % matrix.size + matrix.margin;
    const moduleY = Math.floor(index / matrix.size) + matrix.margin;
    context.fillRect(x + moduleX * scale, y + moduleY * scale, Math.ceil(scale), Math.ceil(scale));
  });
}

export async function renderCombinationCard(input: CardInput): Promise<Blob> {
  const errors = validateCardInput(input);
  if (errors.length) throw new Error(`Invalid combination card input: ${errors.join(',')}`);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');

  context.fillStyle = '#070a11';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = input.sceneWidth;
  sceneCanvas.height = input.sceneHeight;
  const sceneContext = sceneCanvas.getContext('2d');
  if (!sceneContext) throw new Error('Scene canvas is unavailable.');
  const imagePixels = new Uint8ClampedArray(input.sceneWidth * input.sceneHeight * 4);
  imagePixels.set(flipPixelsVertically(input.pixels, input.sceneWidth, input.sceneHeight));
  sceneContext.putImageData(new ImageData(imagePixels, input.sceneWidth, input.sceneHeight), 0, 0);
  context.drawImage(sceneCanvas, 0, 0, 720, 630);

  const fade = context.createLinearGradient(560, 0, 760, 0);
  fade.addColorStop(0, '#070a1100');
  fade.addColorStop(1, '#070a11');
  context.fillStyle = fade;
  context.fillRect(560, 0, 220, 630);

  context.font = '800 18px system-ui, sans-serif';
  context.fillStyle = '#ffbd35';
  context.fillText('NOVA SPIN SYSTEM', 760, 45);
  context.font = '700 28px system-ui, sans-serif';
  context.fillStyle = '#f5f7fb';
  context.fillText('Combination Card', 760, 84);
  context.font = '600 15px ui-monospace, monospace';
  context.fillStyle = '#8edfff';
  context.fillText(combinationId(input.combination), 760, 115);

  context.font = '600 15px system-ui, sans-serif';
  let y = 155;
  for (const family of families) {
    context.fillStyle = '#8e99ae';
    context.fillText(family.toUpperCase(), 760, y);
    context.fillStyle = '#f5f7fb';
    context.fillText(partById.get(input.combination[family])!.displayName, 850, y);
    y += 31;
  }

  const attributes = conceptAttributes(input.combination);
  const labels = { attack: 'ATTACK', defense: 'DEFENSE', stamina: 'STAMINA', balance: 'BALANCE', weight: '重量倾向', height: '高度倾向' } as const;
  y = 350;
  context.font = '600 13px system-ui, sans-serif';
  for (const [name, value] of Object.entries(attributes)) {
    context.fillStyle = '#9ba6ba';
    context.fillText(labels[name as keyof typeof labels], 760, y);
    context.fillStyle = '#252c3b';
    context.fillRect(850, y - 10, 170, 7);
    context.fillStyle = '#59d6ff';
    context.fillRect(850, y - 10, 170 * value / 100, 7);
    context.fillStyle = '#f5f7fb';
    context.fillText(String(value), 1035, y);
    y += 27;
  }

  drawQr(context, input.shareUrl, 1030, 438, 140);
  context.font = '500 12px system-ui, sans-serif';
  context.fillStyle = '#ffcf75';
  context.fillText('Concept attributes for prototype use only.', 760, 555);
  context.fillStyle = '#8e99ae';
  context.fillText('Human visual review remains pending.', 760, 580);
  context.fillText('Internal demonstrable prototype — not manufacturing or battle safety approval.', 760, 603);

  return new Promise((resolve, reject) => canvas.toBlob(blob => (
    blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))
  ), 'image/png'));
}
