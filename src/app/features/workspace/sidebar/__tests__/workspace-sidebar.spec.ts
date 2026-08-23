import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexSidebarSection } from '../../../codex/components/codex-sidebar-section/codex-sidebar-section';
import { GeneralNotesSidebarSection } from '../../../notes/components/general-notes-sidebar-section/general-notes-sidebar-section';
import { WorkspaceSidebar } from '../workspace-sidebar';
import { WorkspaceStore } from '../../workspace.store';

@Component({ selector: 'app-codex-sidebar-section', standalone: true, template: '<div>Codex content</div>' })
class CodexSidebarStub {}

@Component({ selector: 'app-general-notes-sidebar-section', standalone: true, template: '<div>Notes content</div>' })
class GeneralNotesSidebarStub {}

describe('WorkspaceSidebar', () => {
  let fixture: ComponentFixture<WorkspaceSidebar>;
  let sidebarOpen: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    sidebarOpen = signal(true);
    await TestBed.configureTestingModule({
      imports: [WorkspaceSidebar],
      providers: [{
        provide: WorkspaceStore,
        useValue: {
          sidebarOpen,
          toggleSidebar: vi.fn(),
        },
      }],
    })
      .overrideComponent(WorkspaceSidebar, {
        remove: { imports: [CodexSidebarSection, GeneralNotesSidebarSection] },
        add: { imports: [CodexSidebarStub, GeneralNotesSidebarStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WorkspaceSidebar);
    fixture.detectChanges();
  });

  it('starts on Codex with linked tab and panel semantics', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    const codexSection = fixture.nativeElement.querySelector('app-codex-sidebar-section') as HTMLElement;
    const notesSection = fixture.nativeElement.querySelector('app-general-notes-sidebar-section') as HTMLElement;

    expect(tabs[0]?.getAttribute('aria-controls')).toBe('codex-reference-panel');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.tabIndex).toBe(0);
    expect(codexSection.getAttribute('aria-labelledby')).toBe('codex-reference-tab');
    expect(codexSection.classList.contains('section-hidden')).toBe(false);
    expect(notesSection.classList.contains('section-hidden')).toBe(true);
    expect(notesSection.getAttribute('aria-hidden')).toBe('true');
    expect(notesSection.hasAttribute('inert')).toBe(true);
  });

  it('switches the active reference section between Codex and Notes', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    const tabList = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
    const codexSection = fixture.nativeElement.querySelector('app-codex-sidebar-section') as HTMLElement;
    const notesSection = fixture.nativeElement.querySelector('app-general-notes-sidebar-section') as HTMLElement;

    tabs[1]?.click();
    fixture.detectChanges();

    expect(tabList.classList.contains('notes-active')).toBe(true);
    expect(codexSection.classList.contains('section-hidden')).toBe(true);
    expect(codexSection.hasAttribute('inert')).toBe(true);
    expect(notesSection.classList.contains('section-hidden')).toBe(false);
    expect(notesSection.hasAttribute('inert')).toBe(false);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.tabIndex).toBe(0);
  });

  it('supports arrow, Home, and End navigation between tabs', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;

    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSection()).toBe('notes');
    expect(document.activeElement).toBe(tabs[1]);

    tabs[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSection()).toBe('codex');
    expect(document.activeElement).toBe(tabs[0]);

    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSection()).toBe('notes');
  });

  it('keeps the Notes component mounted while switching sections', () => {
    const componentBeforeSwitch = fixture.debugElement.query(By.directive(GeneralNotesSidebarStub)).componentInstance;
    fixture.componentInstance.selectSection('notes');
    fixture.detectChanges();

    const componentAfterSwitch = fixture.debugElement.query(By.directive(GeneralNotesSidebarStub)).componentInstance;
    expect(componentAfterSwitch).toBe(componentBeforeSwitch);
  });

  it('preserves the selected section while collapsing and expanding the sidebar', () => {
    fixture.componentInstance.selectSection('notes');
    sidebarOpen.set(false);
    fixture.detectChanges();
    sidebarOpen.set(true);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSection()).toBe('notes');
    expect(fixture.nativeElement.querySelector('#notes-reference-panel').getAttribute('aria-hidden')).toBe('false');
  });
});
