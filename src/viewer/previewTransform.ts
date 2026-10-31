import { IMAGE_FIT_MARGIN } from "./constants";
import { clamp } from "./format";
import type { PreviewPoint, PreviewTransform } from "./types";

export const MAX_PREVIEW_SCALE = 8;

export interface PreviewScales {
  fitScale: number;
  naturalScale: number;
  transform: PreviewTransform;
}

export function initialPreviewScales(): PreviewScales {
  return {
    fitScale: 1,
    naturalScale: 1,
    transform: { scale: 1, x: 0, y: 0 },
  };
}

export function nextPreviewScales({
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  previousFitScale,
  previousTransform,
}: {
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  previousFitScale: number;
  previousTransform: PreviewTransform;
}): PreviewScales {
  const widthRatio = viewportWidth / imageWidth;
  const heightRatio = viewportHeight / imageHeight;
  const fitScale = Math.min(widthRatio, heightRatio) * IMAGE_FIT_MARGIN;
  const naturalScale = 1;
  const keepFitted = Math.abs(previousTransform.scale - previousFitScale) < 0.01;
  const transform = keepFitted || previousTransform.scale === 1
    ? { scale: fitScale, x: 0, y: 0 }
    : previousTransform;
  return { fitScale, naturalScale, transform };
}

export function minimumPreviewScale(fitScale: number, naturalScale: number) {
  return Math.max(0.05, Math.min(fitScale, naturalScale) * 0.5);
}

export function nextZoomScale(currentScale: number, multiplier: number, fitScale: number, naturalScale: number) {
  return clamp(currentScale * multiplier, minimumPreviewScale(fitScale, naturalScale), MAX_PREVIEW_SCALE);
}

export function setPreviewZoom(scale: number, position: Pick<PreviewTransform, "x" | "y">): PreviewTransform {
  return {
    scale,
    x: position.x,
    y: position.y,
  };
}

export function dragPreviewTransform(
  transform: PreviewTransform,
  drag: { startX: number; startY: number; originX: number; originY: number },
  point: PreviewPoint,
): PreviewTransform {
  return {
    ...transform,
    x: drag.originX + point.x - drag.startX,
    y: drag.originY + point.y - drag.startY,
  };
}

export function pointerDistance(points: Iterable<PreviewPoint>) {
  const [first, second] = [...points];
  if (!first || !second) return 0;
  return Math.hypot(first.x - second.x, first.y - second.y);
}
