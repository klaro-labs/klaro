// Short, human-shareable slugs for Klaro Link (www.myklaro.app/pay/XXXXXXXX).
// Base58 alphabet (Bitcoin's) — excludes the ambiguous 0/O/I/l so a slug read
// aloud or copied from a chat is unambiguous. 8 chars over 58 symbols ≈
// 58^8 ≈ 1.28e14 keyspace, so collisions are negligible; createLinkAction still
// retries once on the unique-index violation as a belt-and-braces guard.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LEN = 8;

export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

const SLUG_RE = new RegExp(`^[${ALPHABET}]{${SLUG_LEN}}$`);

/** Route-handler guard — rejects anything that isn't a well-formed slug before
 *  it hits the DB (cheap pre-filter against scanning / malformed input). */
export function isValidSlug(s: string): boolean {
  return typeof s === "string" && SLUG_RE.test(s);
}

export const SLUG_LENGTH = SLUG_LEN;
export const SLUG_ALPHABET = ALPHABET;
