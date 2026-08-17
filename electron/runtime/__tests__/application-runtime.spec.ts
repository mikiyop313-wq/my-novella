import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

const mocks = vi.hoisted(() => ({
  accessSync: vi.fn(),
  exit: vi.fn(),
  mkdirSync: vi.fn(),
  setPath: vi.fn(),
  showErrorBox: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    exit: mocks.exit,
    setPath: mocks.setPath,
  },
  dialog: {
    showErrorBox: mocks.showErrorBox,
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    accessSync: mocks.accessSync,
    mkdirSync: mocks.mkdirSync,
  };
});

describe('application runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['PORTABLE_EXECUTABLE_DIR'];
  });

  afterEach(() => {
    delete process.env['PORTABLE_EXECUTABLE_DIR'];
  });

  it('keeps the standard user-data directory outside portable builds', async () => {
    const runtime = await import('../application-runtime');

    expect(runtime.isPortableApp()).toBe(false);
    expect(runtime.portableDataDirectory).toBeNull();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.setPath).not.toHaveBeenCalled();
  });

  it('stores portable application data beside the executable', async () => {
    process.env['PORTABLE_EXECUTABLE_DIR'] = 'C:\\Portable\\My Novella';

    const runtime = await import('../application-runtime');

    const expectedPath = path.join('C:\\Portable\\My Novella', 'My-Novella-Data');
    expect(runtime.isPortableApp()).toBe(true);
    expect(runtime.portableDataDirectory).toBe(expectedPath);
    expect(mocks.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    expect(mocks.accessSync).toHaveBeenCalledWith(expectedPath, expect.any(Number));
    expect(mocks.setPath).toHaveBeenCalledWith('userData', expectedPath);
  });

  it('reports an unwritable portable data directory and exits', async () => {
    process.env['PORTABLE_EXECUTABLE_DIR'] = 'C:\\Read Only';
    const writeError = new Error('Access denied');
    mocks.accessSync.mockImplementationOnce(() => {
      throw writeError;
    });

    await expect(import('../application-runtime')).rejects.toThrow(writeError);

    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      'Portable storage unavailable',
      expect.stringContaining(path.join('C:\\Read Only', 'My-Novella-Data')),
    );
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(mocks.setPath).not.toHaveBeenCalled();
  });
});
