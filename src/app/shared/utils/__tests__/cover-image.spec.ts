import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COVER_CROP_CONFIG,
  loadImageDimensions,
  matchesCoverAspectRatio,
} from '../cover-image';

describe('cover image utilities', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defines the shared 600 by 900 WebP crop output', () => {
    expect(COVER_CROP_CONFIG).toEqual({
      aspectRatio: 2 / 3,
      outputWidth: 600,
      format: 'image/webp',
      quality: 0.9,
    });
  });

  it.each([
    [{ width: 600, height: 900 }, true],
    [{ width: 606, height: 900 }, true],
    [{ width: 607, height: 900 }, false],
    [{ width: 600, height: 0 }, false],
  ])('applies the one percent relative ratio tolerance to %o', (dimensions, expected) => {
    expect(matchesCoverAspectRatio(dimensions)).toBe(expected);
  });

  it('loads natural dimensions and releases the temporary object URL', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 1200;
        naturalHeight = 1800;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );

    const dimensions = await loadImageDimensions(
      new File(['image'], 'cover.png', { type: 'image/png' }),
    );

    expect(dimensions).toEqual({ width: 1200, height: 1800 });
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cover');
  });

  it('rejects unreadable images and releases the temporary object URL', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken-cover');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
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

    await expect(
      loadImageDimensions(new File(['broken'], 'broken.png', { type: 'image/png' })),
    ).rejects.toThrow('could not be loaded');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:broken-cover');
  });
});
