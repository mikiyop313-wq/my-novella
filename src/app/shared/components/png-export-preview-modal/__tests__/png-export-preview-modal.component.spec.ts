import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronService } from '../../../../core/services/electron.service';
import { PngExportPreviewModalComponent } from '../png-export-preview-modal.component';

const PREVIEW_HTML = `
  <section class="scene">
    <h2 class="scene-heading">Scene 1 — The Crossing</h2>
    <div class="scene-prose">
      <p><strong>Actual prose</strong> with <a href="https://example.com">a link</a>.</p>
      <pre><code>const crossing = true;</code></pre>
    </div>
  </section>
`;

describe('PngExportPreviewModalComponent', () => {
  let fixture: ComponentFixture<PngExportPreviewModalComponent>;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'manuscript-export:preview-content') {
        return Promise.resolve({ html: PREVIEW_HTML });
      }
      return Promise.resolve({ status: 'saved', filePath: 'C:\\Exports\\scene.png' });
    });

    await TestBed.configureTestingModule({
      imports: [PngExportPreviewModalComponent],
      providers: [{ provide: ElectronService, useValue: { invoke } }],
    }).compileComponents();

    fixture = TestBed.createComponent(PngExportPreviewModalComponent);
    fixture.componentRef.setInput('target', { mode: 'scene', id: 'scene-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    vi.restoreAllMocks();
  });

  it('loads actual preview content once with the default appearance', () => {
    expect(document.querySelector('.cdk-overlay-container .png-preview-modal')).not.toBeNull();
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('manuscript-export:preview-content', {
      mode: 'scene',
      id: 'scene-1',
    });

    const preview = previewElement();
    expect(preview.classList).toContain('preview-dark');
    expect(preview.style.width).toBe('700px');
    expect(preview.style.fontSize).toBe('16px');
    expect(preview.querySelector('.scene-heading')?.textContent).toContain('The Crossing');
    expect(preview.querySelector('strong')?.textContent).toBe('Actual prose');
    expect(preview.querySelector('pre code')?.textContent).toContain('crossing');

    const slider = modalElement().querySelector<HTMLInputElement>('#png-font-size')!;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('8');
    expect(slider.max).toBe('24');
    expect(modalElement().querySelector('.export-resolution')?.textContent).toContain(
      '1400 px wide (2× resolution)',
    );
  });

  it('updates theme, font size, and width immediately without another IPC request', () => {
    invoke.mockClear();

    fixture.componentInstance.updateFontSize('20');
    fixture.componentInstance.updateWidth('4096');
    fixture.componentInstance.setTheme('light');
    fixture.detectChanges();

    const preview = previewElement();
    expect(preview.classList).toContain('preview-light');
    expect(preview.style.fontSize).toBe('20px');
    expect(preview.style.width).toBe('4096px');
    expect(modalElement().querySelector('.export-resolution')?.textContent).toContain(
      '8192 px wide (2× resolution)',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('applies the selected export mode to the preview hierarchy', () => {
    const exportRoot = previewElement().querySelector<HTMLElement>('.export-root')!;
    expect(exportRoot.classList).toContain('export-mode-scene');

    fixture.componentRef.setInput('target', { mode: 'chapter', id: 'chapter-1' });
    fixture.detectChanges();
    expect(exportRoot.classList).toContain('export-mode-chapter');
    expect(exportRoot.classList).not.toContain('export-mode-scene');

    fixture.componentRef.setInput('target', { mode: 'act', id: 'act-1' });
    fixture.detectChanges();
    expect(exportRoot.classList).toContain('export-mode-act');
    expect(exportRoot.classList).not.toContain('export-mode-chapter');
  });

  it('promotes selected and descendant headings in the preview', () => {
    fixture.componentRef.setInput('target', { mode: 'act', id: 'act-1' });
    fixture.componentInstance.previewHtml.set(`
      <section class="act">
        <h1 class="act-number">ACT 1</h1>
        <h2 class="act-title">Act title</h2>
      </section>
      <section class="chapter">
        <h1 class="chapter-heading">Chapter 1</h1>
        <section class="scene"><h2 class="scene-heading">Scene 1</h2></section>
      </section>
    `);
    fixture.detectChanges();

    expectHeadingSize('.act-number', '2.5em');
    expectHeadingSize('.act-title', '2.5em');
    expectHeadingSize('.chapter-heading', '2em');
    expectHeadingSize('.scene-heading', '1.75em');

    fixture.componentRef.setInput('target', { mode: 'chapter', id: 'chapter-1' });
    fixture.componentInstance.previewHtml.set(`
      <section class="chapter">
        <h1 class="chapter-heading">Chapter 1</h1>
        <section class="scene"><h2 class="scene-heading">Scene 1</h2></section>
      </section>
    `);
    fixture.detectChanges();

    expectHeadingSize('.chapter-heading', '2.5em');
    expectHeadingSize('.scene-heading', '2em');

    fixture.componentRef.setInput('target', { mode: 'scene', id: 'scene-1' });
    fixture.componentInstance.previewHtml.set(
      '<section class="scene"><h2 class="scene-heading">Scene 1</h2></section>',
    );
    fixture.detectChanges();

    expectHeadingSize('.scene-heading', '2.5em');
  });

  it('uses compact spacing between hierarchy levels in the preview', () => {
    fixture.componentRef.setInput('target', { mode: 'book', id: 'book-1' });
    fixture.componentInstance.previewHtml.set(`
      <header class="book-title"><h1>Book title</h1><p>by Author</p></header>
      <section class="act"><h1 class="act-number">ACT 1</h1></section>
      <section class="chapter">
        <h1 class="chapter-heading">Chapter 1</h1>
        <section class="scene"><h2 class="scene-heading">Scene 1</h2></section>
      </section>
    `);
    fixture.detectChanges();

    expectSpacing('.book-title', { paddingTop: '80px', paddingBottom: '112px' });
    expectSpacing('.act', { paddingTop: '48px', paddingBottom: '32px' });
    expectSpacing('.chapter', { paddingTop: '36px' });
    expectSpacing('.chapter-heading', { marginBottom: '24px' });
    expectSpacing('.scene-heading', { marginTop: '24px', marginBottom: '12px' });
  });

  it('keeps the full preview width inside a two-direction scrolling workspace', () => {
    fixture.componentInstance.updateWidth('4096');
    fixture.detectChanges();

    const workspace = modalElement().querySelector<HTMLElement>('.png-preview-workspace')!;
    expect(previewElement().style.width).toBe('4096px');
    expect(getComputedStyle(workspace).overflow).toBe('auto');
    expect(workspace.querySelector('.png-preview-scroll-content')).not.toBeNull();
  });

  it('prevents preview link navigation while keeping text selectable', () => {
    const preview = previewElement();
    const link = preview.querySelector<HTMLAnchorElement>('a')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    expect(link.dispatchEvent(click)).toBe(false);
    expect(getComputedStyle(preview).userSelect).toBe('text');
  });

  it('shows an error and disables export when preview content cannot be loaded', async () => {
    fixture.destroy();
    invoke.mockReset().mockRejectedValueOnce(new Error('Preview content failed'));
    fixture = TestBed.createComponent(PngExportPreviewModalComponent);
    fixture.componentRef.setInput('target', { mode: 'scene', id: 'scene-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.previewHtml()).toBeNull();
    expect(fixture.componentInstance.canExport()).toBe(false);
    expect(modalElement().querySelector('[role="alert"]')?.textContent).toContain(
      'Preview content failed',
    );
  });

  it('exports the target with the current live preview options', async () => {
    const exported = vi.fn();
    fixture.componentInstance.exported.subscribe(exported);
    fixture.componentInstance.updateFontSize('20');
    fixture.componentInstance.updateWidth('900');
    fixture.componentInstance.setTheme('light');

    await fixture.componentInstance.exportPng();

    expect(invoke).toHaveBeenLastCalledWith('manuscript-export:save', {
      mode: 'scene',
      id: 'scene-1',
      format: 'png',
      pngOptions: { fontSize: 20, theme: 'light', width: 900 },
    });
    expect(exported).toHaveBeenCalledOnce();
  });

  function modalElement(): HTMLElement {
    const element = document.querySelector<HTMLElement>('.cdk-overlay-container .png-preview-modal');
    if (!element) throw new Error('Expected PNG preview modal overlay.');
    return element;
  }

  function previewElement(): HTMLElement {
    const element = modalElement().querySelector<HTMLElement>('.png-document-preview');
    if (!element) throw new Error('Expected simulated PNG document preview.');
    return element;
  }

  function expectHeadingSize(selector: string, size: string): void {
    const heading = previewElement().querySelector<HTMLElement>(selector);
    if (!heading) throw new Error(`Expected preview heading "${selector}".`);
    expect(getComputedStyle(heading).fontSize).toBe(size);
  }

  function expectSpacing(selector: string, expected: Partial<CSSStyleDeclaration>): void {
    const element = previewElement().querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Expected preview element "${selector}".`);

    const styles = getComputedStyle(element);
    for (const [property, value] of Object.entries(expected)) {
      expect(styles[property as keyof CSSStyleDeclaration]).toBe(value);
    }
  }
});
