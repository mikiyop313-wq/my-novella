import type { ImageCropConfig } from '../components/image-crop-modal/image-crop-modal.component';
import {
  IMAGE_ASPECT_RATIO_TOLERANCE,
  matchesImageAspectRatio,
  type ImageDimensions,
} from './image-upload';

export { fileToDataUrl, loadImageDimensions } from './image-upload';

export const COVER_ASPECT_RATIO = 2 / 3;
export const COVER_ASPECT_RATIO_TOLERANCE = IMAGE_ASPECT_RATIO_TOLERANCE;

export const COVER_CROP_CONFIG: ImageCropConfig = {
  aspectRatio: COVER_ASPECT_RATIO,
  outputWidth: 600,
  format: 'image/webp',
  quality: 0.9,
};

export function matchesCoverAspectRatio({ width, height }: ImageDimensions): boolean {
  return matchesImageAspectRatio({
    dimensions: { width, height },
    aspectRatio: COVER_ASPECT_RATIO,
    tolerance: COVER_ASPECT_RATIO_TOLERANCE,
  });
}
