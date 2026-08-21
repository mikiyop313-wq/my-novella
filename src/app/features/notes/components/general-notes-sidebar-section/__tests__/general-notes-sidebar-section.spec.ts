import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { GeneralNotesSidebarSection } from '../general-notes-sidebar-section';

describe('GeneralNotesSidebarSection', () => {
  let fixture: ComponentFixture<GeneralNotesSidebarSection>;
  let component: GeneralNotesSidebarSection;
  let overlayContainer: OverlayContainer;
  const sidebarOpen = signal(true);

  beforeEach(async () => {
    sidebarOpen.set(true);

    await TestBed.configureTestingModule({
      imports: [GeneralNotesSidebarSection],
      providers: [{
        provide: WorkspaceStore,
        useValue: {
          sidebarOpen,
          openSidebar: vi.fn(() => sidebarOpen.set(true)),
        },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralNotesSidebarSection);
    component = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    overlayContainer.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('creates an untitled note and opens the editor panel', async () => {
    await component.createNote();
    fixture.detectChanges();

    expect(component.notes()).toEqual([{ id: 'general-note-1', title: '', content: '' }]);
    expect(component.selectedNote()?.id).toBe('general-note-1');
    expect(overlayContainer.getContainerElement().querySelector('.note-editor-panel')).not.toBeNull();
  });

  it('keeps live edits when a note is closed and reopened', async () => {
    await component.createNote();
    component.updateSelectedTitle('Revision ideas');
    component.updateSelectedContent('Strengthen the **opening**.');
    component.closeNote();
    component.openNote('general-note-1');

    expect(component.selectedNote()).toEqual({
      id: 'general-note-1',
      title: 'Revision ideas',
      content: 'Strengthen the **opening**.',
    });
  });

  it('filters notes by title and content', async () => {
    await component.createNote();
    component.updateSelectedTitle('Character ideas');
    component.updateSelectedContent('Give Mara a secret.');
    await component.createNote();
    component.updateSelectedTitle('Setting');
    component.updateSelectedContent('A flooded library.');

    component.searchQuery.set('mara');
    expect(component.filteredNotes().map(note => note.title)).toEqual(['Character ideas']);

    component.searchQuery.set('setting');
    expect(component.filteredNotes().map(note => note.title)).toEqual(['Setting']);
  });

  it('deletes the selected note immediately and closes the panel', async () => {
    await component.createNote();

    await component.deleteSelectedNote();

    expect(component.notes()).toEqual([]);
    expect(component.selectedNote()).toBeNull();
  });

  it('renders compact controls when the workspace sidebar is collapsed', () => {
    sidebarOpen.set(false);
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.notes-section') as HTMLElement;
    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(fixture.nativeElement.querySelector('.add-btn')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.search-shell')).not.toBeNull();
  });
});
