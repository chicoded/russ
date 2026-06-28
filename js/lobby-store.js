/**
 * Lobby persistence — local cache + Supabase + API for cross-device multiplayer.
 */

import { CONFIG, getPublicSiteOrigin, getLobbySyncConfig } from './config.js';

const LOBBY_PREFIX = 'rr_open_lobby_';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_API = '/api/lobby';

const lobbyBroadcast =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rr_lobby_sync') : null;

function lobbyKey(code) {
  return `${LOBBY_PREFIX}${code.toUpperCase()}`;
}

function supabaseConfig() {
  const { supabaseUrl, supabaseAnonKey } = getLobbySyncConfig();
  const url = supabaseUrl?.trim();
  const key = supabaseAnonKey?.trim();
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

function decodeBase64Url(encoded) {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  return atob(base64);
}

function encodeBase64Url(json) {
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Keep valid charset chars while typing (partial codes allowed). */
export function sanitizeJoinCodeInput(code) {
  if (!code) return '';
  let out = '';
  const upper = String(code).toUpperCase();
  for (let i = 0; i < upper.length && out.length < 6; i += 1) {
    const ch = upper[i];
    if (CHARSET.includes(ch)) out += ch;
  }
  return out;
}

export function normalizeJoinCode(code) {
  const cleaned = sanitizeJoinCodeInput(code);
  return cleaned.length === 6 ? cleaned : '';
}

export function generateJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

function readLocalLobby(joinCode) {
  if (!joinCode) return null;
  try {
    const raw = localStorage.getItem(lobbyKey(joinCode.toUpperCase()));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.joinCode ? data : null;
  } catch {
    return null;
  }
}

function writeLocalLobby(joinCode, lobbyData) {
  const code = joinCode.toUpperCase();
  const payload = {
    ...lobbyData,
    joinCode: code,
    updatedAt: Date.now(),
  };
  localStorage.setItem(lobbyKey(code), JSON.stringify(payload));
  lobbyBroadcast?.postMessage({ type: 'lobby-updated', joinCode: code, updatedAt: payload.updatedAt });
  return payload;
}

async function fetchSupabaseLobby(joinCode) {
  const sb = supabaseConfig();
  const code = normalizeJoinCode(joinCode);
  if (!sb || !code) return null;

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/lobbies?code=eq.${encodeURIComponent(code)}&select=payload`,
      { headers: supabaseHeaders(sb.key), cache: 'no-store' }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const payload = rows?.[0]?.payload;
    return payload?.joinCode ? payload : null;
  } catch {
    return null;
  }
}

async function pushSupabaseLobby(joinCode, lobbyData) {
  const sb = supabaseConfig();
  const code = normalizeJoinCode(joinCode);
  if (!sb || !code || !lobbyData) return false;

  const payload = { ...lobbyData, joinCode: code, updatedAt: Date.now() };
  const row = {
    code,
    payload,
    updated_at: new Date().toISOString(),
  };

  const upsertHeaders = {
    ...supabaseHeaders(sb.key),
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  try {
    const upsert = await fetch(`${sb.url}/rest/v1/lobbies?on_conflict=code`, {
      method: 'POST',
      headers: upsertHeaders,
      body: JSON.stringify(row),
    });
    if (upsert.ok) return true;

    const patch = await fetch(`${sb.url}/rest/v1/lobbies?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: upsertHeaders,
      body: JSON.stringify({ payload, updated_at: row.updated_at }),
    });
    if (patch.ok) return true;

    const insert = await fetch(`${sb.url}/rest/v1/lobbies`, {
      method: 'POST',
      headers: upsertHeaders,
      body: JSON.stringify(row),
    });
    return insert.ok;
  } catch {
    return false;
  }
}

