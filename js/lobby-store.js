/**
 * Lobby persistence — local cache + remote API for cross-device join keys.
 */

const LOBBY_PREFIX = 'rr_open_lobby_';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_API = '/api/lobby';

const lobbyBroadcast =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rr_lobby_sync') : null;

function lobbyKey(code) {
  return `${LOBBY_PREFIX}${code.toUpperCase()}`;
}

export function normalizeJoinCode(code) {
  if (!code) return '';
  const cleaned = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (cleaned.length !== 6) return '';
  for (let i = 0; i < cleaned.length; i += 1) {
    if (!CHARSET.includes(cleaned[i])) return '';
  }
  return cleaned;
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

async function fetchRemoteLobby(joinCode) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return null;

  try {
    const res = await fetch(`${LOBBY_API}/${code}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data?.joinCode ? data : null;
  } catch {
    return null;
  }
}

async function pushRemoteLobby(joinCode, lobbyData) {
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

async function deleteRemoteLobby(joinCode) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return;

  try {
    await fetch(`${LOBBY_API}/${code}`, { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}

export function getLobbyBootstrapFromHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('lobby=')) return null;

  const encoded = raw.slice(6);
  try {
    const json = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json);
    return data?.joinCode ? data : null;
  } catch {
    return null;
  }
}

export function clearLobbyBootstrapFromHash() {
  const url = new URL(window.location.href);
  if (!url.hash.startsWith('#lobby=')) return;
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/** Sync read — local cache only (use resolveOpenLobby for joins). */
export function loadOpenLobby(joinCode) {
  return readLocalLobby(joinCode);
}

/** Fetch remote lobby, fall back to local cache, then URL bootstrap. */
export async function resolveOpenLobby(joinCode) {
  const code = normalizeJoinCode(joinCode);
  if (!code) return null;

  const remote = await fetchRemoteLobby(code);
  if (remote) {
    writeLocalLobby(code, remote);
    return remote;
  }

  const local = readLocalLobby(code);
  if (local) return local;

  const bootstrap = getLobbyBootstrapFromHash();
  if (bootstrap && normalizeJoinCode(bootstrap.joinCode) === code) {
    writeLocalLobby(code, bootstrap);
    void pushRemoteLobby(code, bootstrap);
    return bootstrap;
  }

  return null;
}

export function saveOpenLobby(joinCode, lobbyData) {
  const payload = writeLocalLobby(joinCode, lobbyData);
  void pushRemoteLobby(joinCode, payload);
  return payload;
}

export function removeOpenLobby(joinCode) {
  if (!joinCode) return;
  localStorage.removeItem(lobbyKey(joinCode.toUpperCase()));
  void deleteRemoteLobby(joinCode);
}

export function buildJoinLink(joinCode, lobbySnapshot = null) {
  const url = new URL(window.location.href);
  url.searchParams.set('join', joinCode.toUpperCase());
  url.hash = '';

  if (lobbySnapshot?.joinCode) {
    const encoded = btoa(JSON.stringify(lobbySnapshot))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    url.hash = `lobby=${encoded}`;
  }

  return url.toString();
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
