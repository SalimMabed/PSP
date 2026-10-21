import { v4 as uuidv4 } from "uuid";

/** Alphabet without ambiguous characters (0/O, 1/I/L) so references can be read aloud. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type RandomBytes = (length: number) => Uint8Array;

/** Cryptographic random bytes (Web Crypto, available in browsers and Node ≥ 19). */
export const cryptoRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export function randomString(length: number, alphabet = ALPHABET, rand: RandomBytes = cryptoRandomBytes): string {
  // Reject out-of-range bytes to avoid modulo bias.
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of rand(length * 2)) {
      if (b < limit) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export type ReferencePrefix = "PAY" | "RFD" | "STL";

export function generateReference(prefix: ReferencePrefix, rand: RandomBytes = cryptoRandomBytes): string {
  return `${prefix}-${randomString(8, ALPHABET, rand)}`;
}

/** URL token of the hosted payment page: 24 characters, unguessable. */
export function generateCheckoutToken(rand: RandomBytes = cryptoRandomBytes): string {
  return randomString(24, "abcdefghijkmnpqrstuvwxyz23456789", rand);
}

export function newId(): string {
  return uuidv4();
}

/** Idempotency key generated client-side for each user intent (form, button). */
export function newIdempotencyKey(): string {
  return `idem_${uuidv4()}`;
}
