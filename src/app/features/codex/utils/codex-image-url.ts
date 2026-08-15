import { type CodexEntryDto } from '../../../../../shared/models/codex.model';

type IpcBinaryImage = Uint8Array | ArrayBuffer | number[] | Record<string, number>;
type CodexImageInput = CodexEntryDto['image'] | IpcBinaryImage | null | undefined;

export function createCodexImageUrl(image: CodexImageInput): string | null {
  if (!image) return null;

  if (typeof image === 'string') {
    const value = image.trim();
    return value.length > 0 ? value : null;
  }

  const bytes = normalizeImageBytes(image);
  if (bytes.length === 0) return null;

  const dataUrl = decodeDataUrl(bytes);
  if (dataUrl) return dataUrl;

  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy.buffer], { type: detectImageMime(copy) }));
}

export function revokeCodexImageUrl(url: string | null): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function normalizeImageBytes(image: Exclude<CodexImageInput, string | null | undefined>): Uint8Array {
  if (image instanceof Uint8Array) return image;
  if (image instanceof ArrayBuffer) return new Uint8Array(image);
  if (Array.isArray(image)) return new Uint8Array(image);

  return new Uint8Array(Object.values(image).filter((value): value is number => typeof value === 'number'));
}

function decodeDataUrl(bytes: Uint8Array): string | null {
  if (
    bytes[0] !== 100 ||
    bytes[1] !== 97 ||
    bytes[2] !== 116 ||
    bytes[3] !== 97 ||
    bytes[4] !== 58
  ) {
    return null;
  }

  const value = new TextDecoder().decode(bytes).trim();
  return value.startsWith('data:') ? value : null;
}

function detectImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return 'image/png';
}
