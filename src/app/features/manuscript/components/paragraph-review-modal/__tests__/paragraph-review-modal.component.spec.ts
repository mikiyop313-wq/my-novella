import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ParagraphReviewModalComponent } from '../paragraph-review-modal.component';

describe('ParagraphReviewModalComponent', () => {
  let fixture: ComponentFixture<ParagraphReviewModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ParagraphReviewModalComponent] })
      .compileComponents();
    fixture = TestBed.createComponent(ParagraphReviewModalComponent);
    fixture.componentRef.setInput('reviewItems', [
      {
        location: 'Act 1 ? Chapter 2 ? Scene 3',
        result: {
          paragraphId: 'paragraph-1',
          actId: 'act-1',
          chapterId: 'chapter-2',
          sceneId: 'scene-3',
          text: 'The complete paragraph remains visible.',
          distance: 0.1,
        },
      },
    ]);
    fixture.detectChanges();
  });

  it('renders the hierarchy location and complete paragraph', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.location-label')?.textContent).toContain(
      'Act 1 ? Chapter 2 ? Scene 3',
    );
    expect(element.querySelector('.modal-body')?.textContent).toContain(
      'The complete paragraph remains visible.',
    );
  });

  it('emits the accepted paragraph and closes after the final decision', () => {
    const accepted = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.accepted.subscribe(accepted);
    fixture.componentInstance.close.subscribe(closed);

    fixture.componentInstance.accept();

    expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ paragraphId: 'paragraph-1' }));
    expect(closed).toHaveBeenCalledOnce();
  });
});
