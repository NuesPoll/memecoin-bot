import { VAULT_VERSION } from './plan';

export type EncryptedVault = { format: typeof VAULT_VERSION; salt: string; iv: string; ciphertext: string };
export type VaultSession = { seal: (payload: string) => Promise<EncryptedVault> };
const encoder = new TextEncoder();
const aad = encoder.encode(VAULT_VERSION);
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function derive(password: string, salt: Uint8Array) {
  if (password.length < 12) throw new Error('Use a vault password of at least 12 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function session(key: CryptoKey, salt: Uint8Array): VaultSession {
  // The non-exportable key lives only in the unlocked browser session. Every seal gets a fresh IV.
  return { async seal(payload) {
    if (encoder.encode(payload).length > 200_000) throw new Error('This project backup is too large.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, encoder.encode(payload));
    return { format: VAULT_VERSION, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  } };
}

export async function createVaultSession(password: string): Promise<VaultSession> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return session(await derive(password, salt), salt);
}

export async function encryptVault(payload: string, password: string): Promise<EncryptedVault> {
  return (await createVaultSession(password)).seal(payload);
}

export async function openVault(input: unknown, password: string): Promise<{ payload: string; session: VaultSession }> {
  const value = input as EncryptedVault;
  if (!value || value.format !== VAULT_VERSION || typeof value.ciphertext !== 'string' || value.ciphertext.length > 300_000 || typeof value.salt !== 'string' || value.salt.length > 32 || typeof value.iv !== 'string' || value.iv.length > 24) throw new Error('Choose a valid NovaPulse devnet vault backup.');
  try {
    const salt = fromBase64(value.salt);
    const iv = fromBase64(value.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error();
    const key = await derive(password, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad }, key, fromBase64(value.ciphertext) as BufferSource);
    return { payload: new TextDecoder().decode(plaintext), session: session(key, salt) };
  } catch { throw new Error('The password is incorrect or the vault backup is damaged.'); }
}

export async function decryptVault(input: unknown, password: string) {
  return (await openVault(input, password)).payload;
}
