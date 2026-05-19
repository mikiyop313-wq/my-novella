import { safeStorage } from 'electron';

export class SecureStorage {

    // Encrypts the API key returning a Buffer (which you can convert to hex/base64 to save)
    static encryptKey(apiKey: string): string | null {
        if (!safeStorage.isEncryptionAvailable()) {
            console.warn('safeStorage is not available. Falling back to plain text (not recommended).');
            return apiKey; // Fallback if the OS doesn't support it
        }

        const encryptedBuffer = safeStorage.encryptString(apiKey);
        // Convert Buffer to a base64 string to easily save in your SQLite DB or JSON file
        return encryptedBuffer.toString('base64');
    }
    // Decrypts the previously saved base64 string back into the API key
    static decryptKey(encryptedKeyBase64: string): string | null {
        if (!safeStorage.isEncryptionAvailable()) {
            return encryptedKeyBase64;
        }
        try {
            const buffer = Buffer.from(encryptedKeyBase64, 'base64');
            return safeStorage.decryptString(buffer);
        } catch (error) {
            console.error('Failed to decrypt the API key', error);
            return null;
        }
    }
}