async function deleteSupabaseLobby(joinCode) {
  const sb = supabaseConfig();
  const code = normalizeJoinCode(joinCode);
  if (!sb || !code) return;

  try {
    await fetch(`${sb.url}/rest/v1/lobbies?code=eq.${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: supabaseHeaders(sb.key),
    });
  } catch {
    /* ignore */
  }
}

async function fetchApiLobby(joinCode) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return null;

  try {
    const res = await fetch(`${LOBBY_API}/${code}`, { method: 'GET', cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data?.joinCode ? data : null;
  } catch {
    return null;
  }
}

async function pushApiLobby(joinCode, lobbyData) {
  const code = normalizeJoinCode(joinCode);
  if (!code || !lobbyData) return false;

  try {
    const res = await fetch(`${LOBBY_API}/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lobbyData, joinCode: code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteApiLobby(joinCode) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return;
  try {
    await fetch(`${LOBBY_API}/${code}`, { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}

async function fetchRemoteLobby(joinCode) {
  const fromSb = await fetchSupabaseLobby(joinCode);
  if (fromSb) return fromSb;
  return fetchApiLobby(joinCode);
}

async function pushRemoteLobby(joinCode, lobbyData) {
  const results = await Promise.all([
    pushSupabaseLobby(joinCode, lobbyData),
    pushApiLobby(joinCode, lobbyData),
  ]);
  return results.some(Boolean);
}

async function deleteRemoteLobby(joinCode) {
  await Promise.all([deleteSupabaseLobby(joinCode), deleteApiLobby(joinCode)]);
}

export function getLobbyBootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('d');
  if (fromQuery) {
    try {
      const data = JSON.parse(decodeBase64Url(fromQuery));
      if (data?.joinCode) return data;
    } catch {
      /* try hash fallback */
    }
  }

  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('lobby=')) return null;
  try {
    const data = JSON.parse(decodeBase64Url(raw.slice(6)));
    return data?.joinCode ? data : null;
  } catch {
    return null;
  }
}

export function clearLobbyBootstrapFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has('d')) {
    url.searchParams.delete('d');
    changed = true;
  }
  if (url.hash.startsWith('#lobby=')) {
    url.hash = '';
    changed = true;
  }
  if (changed) {
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

/** Sync read — local cache only. */
export function loadOpenLobby(joinCode) {
  return readLocalLobby(joinCode);
}

function applyBootstrapIfMatching(code) {
  const bootstrap = getLobbyBootstrapFromUrl();
  if (!bootstrap || normalizeJoinCode(bootstrap.joinCode) !== code) return null;
  writeLocalLobby(code, bootstrap);
  void pushRemoteLobby(code, bootstrap);
  return bootstrap;
}

/** Resolve lobby from URL embed, cloud, local cache, or short poll. */
export async function resolveOpenLobby(joinCode, { retryMs = 0 } = {}) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return null;

  const fromUrl = applyBootstrapIfMatching(code);
  if (fromUrl) return fromUrl;

  const deadline = Date.now() + retryMs;
  do {
    const remote = await fetchRemoteLobby(code);
    if (remote) {
      writeLocalLobby(code, remote);
      return remote;
    }

    const local = readLocalLobby(code);
    if (local) return local;

    if (retryMs > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  } while (Date.now() < deadline);

  return applyBootstrapIfMatching(code);
}

export function saveOpenLobby(joinCode, lobbyData) {
  const payload = writeLocalLobby(joinCode, lobbyData);
  void pushRemoteLobby(joinCode, payload);
  return payload;
}

/** Save locally and wait for cloud sync (use when host creates or updates lobby). */
export async function saveOpenLobbyAsync(joinCode, lobbyData) {
  const payload = writeLocalLobby(joinCode, lobbyData);
  await pushRemoteLobby(joinCode, payload);
  return payload;
}

export function removeOpenLobby(joinCode) {
  if (!joinCode) return;
  localStorage.removeItem(lobbyKey(joinCode.toUpperCase()));
  void deleteRemoteLobby(joinCode);
}

export function buildJoinLink(joinCode) {
  const origin = (getPublicSiteOrigin() || 'https://russ-blush.vercel.app').replace(/\/$/, '');
  return `${origin}/?join=${encodeURIComponent(joinCode.toUpperCase())}`;
}

export function getJoinCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeJoinCode(params.get('join') || '');
}

export function clearJoinCodeFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('join')) return;
  url.searchParams.delete('join');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export function isOnlineLobbySyncEnabled() {
  return Boolean(supabaseConfig());
}

export function serializeLobbyState(lobby) {
  const rules = {
    bullets: lobby.rules.bullets,
    minPlayers: lobby.rules.minPlayers,
    maxPlayers: Math.min(5, lobby.rules.maxPlayers ?? 5),
    fixedStake: lobby.rules.fixedStake ?? lobby.rules.minBet ?? 0.2,
  };
  return {
    active: lobby.active,
    joinCode: lobby.joinCode,
    hostId: lobby.hostId,
    hostWallet: lobby.hostWallet || lobby.players.find((p) => p.isHost)?.wallet || null,
    gameId: lobby.gameId,
    gamePda: lobby.gamePda,
    rules,
    players: lobby.players.map((p) => ({ ...p })),
    departedPlayers: (lobby.departedPlayers || []).map((p) => ({ ...p })),
    status: lobby.status || 'open',
    gameState: lobby.gameState || null,
  };
}

export function hydrateLobbyFromStore(stored) {
  return {
    active: true,
    joinCode: stored.joinCode,
    hostId: stored.hostId,
    hostWallet: stored.hostWallet || null,
    gameId: stored.gameId,
    gamePda: stored.gamePda,
    rules: {
      bullets: stored.rules?.bullets ?? 2,
      minPlayers: stored.rules?.minPlayers ?? 2,
      maxPlayers: Math.min(5, stored.rules?.maxPlayers ?? 5),
      fixedStake: stored.rules?.fixedStake ?? stored.rules?.minBet ?? 0.2,
    },
    players: stored.players.map((p) => ({ ...p })),
    departedPlayers: (stored.departedPlayers || []).map((p) => ({ ...p })),
    status: stored.status || 'open',
    gameState: stored.gameState || null,
  };
}

export function saveLastLobbyForWallet(wallet, joinCode) {
  if (!wallet || !joinCode) return;
  localStorage.setItem(`rr_last_lobby_${wallet}`, joinCode.toUpperCase());
}

export function getLastLobbyForWallet(wallet) {
  if (!wallet) return '';
  const code = localStorage.getItem(`rr_last_lobby_${wallet}`);
  if (!code) return '';
  const lobby = readLocalLobby(code);
  if (!lobby) return '';
  return lobby.status === 'open' || lobby.status === 'started' || lobby.status === 'finished' ? code : '';
}

export function clearLastLobbyForWallet(wallet) {
  if (!wallet) return;
  localStorage.removeItem(`rr_last_lobby_${wallet}`);
}

export function subscribeLobbyUpdates(joinCode, onUpdate) {
  if (!joinCode) return () => {};

  const code = joinCode.toUpperCase();
  let lastRemoteAt = 0;

  const onStorage = (e) => {
    if (e.key === lobbyKey(code)) onUpdate(readLocalLobby(code));
  };

  const onBroadcast = (e) => {
    if (e.data?.type === 'lobby-updated' && e.data.joinCode === code) {
      onUpdate(readLocalLobby(code));
    }
  };

  const pollRemote = async () => {
    const remote = await fetchRemoteLobby(code);
    if (!remote) return;
    const updatedAt = remote.updatedAt || 0;
    if (updatedAt <= lastRemoteAt) return;
    lastRemoteAt = updatedAt;
    writeLocalLobby(code, remote);
    onUpdate(remote);
  };

  window.addEventListener('storage', onStorage);
  lobbyBroadcast?.addEventListener('message', onBroadcast);
  const pollTimer = setInterval(pollRemote, 1200);
  void pollRemote();

  return () => {
    window.removeEventListener('storage', onStorage);
    lobbyBroadcast?.removeEventListener('message', onBroadcast);
    clearInterval(pollTimer);
  };
}
