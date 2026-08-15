import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
  ImageCropConfig,
  ImageCropModalComponent,
} from '../image-crop-modal.component';

const DEFAULT_CONFIG: ImageCropConfig = {
  aspectRatio: 1,
  outputWidth: 600,
  format: 'image/png',
};

interface PointerEventOptions {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  currentTarget?: Partial<HTMLElement>;
}

describe('ImageCropModalComponent', () => {
  let fixture: ComponentFixture<ImageCropModalComponent>;
  let createObjectUrl: Mock<(object: Blob | MediaSource) => void>;
  let revokeObjectUrl: Mock<(url: string) => void>;

  beforeEach(async () => {
    createObjectUrl = vi.fn();
    revokeObjectUrl = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
      createObjectUrl(object);
      return 'blob:crop-source';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revokeObjectUrl(url));

    await TestBed.configureTestingModule({ imports: [ImageCropModalComponent] }).compileComponents();
  });

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    vi.restoreAllMocks();
  });

  it('initializes the largest centered crop at the configured aspect ratio', () => {
    createFixture({ aspectRatio: 1, outputWidth: 600, format: 'image/png' });
    loadImage({ naturalWidth: 1200, naturalHeight: 800, displayWidth: 600, displayHeight: 400 });

    expect(fixture.componentInstance.stageSize()).toEqual({ width: 600, height: 400 });
    expect(fixture.componentInstance.cropFrame()).toEqual({ x: 100, y: 0, width: 400, height: 400 });
    expect(fixture.nativeElement.textContent).toContain('1.00:1');
    expect(fixture.nativeElement.textContent).toContain('600 × 600 px');
  });

  it('clamps crop dragging to the displayed image boundaries', () => {
    createFixture();
    loadImage({ naturalWidth: 1200, naturalHeight: 800, displayWidth: 600, displayHeight: 400 });
    const captureTarget = pointerCaptureTarget();

    fixture.componentInstance.startMove(pointerEvent({ currentTarget: captureTarget }));
    fixture.componentInstance.onPointerMove(pointerEvent({ clientX: -500, clientY: 300 }));

    expect(fixture.componentInstance.cropFrame()).toEqual({ x: 0, y: 0, width: 400, height: 400 });
    expect(captureTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it.each([
    ['north-west', -80, -80],
    ['north-east', 80, -80],
    ['south-west', -80, 80],
    ['south-east', 80, 80],
  ] as const)('keeps the ratio and image bounds when resizing from %s', (handle, x, y) => {
    createFixture();
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });
    fixture.componentInstance.cropFrame.set({ x: 200, y: 100, width: 200, height: 200 });

    fixture.componentInstance.startResize(
      pointerEvent({ currentTarget: pointerCaptureTarget() }),
      handle,
    );
    fixture.componentInstance.onPointerMove(pointerEvent({ clientX: x, clientY: y }));

    const frame = fixture.componentInstance.cropFrame();
    const stage = fixture.componentInstance.stageSize();
    expect(frame.width / frame.height).toBeCloseTo(1, 8);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(stage.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(stage.height);
  });

  it('enforces the minimum crop size and restores the initial crop on reset', () => {
    createFixture();
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });
    const initialFrame = fixture.componentInstance.cropFrame();
    fixture.componentInstance.cropFrame.set({ x: 200, y: 100, width: 200, height: 200 });

    fixture.componentInstance.startResize(
      pointerEvent({ currentTarget: pointerCaptureTarget() }),
      'south-east',
    );
    fixture.componentInstance.onPointerMove(pointerEvent({ clientX: -1000, clientY: -1000 }));

    expect(fixture.componentInstance.cropFrame().width).toBe(48);
    fixture.componentInstance.resetCrop();
    expect(fixture.componentInstance.cropFrame()).toEqual(initialFrame);
  });

  it('supports keyboard movement and ratio-locked keyboard resizing', () => {
    createFixture();
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });
    fixture.componentInstance.cropFrame.set({ x: 100, y: 100, width: 200, height: 200 });
    const moveEvent = keyboardEvent('ArrowRight', true);

    fixture.componentInstance.moveCropWithKeyboard(moveEvent);
    fixture.componentInstance.resizeCropWithKeyboard(keyboardEvent('ArrowDown'), 'south-east');

    expect(fixture.componentInstance.cropFrame()).toEqual({ x: 110, y: 100, width: 201, height: 201 });
    expect(moveEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ['image/png', undefined, 'cover.original.png'],
    ['image/jpeg', 0.82, 'cover.original.jpg'],
    ['image/webp', 0.7, 'cover.original.webp'],
  ] as const)(
    'maps display coordinates to source pixels and emits a %s file',
    async (format, quality, expectedName) => {
      createFixture({ aspectRatio: 1.5, outputWidth: 600, format, quality });
      loadImage({ naturalWidth: 1200, naturalHeight: 800, displayWidth: 600, displayHeight: 400 });
      fixture.componentInstance.cropFrame.set({ x: 100, y: 50, width: 300, height: 200 });
      const drawImage = vi.fn();
      const toBlob = mockCanvas({ drawImage, format });
      const emitted = vi.fn();
      fixture.componentInstance.cropped.subscribe(emitted);

      await fixture.componentInstance.cropImage();

      expect(drawImage).toHaveBeenCalledWith(
        expect.any(HTMLImageElement),
        200,
        100,
        600,
        400,
        0,
        0,
        600,
        400,
      );
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), format, quality);
      const result = emitted.mock.calls[0][0] as File;
      expect(result.name).toBe(expectedName);
      expect(result.type).toBe(format);
      expect(result.size).toBeGreaterThan(0);
    },
  );

  it('emits cancellation from the button, backdrop, and Escape without cropping', () => {
    createFixture();
    const cancelled = vi.fn();
    const cropped = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.cropped.subscribe(cropped);

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.crop-modal-actions button:nth-of-type(2)')?.click();
    element.querySelector<HTMLElement>('.crop-modal-backdrop')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(cancelled).toHaveBeenCalledTimes(3);
    expect(cropped).not.toHaveBeenCalled();
  });

  it('keeps the modal open when the image cannot be decoded', () => {
    createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const image = element.querySelector<HTMLImageElement>('.source-image');

    image?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.imageReady()).toBe(false);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be loaded',
    );
    expect(element.querySelector<HTMLButtonElement>('.btn-primary')?.disabled).toBe(true);
  });

  it('shows an inline error and does not emit when canvas encoding fails', async () => {
    createFixture();
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });
    mockCanvas({ drawImage: vi.fn(), format: 'image/png', failEncoding: true });
    const emitted = vi.fn();
    fixture.componentInstance.cropped.subscribe(emitted);

    await fixture.componentInstance.cropImage();
    fixture.detectChanges();

    expect(emitted).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be cropped',
    );
    expect(fixture.componentInstance.imageReady()).toBe(true);
  });

  it('does not silently accept a browser format fallback', async () => {
    createFixture({ aspectRatio: 1, outputWidth: 600, format: 'image/webp' });
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });
    mockCanvas({ drawImage: vi.fn(), format: 'image/png' });
    const emitted = vi.fn();
    fixture.componentInstance.cropped.subscribe(emitted);

    await fixture.componentInstance.cropImage();

    expect(emitted).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage()).toContain('could not be cropped');
  });

  it.each([
    [{ ...DEFAULT_CONFIG, aspectRatio: 0 }, 'aspectRatio'],
    [{ ...DEFAULT_CONFIG, outputWidth: 1.5 }, 'outputWidth'],
    [{ ...DEFAULT_CONFIG, format: 'image/gif' as 'image/png' }, 'format'],
    [{ ...DEFAULT_CONFIG, quality: 2 }, 'quality'],
  ])('rejects invalid configuration as a programmer error', (config, field) => {
    expect(() => createFixture(config)).toThrow(field);
  });

  it('revokes its temporary object URL when destroyed', () => {
    createFixture();

    fixture.destroy();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:crop-source');
  });

  it('revokes the previous URL and resets state when the input file changes', () => {
    createFixture();
    loadImage({ naturalWidth: 600, naturalHeight: 400, displayWidth: 600, displayHeight: 400 });

    fixture.componentRef.setInput(
      'imageFile',
      new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }),
    );
    fixture.detectChanges();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:crop-source');
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.imageReady()).toBe(false);
    expect(fixture.componentInstance.stageSize()).toEqual({ width: 0, height: 0 });
  });

  function createFixture(config: ImageCropConfig = DEFAULT_CONFIG): void {
    fixture = TestBed.createComponent(ImageCropModalComponent);
    fixture.componentRef.setInput('imageFile', new File(['source'], 'cover.original.png', { type: 'image/png' }));
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
  }

  function loadImage(options: {
    naturalWidth: number;
    naturalHeight: number;
    displayWidth: number;
    displayHeight: number;
  }): void {
    const element = fixture.nativeElement as HTMLElement;
    const workspace = element.querySelector<HTMLElement>('.crop-workspace');
    const image = element.querySelector<HTMLImageElement>('.source-image');
    if (!workspace || !image) throw new Error('Expected crop workspace and source image.');

    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: options.displayWidth });
    Object.defineProperty(workspace, 'clientHeight', { configurable: true, value: options.displayHeight });
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: options.naturalWidth });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: options.naturalHeight });
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  function pointerEvent(options: PointerEventOptions = {}): PointerEvent {
    return {
      button: 0,
      pointerId: options.pointerId ?? 1,
      clientX: options.clientX ?? 0,
      clientY: options.clientY ?? 0,
      currentTarget: options.currentTarget ?? pointerCaptureTarget(),
      target: options.currentTarget ?? pointerCaptureTarget(),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;
  }

  function pointerCaptureTarget(): HTMLElement & { setPointerCapture: ReturnType<typeof vi.fn> } {
    return {
      setPointerCapture: vi.fn(),
    } as unknown as HTMLElement & { setPointerCapture: ReturnType<typeof vi.fn> };
  }

  function keyboardEvent(key: string, shiftKey = false): KeyboardEvent {
    return {
      key,
      shiftKey,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
  }

  function mockCanvas(options: {
    drawImage: ReturnType<typeof vi.fn>;
    format: string;
    failEncoding?: boolean;
  }): ReturnType<typeof vi.fn> {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: options.drawImage,
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(options.failEncoding ? null : new Blob(['cropped'], { type: options.format }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob);
    return toBlob;
  }
});
