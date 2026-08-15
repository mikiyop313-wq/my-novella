import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  AfterViewInit,
  HostListener,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { OverlayModalDirective } from '../../directives/overlay-modal.directive';

export type ImageCropFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageCropConfig {
  aspectRatio: number;
  outputWidth: number;
  format: ImageCropFormat;
  quality?: number;
}

export interface CropFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageSize {
  width: number;
  height: number;
}

type ResizeHandle = 'north-west' | 'north-east' | 'south-west' | 'south-east';

interface CropInteraction {
  kind: 'move' | 'resize';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startFrame: CropFrame;
  handle?: ResizeHandle;
}

const SUPPORTED_FORMATS: readonly ImageCropFormat[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];
const MINIMUM_CROP_DIMENSION = 48;
const KEYBOARD_STEP = 1;
const LARGE_KEYBOARD_STEP = 10;

@Component({
  selector: 'app-image-crop-modal',
  standalone: true,
  imports: [A11yModule, CommonModule, OverlayModalDirective],
  templateUrl: './image-crop-modal.component.html',
  styleUrl: './image-crop-modal.component.scss',
})
export class ImageCropModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('modalTrigger') private modalTrigger?: OverlayModalDirective;
  @ViewChild('cropWorkspace') private cropWorkspace?: ElementRef<HTMLElement>;
  @ViewChild('sourceImage') private sourceImage?: ElementRef<HTMLImageElement>;

  readonly imageFile = input.required<File>();
  readonly config = input.required<ImageCropConfig>();

  readonly cropped = output<File>();
  readonly cancelled = output<void>();

  readonly imageUrl = signal('');
  readonly imageReady = signal(false);
  readonly isCropping = signal(false);
  readonly isVisible = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly stageSize = signal<ImageSize>({ width: 0, height: 0 });
  readonly cropFrame = signal<CropFrame>({ x: 0, y: 0, width: 0, height: 0 });
  readonly outputHeight = computed(() =>
    Math.round(this.config().outputWidth / this.config().aspectRatio),
  );
  readonly aspectRatioLabel = computed(() => `${this.config().aspectRatio.toFixed(2)}:1`);
  readonly resizeHandles: readonly ResizeHandle[] = [
    'north-west',
    'north-east',
    'south-west',
    'south-east',
  ];

  private naturalImageSize: ImageSize = { width: 0, height: 0 };
  private interaction: CropInteraction | null = null;
  private entranceFrame: number | null = null;

  ngAfterViewInit(): void {
    this.modalTrigger?.openModal();

    this.entranceFrame = requestAnimationFrame(() => {
      this.isVisible.set(true);
      this.entranceFrame = null;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.validateConfig(this.config());
      if (this.imageReady()) this.resetCrop();
    }
    if (changes['imageFile']) this.replaceImageUrl();
  }

  ngOnDestroy(): void {
    if (this.entranceFrame !== null) cancelAnimationFrame(this.entranceFrame);
    const currentUrl = this.imageUrl();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
  }

  onImageLoad(): void {
    const image = this.sourceImage?.nativeElement;
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      this.handleImageError();
      return;
    }

    this.naturalImageSize = { width: image.naturalWidth, height: image.naturalHeight };
    this.imageReady.set(true);
    this.errorMessage.set(null);
    this.layoutImage(true);
  }

  handleImageError(): void {
    this.imageReady.set(false);
    this.errorMessage.set('This image could not be loaded. Choose a different image and try again.');
  }

  resetCrop(): void {
    const size = this.stageSize();
    if (size.width === 0 || size.height === 0) return;
    this.cropFrame.set(this.createInitialCropFrame(size));
  }

  startMove(event: PointerEvent): void {
    if (!this.imageReady() || event.button !== 0) return;

    event.preventDefault();
    this.interaction = {
      kind: 'move',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: this.cropFrame(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  startResize(event: PointerEvent, handle: ResizeHandle): void {
    if (!this.imageReady() || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    this.interaction = {
      kind: 'resize',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: this.cropFrame(),
      handle,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    const interaction = this.interaction;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    const deltaX = event.clientX - interaction.startClientX;
    const deltaY = event.clientY - interaction.startClientY;

    if (interaction.kind === 'move') {
      this.cropFrame.set(this.moveFrame(interaction.startFrame, deltaX, deltaY));
      return;
    }

    if (interaction.handle) {
      this.cropFrame.set(
        this.resizeFrame(interaction.startFrame, interaction.handle, deltaX, deltaY),
      );
    }
  }

  endPointerInteraction(event: PointerEvent): void {
    if (!this.interaction || this.interaction.pointerId !== event.pointerId) return;

    const target = event.target as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    this.interaction = null;
  }

  moveCropWithKeyboard(event: KeyboardEvent): void {
    const movement = this.keyboardMovement(event);
    if (!movement) return;

    event.preventDefault();
    event.stopPropagation();
    const frame = this.cropFrame();
    this.cropFrame.set(this.moveFrame(frame, movement.x, movement.y));
  }

  resizeCropWithKeyboard(event: KeyboardEvent, handle: ResizeHandle): void {
    const direction = this.keyboardResizeDirection(event, handle);
    if (direction === null) return;

    event.preventDefault();
    event.stopPropagation();
    const frame = this.cropFrame();
    this.cropFrame.set(this.resizeFrameToWidth(frame, handle, frame.width + direction));
  }

  cancel(): void {
    if (!this.isCropping()) this.cancelled.emit();
  }

  onOverlayClosed(): void {
    if (!this.isCropping()) this.cancelled.emit();
  }

  async cropImage(): Promise<void> {
    const image = this.sourceImage?.nativeElement;
    const stage = this.stageSize();
    if (!image || !this.imageReady() || stage.width === 0 || stage.height === 0) return;

    this.isCropping.set(true);
    this.errorMessage.set(null);

    try {
      const frame = this.cropFrame();
      const canvas = document.createElement('canvas');
      canvas.width = this.config().outputWidth;
      canvas.height = this.outputHeight();

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');

      const sourceScaleX = this.naturalImageSize.width / stage.width;
      const sourceScaleY = this.naturalImageSize.height / stage.height;
      context.drawImage(
        image,
        frame.x * sourceScaleX,
        frame.y * sourceScaleY,
        frame.width * sourceScaleX,
        frame.height * sourceScaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const blob = await this.createCanvasBlob(canvas);
      const result = new File([blob], this.createOutputFilename(), {
        type: this.config().format,
        lastModified: Date.now(),
      });
      this.cropped.emit(result);
    } catch {
      this.errorMessage.set('The selected area could not be cropped. Please try again.');
    } finally {
      this.isCropping.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: Event): void {
    if (this.isCropping()) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelled.emit();
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    if (this.imageReady()) this.layoutImage(false);
  }

  private validateConfig(config: ImageCropConfig): void {
    if (!Number.isFinite(config.aspectRatio) || config.aspectRatio <= 0) {
      throw new Error('ImageCropConfig.aspectRatio must be a positive number.');
    }
    if (!Number.isInteger(config.outputWidth) || config.outputWidth <= 0) {
      throw new Error('ImageCropConfig.outputWidth must be a positive integer.');
    }
    if (!SUPPORTED_FORMATS.includes(config.format)) {
      throw new Error(`Unsupported image crop format: ${config.format}.`);
    }
    if (
      config.quality !== undefined &&
      (!Number.isFinite(config.quality) || config.quality < 0 || config.quality > 1)
    ) {
      throw new Error('ImageCropConfig.quality must be between 0 and 1.');
    }
  }

  private replaceImageUrl(): void {
    const previousUrl = this.imageUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);

    this.naturalImageSize = { width: 0, height: 0 };
    this.stageSize.set({ width: 0, height: 0 });
    this.cropFrame.set({ x: 0, y: 0, width: 0, height: 0 });
    this.imageReady.set(false);
    this.errorMessage.set(null);
    this.imageUrl.set(URL.createObjectURL(this.imageFile()));
  }

  private layoutImage(resetCrop: boolean): void {
    const workspace = this.cropWorkspace?.nativeElement;
    if (!workspace || this.naturalImageSize.width === 0 || this.naturalImageSize.height === 0) return;

    const availableWidth = workspace.clientWidth || Math.min(this.naturalImageSize.width, 720);
    const availableHeight = workspace.clientHeight || Math.min(this.naturalImageSize.height, 520);
    const scale = Math.min(
      availableWidth / this.naturalImageSize.width,
      availableHeight / this.naturalImageSize.height,
    );
    const previousSize = this.stageSize();
    const nextSize = {
      width: this.naturalImageSize.width * scale,
      height: this.naturalImageSize.height * scale,
    };
    this.stageSize.set(nextSize);

    if (resetCrop || previousSize.width === 0 || previousSize.height === 0) {
      this.cropFrame.set(this.createInitialCropFrame(nextSize));
      return;
    }

    this.cropFrame.update((frame) => ({
      x: frame.x * nextSize.width / previousSize.width,
      y: frame.y * nextSize.height / previousSize.height,
      width: frame.width * nextSize.width / previousSize.width,
      height: frame.height * nextSize.height / previousSize.height,
    }));
  }

  private createInitialCropFrame(size: ImageSize): CropFrame {
    const aspectRatio = this.config().aspectRatio;
    const imageRatio = size.width / size.height;
    const width = imageRatio > aspectRatio ? size.height * aspectRatio : size.width;
    const height = width / aspectRatio;

    return {
      x: (size.width - width) / 2,
      y: (size.height - height) / 2,
      width,
      height,
    };
  }

  private moveFrame(frame: CropFrame, deltaX: number, deltaY: number): CropFrame {
    const stage = this.stageSize();
    return {
      ...frame,
      x: this.clamp(frame.x + deltaX, 0, stage.width - frame.width),
      y: this.clamp(frame.y + deltaY, 0, stage.height - frame.height),
    };
  }

  private resizeFrame(
    frame: CropFrame,
    handle: ResizeHandle,
    deltaX: number,
    deltaY: number,
  ): CropFrame {
    const horizontalDirection = handle.endsWith('west') ? -1 : 1;
    const verticalDirection = handle.startsWith('north') ? -1 : 1;
    const projectedX = horizontalDirection * deltaX;
    const projectedY = verticalDirection * deltaY;
    const ratio = this.config().aspectRatio;
    const widthDelta = (projectedX + projectedY / ratio) / (1 + 1 / (ratio * ratio));
    return this.resizeFrameToWidth(frame, handle, frame.width + widthDelta);
  }

  private resizeFrameToWidth(
    frame: CropFrame,
    handle: ResizeHandle,
    requestedWidth: number,
  ): CropFrame {
    const stage = this.stageSize();
    const ratio = this.config().aspectRatio;
    const anchorX = handle.endsWith('west') ? frame.x + frame.width : frame.x;
    const anchorY = handle.startsWith('north') ? frame.y + frame.height : frame.y;
    const maximumHorizontalWidth = handle.endsWith('west') ? anchorX : stage.width - anchorX;
    const maximumVerticalWidth = (handle.startsWith('north') ? anchorY : stage.height - anchorY) * ratio;
    const maximumWidth = Math.max(0, Math.min(maximumHorizontalWidth, maximumVerticalWidth));
    const minimumWidth = Math.min(
      maximumWidth,
      Math.max(MINIMUM_CROP_DIMENSION, MINIMUM_CROP_DIMENSION * ratio),
    );
    const width = this.clamp(requestedWidth, minimumWidth, maximumWidth);
    const height = width / ratio;

    return {
      x: handle.endsWith('west') ? anchorX - width : anchorX,
      y: handle.startsWith('north') ? anchorY - height : anchorY,
      width,
      height,
    };
  }

  private keyboardMovement(event: KeyboardEvent): { x: number; y: number } | null {
    const step = event.shiftKey ? LARGE_KEYBOARD_STEP : KEYBOARD_STEP;
    const movementByKey: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    return movementByKey[event.key] ?? null;
  }

  private keyboardResizeDirection(event: KeyboardEvent, handle: ResizeHandle): number | null {
    const step = event.shiftKey ? LARGE_KEYBOARD_STEP : KEYBOARD_STEP;
    const isWest = handle.endsWith('west');
    const isNorth = handle.startsWith('north');

    if (event.key === 'ArrowLeft') return isWest ? step : -step;
    if (event.key === 'ArrowRight') return isWest ? -step : step;
    if (event.key === 'ArrowUp') return (isNorth ? step : -step) * this.config().aspectRatio;
    if (event.key === 'ArrowDown') return (isNorth ? -step : step) * this.config().aspectRatio;
    return null;
  }

  private createCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob?.type === this.config().format) {
            resolve(blob);
            return;
          }
          reject(new Error('Canvas encoding failed or returned an unsupported format.'));
        },
        this.config().format,
        this.config().quality,
      );
    });
  }

  private createOutputFilename(): string {
    const extensionByFormat: Record<ImageCropFormat, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    const sourceName = this.imageFile().name;
    const lastDot = sourceName.lastIndexOf('.');
    const basename = lastDot > 0 ? sourceName.slice(0, lastDot) : sourceName;
    return `${basename || 'cropped-image'}.${extensionByFormat[this.config().format]}`;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
  }
}
