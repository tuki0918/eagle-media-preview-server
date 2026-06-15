declare module "qrcode-generator" {
  export default function qrcodeFactory(typeNumber: number, errorCorrectionLevel: string): {
    addData(value: string): void;
    createSvgTag(options: { alt: string; cellSize: number; margin: number; scalable: boolean }): string;
    make(): void;
  };
}
