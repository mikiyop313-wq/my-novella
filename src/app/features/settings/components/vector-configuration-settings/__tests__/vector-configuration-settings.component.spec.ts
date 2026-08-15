import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LocalEmbeddingModelDownloadProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  LocalEmbeddingModelTier,
} from '../../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../../shared/components/confirm-modal/confirm-modal.service';
import { VectorConfigurationSettingsComponent } from '../vector-configuration-settings.component';

describe('VectorConfigurationSettingsComponent', () => {
  const catalog: LocalEmbeddingModelStatus[] = [
    model(
      'mixedbread-ai/mxbai-embed-large-v1',
      'Mixedbread Large',
      'Mixedbread',
      'MB',
      'large',
      1024,
      'English',
    ),
    model('BAAI/bge-large-en-v1.5', 'BGE Large', 'BAAI', 'BA', 'large', 1024, 'English'),
    model('BAAI/bge-m3', 'BGE-M3', 'BAAI', 'BA', 'large', 1024, 'Multilingual (100+ languages)'),
    model('nomic-ai/nomic-embed-text-v1.5', 'Nomic Embed', 'Nomic', 'NO', 'medium', 768, 'English'),
    model('BAAI/bge-base-en-v1.5', 'BGE Base', 'BAAI', 'BA', 'medium', 768, 'English'),
    model(
      'Alibaba-NLP/gte-multilingual-base',
      'GTE Multilingual',
      'Alibaba',
      'AL',
      'medium',
      768,
      'Multilingual (75 languages)',
    ),
    model('BAAI/bge-small-en-v1.5', 'BGE Small', 'BAAI', 'BA', 'small', 384, 'English'),
    model(
      'sentence-transformers/all-MiniLM-L6-v2',
      'MiniLM',
      'Sentence Transformers',
      'ST',
      'small',
      384,
      'English',
    ),
    model(
      'Snowflake/snowflake-arctic-embed-xs',
      'Arctic XS',
      'Snowflake',
      'SF',
      'small',
      384,
      'English',
    ),
  ];

  let fixture: ComponentFixture<VectorConfigurationSettingsComponent>;
  let invoke: ReturnType<typeof vi.fn>;
  let removeProgressListener: ReturnType<typeof vi.fn>;
  let progressListener: ((progress: LocalEmbeddingModelDownloadProgress) => void) | undefined;
  let confirmService: ConfirmModalService;

  beforeEach(async () => {
    invoke = vi.fn().mockResolvedValue(catalog);
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

  it('loads the catalog and switches between model tiers', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:get-status');
    expect(element.querySelectorAll('.local-model-card')).toHaveLength(3);
    expect(element.querySelector('.local-model-tier h3')?.textContent).toContain('Large models');
    expect(modelCard('BAAI/bge-m3').textContent).toContain('1024 dimensions');
    expect(modelCard('BAAI/bge-m3').textContent).toContain('Multilingual (100+ languages)');

    selectTier('Medium');
    expect(element.querySelectorAll('.local-model-card')).toHaveLength(3);
    expect(element.querySelector('.local-model-tier h3')?.textContent).toContain('Medium models');
    expect(modelCard('Alibaba-NLP/gte-multilingual-base').textContent).toContain('768 dimensions');

    selectTier('Small');
    expect(element.querySelectorAll('.local-model-card')).toHaveLength(3);
    expect(element.querySelector('.local-model-tier h3')?.textContent).toContain('Small models');
    expect(modelCard('Snowflake/snowflake-arctic-embed-xs').textContent).toContain(
      '384 dimensions',
    );
  });

  it('renders installed state and formats cached bytes independently', async () => {
    invoke.mockResolvedValueOnce(
      catalog.map((status) =>
        status.modelName === 'BAAI/bge-m3'
          ? { ...status, installed: true, cachedBytes: 1_572_864 }
          : status,
      ),
    );

    await fixture.componentInstance.loadLocalModelStatus();
    fixture.detectChanges();

    expect(modelCard('BAAI/bge-m3').querySelector('.local-model-badge')?.textContent).toContain(
      'Installed',
    );
    expect(modelCard('BAAI/bge-m3').textContent).toContain('1.5 MB');
    expect(modelCard('BAAI/bge-large-en-v1.5').textContent).toContain('Not installed');
  });

  it('routes tagged progress to the selected card and disables all model actions', async () => {
    let finishDownload: ((status: LocalEmbeddingModelStatus) => void) | undefined;
    const target = catalog[2];
    invoke.mockImplementationOnce(
      () =>
        new Promise<LocalEmbeddingModelStatus>((resolve) => {
          finishDownload = resolve;
        }),
    );

    const downloadPromise = fixture.componentInstance.downloadLocalModel(target.modelName);
    fixture.detectChanges();
    progressListener?.({
      modelName: target.modelName,
      status: 'progress',
      file: 'onnx/model_quantized.onnx',
      loaded: 25,
      total: 100,
    });
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith('vectors:local-model:download', {
      modelName: target.modelName,
    });
    expect(
      modelCard(target.modelName).querySelector('.local-model-progress')?.textContent,
    ).toContain('25%');
    expect(
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.local-model-button',
        ),
      ].every((button) => button.disabled),
    ).toBe(true);

    finishDownload?.({ ...target, installed: true, cachedBytes: 1024 });
    await downloadPromise;
    fixture.detectChanges();
    expect(modelCard(target.modelName).textContent).toContain('Installed');
  });

  it('refreshes all statuses after a failed download and isolates the error', async () => {
    const target = catalog[1];
    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error('Download failed'))
      .mockResolvedValueOnce(
        catalog.map((status) =>
          status.modelName === target.modelName ? { ...status, cachedBytes: 2048 } : status,
        ),
      );

    await fixture.componentInstance.downloadLocalModel(target.modelName);
    fixture.detectChanges();

    expect(invoke).toHaveBeenNthCalledWith(2, 'vectors:local-model:get-status');
    expect(modelCard(target.modelName).textContent).toContain('Incomplete download');
    expect(modelCard(target.modelName).textContent).toContain('Download failed');
    expect(modelCard(target.modelName).textContent).toContain('Retry download');
    expect(modelCard(catalog[0].modelName).textContent).not.toContain('Download failed');
  });

  it('shows a retry action when catalog status cannot be loaded', async () => {
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
  ])(
    'confirms targeted uninstall with clearVectors=$clearVectors',
    async ({ clearVectors, checked }) => {
      const target = { ...catalog[2], installed: true, cachedBytes: 1024 };
      fixture.componentInstance.localModelStatuses.set(
        catalog.map((status) => (status.modelName === target.modelName ? target : status)),
      );
      fixture.detectChanges();
      invoke.mockResolvedValueOnce({ ...target, installed: false, cachedBytes: 0 });

      fixture.componentInstance.requestLocalModelUninstall(target);
      expect(confirmService.state().show).toBe(true);
      expect(confirmService.state().confirmLabel).toBe('Uninstall');

      confirmService.setCheckboxChecked(checked);
      confirmService.state().onConfirm();
      await fixture.whenStable();

      expect(invoke).toHaveBeenCalledWith('vectors:local-model:uninstall', {
        modelName: target.modelName,
        clearVectors,
      });
    },
  );

  it('removes its download progress listener when destroyed', () => {
    fixture.destroy();
    expect(removeProgressListener).toHaveBeenCalledOnce();
  });

  it('renders cloud providers and keeps separate API key drafts', () => {
    selectProvider('openai');
    updateVisibleKey('sk-openai-draft');
    selectProvider('voyage');
    updateVisibleKey('pa-voyage-draft');

    expect(fixture.componentInstance.apiKeyDrafts()).toEqual({
      openai: 'sk-openai-draft',
      voyage: 'pa-voyage-draft',
    });
  });

  function modelCard(modelName: LocalEmbeddingModelName): HTMLElement {
    const card = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-model="${modelName}"]`,
    );
    if (!card) throw new Error(`Expected card for ${modelName}`);
    return card;
  }

  function selectProvider(providerId: 'openai' | 'voyage'): void {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-provider="${providerId}"]`)
      ?.click();
    fixture.detectChanges();
  }

  function selectTier(label: 'Large' | 'Medium' | 'Small'): void {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.local-model-tier-switch button',
    );
    [...buttons].find((button) => button.textContent?.trim() === label)?.click();
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

  function model(
    modelName: LocalEmbeddingModelName,
    displayName: string,
    providerName: string,
    providerInitials: string,
    tier: LocalEmbeddingModelTier,
    dimensions: number,
    language: string,
  ): LocalEmbeddingModelStatus {
    return {
      modelName,
      displayName,
      providerName,
      providerInitials,
      tier,
      dimensions,
      language,
      installed: false,
      cachedBytes: 0,
    };
  }
});
