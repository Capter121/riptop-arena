import QRCode from 'qrcode';

export interface QrMatrix {
  content: string;
  margin: 4;
  size: number;
  modules: boolean[];
}

export function createQrMatrix(content: string): QrMatrix {
  const code = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const modules = Array.from({ length: code.modules.size * code.modules.size }, (_, index) => (
    Boolean(code.modules.get(Math.floor(index / code.modules.size), index % code.modules.size))
  ));
  return { content, margin: 4, size: code.modules.size, modules };
}

export function createQrSvg(content: string): string {
  const matrix = createQrMatrix(content);
  const extent = matrix.size + matrix.margin * 2;
  const path = matrix.modules.flatMap((dark, index) => {
    if (!dark) return [];
    const x = index % matrix.size + matrix.margin;
    const y = Math.floor(index / matrix.size) + matrix.margin;
    return `M${x} ${y}h1v1h-1z`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export function qrPixels(matrix: QrMatrix, scale: number): { data: Uint8ClampedArray; width: number; height: number } {
  const moduleCount = matrix.size + matrix.margin * 2;
  const width = moduleCount * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / scale) - matrix.margin;
      const moduleY = Math.floor(y / scale) - matrix.margin;
      const dark = moduleX >= 0 && moduleY >= 0 && moduleX < matrix.size && moduleY < matrix.size
        ? matrix.modules[moduleY * matrix.size + moduleX]
        : false;
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = dark ? 0 : 255;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height: width };
}
