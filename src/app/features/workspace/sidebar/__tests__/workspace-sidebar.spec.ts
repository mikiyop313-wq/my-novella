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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceSidebar],
      providers: [{
        provide: WorkspaceStore,
        useValue: {
          sidebarOpen: signal(true),
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

  it('switches the rendered reference section between Codex and Notes', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    const codexSection = fixture.nativeElement.querySelector('app-codex-sidebar-section') as HTMLElement;
    const notesSection = fixture.nativeElement.querySelector('app-general-notes-sidebar-section') as HTMLElement;

    expect(codexSection.classList.contains('section-hidden')).toBe(false);
    expect(notesSection.classList.contains('section-hidden')).toBe(true);

    tabs[1]?.click();
    fixture.detectChanges();

    expect(codexSection.classList.contains('section-hidden')).toBe(true);
    expect(notesSection.classList.contains('section-hidden')).toBe(false);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the Notes component mounted while switching sections', () => {
    const componentBeforeSwitch = fixture.debugElement.query(By.directive(GeneralNotesSidebarStub)).componentInstance;
    fixture.componentInstance.selectSection('notes');
    fixture.detectChanges();

    const componentAfterSwitch = fixture.debugElement.query(By.directive(GeneralNotesSidebarStub)).componentInstance;
    expect(componentAfterSwitch).toBe(componentBeforeSwitch);
  });
});
