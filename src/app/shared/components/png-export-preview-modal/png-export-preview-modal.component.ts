import { A11yModule } from '@angular/cdk/a11y';
import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { ManuscriptMode } from '../../../../../shared/models/manuscript.model';
import {
  MANUSCRIPT_PNG_EXPORT_DEFAULTS,
  MANUSCRIPT_PNG_EXPORT_LIMITS,
  MANUSCRIPT_PNG_EXPORT_SCALE,
  MANUSCRIPT_PNG_EXPORT_THEME_COLORS,
  type ManuscriptPngPreviewContentResult,
  type ManuscriptPngExportOptions,
  type ManuscriptPngExportTheme,
  type SaveManuscriptExportResult,
} from '../../../../../shared/models/manuscript-export.model';
import { ElectronService } from '../../../core/services/electron.service';
import { OverlayModalDirective } from '../../directives/overlay-modal.directive';

export interface PngExportPreviewTarget {
  mode: ManuscriptMode;
  id: string;
}

@Component({
  selector: 'app-png-export-preview-modal',
  standalone: true,
  imports: [A11yModule, OverlayModalDirective],
  templateUrl: './png-export-preview-modal.component.html',
  styleUrl: './png-export-preview-modal.component.scss',
})
export class PngExportPreviewModalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('modalTrigger') private modalTrigger?: OverlayModalDirective;

  readonly target = input.required<PngExportPreviewTarget>();
  readonly closed = output<void>();
  readonly exported = output<void>();

  readonly theme = signal<ManuscriptPngExportTheme>(MANUSCRIPT_PNG_EXPORT_DEFAULTS.theme);
  readonly fontSizeInput = signal(String(MANUSCRIPT_PNG_EXPORT_DEFAULTS.fontSize));
  readonly widthInput = signal(String(MANUSCRIPT_PNG_EXPORT_DEFAULTS.width));
  readonly previewHtml = signal<string | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly isPreviewLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isVisible = signal(false);

  readonly fontSizeError = computed(() => this.integerError({
    label: 'Font size',
    value: this.fontSizeInput(),
    ...MANUSCRIPT_PNG_EXPORT_LIMITS.fontSize,
  }));
  readonly widthError = computed(() => this.integerError({
    label: 'Width',
    value: this.widthInput(),
    ...MANUSCRIPT_PNG_EXPORT_LIMITS.width,
  }));
  readonly hasValidationError = computed(() => !!this.fontSizeError() || !!this.widthError());
  readonly fontSizeProgress = computed(() => {
    const { minimum, maximum } = MANUSCRIPT_PNG_EXPORT_LIMITS.fontSize;
    return (Number(this.fontSizeInput()) - minimum) / (maximum - minimum) * 100;
  });
  readonly previewWidth = computed(() => this.widthError()
    ? MANUSCRIPT_PNG_EXPORT_DEFAULTS.width
    : Number(this.widthInput()));
  readonly exportedWidth = computed(() => this.previewWidth() * MANUSCRIPT_PNG_EXPORT_SCALE);
  readonly previewColors = computed(() => MANUSCRIPT_PNG_EXPORT_THEME_COLORS[this.theme()]);
  readonly canExport = computed(() => {
    return !this.hasValidationError()
      && !this.isPreviewLoading()
      && !this.isSaving()
      && this.previewHtml() !== null;
  });

  readonly limits = MANUSCRIPT_PNG_EXPORT_LIMITS;

  private readonly electronService = inject(ElectronService);
  private entranceFrame: number | null = null;

  ngAfterViewInit(): void {
    this.modalTrigger?.openModal();
    this.loadPreviewContent();
    this.entranceFrame = requestAnimationFrame(() => {
      this.isVisible.set(true);
      this.entranceFrame = null;
    });
  }

  ngOnDestroy(): void {
    if (this.entranceFrame !== null) cancelAnimationFrame(this.entranceFrame);
  }

  setTheme(theme: ManuscriptPngExportTheme): void {
    if (this.theme() === theme) return;
    this.theme.set(theme);
  }

  updateFontSize(value: string): void {
    this.fontSizeInput.set(value);
  }

  updateWidth(value: string): void {
    this.widthInput.set(value);
  }

  preventPreviewNavigation(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('a')) event.preventDefault();
  }

  preventPreviewDrag(event: DragEvent): void {
    event.preventDefault();
  }

  cancel(): void {
    if (!this.isSaving()) this.modalTrigger?.closeModal();
  }

  onOverlayClosed(): void {
    this.closed.emit();
  }

  async exportPng(): Promise<void> {
    if (!this.canExport()) return;

    this.isSaving.set(true);
    try {
      const target = this.target();
      const result = await this.electronService.invoke('manuscript-export:save', {
        mode: target.mode,
        id: target.id,
        format: 'png',
        pngOptions: this.options(),
      }) as SaveManuscriptExportResult;

      if (result.status === 'saved') {
        this.exported.emit();
        this.modalTrigger?.closeModal();
      }
    } catch (error) {
      this.previewError.set(this.errorMessage(error, 'Unable to export the PNG image.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: Event): void {
    if (this.isSaving()) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }

  private async loadPreviewContent(): Promise<void> {
    const target = this.target();
    this.isPreviewLoading.set(true);
    this.previewError.set(null);

    try {
      const result = await this.electronService.invoke('manuscript-export:preview-content', {
        mode: target.mode,
        id: target.id,
      }) as ManuscriptPngPreviewContentResult;
      this.previewHtml.set(result.html);
    } catch (error) {
      this.previewHtml.set(null);
      this.previewError.set(this.errorMessage(error, 'Unable to load the PNG preview content.'));
    } finally {
      this.isPreviewLoading.set(false);
    }
  }

  private options(): Required<ManuscriptPngExportOptions> {
    return {
      fontSize: Number(this.fontSizeInput()),
      theme: this.theme(),
      width: Number(this.widthInput()),
    };
  }

  private integerError({
    label,
    value,
    minimum,
    maximum,
  }: {
    label: string;
    value: string;
    minimum: number;
    maximum: number;
  }): string | null {
    const number = Number(value);
    if (value.trim() && Number.isInteger(number) && number >= minimum && number <= maximum) {
      return null;
    }
    return `${label} must be a whole number between ${minimum} and ${maximum} px.`;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
