import crypto from 'crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

export async function hashSessionPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, KEY_LEN)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifySessionPasswordHash(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const saltHex = parts[1]
  const keyHex = parts[2]
  if (!saltHex || !keyHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derivedKey) => {
      if (err) {
        reject(err)
        return
      }
      resolve(Buffer.from(derivedKey))
    })
  })
}
