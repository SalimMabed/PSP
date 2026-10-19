import { v4 as uuidv4 } from "uuid";

/** Alphabet sans caractères ambigus (0/O, 1/I/L) pour des références lisibles à voix haute. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type RandomBytes = (length: number) => Uint8Array;

/** Octets aléatoires cryptographiques (Web Crypto, disponible navigateur et Node ≥ 19). */
export const cryptoRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export function randomString(length: number, alphabet = ALPHABET, rand: RandomBytes = cryptoRandomBytes): string {
  // Rejet des octets hors plage pour éviter le biais modulo.
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

/** Jeton d'URL de la page de paiement hébergée : 24 caractères, non devinable. */
export function generateCheckoutToken(rand: RandomBytes = cryptoRandomBytes): string {
  return randomString(24, "abcdefghijkmnpqrstuvwxyz23456789", rand);
}

export function newId(): string {
  return uuidv4();
}

/** Clé d'idempotence générée côté client pour chaque intention utilisateur (formulaire, bouton). */
export function newIdempotencyKey(): string {
  return `idem_${uuidv4()}`;
}
