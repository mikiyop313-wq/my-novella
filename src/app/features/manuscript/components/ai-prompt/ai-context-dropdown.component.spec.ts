import { TestBed } from '@angular/core/testing';

import type { CodexEntryDto, CodexEntryType } from '../../../../../../shared/models/codex.model';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import { AiContextDropdownComponent, type AiContextSelection } from './ai-context-dropdown.component';

describe('AiContextDropdownComponent', () => {
  async function createComponent() {
    await TestBed.configureTestingModule({ imports: [AiContextDropdownComponent] }).compileComponents();
    const fixture = TestBed.createComponent(AiContextDropdownComponent);
    fixture.componentRef.setInput('hierarchy', createHierarchy());
    fixture.componentRef.setInput('codexEntries', [
      createCodexEntry('char-2', 'Zara', 'character'),
      createCodexEntry('char-1', 'Ari', 'character'),
      createCodexEntry('loc-1', 'Harbor', 'location'),
      createCodexEntry('archived', 'Old Hero', 'character', 'archived'),
    ]);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('cascades novel selections and reports checked and indeterminate parent states', async () => {
    const { fixture, component } = await createComponent();
    let emitted: AiContextSelection | undefined;
    component.selectionChange.subscribe(value => emitted = value);

    component.toggleScenes(component.allSceneIds());
    expect(emitted?.sceneIds).toEqual(['scene-1', 'scene-2', 'scene-3']);

    fixture.componentRef.setInput('sceneIds', ['scene-1']);
    fixture.detectChanges();
    expect(component.sceneState(component.allSceneIds())).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });

    fixture.componentRef.setInput('sceneIds', ['scene-1', 'scene-2', 'scene-3']);
    fixture.detectChanges();
    expect(component.sceneState(component.allSceneIds()).checked).toBe(true);

    component.toggleScenes(component.allSceneIds());
    expect(emitted?.sceneIds).toEqual([]);
  });

  it('toggles Act and Chapter descendants without selecting unrelated scenes', async () => {
    const { fixture, component } = await createComponent();
    const emitted: AiContextSelection[] = [];
    component.selectionChange.subscribe(value => emitted.push(value));
    const firstAct = component.hierarchy()[0];
    const firstChapter = firstAct.chapters![0];

    component.toggleScenes(component.scenesForAct(firstAct).map(scene => scene.id));
    expect(emitted.at(-1)?.sceneIds).toEqual(['scene-1', 'scene-2']);

    fixture.componentRef.setInput('sceneIds', ['scene-1', 'scene-2']);
    fixture.detectChanges();
    component.toggleScenes(component.scenesForAct(firstAct).map(scene => scene.id));
    expect(emitted.at(-1)?.sceneIds).toEqual([]);

    fixture.componentRef.setInput('sceneIds', []);
    fixture.detectChanges();
    component.toggleScenes(component.scenesForChapter(firstChapter).map(scene => scene.id));
    expect(emitted.at(-1)?.sceneIds).toEqual(['scene-1', 'scene-2']);
    expect(emitted.at(-1)?.sceneIds).not.toContain('scene-3');

    fixture.componentRef.setInput('sceneIds', ['scene-1', 'scene-2']);
    fixture.detectChanges();
    component.toggleScenes(component.scenesForChapter(firstChapter).map(scene => scene.id));
    expect(emitted.at(-1)?.sceneIds).toEqual([]);
  });

  it('keeps a leaf selection isolated and derives mixed and checked ancestor states', async () => {
    const { fixture, component } = await createComponent();
    const firstAct = component.hierarchy()[0];
    const firstChapter = firstAct.chapters![0];

    fixture.componentRef.setInput('sceneIds', ['scene-1']);
    fixture.detectChanges();

    expect(component.sceneState(['scene-2']).checked).toBe(false);
    expect(component.sceneState(component.scenesForChapter(firstChapter).map(scene => scene.id))).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });
    expect(component.sceneState(component.scenesForAct(firstAct).map(scene => scene.id)).checked).toBe(false);
    expect(component.sceneState(component.allSceneIds()).checked).toBe(false);

    fixture.componentRef.setInput('sceneIds', ['scene-1', 'scene-2']);
    fixture.detectChanges();

    expect(component.sceneState(component.scenesForChapter(firstChapter).map(scene => scene.id)).checked).toBe(true);
    expect(component.sceneState(component.scenesForAct(firstAct).map(scene => scene.id)).checked).toBe(true);
    expect(component.sceneState(component.allSceneIds())).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });
  });

  it('cascades Codex categories, filters archived entries, and avoids duplicates', async () => {
    const { fixture, component } = await createComponent();
    let emitted: AiContextSelection | undefined;
    component.selectionChange.subscribe(value => emitted = value);
    const characterIds = component.entriesForType('character').map(entry => entry.id);

    expect(characterIds).toEqual(['char-1', 'char-2']);
    fixture.componentRef.setInput('codexEntryIds', ['char-1', 'char-1']);
    fixture.detectChanges();
    component.toggleCodex(characterIds);

    expect(emitted?.codexEntryIds).toEqual(['char-1', 'char-2']);
    expect(component.codexState(characterIds)).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });

    fixture.componentRef.setInput('codexEntryIds', ['char-1', 'char-2']);
    fixture.detectChanges();
    expect(component.codexState(characterIds).checked).toBe(true);

    component.toggleCodex(characterIds);
    expect(emitted?.codexEntryIds).toEqual([]);
  });

  it('compacts complete branches into parent chips and partial branches into leaf chips', async () => {
    const { fixture, component } = await createComponent();

    fixture.componentRef.setInput('includeFullOutline', true);
    fixture.componentRef.setInput('sceneIds', ['scene-1', 'scene-2']);
    fixture.componentRef.setInput('codexEntryIds', ['char-1', 'char-2', 'loc-1']);
    fixture.detectChanges();

    expect(component.chips().map(chip => chip.label)).toEqual([
      'Full Outline',
      'Act One',
      'Characters',
      'Locations',
    ]);

    fixture.componentRef.setInput('sceneIds', ['scene-1']);
    fixture.componentRef.setInput('codexEntryIds', ['char-1']);
    fixture.detectChanges();
    expect(component.chips().map(chip => chip.label)).toEqual(['Full Outline', 'Opening', 'Ari']);

    fixture.componentRef.setInput('includeFullOutline', false);
    fixture.componentRef.setInput('sceneIds', ['scene-3']);
    fixture.componentRef.setInput('codexEntryIds', []);
    fixture.detectChanges();
    expect(component.chips().map(chip => chip.label)).toEqual(['Act Two']);
  });

  it('renders selected-chip removal controls with an icon instead of a text glyph', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('sceneIds', ['scene-1']);
    fixture.detectChanges();

    const removeButton = fixture.nativeElement.querySelector('.chip button') as HTMLButtonElement;
    expect(removeButton.textContent?.trim()).toBe('');
    expect(removeButton.querySelector('svg')).toBeTruthy();
    expect(removeButton.getAttribute('aria-label')).toBe('Remove Opening');
  });

  it('promotes a selected scene through single-child ancestors up to Novel', async () => {
    const { fixture, component } = await createComponent();
    fixture.componentRef.setInput('hierarchy', [
      createAct('only-act', 'Only Act', [
        createChapter('only-chapter', 'Only Chapter', [
          createScene('only-scene', 'Only Scene', 0),
        ]),
      ]),
    ]);
    fixture.componentRef.setInput('sceneIds', ['only-scene']);
    fixture.detectChanges();

    expect(component.chips().map(chip => chip.label)).toEqual(['Novel']);
  });

  it('searches descendants while retaining their ancestor path', async () => {
    const { component } = await createComponent();
    component.searchTerm.set('ending');

    expect(component.actVisible(component.hierarchy()[1])).toBe(true);
    expect(component.actVisible(component.hierarchy()[0])).toBe(false);
    expect(component.sceneVisible(component.hierarchy()[1].chapters![0].scenes![0])).toBe(true);

    component.searchTerm.set('harbor');
    expect(component.categoryVisible(component.codexCategories[1])).toBe(true);
    expect(component.categoryVisible(component.codexCategories[0])).toBe(false);
  });

  it('searches every selectable context row using direct label and alias matches', async () => {
    const { fixture, component } = await createComponent();
    fixture.componentRef.setInput('codexEntries', [
      createCodexEntry('char-2', 'Zara', 'character'),
      createCodexEntry('char-1', 'Ari', 'character', 'active', 'The Protagonist'),
      createCodexEntry('loc-1', 'Harbor', 'location'),
      createCodexEntry('archived', 'Old Hero', 'character', 'archived'),
    ]);
    fixture.detectChanges();

    const matches = (term: string) => {
      component.searchTerm.set(term);
      return component.searchResults();
    };

    expect(matches('outline').map(result => result.label)).toEqual(['Full Outline']);
    expect(matches('novel').map(result => result.label)).toEqual(['Novel']);
    expect(matches('act one').map(result => result.label)).toEqual(['Act One']);
    expect(matches('chapter one').map(result => result.label)).toEqual(['Chapter One']);
    expect(matches('opening').map(result => result.label)).toEqual(['Opening']);
    expect(matches('characters').map(result => result.label)).toEqual(['Characters']);
    expect(matches('harbor').map(result => result.label)).toEqual(['Harbor']);
    expect(matches('protagonist').map(result => result.label)).toEqual(['Ari']);
    expect(matches('old hero')).toEqual([]);
  });

  it('toggles search results at their native scope and exposes parent selection state', async () => {
    const { fixture, component } = await createComponent();
    const emitted: AiContextSelection[] = [];
    component.selectionChange.subscribe(value => emitted.push(value));

    component.searchTerm.set('outline');
    component.toggleSearchResult(component.searchResults()[0]);
    expect(emitted.at(-1)?.includeFullOutline).toBe(true);

    component.searchTerm.set('act one');
    const actResult = component.searchResults()[0];
    component.toggleSearchResult(actResult);
    expect(emitted.at(-1)?.sceneIds).toEqual(['scene-1', 'scene-2']);

    fixture.componentRef.setInput('sceneIds', ['scene-1']);
    fixture.detectChanges();
    expect(component.searchResultState(actResult)).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });

    component.searchTerm.set('characters');
    component.toggleSearchResult(component.searchResults()[0]);
    expect(emitted.at(-1)?.codexEntryIds).toEqual(['char-1', 'char-2']);
  });

  it('excludes empty parents and renders the empty search state', async () => {
    const { fixture, component } = await createComponent();
    fixture.componentRef.setInput('hierarchy', [createAct('empty-act', 'Empty Act', [])]);
    fixture.componentRef.setInput('codexEntries', []);
    fixture.detectChanges();

    component.searchTerm.set('empty act');
    expect(component.searchResults()).toEqual([]);

    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    component.searchTerm.set('missing');
    fixture.detectChanges();

    expect(document.body.textContent).toContain('No context found.');
  });

  it('clears the search with the custom clear button and restores input focus', async () => {
    const { fixture, component } = await createComponent();
    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    component.searchTerm.set('harbor');
    fixture.detectChanges();

    const input = document.querySelector<HTMLInputElement>('.search-wrapper input')!;
    const clearButton = document.querySelector<HTMLButtonElement>('.search-clear')!;
    clearButton.click();
    fixture.detectChanges();

    expect(component.searchTerm()).toBe('');
    expect(document.querySelector('.search-clear')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('keeps the overlay open when a context row is selected', async () => {
    const { fixture } = await createComponent();
    const trigger = fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const outlineRow = document.querySelector('.context-menu .menu-row') as HTMLButtonElement;
    expect(outlineRow).toBeTruthy();
    outlineRow.click();
    fixture.detectChanges();

    expect(document.querySelector('.context-menu')).toBeTruthy();
  });

  it('opens the manuscript-style Novel flyout without closing the root menu', async () => {
    const { fixture } = await createComponent();
    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const novelRow = [...document.querySelectorAll<HTMLButtonElement>('.context-menu .submenu-row')]
      .find(row => row.textContent?.includes('Novel'))!;
    novelRow.click();
    fixture.detectChanges();

    expect(document.querySelectorAll('.context-menu').length).toBe(2);
    expect(document.body.textContent).toContain('Act One');
    expect(document.body.textContent).not.toContain('Full Novel');

    const actRow = [...document.querySelectorAll<HTMLButtonElement>('.context-submenu .submenu-row')]
      .find(row => row.textContent?.includes('Act One'))!;
    actRow.click();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Chapter One');
    expect(document.body.textContent).not.toContain('Full Act');

    const chapterRow = [...document.querySelectorAll<HTMLButtonElement>('.context-submenu .submenu-row')]
      .find(row => row.textContent?.includes('Chapter One'))!;
    chapterRow.click();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Opening');
    expect(document.body.textContent).not.toContain('Full Chapter');
  });

  it('opens Codex entries without adding a redundant category selection row', async () => {
    const { fixture } = await createComponent();
    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const charactersRow = [...document.querySelectorAll<HTMLButtonElement>('.context-menu .submenu-row')]
      .find(row => row.textContent?.includes('Characters'))!;
    charactersRow.click();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Ari');
    expect(document.body.textContent).toContain('Zara');
    expect(document.body.textContent).not.toContain('All Characters');
  });

  it('does not expose flyout affordances when manuscript and Codex parents are empty', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('hierarchy', []);
    fixture.componentRef.setInput('codexEntries', []);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const emptyRows = [...document.querySelectorAll<HTMLButtonElement>('.context-menu .submenu-row')];
    expect(emptyRows.length).toBeGreaterThan(0);
    expect(emptyRows.every(row => row.disabled)).toBe(true);
    expect(emptyRows.every(row => !row.querySelector('.chevron-right'))).toBe(true);

    emptyRows[0].click();
    fixture.detectChanges();
    expect(document.querySelectorAll('.context-menu').length).toBe(1);
  });

  it('closes the previous flyout when another root item is hovered', async () => {
    const { fixture } = await createComponent();
    (fixture.nativeElement.querySelector('.context-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const rootRows = [...document.querySelectorAll<HTMLButtonElement>('.context-menu .submenu-row')];
    rootRows.find(row => row.textContent?.includes('Novel'))!.click();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Act One');

    rootRows.find(row => row.textContent?.includes('Characters'))!
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 150));
    fixture.detectChanges();

    expect(document.querySelectorAll('.context-menu').length).toBe(2);
    expect(document.body.textContent).not.toContain('Act One');
    expect(document.body.textContent).toContain('Ari');
  });
});

