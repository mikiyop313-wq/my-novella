import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LocalEmbeddingModelDownloadProgress,
  LocalEmbeddingModelStatus,
} from '../../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../../shared/components/confirm-modal/confirm-modal.service';
import { VectorConfigurationSettingsComponent } from '../vector-configuration-settings.component';

describe('VectorConfigurationSettingsComponent', () => {
  const notInstalledStatus: LocalEmbeddingModelStatus = {
    modelName: 'mixedbread-ai/mxbai-embed-large-v1',
    installed: false,
    cachedBytes: 0,
  };

  let fixture: ComponentFixture<VectorConfigurationSettingsComponent>;
  let invoke: ReturnType<typeof vi.fn>;
  let removeProgressListener: ReturnType<typeof vi.fn>;
  let progressListener: ((progress: LocalEmbeddingModelDownloadProgress) => void) | undefined;
  let confirmService: ConfirmModalService;

  beforeEach(async () => {
    invoke = vi.fn().mockResolvedValue(notInstalledStatus);
    removeProgressListener = vi.fn();
    const on = vi.fn(
      (channel: string, callback: (progress: LocalEmbeddingModelDownloadProgress) => void) => {
        if (channel === 'vectors:local-model:download-progress') progressListener = callback;
        return removeProgressListener;
      },
    );

    await TestBed.configureTestingModule({
      imports: [VectorConfigurationSettingsComponent],
      providers: [{ provide: ElectronService, useValue: { invoke, on } }],
    }).compileComponents();

    fixture = TestBed.createComponent(VectorConfigurationSettingsComponent);
    confirmService = TestBed.inject(ConfirmModalService);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads and renders the available Mixedbread model', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:get-status');
    expect(element.querySelector('.local-model-card')?.textContent).toContain(
      'mixedbread-ai/mxbai-embed-large-v1',
    );
    expect(element.querySelector('.local-model-badge')?.textContent).toContain('Not installed');
    expect(element.querySelector('.local-model-meta')?.textContent).toContain('0 B');
    expect(element.querySelector('.local-model-button')?.textContent).toContain('Download');
  });

  it('renders installed state and formats cached bytes', async () => {
    invoke.mockResolvedValueOnce({
      ...notInstalledStatus,
      installed: true,
      cachedBytes: 1_572_864,
    });

    await fixture.componentInstance.loadLocalModelStatus();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.local-model-badge')?.textContent).toContain('Installed');
    expect(element.querySelector('.local-model-meta')?.textContent).toContain('1.5 MB');
    expect(element.querySelector('.local-model-button')?.textContent).toContain('Uninstall');
  });

  it('shows download progress and disables model actions while downloading', async () => {
    let finishDownload: ((status: LocalEmbeddingModelStatus) => void) | undefined;
    invoke.mockImplementationOnce(
      () =>
        new Promise<LocalEmbeddingModelStatus>((resolve) => {
          finishDownload = resolve;
        }),
    );

    const downloadPromise = fixture.componentInstance.downloadLocalModel();
    fixture.detectChanges();
    progressListener?.({
      status: 'progress',
      file: 'onnx/model_quantized.onnx',
      loaded: 25,
      total: 100,
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const progress = element.querySelector<HTMLElement>('.local-model-progress');
    expect(invoke).toHaveBeenCalledWith('vectors:local-model:download');
    expect(progress?.textContent).toContain('onnx/model_quantized.onnx');
    expect(progress?.textContent).toContain('25%');
    expect(element.querySelector<HTMLButtonElement>('.local-model-button')?.disabled).toBe(true);

    finishDownload?.({ ...notInstalledStatus, installed: true, cachedBytes: 1024 });
    await downloadPromise;
    fixture.detectChanges();
    expect(element.querySelector('.local-model-badge')?.textContent).toContain('Installed');
  });

  it('refreshes status after a failed download and offers partial-download actions', async () => {
    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error('Download failed'))
      .mockResolvedValueOnce({ ...notInstalledStatus, cachedBytes: 2048 });

    await fixture.componentInstance.downloadLocalModel();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(invoke).toHaveBeenNthCalledWith(2, 'vectors:local-model:get-status');
    expect(element.querySelector('.local-model-badge')?.textContent).toContain(
      'Incomplete download',
    );
    expect(element.querySelector('.local-model-error')?.textContent).toContain('Download failed');
    expect(element.querySelector('.local-model-actions')?.textContent).toContain('Retry download');
    expect(element.querySelector('.local-model-actions')?.textContent).toContain('Remove files');
  });

  it('shows a retry action when model status cannot be loaded', async () => {
    fixture.componentInstance.localModelStatus.set(null);
    invoke.mockRejectedValueOnce(new Error('Status unavailable'));

    await fixture.componentInstance.loadLocalModelStatus();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.configuration-state')?.textContent).toContain(
      'Status unavailable',
    );
    expect(element.querySelector('.configuration-state button')?.textContent).toContain('Retry');
  });

  it.each([
    { clearVectors: false, checked: false },
    { clearVectors: true, checked: true },
  ])('confirms uninstall with clearVectors=$clearVectors', async ({ clearVectors, checked }) => {
    fixture.componentInstance.localModelStatus.set({
      ...notInstalledStatus,
      installed: true,
      cachedBytes: 1024,
    });
    fixture.detectChanges();
    invoke.mockResolvedValueOnce(notInstalledStatus);

    fixture.componentInstance.requestLocalModelUninstall();
    expect(confirmService.state().show).toBe(true);
    expect(confirmService.state().confirmLabel).toBe('Uninstall');
    expect(confirmService.state().checkboxLabel).toContain('Also delete vectors');
    expect(confirmService.state().checkboxChecked).toBe(false);

    confirmService.setCheckboxChecked(checked);
    confirmService.state().onConfirm();
    await fixture.whenStable();

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:uninstall', { clearVectors });
  });

  it('removes its download progress listener when destroyed', () => {
    fixture.destroy();
    expect(removeProgressListener).toHaveBeenCalledOnce();
  });

  it('renders OpenAI and Voyage provider cards', () => {
    const element = fixture.nativeElement as HTMLElement;
    const providerCards = element.querySelectorAll<HTMLButtonElement>('.provider-card');

    expect(providerCards).toHaveLength(2);
    expect(providerCards[0].textContent).toContain('OpenAI');
    expect(providerCards[1].textContent).toContain('Voyage AI');
  });

  it('shows the credential editor for the selected provider', () => {
    selectProvider('voyage');

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.provider-card.is-selected')?.textContent).toContain('Voyage AI');
    expect(element.querySelector('label')?.textContent).toContain('Voyage AI API key');
  });

  it('keeps separate API key drafts for each provider', () => {
    selectProvider('openai');
    updateVisibleKey('sk-openai-draft');

    selectProvider('voyage');
    updateVisibleKey('pa-voyage-draft');

    selectProvider('openai');
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.credential-input input',
    );

    expect(input?.value).toBe('sk-openai-draft');
    expect(fixture.componentInstance.apiKeyDrafts()).toEqual({
      openai: 'sk-openai-draft',
      voyage: 'pa-voyage-draft',
    });
  });

  it('shows and hides the selected API key', () => {
    selectProvider('openai');

    const element = fixture.nativeElement as HTMLElement;
    const visibilityButton = element.querySelector<HTMLButtonElement>('.visibility-button');
    const input = element.querySelector<HTMLInputElement>('.credential-input input');

    expect(input?.type).toBe('password');

    visibilityButton?.click();
    fixture.detectChanges();
    expect(input?.type).toBe('text');

    visibilityButton?.click();
    fixture.detectChanges();
    expect(input?.type).toBe('password');
  });

  it('does not invoke backend services when saving or testing cloud providers', () => {
    invoke.mockClear();
    selectProvider('openai');
    updateVisibleKey('sk-preview-only');

    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLInputElement>('.credential-input input')
      ?.dispatchEvent(new FocusEvent('blur'));
    element.querySelector<HTMLButtonElement>('.connection-test-button')?.click();

    expect(invoke).not.toHaveBeenCalled();
  });

  function selectProvider(providerId: 'openai' | 'voyage'): void {
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>(`[data-provider="${providerId}"]`)?.click();
    fixture.detectChanges();
  }

  function updateVisibleKey(value: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.credential-input input',
    );
    if (!input) throw new Error('Expected an API key input for the selected provider.');

    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
});
