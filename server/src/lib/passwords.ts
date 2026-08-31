import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// promisify picks scrypt's 3-argument overload, which drops the options we need
// to raise the cost factor. Wrapping it keeps the call sites typed.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt is in Node's standard library and is a real password KDF, so there is
// no reason to take a native dependency for this.
//
// N=2^14, r=8, p=1 are the standard interactive parameters. scrypt needs
// 128*N*r bytes, so this costs 16MB per hash — deliberately not higher, because
// that memory is held for every concurrent login, and 2^16 would mean 64MB each.
// Node's default maxmem is 32MB and it throws rather than clamping, so it is
// passed explicitly instead of being left to the default.
const COST = 2 ** 14;
const BLOCK = 8;
const MAXMEM = 128 * COST * BLOCK * 2;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEYLEN, {
    N: COST,
    r: BLOCK,
    p: 1,
    maxmem: MAXMEM,
  });
  return `scrypt$${COST}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, cost, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  // The cost factor comes from the stored hash, so hashes written under older
  // parameters keep verifying after this constant changes.
  const n = Number(cost);
  if (!Number.isInteger(n) || n < 2 || (n & (n - 1)) !== 0) return false;

  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
    {
      N: n,
      r: BLOCK,
      p: 1,
      maxmem: 128 * n * BLOCK * 2,
    },
  );

  // Constant-time: a length-dependent early return would leak how much of the
  // hash matched.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
