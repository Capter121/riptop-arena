import { useMemo } from 'react';
import { createQrSvg } from './qrCode';

export function QrCodeView({ content }: { content: string }) {
  const svg = useMemo(() => createQrSvg(content), [content]);
  return <div className="share-qr" role="img" aria-label="QR code for the current combination link" dangerouslySetInnerHTML={{ __html: svg }} />;
}