function createHierarchy(): ActDto[] {
  return [
    createAct('act-1', 'Act One', [
      createChapter('chapter-1', 'Chapter One', [
        createScene('scene-1', 'Opening', 0),
        createScene('scene-2', 'Crossroads', 1),
      ]),
    ]),
    createAct('act-2', 'Act Two', [
      createChapter('chapter-2', 'Chapter Two', [createScene('scene-3', 'Ending', 0)]),
    ]),
  ];
}

function createAct(id: string, title: string, chapters: ChapterDto[]): ActDto {
  return { id, title, bookId: 'book-1', position: 0, status: 'active', summary: null, chapters };
}

function createChapter(id: string, title: string, scenes: SceneDto[]): ChapterDto {
  return { id, title, actId: 'act-1', position: 0, status: 'active', summary: null, scenes };
}

function createScene(id: string, title: string, position: number): SceneDto {
  return {
    id,
    title,
    chapterId: 'chapter-1',
    position,
    status: 'active',
    prose: null,
    summary: null,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function createCodexEntry(
  id: string,
  name: string,
  type: CodexEntryType,
  status: CodexEntryDto['status'] = 'active',
  alias: string | null = null,
): CodexEntryDto {
  return {
    id,
    bookId: 'book-1',
    type,
    name,
    alias,
    description: null,
    image: null,
    status,
    trackingSetting: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
