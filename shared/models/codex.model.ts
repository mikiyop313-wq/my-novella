export type CodexEntryType = 'character' | 'location' | 'object' | 'lore' | 'subplot' | 'other';

export type CodexEntryStatus = 'active' | 'archived';

export type CodexTrackingSetting =
  | 'always_include'
  | 'include_when_detected'
  | 'manual'
  | 'never_include';

export interface DetectedCodexEntryDto {
  name: string;
  type: CodexEntryType;
  description: string;
}

export interface CodexEntryDto {
  id: string;
  bookId: string;
  type: CodexEntryType;
  name: string;
  alias: string | null;
  description: string | null;
  image: Uint8Array | string | null;
  status: CodexEntryStatus;
  trackingSetting: CodexTrackingSetting;
  createdAt: string;
  lastEditedAt: string;
}

export interface CodexEntryNoteDto {
  id: string;
  codexEntryId: string;
  content: string;
  createdAt: string;
  lastEditedAt: string;
}

export interface CodexEntryProgressionDto {
  id: string;
  codexEntryId: string;
  title: string;
  description: string;
  sceneId: string | null;
  createdAt: string;
  lastEditedAt: string;
}

export interface CodexEntryDetailDto extends CodexEntryDto {
  entryNotes: CodexEntryNoteDto[];
  entryProgression: CodexEntryProgressionDto[];
}

export interface CreateCodexEntryDto {
  bookId: string;
  type: CodexEntryType;
  name: string;
  alias?: string | null;
  description?: string | null;
  image?: Uint8Array | string | null;
  status?: CodexEntryStatus;
  trackingSetting?: CodexTrackingSetting;
}

export type UpdateCodexEntryDto = Partial<Omit<CreateCodexEntryDto, 'bookId'>>;

export interface CreateCodexEntryNoteDto {
  codexEntryId: string;
  content: string;
}

export interface UpdateCodexEntryNoteDto {
  content: string;
}

export interface CreateCodexEntryProgressionDto {
  codexEntryId: string;
  title: string;
  description: string;
  sceneId?: string | null;
}

export type UpdateCodexEntryProgressionDto = Partial<
  Omit<CreateCodexEntryProgressionDto, 'codexEntryId'>
>;

export interface CodexEntryListFiltersDto {
  type?: CodexEntryType;
  search?: string;
  includeArchived?: boolean;
  status?: CodexEntryStatus;
  hasNotes?: boolean;
  hasDescription?: boolean;
  hasProgression?: boolean;
  trackingSettings?: CodexTrackingSetting[];
}

export interface CodexEntryTypeCountDto {
  type: CodexEntryType;
  count: number;
}

export interface GetCodexEntriesPayload {
  bookId: string;
  filters?: CodexEntryListFiltersDto;
}

export interface GetCodexEntryPayload {
  id: string;
}

export interface GetCodexEntryNotesPayload {
  entryId: string;
}

export interface GetCodexEntryProgressionPayload {
  entryId: string;
}

export interface CreateCodexEntryPayload {
  data: CreateCodexEntryDto;
}

export interface UpdateCodexEntryPayload {
  id: string;
  data: UpdateCodexEntryDto;
}

export interface DeleteCodexEntryPayload {
  id: string;
}

export interface CreateCodexEntryNotePayload {
  data: CreateCodexEntryNoteDto;
}

export interface UpdateCodexEntryNotePayload {
  id: string;
  data: UpdateCodexEntryNoteDto;
}

export interface DeleteCodexEntryNotePayload {
  id: string;
}

export interface CreateCodexEntryProgressionPayload {
  data: CreateCodexEntryProgressionDto;
}

export interface UpdateCodexEntryProgressionPayload {
  id: string;
  data: UpdateCodexEntryProgressionDto;
}

export interface DeleteCodexEntryProgressionPayload {
  id: string;
}

export interface GetCodexEntryCountsPayload {
  bookId: string;
}
