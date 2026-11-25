import qrcodeFactory from "qrcode-generator";

interface QrCodeFactoryResult {
  addData(value: string): void;
  createSvgTag(options: { alt: string; cellSize: number; margin: number; scalable: boolean }): string;
  make(): void;
}

export function createQrDataUrl(value: string) {
  const qr = qrcodeFactory(0, "M") as QrCodeFactoryResult;
  qr.addData(value);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: value });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
