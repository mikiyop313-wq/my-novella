import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { ToastService } from '../../../../../shared/services/toast.service';
import { AiGeneratedBlockComponent } from '../ai-generated-block.component';
import { AiStreamEditorService } from '../../../helpers/ai/ai-stream-editor.service';
import { ManuscriptAiRequestService } from '../../../helpers/ai/manuscript-ai-request.service';

describe('AiGeneratedBlockComponent', () => {
  let component: AiGeneratedBlockComponent;
  let fixture: ComponentFixture<AiGeneratedBlockComponent>;

  const aiStreamEditor = {
    loadingState: new Map(),
    hasActiveSceneGeneration: vi.fn(() => false),
    isSceneGenerationOwner: vi.fn(() => false),
  };
  const manuscriptAiRequest = {
    findPromptSource: vi.fn(),
    prepare: vi.fn(),
  };
  const toastService = { error: vi.fn() };

  beforeEach(async () => {
    aiStreamEditor.loadingState.clear();
    aiStreamEditor.hasActiveSceneGeneration.mockReset();
    aiStreamEditor.hasActiveSceneGeneration.mockReturnValue(false);
    aiStreamEditor.isSceneGenerationOwner.mockReset();
    aiStreamEditor.isSceneGenerationOwner.mockReturnValue(false);

    await TestBed.configureTestingModule({
      imports: [AiGeneratedBlockComponent],
      providers: [
        { provide: AiStreamEditorService, useValue: aiStreamEditor },
        { provide: ManuscriptAiRequestService, useValue: manuscriptAiRequest },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiGeneratedBlockComponent);
    component = fixture.componentInstance;
    setNode({
      id: 'block-1',
      modelId: 'openrouter/example-model-with-a-long-name',
      reasoningText: 'The response follows the requested scene direction.',
      textContent: 'Three generated words',
    });
  });

  afterEach(() => fixture.destroy());

  it('condenses metadata and keeps reasoning collapsed by default', () => {
    const metadata = fixture.nativeElement.querySelector('.ai-metadata') as HTMLElement;
    const reasoningToggle = metadata.querySelector('.reasoning-toggle') as HTMLButtonElement;
    const actionButtons = fixture.nativeElement.querySelectorAll(
      '.main-actions .action-btn',
    ) as NodeListOf<HTMLButtonElement>;
    const actionLabels = Array.from(
      actionButtons,
      button => button.textContent?.trim(),
    );

    expect(metadata.textContent).toContain('AI draft');
    expect(metadata.textContent).toContain('openrouter/example-model-with-a-long-name');
    expect(metadata.textContent).toContain('3 words');
    expect(reasoningToggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.reasoning-block')).toBeNull();
    expect(actionLabels).toEqual(['Discard', 'Copy', 'Try Again', 'Modify', 'Apply']);
  });

  it('expands and collapses reasoning through its button control', () => {
    const reasoningToggle = fixture.nativeElement.querySelector('.reasoning-toggle') as HTMLButtonElement;

    reasoningToggle.click();
    fixture.detectChanges();

    expect(reasoningToggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.reasoning-content')?.textContent)
      .toContain('The response follows the requested scene direction.');

    reasoningToggle.click();
    fixture.detectChanges();

    expect(reasoningToggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.reasoning-block')).toBeNull();
  });

  it('shows quiet live feedback and hides review actions while loading', () => {
    aiStreamEditor.loadingState.get('block-1')?.set('loading');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ai-generated-container').classList)
      .toContain('is-loading');
    expect(fixture.nativeElement.querySelector('.word-count.is-live')?.textContent).toContain('3 words');
    expect(fixture.nativeElement.querySelector('.live-dot')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.ai-post-actions')).toBeNull();
  });

  it('keeps empty optional metadata out of the condensed row', () => {
    setNode({ id: 'block-2', textContent: '' });

    const metadata = fixture.nativeElement.querySelector('.ai-metadata') as HTMLElement;

    expect(metadata.textContent?.trim()).toBe('AI draft');
    expect(metadata.querySelector('.ai-model')).toBeNull();
    expect(metadata.querySelector('.reasoning-toggle')).toBeNull();
    expect(metadata.querySelector('.word-count')).toBeNull();
  });

  it('preserves modification mode and disables blocked generation actions', () => {
    const modifyButton = fixture.nativeElement.querySelector('.action-btn.modify') as HTMLButtonElement;
    modifyButton.click();
    fixture.detectChanges();

    const updateButton = fixture.nativeElement.querySelector('.modify-btns .apply') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('.modify-input')).not.toBeNull();
    expect(updateButton.disabled).toBe(true);

    component.modifyPrompt.set('Make the description more concise.');
    fixture.detectChanges();
    expect(updateButton.disabled).toBe(false);

    component.toggleModify();
    component.isSceneGenerationBlocked = signal(true);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.action-btn.retry') as HTMLButtonElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('.action-btn.modify') as HTMLButtonElement).disabled).toBe(true);
  });

  function setNode({
    id,
    modelId = '',
    reasoningText = '',
    textContent,
  }: {
    id: string;
    modelId?: string;
    reasoningText?: string;
    textContent: string;
  }): void {
    fixture.componentRef.setInput('node', {
      attrs: { id, modelId, reasoningText },
      textContent,
    });
    fixture.componentRef.setInput('getPos', () => undefined);
    fixture.detectChanges();
  }
});
