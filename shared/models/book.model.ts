export interface CategoryDto {
  id: string;
  name: string;
  type: 'genre' | 'trope' | 'demographic';
  isCustom: boolean;
}

export interface BookTagDto {
  bookId: string;
  categoryId: string;
}

export interface BookDto {
  id: string;
  title: string;
  author: string;
  status: 'archived' | 'draft';
  synopsis: string | null;
  coverImage: Uint8Array | string | null;
  wordCount: number;
  language: string;
  createdAt: string;
  lastEditedAt: string;
  categories?: CategoryDto[];
}

export type CreateBookDto = Omit<BookDto, 'id' | 'createdAt' | 'lastEditedAt'>;
export type UpdateBookDto = Partial<CreateBookDto>;
