import nacl from "tweetnacl";
import bs58 from "bs58";

const te = new TextEncoder();
const td = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encryptionMessage(pubkey: string) {
  return `Telegrum encryption v1\n${pubkey}`;
}

export async function deriveBoxKeyPair(signature: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", signature.slice().buffer);
  const secretKey = new Uint8Array(digest);
  return nacl.box.keyPair.fromSecretKey(secretKey);
}

export function wrapConversationKey(
  conversationKey: Uint8Array,
  recipientBoxPublicKey: Uint8Array,
  senderBoxSecretKey: Uint8Array,
  senderBoxPublicKey: Uint8Array,
) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(
    conversationKey,
    nonce,
    recipientBoxPublicKey,
    senderBoxSecretKey,
  );
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    fromBoxPublicKey: encodeKey(senderBoxPublicKey),
  };
}

export function unwrapConversationKey(
  wrap: { nonce: string; ciphertext: string },
  senderBoxPublicKey: Uint8Array,
  recipientBoxSecretKey: Uint8Array,
) {
  const opened = nacl.box.open(
    base64ToBytes(wrap.ciphertext),
    base64ToBytes(wrap.nonce),
    senderBoxPublicKey,
    recipientBoxSecretKey,
  );
  if (!opened) throw new Error("Failed to unwrap conversation key");
  return opened;
}

export function encryptPayload(plaintext: string, conversationKey: Uint8Array) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(te.encode(plaintext), nonce, conversationKey);
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export function decryptPayload(
  payload: { nonce: string; ciphertext: string },
  conversationKey: Uint8Array,
) {
  const opened = nacl.secretbox.open(
    base64ToBytes(payload.ciphertext),
    base64ToBytes(payload.nonce),
    conversationKey,
  );
  if (!opened) throw new Error("Failed to decrypt message");
  return td.decode(opened);
}

export function randomConversationKey() {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

export function verifySolanaSignature(
  message: string,
  signatureBase58: string,
  pubkeyBase58: string,
) {
  try {
    return nacl.sign.detached.verify(
      te.encode(message),
      bs58.decode(signatureBase58),
      bs58.decode(pubkeyBase58),
    );
  } catch {
    return false;
  }
}

export function encodeKey(bytes: Uint8Array) {
  return bs58.encode(bytes);
}

export function decodeKey(value: string) {
  return bs58.decode(value);
}
