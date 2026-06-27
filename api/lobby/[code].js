import { Redis } from '@upstash/redis';

const TTL_SECONDS = 60 * 60 * 24;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function lobbyKey(code) {
  return `rr:lobby:${code}`;
}

function isValidCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const code = String(req.query.code || '').toUpperCase();
  if (!isValidCode(code)) {
    return res.status(400).json({ error: 'Invalid join code format' });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({ error: 'Lobby server not configured' });
  }

  const key = lobbyKey(code);

  try {
    if (req.method === 'GET') {
      const data = await redis.get(key);
      if (!data) return res.status(404).json({ error: 'Lobby not found' });
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.joinCode || String(body.joinCode).toUpperCase() !== code) {
        return res.status(400).json({ error: 'Invalid lobby payload' });
      }
      const payload = { ...body, joinCode: code, updatedAt: Date.now() };
      await redis.set(key, payload, { ex: TTL_SECONDS });
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt });
    }

    if (req.method === 'DELETE') {
      await redis.del(key);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch {
    return res.status(500).json({ error: 'Lobby server error' });
  }
}
