export interface GeneralNoteDto {
  id: string;
  bookId: string;
  title: string;
  content: string;
  createdAt: string;
  lastEditedAt: string;
}

export interface CreateGeneralNoteDto {
  bookId: string;
  title: string;
  content: string;
}

export interface UpdateGeneralNoteDto {
  title: string;
  content: string;
}

export interface GetGeneralNotesPayload {
  bookId: string;
}

export interface CreateGeneralNotePayload {
  data: CreateGeneralNoteDto;
}

export interface UpdateGeneralNotePayload {
  id: string;
  data: UpdateGeneralNoteDto;
}

export interface DeleteGeneralNotePayload {
  id: string;
}
