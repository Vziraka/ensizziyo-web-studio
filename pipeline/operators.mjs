import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = 'evz_operator_session';
const sessionMs = 8 * 60 * 60 * 1000;
const roles = ['owner', 'friend'];
const strongKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43,}$/.test(value);
const signature = (secret, value) => createHmac('sha256', secret).update(value).digest();

export function createOperatorAuth(env = process.env, { now = () => Date.now() } = {}) {
  const credentials = [env.EVZ_OPERATIONS_OWNER_KEY, env.EVZ_OPERATIONS_FRIEND_KEY, env.EVZ_OPERATIONS_SESSION_SECRET];
  if (credentials.every(value => value === undefined || value === '')) return null;
  if (!credentials.every(strongKey)) throw Error('Configure separate 32-byte owner and friend keys plus a 32-byte session secret');
  if (credentials[0] === credentials[1] || credentials[0] === credentials[2] || credentials[1] === credentials[2]) throw Error('Operator keys and session secret must be different');

  const [ownerKey, friendKey, sessionSecret] = credentials;
  const ownerDigest = signature(sessionSecret, `operator:${ownerKey}`);
  const friendDigest = signature(sessionSecret, `operator:${friendKey}`);
  const actorFromCookie = header => {
    const raw = String(header ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw) return null;
    const [payload, supplied, extra] = raw.split('.');
    if (!payload || !supplied || extra !== undefined) return null;
    let actual;
    try { actual = Buffer.from(supplied, 'base64url'); } catch { return null; }
    const expected = signature(sessionSecret, payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const [actor, expiresAt, nonce] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return roles.includes(actor) && Number.isSafeInteger(expiresAt) && expiresAt > now() && typeof nonce === 'string' ? actor : null;
    } catch { return null; }
  };

  return Object.freeze({
    enabled: true,
    authenticate(key) {
      const candidate = signature(sessionSecret, `operator:${typeof key === 'string' ? key : ''}`);
      const ownerMatch = timingSafeEqual(candidate, ownerDigest);
      const friendMatch = timingSafeEqual(candidate, friendDigest);
      return ownerMatch ? 'owner' : friendMatch ? 'friend' : null;
    },
    issue(actor) {
      if (!roles.includes(actor)) throw Error('Unknown operator');
      const payload = Buffer.from(JSON.stringify([actor, now() + sessionMs, randomBytes(16).toString('base64url')])).toString('base64url');
      return `${payload}.${signature(sessionSecret, payload).toString('base64url')}`;
    },
    actorFromCookie,
    cookie(value, { secure = false, clear = false } = {}) {
      return `${cookieName}=${clear ? '' : value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : Math.floor(sessionMs / 1000)}${secure ? '; Secure' : ''}`;
    }
  });
}
