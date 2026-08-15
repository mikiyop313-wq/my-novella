import type { ImageCropConfig } from '../../../shared/components/image-crop-modal/image-crop-modal.component';

export const CODEX_IMAGE_ASPECT_RATIO = 1;

export const CODEX_IMAGE_CROP_CONFIG: ImageCropConfig = {
  aspectRatio: CODEX_IMAGE_ASPECT_RATIO,
  outputWidth: 520,
  format: 'image/webp',
  quality: 0.9,
};
