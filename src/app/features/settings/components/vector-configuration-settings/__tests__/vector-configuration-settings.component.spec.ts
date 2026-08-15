import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronService } from '../../../../../core/services/electron.service';
import { VectorConfigurationSettingsComponent } from '../vector-configuration-settings.component';

describe('VectorConfigurationSettingsComponent', () => {
  let fixture: ComponentFixture<VectorConfigurationSettingsComponent>;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    invoke = vi.fn();

    await TestBed.configureTestingModule({
      imports: [VectorConfigurationSettingsComponent],
      providers: [{ provide: ElectronService, useValue: { invoke } }],
    }).compileComponents();

    fixture = TestBed.createComponent(VectorConfigurationSettingsComponent);
    fixture.detectChanges();
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

  it('does not invoke backend services when saving or testing', () => {
    selectProvider('openai');
    updateVisibleKey('sk-preview-only');

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLInputElement>('.credential-input input')?.dispatchEvent(
      new FocusEvent('blur'),
    );
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
