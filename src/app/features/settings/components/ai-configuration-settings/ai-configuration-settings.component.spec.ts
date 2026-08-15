import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AiConfigurationSettingsComponent } from './ai-configuration-settings.component';

describe('AiConfigurationSettingsComponent', () => {
  let fixture: ComponentFixture<AiConfigurationSettingsComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiConfigurationSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AiConfigurationSettingsComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('groups all supported cloud and local providers', () => {
    expect(element.querySelector('#cloud-providers-heading')?.textContent).toContain(
      'Cloud providers',
    );
    expect(element.querySelector('#local-providers-heading')?.textContent).toContain(
      'Local providers',
    );
    expect(element.querySelectorAll('.provider-card')).toHaveLength(6);
    expect(element.textContent).toContain('OpenRouter');
    expect(element.textContent).toContain('Google Gemini');
    expect(element.textContent).toContain('OpenAI');
    expect(element.textContent).toContain('Anthropic');
    expect(element.textContent).toContain('Ollama');
    expect(element.textContent).toContain('LM Studio');
  });

  it('shows the selected cloud provider field and preserves API key drafts', () => {
    clickProvider('openrouter');

    const openRouterInput = element.querySelector<HTMLInputElement>('#openrouter-api-key')!;
    expect(openRouterInput.type).toBe('password');
    setInputValue(openRouterInput, 'sk-or-test');

    clickProvider('google');
    expect(element.querySelector('#google-api-key')).not.toBeNull();

    clickProvider('openrouter');
    expect(element.querySelector<HTMLInputElement>('#openrouter-api-key')?.value).toBe(
      'sk-or-test',
    );
  });

  it('toggles API key visibility and resets it when providers change', () => {
    clickProvider('anthropic');

    const visibilityButton = element.querySelector<HTMLButtonElement>('.visibility-button')!;
    visibilityButton.click();
    fixture.detectChanges();

    expect(element.querySelector<HTMLInputElement>('#anthropic-api-key')?.type).toBe('text');
    expect(visibilityButton.getAttribute('aria-pressed')).toBe('true');

    clickProvider('openai');
    expect(element.querySelector<HTMLInputElement>('#openai-api-key')?.type).toBe('password');
  });

  it('shows local server URL fields with placeholders and preserves drafts', () => {
    clickProvider('ollama');

    const ollamaInput = element.querySelector<HTMLInputElement>('#ollama-server-url')!;
    expect(ollamaInput.placeholder).toBe('http://localhost:11434');
    setInputValue(ollamaInput, 'http://localhost:22000');

    clickProvider('lm-studio');
    expect(element.querySelector<HTMLInputElement>('#lm-studio-server-url')?.placeholder).toBe(
      'http://localhost:1234/v1',
    );

    clickProvider('ollama');
    expect(element.querySelector<HTMLInputElement>('#ollama-server-url')?.value).toBe(
      'http://localhost:22000',
    );
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
});
