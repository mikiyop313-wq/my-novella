import { Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
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
import {
  type MarkdownKeywordClick,
  type MarkdownKeywordHighlight,
} from '../../../../shared/components/markdown-editor/markdown-editor.extensions';
import { buildContextHighlightSegments } from '../../../../../../shared/utils/context-highlighter';
import { CodexMatchChooserService } from '../../highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../../services/codex-context-trie.service';
import { isSceneIncludedInContext } from '../../../../../../shared/utils/manuscript-context-inclusion';
import { ImageCropModalComponent } from '../../../../shared/components/image-crop-modal/image-crop-modal.component';
import { fileToDataUrl, prepareImageUpload } from '../../../../shared/utils/image-upload';
import { CODEX_IMAGE_CROP_CONFIG } from '../../utils/codex-image-upload';

type CodexEntryProgressionInput = CodexEntryProgressionPayload & {
  localId: string;
};

type SceneMetadata = {
  title: string;
  rank: number;
  includedInContext: boolean;
};

type TrackingOption = {
  value: CodexTrackingSetting;
  title: string;
  description: string;
};

const SELECT_SCENE_LABEL = 'Select scene...';
const UNTITLED_SCENE_LABEL = 'Untitled Scene';
const EXCLUDED_FROM_AI_CONTEXT_LABEL = 'Excluded from AI context';
const UNRANKED_SCENE_RANK = Number.MAX_SAFE_INTEGER;

@Component({
  selector: 'app-codex-entry-menu',
  standalone: true,
  imports: [
    FormsModule,
    MarkdownEditorComponent,
    AutocompleteDropdownComponent,
    CdkMenuModule,
    InfoIconComponent,
    ImageCropModalComponent,
  ],
  templateUrl: './codex-entry-menu.html',
  styleUrl: './codex-entry-menu.scss'
})
export class CodexEntryMenuComponent implements OnDestroy {
  readonly INFO_MESSAGES = INFO_MESSAGES;
  private readonly codexContextTrie = inject(CodexContextTrieService);
  private readonly codexMatchChooser = inject(CodexMatchChooserService);

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
  readonly newEntryImage = signal<string | null | undefined>(null);
  readonly imageActionsOpen = signal(false);
  readonly pendingImageFile = signal<File | null>(null);
  readonly newEntryTrackingSetting = signal<CodexTrackingSetting>('include_when_detected');
  readonly newEntryNotes = signal<CodexEntryNoteInput[]>([]);
  readonly newEntryProgression = signal<CodexEntryProgressionInput[]>([]);
  readonly activeEntryView = signal<CodexEntryMenuView>('Description');
  readonly canCreateEntry = computed(() => this.newEntryName().trim().length > 0);
  readonly isEditing = computed(() => this.existingEntry() !== null);
  readonly isArchived = computed(() => this.existingEntry()?.status === 'archived');
  readonly menuTitle = computed(() => this.isEditing() ? 'Edit Codex Entry' : 'New Codex Entry');
  readonly displayedThumbnailUrl = computed(() =>
    this.newEntryImage() === undefined ? this.thumbnailUrl() : this.newEntryImage(),
  );
  readonly imageCropConfig = CODEX_IMAGE_CROP_CONFIG;
  readonly descriptionKeywordHighlights = computed<MarkdownKeywordHighlight[]>(() => {
    const description = this.newEntryDescription();
    const currentEntryId = this.existingEntry()?.id ?? null;
    const matches = this.codexContextTrie
      .findMatches(description)
      .filter(match => match.value.entryId !== currentEntryId);

    return buildContextHighlightSegments(description, matches)
      .filter(segment => segment.isMatch)
      .map(segment => ({
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
        entryIds: [...new Set(segment.matches.map(match => match.value.entryId))],
      }));
  });
  readonly sceneLookup = computed(() => {
    const scenes = new Map<string, SceneMetadata>();
    let rank = 0;

    for (const act of this.bookHierarchy()) {
      for (const chapter of act.chapters ?? []) {
        for (const scene of chapter.scenes ?? []) {
          scenes.set(scene.id, {
            title: scene.title || UNTITLED_SCENE_LABEL,
            rank,
            includedInContext: isSceneIncludedInContext(scene),
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

  async onImageChange(event: Event): Promise<void> {
    this.imageActionsOpen.set(false);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const result = await prepareImageUpload({
        file,
        aspectRatio: this.imageCropConfig.aspectRatio,
      });
      if (!result) return;

      if (result.kind === 'ready') {
        this.setEntryImage(result.dataUrl);
        return;
      }

      this.pendingImageFile.set(result.file);
    } catch (error) {
      console.error('Failed to load Codex image:', error);
    }
  }

  async onImageCropped(file: File): Promise<void> {
    this.pendingImageFile.set(null);

    try {
      this.setEntryImage(await fileToDataUrl(file));
    } catch (error) {
      console.error('Failed to read Codex image:', error);
    }
  }

  cancelImageCrop(): void {
    this.pendingImageFile.set(null);
  }

  toggleImageActions(): void {
    this.imageActionsOpen.update(isOpen => !isOpen);
  }

  closeImageActions(): void {
    this.imageActionsOpen.set(false);
  }

  onImageActionsFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    const actionControl = event.currentTarget;

    if (
      actionControl instanceof HTMLElement
      && nextTarget instanceof Node
      && actionControl.contains(nextTarget)
    ) {
      return;
    }

    this.closeImageActions();
  }

  removeEntryImage(): void {
    this.newEntryImage.set(null);
    this.closeImageActions();
    this.queueAutosave();
  }

  openDescriptionKeyword(event: MarkdownKeywordClick): void {
    this.codexMatchChooser.open(event.entryIds, event.clientX, event.clientY);
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
    if (!scene) return SELECT_SCENE_LABEL;

    const exclusionLabel = scene.includedInContext
      ? ''
      : ` — ${EXCLUDED_FROM_AI_CONTEXT_LABEL}`;
    return `${scene.rank + 1}: ${scene.title}${exclusionLabel}`;
  }

  isSceneExcludedFromContext(sceneId: string | null): boolean {
    if (!sceneId) return false;

    return this.sceneLookup().get(sceneId)?.includedInContext === false;
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
    this.newEntryImage.set(undefined);
    this.imageActionsOpen.set(false);
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
    this.newEntryImage.set(null);
    this.imageActionsOpen.set(false);
    this.pendingImageFile.set(null);
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
    this.newEntryImage.set(draft.image);
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

  private setEntryImage(dataUrl: string): void {
    this.newEntryImage.set(dataUrl);
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
      image: this.newEntryImage(),
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
