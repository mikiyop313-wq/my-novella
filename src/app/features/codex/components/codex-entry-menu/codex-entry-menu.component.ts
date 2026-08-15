import { Component, OnDestroy, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import {
  type CodexEntryDetailDto,
  type CodexEntryNoteDto,
  type CodexEntryProgressionDto,
  type CodexEntryType,
  type CodexTrackingSetting,
} from '../../../../../../shared/models/codex.model';
import {
  type CodexDetachRequest,
  type CodexEntryMenuView,
  type CodexEntryMenuPayload,
  type CodexEntryNoteInput,
  type CodexEntryProgressionPayload,
} from '../../../../../../shared/models/codex-window.model';
import { type ActDto } from '../../../../../../shared/models/manuscript.model';
import { CdkMenuModule } from '@angular/cdk/menu';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';
import { MarkdownEditorComponent } from '../../../../shared/components/markdown-editor/markdown-editor.component';

type CodexEntryProgressionInput = CodexEntryProgressionPayload & {
  localId: string;
};

type SceneMetadata = {
  title: string;
  rank: number;
};

type TrackingOption = {
  value: CodexTrackingSetting;
  title: string;
  description: string;
};

const SELECT_SCENE_LABEL = 'Select scene...';
const UNTITLED_SCENE_LABEL = 'Untitled Scene';
const UNRANKED_SCENE_RANK = Number.MAX_SAFE_INTEGER;

@Component({
  selector: 'app-codex-entry-menu',
  standalone: true,
  imports: [FormsModule, MarkdownEditorComponent, AutocompleteDropdownComponent, CdkMenuModule, InfoIconComponent],
  templateUrl: './codex-entry-menu.html',
  styleUrl: './codex-entry-menu.scss'
})
export class CodexEntryMenuComponent implements OnDestroy {
  readonly INFO_MESSAGES = INFO_MESSAGES;

  readonly initialType = input.required<CodexEntryType>();
  readonly existingEntry = input<CodexEntryDetailDto | null>(null);
  readonly initialDraft = input<CodexEntryMenuPayload | null>(null);
  readonly initialView = input<CodexEntryMenuView | null>(null);
  readonly thumbnailUrl = input<string | null>(null);
  readonly entityDropdownOptions = input.required<DropdownOption[]>();
  readonly bookHierarchy = input<ActDto[]>([]);

  readonly closeMenu = output<void>();
  readonly entryCreated = output<CodexEntryMenuPayload>();
  readonly entryUpdated = output<CodexEntryMenuPayload>();
  readonly archiveEntry = output<void>();
  readonly restoreEntry = output<void>();
  readonly deleteEntry = output<void>();
  readonly detachRequested = output<CodexDetachRequest>();

  readonly entryViews: readonly CodexEntryMenuView[] = ['Description', 'Progression', 'Notes', 'Tracking'];
  readonly trackingOptions: readonly TrackingOption[] = [
    {
      value: 'always_include',
      title: 'Always Include',
      description: 'Forced into context for every generation.',
    },
    {
      value: 'include_when_detected',
      title: 'Include When Detected',
      description: 'Included when the name or aliases appear in recent text.',
    },
    {
      value: 'manual',
      title: 'Manual',
      description: 'Only included when you specifically attach it.',
    },
    {
      value: 'never_include',
      title: 'Never Include',
      description: 'Excluded from AI context completely.',
    },
  ];

  readonly newEntryType = signal<CodexEntryType>('character');
  readonly newEntryName = signal('');
  readonly newEntryAlias = signal('');
  readonly newEntryDescription = signal('');
  readonly newEntryTrackingSetting = signal<CodexTrackingSetting>('include_when_detected');
  readonly newEntryNotes = signal<CodexEntryNoteInput[]>([]);
  readonly newEntryProgression = signal<CodexEntryProgressionInput[]>([]);
  readonly activeEntryView = signal<CodexEntryMenuView>('Description');
  readonly canCreateEntry = computed(() => this.newEntryName().trim().length > 0);
  readonly isEditing = computed(() => this.existingEntry() !== null);
  readonly isArchived = computed(() => this.existingEntry()?.status === 'archived');
  readonly menuTitle = computed(() => this.isEditing() ? 'Edit Codex Entry' : 'New Codex Entry');
  readonly sceneLookup = computed(() => {
    const scenes = new Map<string, SceneMetadata>();
    let rank = 0;

    for (const act of this.bookHierarchy()) {
      for (const chapter of act.chapters ?? []) {
        for (const scene of chapter.scenes ?? []) {
          scenes.set(scene.id, {
            title: scene.title || UNTITLED_SCENE_LABEL,
            rank,
          });
          rank++;
        }
      }
    }

    return scenes;
  });
  readonly sortedProgression = computed(() => this.sortProgression(this.newEntryProgression()));

  private autosaveTimeoutId: number | null = null;
  private appliedEntryId: string | null = null;
  private appliedInitialDraftSignature = '';
  private lastAutosaveSignature = '';

  constructor() {
    effect(() => {
      const entry = this.existingEntry();

      if (entry) {
        if (this.appliedEntryId !== entry.id) {
          this.applyEntry(entry);
          this.appliedEntryId = entry.id;
          this.lastAutosaveSignature = this.getPayloadSignature();
          this.appliedInitialDraftSignature = '';
        }
      } else {
        this.appliedEntryId = null;
        this.lastAutosaveSignature = '';
        this.resetForCreate(this.initialType());
      }

      this.applyInitialDraftIfNeeded();
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    if (this.autosaveTimeoutId !== null) {
      window.clearTimeout(this.autosaveTimeoutId);
      this.autosaveTimeoutId = null;
    }

    this.flushAutosave();
  }

  close(): void {
    if (this.autosaveTimeoutId !== null) {
      window.clearTimeout(this.autosaveTimeoutId);
      this.autosaveTimeoutId = null;
    }

    this.flushAutosave();
    this.closeMenu.emit();
  }

  detachWindow(): void {
    this.detachRequested.emit({
      entryId: this.existingEntry()?.id ?? null,
      initialType: this.newEntryType(),
      draft: this.buildPayload(),
      activeView: this.activeEntryView(),
      isArchived: this.isArchived(),
    });
  }

  selectNewEntryType(type: CodexEntryType): void {
    this.newEntryType.set(type);
    this.queueAutosave();
  }

  updateEntryName(name: string): void {
    this.newEntryName.set(name);
    this.queueAutosave();
  }

  updateEntryAlias(alias: string): void {
    this.newEntryAlias.set(alias);
    this.queueAutosave();
  }

  updateEntryDescription(description: string): void {
    this.newEntryDescription.set(description);
    this.queueAutosave();
  }

  setEntryView(view: CodexEntryMenuView): void {
    this.activeEntryView.set(view);
  }

  selectTrackingSetting(setting: CodexTrackingSetting): void {
    this.newEntryTrackingSetting.set(setting);
    this.queueAutosave();
  }

  addNote(): void {
    this.newEntryNotes.update(notes => [...notes, { id: null, title: '', content: '' }]);
    this.queueAutosave();
  }

  removeNote(index: number): void {
    this.newEntryNotes.update(notes => notes.filter((_, i) => i !== index));
    this.queueAutosave();
  }

  updateNoteTitle(index: number, title: string): void {
    this.updateNote(index, { title });
  }

  updateNoteContent(index: number, content: string): void {
    this.updateNote(index, { content });
  }

  addProgression(): void {
    this.newEntryProgression.update(items => [
      ...items,
      {
        localId: crypto.randomUUID(),
        id: null,
        title: '',
        description: '',
        sceneId: null,
      },
    ]);
    this.queueAutosave();
  }

  removeProgression(localId: string): void {
    this.newEntryProgression.update(items => items.filter(i => i.localId !== localId));
    this.queueAutosave();
  }

  updateProgressionTitle(localId: string, title: string): void {
    this.updateProgression(localId, { title });
  }

  updateProgressionDescription(localId: string, description: string): void {
    this.updateProgression(localId, { description });
  }

  updateProgressionScene(localId: string, sceneId: string | null): void {
    this.updateProgression(localId, { sceneId });
  }

  getSceneTitle(sceneId: string | null): string {
    if (!sceneId) return SELECT_SCENE_LABEL;

    return this.sceneLookup().get(sceneId)?.title ?? SELECT_SCENE_LABEL;
  }

  getSceneNumber(sceneId: string | null): string {
    if (!sceneId) return '';

    const scene = this.sceneLookup().get(sceneId);
    return scene ? String(scene.rank + 1) : '';
  }

  getSceneHoverLabel(sceneId: string | null): string {
    if (!sceneId) return SELECT_SCENE_LABEL;

    const scene = this.sceneLookup().get(sceneId);
    return scene ? `${scene.rank + 1}: ${scene.title}` : SELECT_SCENE_LABEL;
  }

  isSceneSelectedForItem(sceneId: string, localId: string): boolean {
    return this.newEntryProgression().some(item => item.localId === localId && item.sceneId === sceneId);
  }

  isSceneUnavailable(sceneId: string, localId: string): boolean {
    return this.newEntryProgression().some(item => item.localId !== localId && item.sceneId === sceneId);
  }

  submitEntry(): void {
    if (!this.canCreateEntry()) return;

    this.entryCreated.emit(this.buildPayload());
  }

  private applyEntry(entry: CodexEntryDetailDto): void {
    this.newEntryType.set(entry.type);
    this.newEntryName.set(entry.name);
    this.newEntryAlias.set(entry.alias ?? '');
    this.newEntryDescription.set(entry.description ?? '');
    this.newEntryTrackingSetting.set(entry.trackingSetting);
    this.newEntryNotes.set(entry.entryNotes.map(note => this.parseNote(note)));
    this.newEntryProgression.set(entry.entryProgression.map(item => this.parseProgression(item)));
    this.activeEntryView.set('Description');
  }

  private resetForCreate(type: CodexEntryType): void {
    this.newEntryType.set(type);
    this.newEntryName.set('');
    this.newEntryAlias.set('');
    this.newEntryDescription.set('');
    this.newEntryTrackingSetting.set('include_when_detected');
    this.newEntryNotes.set([]);
    this.newEntryProgression.set([]);
    this.activeEntryView.set('Description');
  }

  private applyInitialDraftIfNeeded(): void {
    const draft = this.initialDraft();
    if (!draft) return;

    const signature = JSON.stringify({
      entryId: this.existingEntry()?.id ?? null,
      draft,
      view: this.initialView(),
    });
    if (signature === this.appliedInitialDraftSignature) return;

    this.appliedInitialDraftSignature = signature;
    this.applyDraft(draft);

    const initialView = this.initialView();
    if (initialView) {
      this.activeEntryView.set(initialView);
    }
  }

  private applyDraft(draft: CodexEntryMenuPayload): void {
    this.newEntryType.set(draft.type);
    this.newEntryName.set(draft.name);
    this.newEntryAlias.set(draft.alias);
    this.newEntryDescription.set(draft.description);
    this.newEntryTrackingSetting.set(draft.trackingSetting);
    this.newEntryNotes.set(draft.notes.map(note => ({ ...note })));
    this.newEntryProgression.set(draft.progression.map(item => ({
      ...item,
      localId: item.id ?? crypto.randomUUID(),
    })));
  }

  private updateNote(index: number, changes: Partial<CodexEntryNoteInput>): void {
    this.newEntryNotes.update(notes =>
      notes.map((note, i) => (i === index ? { ...note, ...changes } : note)),
    );
    this.queueAutosave();
  }

  private updateProgression(localId: string, changes: Partial<CodexEntryProgressionInput>): void {
    this.newEntryProgression.update(items =>
      items.map(item => (item.localId === localId ? { ...item, ...changes } : item)),
    );
    this.queueAutosave();
  }

  private queueAutosave(): void {
    if (!this.isEditing()) return;

    if (this.autosaveTimeoutId !== null) {
      window.clearTimeout(this.autosaveTimeoutId);
    }

    this.autosaveTimeoutId = window.setTimeout(() => {
      this.autosaveTimeoutId = null;
      this.flushAutosave();
    }, 300);
  }

  private flushAutosave(): void {
    if (!this.isEditing() || !this.canCreateEntry()) return;

    const payloadSignature = this.getPayloadSignature();
    if (payloadSignature === this.lastAutosaveSignature) return;

    this.lastAutosaveSignature = payloadSignature;
    this.entryUpdated.emit(this.buildPayload());
  }

  private getPayloadSignature(): string {
    return JSON.stringify(this.buildPayload());
  }

  private getSceneRank(sceneId: string | null): number {
    if (!sceneId) return UNRANKED_SCENE_RANK;

    return this.sceneLookup().get(sceneId)?.rank ?? UNRANKED_SCENE_RANK;
  }

  private sortProgression(items: CodexEntryProgressionInput[]): CodexEntryProgressionInput[] {
    return [...items].sort((a, b) => this.getSceneRank(a.sceneId) - this.getSceneRank(b.sceneId));
  }

  private parseNote(note: CodexEntryNoteDto): CodexEntryNoteInput {
    const parts = note.content.split(/\r?\n\r?\n/);

    if (parts.length > 1) {
      return {
        id: note.id,
        title: parts[0]?.trim() ?? '',
        content: parts.slice(1).join('\n\n').trim(),
      };
    }

    return {
      id: note.id,
      title: note.content.trim(),
      content: '',
    };
  }

  private parseProgression(progression: CodexEntryProgressionDto): CodexEntryProgressionInput {
    return {
      localId: progression.id,
      id: progression.id,
      title: progression.title,
      description: progression.description,
      sceneId: progression.sceneId,
    };
  }

  private buildPayload(): CodexEntryMenuPayload {
    return {
      type: this.newEntryType(),
      name: this.newEntryName().trim(),
      alias: this.newEntryAlias().trim(),
      description: this.newEntryDescription().trim(),
      trackingSetting: this.newEntryTrackingSetting(),
      notes: this.newEntryNotes()
        .map(note => ({
          id: note.id,
          title: note.title.trim(),
          content: note.content.trim(),
        }))
        .filter(note => note.title || note.content),
      progression: this.sortedProgression()
        .map(item => ({
          id: item.id,
          title: item.title.trim(),
          description: item.description.trim(),
          sceneId: item.sceneId,
        }))
        .filter(item => item.title || item.description || item.sceneId),
    };
  }
}
