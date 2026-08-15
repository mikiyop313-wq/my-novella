import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AiProviderConfiguration,
  SaveAiApiKeyRequest,
  SaveAiServerUrlRequest,
} from '../../../../../../shared/models/ai.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AiConfigurationSettingsComponent } from './ai-configuration-settings.component';

describe('AiConfigurationSettingsComponent', () => {
  let fixture: ComponentFixture<AiConfigurationSettingsComponent>;
  let element: HTMLElement;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    invoke = vi.fn(async (channel: string, request?: unknown) => {
      if (channel === 'ai:config:load') return configuration();
      if (channel === 'ai:config:load-api-key') {
        const { providerId } = request as { providerId: string };
        return providerId === 'openrouter' ? 'sk-or-loaded-1234' : null;
      }
      if (channel === 'ai:config:save-api-key') {
        const { apiKey } = request as SaveAiApiKeyRequest;
        return apiKey
          ? { configured: true, suffix: apiKey.slice(-4) }
          : { configured: false, suffix: null };
      }
      if (channel === 'ai:config:save-server-url') {
        return (request as SaveAiServerUrlRequest).serverUrl;
      }
      throw new Error(`Unexpected IPC channel: ${channel}`);
    });
    await TestBed.configureTestingModule({
      imports: [AiConfigurationSettingsComponent],
      providers: [
        { provide: ElectronService, useValue: { invoke } },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiConfigurationSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('groups all supported cloud and local providers', () => {
    expect(element.querySelectorAll('.provider-card')).toHaveLength(6);
    expect(element.textContent).toContain('OpenRouter');
    expect(element.textContent).toContain('Google Gemini');
    expect(element.textContent).toContain('OpenAI');
    expect(element.textContent).toContain('Anthropic');
    expect(element.textContent).toContain('Ollama');
    expect(element.textContent).toContain('LM Studio');
  });

  it('shows a distinct inline SVG icon for every provider', () => {
    const icons = [...element.querySelectorAll<SVGElement>('.provider-mark svg')];

    expect(icons).toHaveLength(6);
    expect(new Set(icons.map((icon) => icon.dataset['providerIcon'])).size).toBe(6);
    expect(
      element.querySelector('[data-provider-icon="openai"] path')?.getAttribute('fill'),
    ).toBe('currentColor');
  });

  it('loads the full saved key on focus and allows revealing it', async () => {
    clickProvider('openrouter');

    const input = element.querySelector<HTMLInputElement>('#openrouter-api-key')!;
    expect(input.value).toBe('••••••••1234');
    expect(input.type).toBe('text');
    expect(element.querySelector('.visibility-button')).toBeNull();

    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(input.value).toBe('••••••••1234');
    expect(input.type).toBe('password');
    expect(element.querySelector('.visibility-button')).not.toBeNull();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(input.value).toBe('sk-or-loaded-1234');

    element.querySelector<HTMLButtonElement>('.visibility-button')!.click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
    expect(input.value).toBe('sk-or-loaded-1234');

    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(input.value).toBe('••••••••1234');

    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(element.querySelector('.visibility-button')).not.toBeNull();
    expect(input.type).toBe('password');
    expect(input.value).toBe('sk-or-loaded-1234');

    element.querySelector<HTMLButtonElement>('.visibility-button')!.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('sk-or-loaded-1234');
  });

  it('saves an API key only after blur and replaces the draft with a new mask', async () => {
    clickProvider('openai');
    const input = element.querySelector<HTMLInputElement>('#openai-api-key')!;
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    setInputValue(input, 'sk-new-key-abcd');
    expect(saveCalls('ai:config:save-api-key')).toHaveLength(0);

    input.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveCalls('ai:config:save-api-key')).toEqual([
      ['ai:config:save-api-key', { providerId: 'openai', apiKey: 'sk-new-key-abcd' }],
    ]);
    expect(input.value).toBe('••••••••abcd');

    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    const visibilityButton = element.querySelector<HTMLButtonElement>('.visibility-button')!;
    expect(visibilityButton).not.toBeNull();
    expect(input.type).toBe('password');
    expect(input.value).toBe('sk-new-key-abcd');

    visibilityButton.click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
    expect(input.value).toBe('sk-new-key-abcd');
  });

  it('deletes a configured API key when its complete value is cleared', async () => {
    clickProvider('openrouter');
    const input = element.querySelector<HTMLInputElement>('#openrouter-api-key')!;
    input.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();

    setInputValue(input, '');
    expect(input.value).toBe('');

    input.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveCalls('ai:config:save-api-key')).toContainEqual([
      'ai:config:save-api-key',
      { providerId: 'openrouter', apiKey: '' },
    ]);
    expect(input.value).toBe('');
    expect(element.querySelector('.visibility-button')).toBeNull();
    expect(element.querySelector('.field-status')?.textContent?.trim()).toBe('');
  });

  it('flushes a changed local URL immediately on blur', async () => {
    clickProvider('ollama');
    const input = element.querySelector<HTMLInputElement>('#ollama-server-url')!;

    setInputValue(input, 'https://localhost:22000/v1');
    input.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveCalls('ai:config:save-server-url')).toEqual([
      [
        'ai:config:save-server-url',
        { providerId: 'ollama', serverUrl: 'https://localhost:22000/v1' },
      ],
    ]);
    expect(element.querySelector('.field-status')?.textContent).toContain('Saved');
  });

  it('does not persist empty or invalid values', async () => {
    clickProvider('lm-studio');
    const input = element.querySelector<HTMLInputElement>('#lm-studio-server-url')!;

    setInputValue(input, 'not a URL');
    input.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveCalls('ai:config:save-server-url')).toHaveLength(0);
    expect(element.querySelector('.field-status')?.textContent).toContain(
      'Enter a valid absolute server URL.',
    );
  });

  it('keeps a newer key draft when an older save finishes later', async () => {
    let resolveFirstSave!: (value: { configured: true; suffix: string }) => void;
    const firstSave = new Promise<{ configured: true; suffix: string }>((resolve) => {
      resolveFirstSave = resolve;
    });
    let saveNumber = 0;
    invoke.mockImplementation(async (channel: string, request?: unknown) => {
      if (channel === 'ai:config:load') return configuration();
      if (channel === 'ai:config:load-api-key') return null;
      if (channel === 'ai:config:save-api-key') {
        saveNumber += 1;
        if (saveNumber === 1) return firstSave;
        const { apiKey } = request as SaveAiApiKeyRequest;
        return { configured: true, suffix: apiKey.slice(-4) };
      }
      return (request as SaveAiServerUrlRequest).serverUrl;
    });

    clickProvider('anthropic');
    const input = element.querySelector<HTMLInputElement>('#anthropic-api-key')!;
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    setInputValue(input, 'sk-ant-first-1111');
    input.dispatchEvent(new FocusEvent('blur'));
    await Promise.resolve();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    setInputValue(input, 'sk-ant-second-2222');
    resolveFirstSave({ configured: true, suffix: '1111' });
    await Promise.resolve();
    fixture.detectChanges();

    expect(input.value).toBe('sk-ant-second-2222');

    input.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('••••••••2222');
  });

  it('keeps the eye available when a save finishes after the field is refocused', async () => {
    let resolveSave!: (value: { configured: true; suffix: string }) => void;
    const pendingSave = new Promise<{ configured: true; suffix: string }>((resolve) => {
      resolveSave = resolve;
    });
    invoke.mockImplementation(async (channel: string, request?: unknown) => {
      if (channel === 'ai:config:load') return configuration();
      if (channel === 'ai:config:load-api-key') return null;
      if (channel === 'ai:config:save-api-key') return pendingSave;
      return (request as SaveAiServerUrlRequest).serverUrl;
    });

    clickProvider('openai');
    const input = element.querySelector<HTMLInputElement>('#openai-api-key')!;
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    setInputValue(input, 'sk-refocused-abcd');

    input.dispatchEvent(new FocusEvent('blur'));
    await Promise.resolve();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    resolveSave({ configured: true, suffix: 'abcd' });
    await fixture.whenStable();
    fixture.detectChanges();

    const visibilityButton = element.querySelector<HTMLButtonElement>('.visibility-button');
    expect(visibilityButton).not.toBeNull();
    expect(input.type).toBe('password');
    expect(input.value).toBe('sk-refocused-abcd');

    visibilityButton!.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('sk-refocused-abcd');
  });

  function clickProvider(providerId: string): void {
    element.querySelector<HTMLButtonElement>(`[data-provider="${providerId}"]`)!.click();
    fixture.detectChanges();
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function saveCalls(channel: string): unknown[][] {
    return invoke.mock.calls.filter(([calledChannel]) => calledChannel === channel);
  }

  function configuration(): AiProviderConfiguration {
    return {
      apiKeys: {
        openrouter: { configured: true, suffix: '1234' },
        google: { configured: false, suffix: null },
        openai: { configured: false, suffix: null },
        anthropic: { configured: false, suffix: null },
      },
      serverUrls: {
        ollama: 'http://localhost:11434',
        'lm-studio': null,
      },
    };
  }
});
