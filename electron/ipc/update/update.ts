import { ipcMain } from 'electron';

import type { UpdateService } from '../../domain/update/update.service';

interface SetupUpdateHandlersOptions {
  updateService: UpdateService;
  requestUpdateInstall: () => void;
}

export function setupUpdateHandlers(options: SetupUpdateHandlersOptions): void {
  ipcMain.handle('update:get-state', () => options.updateService.getState());
  ipcMain.handle('update:check', () => options.updateService.checkForUpdates());
  ipcMain.handle('update:download', () => options.updateService.downloadUpdate());
  ipcMain.handle('update:install', () => {
    options.updateService.assertReadyToInstall();
    options.requestUpdateInstall();
  });
}
