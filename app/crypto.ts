export interface EncryptedBlock {
  version: number;
  salt: string;
  iv: string;
  data: string;
}

const AES_ALGO = "AES-GCM" as const;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function uint8ArrayToBase64(arr: Uint8Array): string {
  // @ts-expect-error typescript missing definitions https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
  return arr.toBase64();
}

function base64ToUint8Array(base64: string) {
  // @ts-expect-error typescript missing definitions https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64
  return Uint8Array.fromBase64(base64);
}

function getKeyMaterial(password: string) {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
}

async function getKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const keyMaterial = await getKeyMaterial(password);
  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: AES_ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return key;
}

export async function encrypt(
  password: string,
  plaintext: string,
): Promise<EncryptedBlock> {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await getKey(password, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    key,
    enc.encode(plaintext),
  );

  return {
    version: 1,
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(encrypted)),
  };
}

export async function decrypt(
  password: string,
  block: EncryptedBlock,
): Promise<string> {
  if (!block.salt || !block.iv || !block.data || !block.version) {
    throw new Error("invalid encrypted block missing fields");
  }

  if (block.version !== 1) {
    throw new Error(`version ${block.version} not supported`);
  }

  const salt = base64ToUint8Array(block.salt);
  const iv = base64ToUint8Array(block.iv);
  const data = base64ToUint8Array(block.data);

  const dec = new TextDecoder();
  const key = await getKey(password, salt);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: AES_ALGO, iv },
    key,
    data,
  );

  return dec.decode(decrypted);
}
