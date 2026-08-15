import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { ToastService } from '../../shared/services/toast.service';
import { AiGenerationSessionService } from '../services/ai-generation-session.service';

export const manuscriptSelectionGenerationGuard: CanDeactivateFn<unknown> = () => {
  const sessions = inject(AiGenerationSessionService);
  const hasActiveSelection = sessions.sessions().some(
    session => session.source === 'manuscript-selection'
      && session.status() !== 'complete'
      && session.status() !== 'stopped'
      && session.status() !== 'failed',
  );
  if (!hasActiveSelection) return true;

  inject(ToastService).warning(
    'Finish or cancel the active Ask AI selection before leaving the manuscript.',
    'AI Generation',
  );
  return false;
};
