import { Redis } from '@upstash/redis';

const TTL_SECONDS = 60 * 60 * 24;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
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

async function sbGet(sb, code) {
  const res = await fetch(
    `${sb.url}/rest/v1/lobbies?code=eq.${encodeURIComponent(code)}&select=payload`,
    {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.payload || null;
}

async function sbSet(sb, code, payload) {
  const res = await fetch(`${sb.url}/rest/v1/lobbies`, {
    method: 'POST',
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      code,
      payload,
      updated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

async function sbDel(sb, code) {
  const res = await fetch(`${sb.url}/rest/v1/lobbies?code=eq.${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
    },
  });
  return res.ok;
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
  const sb = getSupabase();

  if (!redis && !sb) {
    return res.status(503).json({ error: 'Lobby server not configured' });
  }

  const key = lobbyKey(code);

  try {
    if (req.method === 'GET') {
      if (redis) {
        const data = await redis.get(key);
        if (data) return res.status(200).json(data);
      }
      if (sb) {
        const data = await sbGet(sb, code);
        if (data) return res.status(200).json(data);
      }
      return res.status(404).json({ error: 'Lobby not found' });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.joinCode || String(body.joinCode).toUpperCase() !== code) {
        return res.status(400).json({ error: 'Invalid lobby payload' });
      }
      const payload = { ...body, joinCode: code, updatedAt: Date.now() };

      if (redis) {
        await redis.set(key, payload, { ex: TTL_SECONDS });
      }
      if (sb) {
        await sbSet(sb, code, payload);
      }
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt });
    }

    if (req.method === 'DELETE') {
      if (redis) await redis.del(key);
      if (sb) await sbDel(sb, code);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch {
    return res.status(500).json({ error: 'Lobby server error' });
  }
}
