import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BookCardComponent } from './book-card.component';
import { BookUi } from '../../store/book.store';

describe('BookCardComponent', () => {
  let component: BookCardComponent;
  let fixture: ComponentFixture<BookCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BookCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('book', {
      id: 'book-1',
      title: 'Test Book',
      author: 'Test Author',
      status: 'draft',
      synopsis: null,
      coverImage: null,
      displayCoverImage: '',
      wordCount: 0,
      language: 'english',
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      categories: [],
    } satisfies BookUi);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
