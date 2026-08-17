import { app, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PORTABLE_DATA_DIRECTORY_NAME = 'My-Novella-Data';

const portableExecutableDirectory = process.env['PORTABLE_EXECUTABLE_DIR']?.trim() || null;

export const portableDataDirectory = portableExecutableDirectory
  ? path.join(portableExecutableDirectory, PORTABLE_DATA_DIRECTORY_NAME)
  : null;

export function isPortableApp(): boolean {
  return portableDataDirectory !== null;
}

function configurePortableStorage(): void {
  if (portableDataDirectory === null) return;

  try {
    fs.mkdirSync(portableDataDirectory, { recursive: true });
    fs.accessSync(portableDataDirectory, fs.constants.W_OK);
    app.setPath('userData', portableDataDirectory);
  } catch (error) {
    dialog.showErrorBox(
      'Portable storage unavailable',
      `My Novella cannot write to its portable data folder:\n\n${portableDataDirectory}\n\nMove the portable application to a writable folder and try again.`,
    );
    app.exit(1);
    throw error;
  }
}

configurePortableStorage();
