import { useEffect, useMemo } from 'react';
import { createQrSvg } from './qrCode';

export function QrCodeView({ content, onReady }: { content: string; onReady?: () => void }) {
  const svg = useMemo(() => createQrSvg(content), [content]);
  useEffect(() => { onReady?.(); }, [onReady, svg]);
  return <div className="share-qr" role="img" aria-label="QR code for the current combination link" dangerouslySetInnerHTML={{ __html: svg }} />;
}
