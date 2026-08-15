import type { ImageCropConfig } from '../components/image-crop-modal/image-crop-modal.component';

export const COVER_ASPECT_RATIO = 2 / 3;
export const COVER_ASPECT_RATIO_TOLERANCE = 0.01;

export const COVER_CROP_CONFIG: ImageCropConfig = {
  aspectRatio: COVER_ASPECT_RATIO,
  outputWidth: 600,
  format: 'image/webp',
  quality: 0.9,
};

interface ImageDimensions {
  width: number;
  height: number;
}

export function matchesCoverAspectRatio({ width, height }: ImageDimensions): boolean {
  if (width <= 0 || height <= 0) return false;

  const imageAspectRatio = width / height;
  return (
    Math.abs(imageAspectRatio - COVER_ASPECT_RATIO) / COVER_ASPECT_RATIO <=
    COVER_ASPECT_RATIO_TOLERANCE + Number.EPSILON
  );
}

export function loadImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    const releaseImageUrl = (): void => URL.revokeObjectURL(imageUrl);

    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      releaseImageUrl();

      if (dimensions.width <= 0 || dimensions.height <= 0) {
        reject(new Error('The selected image has invalid dimensions.'));
        return;
      }

      resolve(dimensions);
    };
    image.onerror = () => {
      releaseImageUrl();
      reject(new Error('The selected image could not be loaded.'));
    };
    image.src = imageUrl;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('The selected image could not be read.'));
    };
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });
}
