import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareImageUpload } from '../image-upload';

describe('image upload utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores non-image files', async () => {
    const result = await prepareImageUpload({
      file: new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      aspectRatio: 2 / 3,
    });

    expect(result).toBeNull();
  });

  it('returns a data URL when the image ratio is within tolerance', async () => {
    stubImageLoading({ width: 606, height: 900 });
    const result = await prepareImageUpload({
      file: new File(['image'], 'cover.png', { type: 'image/png' }),
      aspectRatio: 2 / 3,
    });

    expect(result).toEqual({
      kind: 'ready',
      dataUrl: expect.stringContaining('data:image/png'),
    });
  });

  it('returns the source file when cropping is required', async () => {
    stubImageLoading({ width: 607, height: 900 });
    const file = new File(['image'], 'cover.png', { type: 'image/png' });

    await expect(prepareImageUpload({ file, aspectRatio: 2 / 3 })).resolves.toEqual({
      kind: 'crop',
      file,
    });
  });

  it('surfaces an unreadable image error', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );

    await expect(prepareImageUpload({
      file: new File(['broken'], 'broken.png', { type: 'image/png' }),
      aspectRatio: 2 / 3,
    })).rejects.toThrow('could not be loaded');
  });
});

function stubImageLoading({ width, height }: { width: number; height: number }): void {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:selected-image');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}
