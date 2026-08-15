export const IMAGE_ASPECT_RATIO_TOLERANCE = 0.01;

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ImageUploadResult =
  | { kind: 'ready'; dataUrl: string }
  | { kind: 'crop'; file: File };

interface PrepareImageUploadOptions {
  file: File;
  aspectRatio: number;
  tolerance?: number;
}

export async function prepareImageUpload({
  file,
  aspectRatio,
  tolerance = IMAGE_ASPECT_RATIO_TOLERANCE,
}: PrepareImageUploadOptions): Promise<ImageUploadResult | null> {
  if (!file.type.startsWith('image/')) return null;

  const dimensions = await loadImageDimensions(file);
  if (!matchesImageAspectRatio({ dimensions, aspectRatio, tolerance })) {
    return { kind: 'crop', file };
  }

  return { kind: 'ready', dataUrl: await fileToDataUrl(file) };
}

export function matchesImageAspectRatio({
  dimensions,
  aspectRatio,
  tolerance = IMAGE_ASPECT_RATIO_TOLERANCE,
}: {
  dimensions: ImageDimensions;
  aspectRatio: number;
  tolerance?: number;
}): boolean {
  if (dimensions.width <= 0 || dimensions.height <= 0 || aspectRatio <= 0) return false;

  const imageAspectRatio = dimensions.width / dimensions.height;
  return (
    Math.abs(imageAspectRatio - aspectRatio) / aspectRatio <=
    tolerance + Number.EPSILON
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
