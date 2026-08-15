import JSZip from 'jszip';

import type { DataExportSnapshot } from './models';

export const TRANSFER_ARCHIVE_ENTRY_NAME = 'snapshot.json';

/** Creates the portable archive shared by data export and import. */
export async function createTransferArchive(snapshot: DataExportSnapshot): Promise<Buffer> {
  const archive = new JSZip();
  const serializedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;

  archive.file(TRANSFER_ARCHIVE_ENTRY_NAME, serializedSnapshot);

  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

/** Reads the JSON payload without applying import-specific validation. */
export async function readTransferArchive(archiveBuffer: Buffer): Promise<unknown> {
  const archive = await loadArchive(archiveBuffer);
  const entries = Object.values(archive.files);

  if (
    entries.length !== 1
    || entries[0].dir
    || entries[0].name !== TRANSFER_ARCHIVE_ENTRY_NAME
  ) {
    throw new Error(
      `Invalid transfer archive: expected exactly one file named "${TRANSFER_ARCHIVE_ENTRY_NAME}".`,
    );
  }

  let serializedSnapshot: string;
  try {
    serializedSnapshot = await entries[0].async('string');
  } catch {
    throw new Error(
      `Invalid transfer archive: could not read "${TRANSFER_ARCHIVE_ENTRY_NAME}".`,
    );
  }

  try {
    return JSON.parse(serializedSnapshot) as unknown;
  } catch {
    throw new Error(
      `Invalid transfer archive: "${TRANSFER_ARCHIVE_ENTRY_NAME}" is not valid JSON.`,
    );
  }
}

async function loadArchive(archiveBuffer: Buffer): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(archiveBuffer);
  } catch {
    throw new Error('Invalid transfer archive: unreadable ZIP data.');
  }
}
