import { getDebugNode } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  AutocompleteDropdownComponent,
  AutocompleteHoverMenuTriggerDirective,
  type DropdownSection,
} from './autocomplete-dropdown.component';

describe('AutocompleteDropdownComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(element => element.replaceChildren());
  });

  async function createComponent(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [AutocompleteDropdownComponent] }).compileComponents();
    const fixture = TestBed.createComponent(AutocompleteDropdownComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('renders recursive submenu main titles, section titles, dividers, and counts', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'providers',
      options: [{
        value: 'provider:openrouter',
        label: 'OpenRouter',
        count: 2,
        selectable: false,
        submenu: {
          title: 'OpenRouter Models',
          sections: [
            { key: 'anthropic', title: 'Anthropic', options: [{ value: 'claude', label: 'Claude' }] },
            {
              key: 'openai',
              title: 'OpenAI',
              dividerBefore: true,
              options: [{ value: 'gpt', label: 'GPT' }],
            },
          ],
        },
      }],
    }];
    const { fixture } = await createComponent({ sections });

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const provider = document.querySelector('.menu-row') as HTMLButtonElement;
    expect(provider.textContent).toContain('2');
    provider.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(document.body.textContent).toContain('OpenRouter Models');
    expect(document.body.textContent).toContain('Anthropic');
    expect(document.body.textContent).toContain('OpenAI');
    expect(document.querySelector('.submenu-panel .section-divider')).toBeTruthy();
  });

  it('closes the full menu tree immediately after a single leaf selection', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'root',
      options: [{
        value: 'provider',
        label: 'Provider',
        selectable: false,
        submenu: {
          title: 'Provider Models',
          sections: [{ key: 'models', options: [{ value: 'model-1', label: 'Model One' }] }],
        },
      }],
    }];
    const { fixture, component } = await createComponent({ sections });
    let emitted: string | undefined;
    component.selectionChange.subscribe(value => emitted = value as string);

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    (document.querySelector('.menu-row') as HTMLButtonElement)
      .dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const leaf = [...document.querySelectorAll<HTMLButtonElement>('.submenu-panel .menu-row')]
      .find(row => row.textContent?.includes('Model One'))!;
    leaf.click();
    fixture.detectChanges();

    expect(emitted).toBe('model-1');
    expect(document.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('keeps multi-select open and derives aggregate checked, mixed, and compact-chip state', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'context',
      options: [{
        value: 'branch:novel',
        label: 'Novel',
        selectionValues: ['scene:1', 'scene:2'],
        submenu: {
          sections: [{
            key: 'scenes',
            options: [
              { value: 'scene:1', label: 'Opening' },
              { value: 'scene:2', label: 'Ending' },
            ],
          }],
        },
      }],
    }];
    const { fixture, component } = await createComponent({
      sections,
      multi: true,
      compactSelectionChips: true,
      selectedValue: [],
    });
    let emitted: string[] = [];
    component.selectionChange.subscribe(value => emitted = value as string[]);

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const aggregateRow = document.querySelector('.menu-row') as HTMLButtonElement;
    aggregateRow.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    aggregateRow.click();
    fixture.detectChanges();

    expect(emitted).toEqual(['scene:1', 'scene:2']);
    expect(document.querySelector('.autocomplete-dropdown')).toBeTruthy();

    fixture.componentRef.setInput('selectedValue', ['scene:1']);
    fixture.detectChanges();
    expect(component.selectionState(sections[0].options[0]).indeterminate).toBe(true);

    fixture.componentRef.setInput('selectedValue', emitted);
    fixture.detectChanges();
    expect(component.selectionState(sections[0].options[0]).checked).toBe(true);
    expect(component.selectedChips().map(chip => chip.label)).toEqual(['Novel']);
  });

  it('flattens nested search matches with explicit terms and ancestor paths', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'codex',
      title: 'Codex',
      options: [{
        value: 'characters',
        label: 'Characters',
        selectable: false,
        submenu: {
          sections: [{
            key: 'entries',
            options: [{ value: 'ari', label: 'Ari', searchTerms: ['The Protagonist'] }],
          }],
        },
      }],
    }];
    const { component } = await createComponent({ sections });

    component.searchControl.setValue('protagonist');

    expect(component.searchResults().map(result => result.option.label)).toEqual(['Ari']);
    expect(component.searchResults()[0].path).toBe('Codex / Characters');
  });

  it('preserves legacy inline subOptions and custom multi values', async () => {
    const { component } = await createComponent({
      options: [{
        value: 'fantasy',
        label: 'Fantasy',
        subOptions: [{ value: 'urban', label: 'Urban Fantasy' }],
      }],
      multi: true,
      selectedValue: ['urban', 'Custom'],
    });

    component.toggleExpand('fantasy');

    expect(component.isExpanded('fantasy')).toBe(true);
    expect(component.selectedChips().map(chip => chip.label)).toEqual(['Urban Fantasy', 'Custom']);
  });

  it('opens submenus only on hover and keeps only the hovered sibling open', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'providers',
      options: [
        {
          value: 'first',
          label: 'First',
          selectable: false,
          submenu: {
            title: 'First submenu',
            sections: [{ key: 'first-items', options: [{ value: 'one', label: 'One' }] }],
          },
        },
        {
          value: 'second',
          label: 'Second',
          selectable: false,
          submenu: {
            title: 'Second submenu',
            sections: [{ key: 'second-items', options: [{ value: 'two', label: 'Two' }] }],
          },
        },
      ],
    }];
    const { fixture } = await createComponent({ sections });

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const rows = [...document.querySelectorAll<HTMLButtonElement>('.root-panel .submenu-row')];

    rows[0].click();
    fixture.detectChanges();
    expect(document.querySelector('.submenu-panel')).toBeNull();

    rows[0].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(document.querySelector('.submenu-panel')?.textContent).toContain('First submenu');

    rows[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const submenus = [...document.querySelectorAll('.submenu-panel')];
    expect(submenus).toHaveLength(1);
    expect(submenus[0].textContent).toContain('Second submenu');
  });

  it('fits opposite-side submenu fallbacks to the parent corners in LTR layouts', async () => {
    const { fixture } = await createComponent({
      sections: [{
        key: 'root',
        options: [{
          value: 'parent',
          label: 'Parent',
          selectable: false,
          submenu: {
            sections: [{ key: 'children', options: [{ value: 'child', label: 'Child' }] }],
          },
        }],
      }],
    });

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const parentPanel = document.querySelector('.root-panel') as HTMLElement;
    const triggerRow = parentPanel.querySelector('.submenu-row') as HTMLButtonElement;
    vi.spyOn(parentPanel, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 340, top: 100, bottom: 400, width: 240, height: 300, x: 100, y: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(triggerRow, 'getBoundingClientRect').mockReturnValue({
      left: 130, right: 330, top: 180, bottom: 214, width: 200, height: 34, x: 130, y: 180,
      toJSON: () => ({}),
    });

    const hoverTrigger = getDebugNode(triggerRow)!.injector.get(
      AutocompleteHoverMenuTriggerDirective,
    );
    hoverTrigger.openOnHover();

    expect(hoverTrigger.menuPosition).toEqual([
      expect.objectContaining({ originX: 'end', overlayX: 'start', offsetX: 8 }),
      expect.objectContaining({ originX: 'end', overlayX: 'start', offsetX: 8 }),
      expect.objectContaining({
        originX: 'start', originY: 'bottom', overlayX: 'end', overlayY: 'top',
        offsetX: -30, offsetY: 186,
      }),
      expect.objectContaining({
        originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'bottom',
        offsetX: -30, offsetY: -80,
      }),
    ]);
  });

  it('uses logical parent corners and an outward normal gap in RTL layouts', async () => {
    const { fixture } = await createComponent({
      sections: [{
        key: 'root',
        options: [{
          value: 'parent',
          label: 'Parent',
          selectable: false,
          submenu: {
            sections: [{ key: 'children', options: [{ value: 'child', label: 'Child' }] }],
          },
        }],
      }],
    });

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const parentPanel = document.querySelector('.root-panel') as HTMLElement;
    parentPanel.style.direction = 'rtl';
    const triggerRow = parentPanel.querySelector('.submenu-row') as HTMLButtonElement;
    vi.spyOn(parentPanel, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 340, top: 100, bottom: 400, width: 240, height: 300, x: 100, y: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(triggerRow, 'getBoundingClientRect').mockReturnValue({
      left: 110, right: 330, top: 180, bottom: 214, width: 220, height: 34, x: 110, y: 180,
      toJSON: () => ({}),
    });

    const hoverTrigger = getDebugNode(triggerRow)!.injector.get(
      AutocompleteHoverMenuTriggerDirective,
    );
    hoverTrigger.openOnHover();

    expect(hoverTrigger.menuPosition[0].offsetX).toBe(-8);
    expect(hoverTrigger.menuPosition[2]).toEqual(expect.objectContaining({
      originX: 'start', overlayX: 'end', offsetX: 10, offsetY: 186,
    }));
    expect(hoverTrigger.menuPosition[3]).toEqual(expect.objectContaining({
      originX: 'start', overlayX: 'end', offsetX: 10, offsetY: -80,
    }));
  });

  it('prunes deeper submenus when an open ancestor is hovered', async () => {
    const sections: DropdownSection<string>[] = [{
      key: 'root',
      options: [{
        value: 'a',
        label: 'A',
        selectable: false,
        submenu: {
          title: 'B panel',
          sections: [{
            key: 'b-options',
            options: [{
              value: 'b',
              label: 'B',
              selectable: false,
              submenu: {
                title: 'C panel',
                sections: [{
                  key: 'c-options',
                  options: [{
                    value: 'c',
                    label: 'C',
                    selectable: false,
                    submenu: {
                      title: 'D panel',
                      sections: [{ key: 'd-options', options: [{ value: 'd', label: 'D' }] }],
                    },
                  }],
                }],
              },
            }],
          }],
        },
      }],
    }];
    const { fixture } = await createComponent({ sections });

    const hoverRow = (label: string): void => {
      const row = [...document.querySelectorAll<HTMLButtonElement>('.submenu-row')]
        .find(candidate => candidate.textContent?.trim() === label);
      expect(row).toBeTruthy();
      row!.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
    };
    const panelTitles = (): string[] =>
      [...document.querySelectorAll<HTMLElement>('.submenu-panel .menu-main-title')]
        .map(title => title.textContent?.trim() ?? '');

    (fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    hoverRow('A');
    hoverRow('B');
    hoverRow('C');
    expect(panelTitles()).toEqual(['B panel', 'C panel', 'D panel']);

    hoverRow('C');
    expect(panelTitles()).toEqual(['B panel', 'C panel', 'D panel']);

    hoverRow('B');
    expect(panelTitles()).toEqual(['B panel', 'C panel']);

    hoverRow('C');
    expect(panelTitles()).toEqual(['B panel', 'C panel', 'D panel']);

    hoverRow('A');
    expect(panelTitles()).toEqual(['B panel']);
  });

  it('closes when the page scrolls or the user clicks outside', async () => {
    const { fixture } = await createComponent({
      options: [{ value: 'one', label: 'One' }],
    });
    const trigger = fixture.nativeElement.querySelector('.dropdown-trigger') as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();
    expect(document.querySelector('.autocomplete-dropdown')).toBeTruthy();

    document.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(document.querySelector('.autocomplete-dropdown')).toBeNull();

    trigger.click();
    fixture.detectChanges();
    expect(document.querySelector('.autocomplete-dropdown')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    expect(document.querySelector('.autocomplete-dropdown')).toBeNull();
  });
});
