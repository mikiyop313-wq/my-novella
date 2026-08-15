import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ToastService } from '../../../../../shared/services/toast.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { ManuscriptHeaderComponent } from '../manuscript-header.component';

describe('ManuscriptHeaderComponent', () => {
  let component: ManuscriptHeaderComponent;
  let fixture: ComponentFixture<ManuscriptHeaderComponent>;

  const store = {
    mode: vi.fn(() => 'act'),
    updateAct: vi.fn(),
    updateChapter: vi.fn(),
    deleteAct: vi.fn(),
    deleteChapter: vi.fn(),
    archiveAct: vi.fn(),
    archiveChapter: vi.fn(),
  };
  const toastService = { error: vi.fn() };

  beforeEach(async () => {
    Object.values(store).forEach(mock => mock.mockReset());
    store.mode.mockReturnValue('act');
    store.archiveAct.mockResolvedValue(undefined);
    store.archiveChapter.mockResolvedValue(undefined);
    toastService.error.mockReset();

    await TestBed.configureTestingModule({
      imports: [ManuscriptHeaderComponent],
      providers: [
        { provide: ManuscriptStore, useValue: store },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManuscriptHeaderComponent);
    component = fixture.componentInstance;
    setHeaderNode('act', 'act-1');
  });

  afterEach(() => fixture.destroy());

  it('shows only archive and delete in the act options menu', async () => {
    const trigger = fixture.nativeElement.querySelector('.header-menu-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const menu = document.body.querySelector('.manuscript-header-menu') as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('.menu-item'));

    expect(items.map(item => item.textContent?.trim())).toEqual(['Archive act', 'Delete act']);
    expect(menu.textContent).not.toContain('AI');

    items[1].click();
    expect(store.deleteAct).toHaveBeenCalledWith('act-1');
  });

  it('archives acts and chapters through their matching store methods', async () => {
    await component.archiveSection();
    expect(store.archiveAct).toHaveBeenCalledWith('act-1');

    setHeaderNode('chapter', 'chapter-1');
    await component.archiveSection();
    expect(store.archiveChapter).toHaveBeenCalledWith('chapter-1');
  });

  it('keeps archive failures in the component error flow', async () => {
    store.archiveAct.mockRejectedValueOnce(new Error('Archive failed'));

    await component.archiveSection();

    expect(toastService.error).toHaveBeenCalledWith('Archive failed', 'Manuscript');
    expect(store.deleteAct).not.toHaveBeenCalled();
  });

  function setHeaderNode(type: 'act' | 'chapter', id: string): void {
    fixture.componentRef.setInput('node', {
      type: { name: type === 'act' ? 'actHeader' : 'chapterHeader' },
      attrs: { id, title: 'Title', position: 0 },
    });
    fixture.componentRef.setInput('updateAttributes', vi.fn());
    fixture.detectChanges();
  }
});
