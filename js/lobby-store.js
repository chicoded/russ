/**
 * Open lobbies persisted in localStorage — join via 6-character room key.
 * (Practice mode: same browser/device; share the key or link with friends on the same machine.)
 */

const LOBBY_PREFIX = 'rr_open_lobby_';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const lobbyBroadcast =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rr_lobby_sync') : null;

function lobbyKey(code) {
  return `${LOBBY_PREFIX}${code.toUpperCase()}`;
}

export function generateJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

export function saveOpenLobby(joinCode, lobbyData) {
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

export function loadOpenLobby(joinCode) {
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

export function removeOpenLobby(joinCode) {
  if (!joinCode) return;
  localStorage.removeItem(lobbyKey(joinCode.toUpperCase()));
}

export function buildJoinLink(joinCode) {
  const url = new URL(window.location.href);
  url.searchParams.set('join', joinCode.toUpperCase());
  return url.toString();
}

export function getJoinCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join')?.toUpperCase().trim() || '';
  return code.length === 6 ? code : '';
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
  const lobby = loadOpenLobby(code);
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

  const onStorage = (e) => {
    if (e.key === lobbyKey(code)) onUpdate(loadOpenLobby(code));
  };

  const onBroadcast = (e) => {
    if (e.data?.type === 'lobby-updated' && e.data.joinCode === code) {
      onUpdate(loadOpenLobby(code));
    }
  };

  window.addEventListener('storage', onStorage);
  lobbyBroadcast?.addEventListener('message', onBroadcast);

  return () => {
    window.removeEventListener('storage', onStorage);
    lobbyBroadcast?.removeEventListener('message', onBroadcast);
  };
}
