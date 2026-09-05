import { createHmac, timingSafeEqual } from 'node:crypto';
export function signSession(expires: number, secret: string) {
  const payload = String(expires);
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('hex');
}
export function verifySession(token: string, secret: string, now = Date.now()) {
  const [expires, signature] = token.split('.');
  if (!secret || !/^\d+$/.test(expires ?? '') || Number(expires) <= now || !/^[a-f0-9]{64}$/.test(signature ?? '')) return false;
  const expected = signSession(Number(expires), secret);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
export function passwordMatches(input: string, expected: string) {
  const hash = (text: string) => createHmac('sha256', 'nico-password-comparison').update(text).digest();
  return !!expected && timingSafeEqual(hash(input), hash(expected));
}
