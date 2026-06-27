import { initUiPolish, initBulletLoadSelectors, refreshGameVisuals, syncCylinderLoadVisuals } from './ui.js';
import { formatSol, lamportsToSol } from './config.js';
import {
  startGameMusic,
  stopGameMusic,
  duckMusic,
  playHammerCock,
  playCylinderSpin,
  playShotResult,
  playWin,
  playLose,
  playCashOut,
  playUiClick,
  ensureAudioContext,
} from './audio.js';
import { addBetRecord, clearBetHistory, renderBetHistory } from './history.js';
import {
  buildJoinLink,
  clearJoinCodeFromUrl,
  clearLastLobbyForWallet,
  generateJoinCode,
  getJoinCodeFromUrl,
  getLastLobbyForWallet,
  hydrateLobbyFromStore,
  loadOpenLobby,
  removeOpenLobby,
  saveLastLobbyForWallet,
  saveOpenLobby,
  serializeLobbyState,
  subscribeLobbyUpdates,
} from './lobby-store.js';
import {
  getPublicKeyString,
  getUsername,
  getWallet,
  refreshWalletUI,
  getBalance,
} from './wallet.js';
import {
  adjustPlayerStakeOnChain,
  cancelGameOnChain,
  createGameOnChain,
  createSoloSessionOnChain,
  declareAndSettleWinner,
  joinGameOnChain,
  refundPlayerOnChain,
  soloCashoutOnChain,
  soloForfeitOnChain,
  startGameOnChain,
} from './contract.js';

const CHAMBERS = 6;
const MAX_LOBBY_PLAYERS = 5;

const SINGLE_REWARDS = {
  1: { rate: 0.28, streak: 0.12, tag: 'Safe grind — small wins, many clicks' },
  2: { rate: 0.55, streak: 0.15, tag: 'Balanced risk — steady climbs' },
  3: { rate: 0.95, streak: 0.18, tag: 'Hot zone — 50/50 shots, big jumps' },
  4: { rate: 1.55, streak: 0.22, tag: 'High risk — one click can double you' },
  5: { rate: 2.75, streak: 0.30, tag: 'Insane gamble — jackpot clicks' },
};

const state = {
  mode: 'single',
  baseBet: 0.1,
  bullets: 2,
  players: [],
  stake: 0,
  winnings: 0,
  pot: 0,
  round: 1,
  currentPlayerIndex: 0,
  cylinder: [],
  currentChamber: 0,
  chambersChecked: 0,
  survives: 0,
  gameOver: false,
  isProcessing: false,
  sessionId: null,
  turnSeq: 0,
  lastAction: null,
  shotId: 0,
  lastMessage: '',
  lastMessageType: '',
  winnerWallet: null,
  resultMessage: null,
};

const lobby = {
  active: false,
  joinCode: null,
  status: 'open',
  hostId: null,
  gameId: null,
  gamePda: null,
  rules: {
    bullets: 2,
    minPlayers: 2,
    maxPlayers: MAX_LOBBY_PLAYERS,
    fixedStake: 0.2,
  },
  players: [],
  departedPlayers: [],
  hostWallet: null,
  gameState: null,
};

let nextPlayerId = 1;
let lobbyPollTimer = null;
let lobbyUnsubscribe = null;
let lastSeenTurnSeq = 0;
let syncingRemoteGame = false;
let lastMergedLobbyAt = 0;
let lastRenderedPot = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let cinemaModule = null;
function getCinema() {
  if (!cinemaModule) {
    cinemaModule = import('./cinema.js');
  }
  return cinemaModule;
}

const setupScreen = $('#setup-screen');
const lobbyScreen = $('#lobby-screen');
const gameScreen = $('#game-screen');
const resultScreen = $('#result-screen');
const historyScreen = $('#history-screen');

function setTxStatus(msg, loading = false) {
  const el = document.getElementById('tx-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('loading', loading);
}

async function runTx(label, fn) {
  try {
    setTxStatus(`${label}…`, true);

    const balance = await getBalance();
    if (balance <= 0) {
      throw new Error('No practice SOL left. Log out and create a new username to get 100 SOL.');
    }

    const result = await fn();
    const sig = result?.sig || 'mock';
    setTxStatus(`Mock transaction confirmed · ${sig.slice(0, 16)}…`);
    await refreshWalletUI();
    setTimeout(() => setTxStatus(''), 3000);
    return result;
  } catch (err) {
    console.error(err);
    setTxStatus(`Transaction failed: ${err.message || err}`);
    throw err;
  }
}

export function initGame() {
  initUiPolish();
  bindSetupEvents();
  bindLobbyEvents();
  bindGameEvents();
  bindHistoryEvents();
  updateSetupUI();
  updateBetPreview();

  const user = getUsername();
  if (user) {
    const playerName = $('#player-name');
    const hostName = $('#host-name');
    const joinName = $('#join-name');
    const joinSetupName = $('#join-setup-name');
    if (playerName) playerName.value = user;
    if (hostName) hostName.value = user;
    if (joinName) joinName.value = user;
    if (joinSetupName) joinSetupName.value = user;
  }

  const urlJoinCode = getJoinCodeFromUrl();
  if (urlJoinCode) {
    state.mode = 'multi';
    $$('.mode-btn').forEach((b) => b.classList.remove('active'));
    $('.mode-btn[data-mode="multi"]')?.classList.add('active');
    updateSetupUI();
    switchMultiTab('join');
    const codeInput = $('#join-code');
    if (codeInput) codeInput.value = urlJoinCode;
  } else {
    updateRejoinHint();
    updateJoinStakeFields();
    ensureLobbyMembershipSync();
  }
}

function bindSetupEvents() {
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      updateSetupUI();
      updateBetPreview();
    });
  });

  $$('.bullet-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.bullet-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.bullets = parseInt(btn.dataset.bullets, 10);
      updateBetPreview();
    });
  });

  $('#base-bet').addEventListener('input', updateBetPreview);
  $('#start-btn').addEventListener('click', startSingleGame);

  $$('.multi-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchMultiTab(btn.dataset.multiTab));
  });
  $('#open-lobby-btn').addEventListener('click', openLobby);
  $('#join-with-code-btn').addEventListener('click', joinWithCodeFromSetup);
  $('#join-code')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    renderJoinRulesPreview();
  });
}

function switchMultiTab(tab) {
  $$('.multi-tab').forEach((b) => b.classList.toggle('active', b.dataset.multiTab === tab));
  $('#multi-host-panel')?.classList.toggle('hidden', tab !== 'host');
  $('#multi-join-panel')?.classList.toggle('hidden', tab !== 'join');
  if (tab === 'join') renderJoinRulesPreview();
}

function bindLobbyEvents() {
  $('#join-game-btn').addEventListener('click', joinLobby);
  $('#start-multi-btn').addEventListener('click', startMultiGame);
  $('#leave-lobby-btn').addEventListener('click', leaveLobby);
  $('#end-lobby-btn')?.addEventListener('click', endLobbyForAll);
  $('#copy-join-key-btn')?.addEventListener('click', copyJoinKey);
  $('#copy-join-link-btn')?.addEventListener('click', copyJoinLink);
  $('#update-stake-btn')?.addEventListener('click', updateLobbyStake);
  $('#host-bullets-control')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.lobby-bullet-btn');
    if (btn) updateLobbyBullets(parseInt(btn.dataset.bullets, 10));
  });
}

function bindHistoryEvents() {
  $('#view-history-btn')?.addEventListener('click', openBetHistory);
  $('#nav-history-btn')?.addEventListener('click', () => {
    document.getElementById('nav-dropdown')?.classList.add('hidden');
    openBetHistory();
  });
  $('#nav-setup-btn')?.addEventListener('click', () => {
    document.getElementById('nav-dropdown')?.classList.add('hidden');
    void goToMainMenu();
  });
  $('#toolbar-menu-btn')?.addEventListener('click', () => void goToMainMenu());
  $('#toolbar-history-btn')?.addEventListener('click', openBetHistory);
  $('#nav-menu-toggle')?.addEventListener('click', () => void goToMainMenu());
  $('#game-inline-menu')?.addEventListener('click', () => void goToMainMenu());
  $('#game-inline-history')?.addEventListener('click', openBetHistory);
  $('#history-back-btn')?.addEventListener('click', () => {
    void goToMainMenu();
  });
  $('#clear-history-btn')?.addEventListener('click', () => {
    if (!getPublicKeyString()) return;
    if (confirm('Clear all bet history for this wallet? This cannot be undone.')) {
      clearBetHistory();
      renderBetHistory();
    }
  });
}

export function openBetHistory() {
  renderBetHistory();
  showScreen('history');
}

async function goToMainMenu() {
  if (isMultiGameInProgress()) {
    alert('Finish the match or use “Leave Game (Forfeit)” before returning to the menu.');
    return;
  }

  if (isSingleGameInProgress()) {
    const msg =
      state.survives > 0
        ? 'Leave this game? Use Cash Out first to keep your winnings — otherwise your stake is forfeited.'
        : 'Leave this game? Your stake will be forfeited.';
    if (!confirm(msg)) return;

    try {
      if (state.sessionId) {
        await runTx('Forfeiting stake on-chain', () =>
          soloForfeitOnChain({ sessionId: state.sessionId })
        );
      }
      recordGameHistory(null, 'Left game early — stake forfeited.');
    } catch {
      /* still return to menu */
    }
    state.gameOver = true;
    state.sessionId = null;
    showScreen('setup');
    return;
  }

  if (lobbyScreen.classList.contains('active') && lobby.active) {
    await leaveLobby();
    return;
  }

  showScreen('setup');
}

function getMyPlayer() {
  const wallet = getPublicKeyString();
  const name = getUsername();

  if (state.mode === 'single') {
    return state.players[0];
  }

  return (
    state.players.find((p) => p.wallet && p.wallet === wallet) ||
    state.players.find((p) => p.name === name)
  );
}

function recordGameHistory(winner, message, opts = {}) {
  const wallet = getPublicKeyString();
  if (!wallet) return;

  const me = getMyPlayer();
  if (!me) return;

  let outcome;
  let betSol;
  let payoutSol;
  let profitSol;

  if (state.mode === 'single') {
    betSol = state.stake || getTotalBet();
    if (winner) {
      outcome = 'cashout';
      payoutSol = getCashOutTotal();
      profitSol = getProfit();
    } else {
      outcome = 'loss';
      payoutSol = 0;
      profitSol = -betSol;
    }
  } else {
    betSol = me.bet;
    const iWon = winner && (winner.wallet === wallet || winner.name === me.name);

    if (opts.forfeit) {
      outcome = 'forfeit';
      payoutSol = 0;
      profitSol = -betSol;
    } else if (iWon) {
      outcome = 'win';
      payoutSol = state.pot;
      profitSol = payoutSol - betSol;
    } else if (!winner) {
      outcome = 'no_winner';
      payoutSol = 0;
      profitSol = -betSol;
    } else {
      outcome = 'eliminated';
      payoutSol = 0;
      profitSol = -betSol;
    }
  }

  addBetRecord({
    mode: state.mode,
    outcome,
    betSol,
    payoutSol,
    profitSol,
    bullets: state.bullets,
    survives: state.survives,
    round: state.round,
    playerCount: state.players.length,
    gameId: state.sessionId || lobby.gameId || null,
    summary: message,
  });
}

function bindGameEvents() {
  $('#pull-trigger-btn').addEventListener('click', () => {
    void ensureAudioContext();
    pullTrigger();
  });
  $('#cash-out-btn').addEventListener('click', cashOut);
  $('#play-again-btn').addEventListener('click', () => {
    if (isMultiGameInProgress()) {
      alert('Finish the game first. Leaving counts as a forfeit loss.');
      return;
    }
    resetGameState();
    resetGameUiForNewRound();
    resetLobby();
    showScreen('setup');
  });
  $('#forfeit-game-btn')?.addEventListener('click', () => {
    void forfeitActiveMultiGame();
  });

  window.addEventListener('beforeunload', (e) => {
    if (isMultiGameInProgress()) {
      e.preventDefault();
      e.returnValue = 'Leaving forfeits your stake. Are you sure?';
    }
  });
}

function updateSetupUI() {
  const isSingle = state.mode === 'single';
  $('#single-player-options').classList.toggle('hidden', !isSingle);
  $('#single-setup').classList.toggle('hidden', !isSingle);
  $('#multi-setup').classList.toggle('hidden', isSingle);
  $('#start-btn').classList.toggle('hidden', !isSingle);
  $('#multi-setup').classList.toggle('hidden', isSingle);

  updateRejoinHint();

  const singleHint = $('#single-hint');
  if (singleHint) singleHint.style.display = isSingle ? 'block' : 'none';
}

function updateBetPreview() {
  const baseBet = parseFloat($('#base-bet').value) || 0.1;
  state.baseBet = baseBet;
  const bullets = parseInt($('.bullet-btn.active')?.dataset.bullets, 10) || state.bullets;
  const total = bullets * baseBet;
  $('#bet-preview').textContent = `Total stake: ${formatSol(total)} (${bullets} bullets × ${formatSol(baseBet)})`;

  const preview = $('#payout-preview');
  if (!preview) return;

  if (state.mode === 'single') {
    const r1 = calcSurviveReward(bullets, baseBet, 1);
    const r2 = calcSurviveReward(bullets, baseBet, 2);
    const r3 = calcSurviveReward(bullets, baseBet, 3);
    const odds = Math.round(((CHAMBERS - bullets) / CHAMBERS) * 100);
    const cfg = SINGLE_REWARDS[bullets];
    preview.innerHTML = `
      <div><strong>${formatSol(total)}</strong> at risk · ~${odds}% to survive each click</div>
      <div class="${bullets >= 4 ? 'risk-high' : ''}">${cfg.tag}</div>
      <div>1 click: +${formatSol(r1)} → <strong>${formatSol(total + r1)}</strong></div>
      <div>2 clicks: +${formatSol(r2)} more → <strong>${formatSol(total + r1 + r2)}</strong></div>
      <div>3 clicks: +${formatSol(r3)} more → <strong>${formatSol(total + r1 + r2 + r3)}</strong></div>
    `;
    preview.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
  }
}

function calcSurviveReward(bullets, baseBet, surviveNumber) {
  const cfg = SINGLE_REWARDS[bullets];
  const streakMult = 1 + (surviveNumber - 1) * cfg.streak;
  return Math.round(baseBet * bullets * cfg.rate * streakMult * 1000) / 1000;
}

function getSurviveReward(surviveNumber) {
  return calcSurviveReward(state.bullets, state.baseBet, surviveNumber);
}

function getCashOutTotal() {
  return state.stake + state.winnings;
}

function getProfit() {
  return state.winnings;
}

function getRemainingSurvivalOdds() {
  const remaining = CHAMBERS - state.chambersChecked;
  if (remaining <= 0) return 0;

  let bulletsLeft = 0;
  for (let i = 0; i < remaining; i += 1) {
    const idx = (state.currentChamber + i) % CHAMBERS;
    if (state.cylinder[idx]) bulletsLeft += 1;
  }

  return Math.round(((remaining - bulletsLeft) / remaining) * 100);
}

function getTotalBet() {
  return state.bullets * state.baseBet;
}

function createPlayerId() {
  const id = nextPlayerId;
  nextPlayerId += 1;
  return id;
}

function updateRejoinHint() {
  const el = $('#rejoin-lobby-hint');
  if (!el) return;

  const code = getLastLobbyForWallet(getPublicKeyString());
  const rejoin = getRejoinRecord();
  const isHost = isLobbyOwner() || rejoin?.isHost;

  if (code && (rejoin || isHost)) {
    const stakeNote = rejoin?.bet ? ` — stake ${formatSol(rejoin.bet)}` : '';
    el.textContent = isHost
      ? `Your lobby ${code} is open — return anytime and start when ready${stakeNote}.`
      : `Rejoin lobby ${code}${stakeNote}.`;
    el.classList.remove('hidden');
    const joinInput = $('#join-code');
    if (joinInput && !joinInput.value) joinInput.value = code;

    const joinBtn = $('#join-with-code-btn');
    if (joinBtn) joinBtn.textContent = isHost ? 'Return to Lobby' : 'Join Lobby';
  } else if (code) {
    el.textContent = `You have an open lobby (${code}) — rejoin with that key to keep your host seat.`;
    el.classList.remove('hidden');
    const joinInput = $('#join-code');
    if (joinInput && !joinInput.value) joinInput.value = code;
  } else {
    el.classList.add('hidden');
    el.textContent = '';
    const joinBtn = $('#join-with-code-btn');
    if (joinBtn) joinBtn.textContent = 'Join Lobby';
  }
  updateJoinStakeFields();
}

function resetLobby() {
  stopLobbySync();
  if (lobby.joinCode) removeOpenLobby(lobby.joinCode);
  lobby.active = false;
  lobby.joinCode = null;
  lobby.status = 'open';
  lobby.hostId = null;
  lobby.hostWallet = null;
  lobby.gameId = null;
  lobby.gamePda = null;
  lobby.rules = { bullets: 2, minPlayers: 2, maxPlayers: MAX_LOBBY_PLAYERS, fixedStake: 0.2 };
  lobby.players = [];
  lobby.departedPlayers = [];
}

function normalizeLobbyRules(rules = {}) {
  const fixedStake = rules.fixedStake ?? rules.minBet ?? 0.2;
  let minPlayers = Math.min(MAX_LOBBY_PLAYERS, Math.max(2, rules.minPlayers ?? 2));
  return {
    bullets: Math.min(5, Math.max(1, rules.bullets ?? 2)),
    minPlayers,
    maxPlayers: MAX_LOBBY_PLAYERS,
    fixedStake: Math.max(0.01, fixedStake),
  };
}

function getFixedStake() {
  return normalizeLobbyRules(lobby.rules).fixedStake;
}

async function updateLobbyStake() {
  if (!isLobbyHost()) {
    alert('Only the host can change the stake.');
    return;
  }

  if (lobby.status !== 'open') {
    alert('Stake cannot be changed after the game has started.');
    return;
  }

  const newStake = Math.max(0.01, parseFloat($('#lobby-host-stake')?.value) || 0);
  const oldStake = getFixedStake();

  if (newStake < 0.01) {
    alert('Stake must be at least 0.01 SOL.');
    return;
  }

  if (Math.abs(newStake - oldStake) < 0.0001) return;

  const othersJoined = lobby.players.some((p) => !p.isHost && p.wallet !== lobby.hostWallet);
  if (othersJoined) {
    const ok = confirm(
      `${lobby.players.length - 1} player(s) already joined at ${formatSol(oldStake)}. ` +
        `The new stake (${formatSol(newStake)}) applies to future joiners only. Update anyway?`
    );
    if (!ok) return;
  }

  const hostPlayer = lobby.players.find((p) => p.isHost || p.wallet === lobby.hostWallet);
  const hostAlone = lobby.players.length === 1 && hostPlayer;

  try {
    if (hostAlone && hostPlayer) {
      await runTx('Updating host stake on-chain', () =>
        adjustPlayerStakeOnChain({
          gamePda: lobby.gamePda,
          playerWallet: hostPlayer.wallet,
          oldBetSol: oldStake,
          newBetSol: newStake,
        })
      );
      hostPlayer.bet = newStake;
    }

    lobby.rules.fixedStake = newStake;
    persistLobby();
    renderLobby();
    setTxStatus(`Stake updated to ${formatSol(newStake)}`);
    setTimeout(() => setTxStatus(''), 3000);
  } catch (err) {
    alert(err.message || 'Could not update stake.');
  }
}

function updateLobbyBullets(bullets) {
  if (!isLobbyHost()) {
    alert('Only the host can change bullets.');
    return;
  }

  if (lobby.status !== 'open') {
    alert('Bullets cannot be changed after the game has started.');
    return;
  }

  const newBullets = Math.min(5, Math.max(1, bullets));
  if (newBullets === lobby.rules.bullets) return;

  lobby.rules.bullets = newBullets;
  persistLobby();
  renderLobby();
  setTxStatus(`Bullets set to ${newBullets}`);
  setTimeout(() => setTxStatus(''), 3000);
}

function syncHostRulesFromSetup() {
  let minPlayers = Math.min(MAX_LOBBY_PLAYERS, Math.max(2, parseInt($('#host-min-players').value, 10) || 2));
  const fixedStake = Math.max(0.01, parseFloat($('#host-fixed-stake').value) || 0.2);

  lobby.rules = {
    bullets: lobby.rules?.bullets ?? 2,
    minPlayers,
    maxPlayers: MAX_LOBBY_PLAYERS,
    fixedStake,
  };

  $('#host-min-players').value = minPlayers;
  $('#host-fixed-stake').value = fixedStake;
}

function renderJoinRulesPreview() {
  const preview = $('#join-rules-preview');
  if (!preview) return;

  const code = $('#join-code')?.value.trim().toUpperCase();
  if (!code || code.length !== 6) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }

  const stored = loadOpenLobby(code);
  if (!stored) {
    preview.classList.remove('hidden');
    preview.innerHTML = '<p class="hint">Invalid join key.</p>';
    return;
  }

  preview.classList.remove('hidden');
  preview.innerHTML = `<h4>Lobby rules</h4><ul>${renderRulesListHtml(stored.rules)}</ul>`;
}

function renderRulesListHtml(rules) {
  const r = normalizeLobbyRules(rules);
  const odds = Math.round(((CHAMBERS - r.bullets) / CHAMBERS) * 100);
  return `
    <li><strong>${r.bullets}</strong> bullets in the chamber (~${odds}% survive each shot)</li>
    <li><strong>${r.minPlayers}–${r.maxPlayers}</strong> players (max ${MAX_LOBBY_PLAYERS})</li>
    <li>Fixed stake: <strong>${formatSol(r.fixedStake)}</strong> per player</li>
    <li>Players take turns pulling the trigger until <strong>one is left standing</strong></li>
    <li>Last survivor wins the <strong>entire pot</strong></li>
  `;
}

function detachLocalLobbyView() {
  stopLobbySync();
  lobby.active = false;
  lobby.joinCode = null;
  lobby.status = 'open';
  lobby.hostId = null;
  lobby.hostWallet = null;
  lobby.gameId = null;
  lobby.gamePda = null;
  lobby.players = [];
  lobby.departedPlayers = [];
}

function updateJoinStakeFields() {
  renderJoinRulesPreview();
  const stakeLabel = $('#join-fixed-stake-label');
  if (stakeLabel && lobby.active) {
    stakeLabel.textContent = `Fixed stake: ${formatSol(getFixedStake())} per player`;
  }
}

function recordDepartedPlayer(player) {
  if (!player) return;
  if (!lobby.departedPlayers) lobby.departedPlayers = [];
  lobby.departedPlayers = lobby.departedPlayers.filter((p) => p.wallet !== player.wallet);
  lobby.departedPlayers.push({
    id: player.id,
    name: player.name,
    bet: player.bet,
    wallet: player.wallet,
    isHost: !!player.isHost,
  });
}

function findDepartedPlayer(wallet) {
  return lobby.departedPlayers?.find((p) => p.wallet === wallet) || null;
}

function getRejoinRecord(wallet = getPublicKeyString()) {
  if (!wallet) return null;

  if (lobby.active) {
    const departed = findDepartedPlayer(wallet);
    if (departed) return departed;
  }

  const code =
    lobby.joinCode ||
    $('#join-code')?.value.trim().toUpperCase() ||
    getLastLobbyForWallet(wallet);

  if (!code) return null;

  const stored = loadOpenLobby(code);
  if (!stored) return null;

  return stored.departedPlayers?.find((p) => p.wallet === wallet) || null;
}

function isLobbyOwner(wallet = getPublicKeyString()) {
  return !!(wallet && lobby.hostWallet && wallet === lobby.hostWallet);
}

function isReturningHost(wallet) {
  if (!wallet || isInCurrentLobby()) return false;
  const departed = findDepartedPlayer(wallet);
  return !!(departed?.isHost);
}

function pruneDepartedPlayers() {
  if (!lobby.departedPlayers?.length) return;
  const activeWallets = new Set(lobby.players.map((p) => p.wallet));
  lobby.departedPlayers = lobby.departedPlayers.filter((d) => !activeWallets.has(d.wallet));
}

function syncNextPlayerIdFromLobby() {
  const maxId = lobby.players.reduce((max, p) => Math.max(max, p.id || 0), 0);
  nextPlayerId = maxId + 1;
}

function isMultiGameInProgress() {
  return (
    state.mode === 'multi' &&
    !state.gameOver &&
    (lobby.status === 'started' || (lobby.gameState && !lobby.gameState.gameOver))
  );
}

function isSingleGameInProgress() {
  return state.mode === 'single' && !state.gameOver && !!state.sessionId;
}

export function isMultiGameLockedIn() {
  return isMultiGameInProgress();
}

export async function abandonMultiGameIfActive() {
  if (!isMultiGameInProgress()) return false;
  return forfeitActiveMultiGame({ skipConfirm: true });
}

function isAliveInStoredGame(stored, wallet) {
  const player = stored.gameState?.players?.find((p) => p.wallet === wallet);
  return !!(player && player.alive);
}

function showForfeitResultScreen(betSol) {
  const icon = $('#result-icon');
  const title = $('#result-title');
  const msg = $('#result-message');
  const amount = $('#result-amount');

  icon.textContent = '💀';
  title.textContent = 'You Forfeited';
  msg.textContent = 'You left the game. Your stake stays in the pot.';
  amount.style.display = 'block';
  amount.style.color = 'var(--danger)';
  amount.textContent = `-${formatSol(betSol)}`;
  showScreen('result');
}

async function maybeSettleWinnerOnChain(winner) {
  if (!lobby.gamePda || !winner?.wallet) return;

  const host = lobby.players.find((p) => p.isHost);
  if (!host || getPublicKeyString() !== host.wallet) return;

  try {
    await runTx('Paying winner from escrow', () =>
      declareAndSettleWinner({
        gamePda: lobby.gamePda,
        host: getWallet(),
        winnerPubkey: winner.wallet,
      })
    );
  } catch {
    /* mock — other clients still see winner */
  }
}

async function forfeitActiveMultiGame({ skipConfirm = false } = {}) {
  if (!isMultiGameInProgress()) return false;

  const wallet = getPublicKeyString();
  const me = state.players.find((p) => p.wallet === wallet);
  if (!me?.alive) return false;

  if (
    !skipConfirm &&
    !confirm('Leave the game? You forfeit your stake and lose. The match continues for everyone else.')
  ) {
    return false;
  }

  me.alive = false;

  if (getCurrentPlayer()?.wallet === wallet) {
    advanceToNextPlayer();
  }

  state.lastMessage = `${me.name} left the game — stake forfeited.`;
  state.lastMessageType = 'danger';

  const alive = getAlivePlayers();

  if (alive.length === 1) {
    const winner = alive[0];
    state.winnerWallet = winner.wallet;
    state.resultMessage = `${winner.name} wins the pot — last player standing.`;
    state.gameOver = true;
    recordMultiTurnAction({ type: 'win', winnerName: winner.name, winnerWallet: winner.wallet });
    lastSeenTurnSeq = state.turnSeq;
    persistMultiGameState();
    void maybeSettleWinnerOnChain(winner);
  } else if (alive.length === 0) {
    state.gameOver = true;
    state.winnerWallet = null;
    state.resultMessage = 'Everyone is out. No winner.';
    recordMultiTurnAction({ type: 'forfeit', playerName: me.name, survived: false });
    lastSeenTurnSeq = state.turnSeq;
    persistMultiGameState();
  } else {
    recordMultiTurnAction({ type: 'forfeit', playerName: me.name, survived: false });
    lastSeenTurnSeq = state.turnSeq;
    persistMultiGameState();
  }

  recordGameHistory(null, 'Left during game — stake forfeited.', { forfeit: true });
  clearLastLobbyForWallet(wallet);
  stopLobbySync();
  showForfeitResultScreen(me.bet);
  detachLocalLobbyView();
  return true;
}

function persistLobby() {
  if (!lobby.active || !lobby.joinCode) return;
  pruneDepartedPlayers();
  saveOpenLobby(lobby.joinCode, serializeLobbyState(lobby));
}

function buildGameStateSnapshot() {
  return {
    turnSeq: state.turnSeq,
    bullets: state.bullets,
    players: state.players.map((p) => ({ ...p })),
    pot: state.pot,
    round: state.round,
    currentPlayerIndex: state.currentPlayerIndex,
    cylinder: [...state.cylinder],
    currentChamber: state.currentChamber,
    chambersChecked: state.chambersChecked,
    survives: state.survives,
    gameOver: state.gameOver,
    isProcessing: state.isProcessing,
    lastMessage: state.lastMessage,
    lastMessageType: state.lastMessageType,
    lastAction: state.lastAction ? { ...state.lastAction } : null,
    winnerWallet: state.winnerWallet,
    resultMessage: state.resultMessage,
  };
}

function applyGameStateSnapshot(gs) {
  if (!gs) return;

  state.mode = 'multi';
  state.bullets = gs.bullets;
  state.players = gs.players.map((p) => ({ ...p }));
  state.pot = gs.pot;
  state.round = gs.round;
  state.currentPlayerIndex = gs.currentPlayerIndex;
  state.cylinder = [...gs.cylinder];
  state.currentChamber = gs.currentChamber;
  state.chambersChecked = gs.chambersChecked;
  state.survives = gs.survives ?? 0;
  state.gameOver = !!gs.gameOver;
  state.isProcessing = !!gs.isProcessing;
  state.lastMessage = gs.lastMessage || '';
  state.lastMessageType = gs.lastMessageType || '';
  state.lastAction = gs.lastAction ? { ...gs.lastAction } : null;
  state.winnerWallet = gs.winnerWallet || null;
  state.resultMessage = gs.resultMessage || null;
  state.turnSeq = gs.turnSeq ?? 0;
}

function persistMultiGameState() {
  if (state.mode !== 'multi' || !lobby.active || !lobby.joinCode) return;
  lobby.gameState = buildGameStateSnapshot();
  lobby.status = state.gameOver ? 'finished' : 'started';
  persistLobby();
}

function isMyTurn() {
  if (state.mode !== 'multi' || state.gameOver) return false;
  const player = getCurrentPlayer();
  return !!(player?.alive && player.wallet === getPublicKeyString());
}

function isPlayerInStoredGame(stored, wallet) {
  return stored.players?.some((p) => p.wallet === wallet);
}

function enterStoredMultiGame(stored) {
  Object.assign(lobby, hydrateLobbyFromStore(stored));
  lobby.gameState = stored.gameState || null;
  lobby.active = true;
  syncNextPlayerIdFromLobby();
  lastMergedLobbyAt = stored.updatedAt || 0;
  startLobbySync();

  if (!lobby.gameState) return;

  lastSeenTurnSeq = lobby.gameState.turnSeq ?? 0;
  applyGameStateSnapshot(lobby.gameState);

  if (lobby.gameState.gameOver) {
    showMultiResultFromState(lobby.gameState);
  } else {
    showScreen('game');
    renderGameUI();
    refreshWalletUI();
    if (state.lastMessage) setMessage(state.lastMessage, state.lastMessageType);
  }
}

function ensureLobbyMembershipSync() {
  const wallet = getPublicKeyString();
  if (!wallet) return;

  const code = lobby.joinCode || getLastLobbyForWallet(wallet);
  if (!code) return;

  const stored = loadOpenLobby(code);
  if (!stored || !isPlayerInStoredGame(stored, wallet)) return;

  if (stored.status === 'started' || stored.status === 'finished') {
    if (!isAliveInStoredGame(stored, wallet)) return;
    if (!lobby.active || lobby.joinCode !== stored.joinCode) {
      enterStoredMultiGame(stored);
    }
    return;
  }

  if (!lobby.active && stored.status === 'open') {
    Object.assign(lobby, hydrateLobbyFromStore(stored));
    lobby.gameState = null;
    lobby.active = true;
    syncNextPlayerIdFromLobby();
    startLobbySync();
    showScreen('lobby');
    renderLobby();
  }
}

function tryResumeActiveMultiGame() {
  ensureLobbyMembershipSync();
}

async function syncMultiGameFromStore(gs) {
  if (!gs || syncingRemoteGame) return;

  const wallet = getPublicKeyString();
  const isOnGameScreen = gameScreen.classList.contains('active');
  const isOnResultScreen = resultScreen.classList.contains('active');

  if (gs.turnSeq > lastSeenTurnSeq && gs.lastAction?.seq === gs.turnSeq) {
    const iActed = gs.lastAction.actorWallet === wallet;

    if (!iActed) {
      syncingRemoteGame = true;
      try {
        if (gs.lastAction.type === 'win') {
          const { playGangWinCinema } = await getCinema();
          await playGangWinCinema({
            winnerName: gs.lastAction.winnerName,
            potLabel: formatSol(gs.pot),
          });
        } else if (gs.lastAction.type === 'forfeit') {
          setMessage(`${gs.lastAction.playerName} left the game — stake forfeited.`, 'danger');
        } else if (gs.lastAction.type === 'shot') {
          const aliveNames = gs.players.filter((p) => p.alive).map((p) => p.name);
          const eliminatedCount = gs.players.filter((p) => !p.alive).length;
          const { playGangCinema } = await getCinema();
          await playGangCinema({
            playerName: gs.lastAction.playerName,
            survived: gs.lastAction.survived,
            aliveNames,
            eliminatedCount,
            totalPlayers: gs.players.length,
          });
        }
      } finally {
        syncingRemoteGame = false;
      }
    }

    lastSeenTurnSeq = gs.turnSeq;
  }

  applyGameStateSnapshot(gs);
  lobby.gameState = gs;

  if (gs.gameOver) {
    if (!isOnResultScreen) showMultiResultFromState(gs);
    return;
  }

  if (!isOnGameScreen) {
    showScreen('game');
    refreshWalletUI();
  }
  renderGameUI();
  if (state.lastMessage) setMessage(state.lastMessage, state.lastMessageType);
}

function showMultiResultFromState(gs) {
  const winner = gs.players.find((p) => p.wallet === gs.winnerWallet);
  state.gameOver = true;

  const icon = $('#result-icon');
  const title = $('#result-title');
  const msg = $('#result-message');
  const amount = $('#result-amount');

  amount.style.display = 'block';
  amount.style.color = 'var(--gold)';

  if (winner) {
    icon.textContent = '🏆';
    title.textContent = `${winner.name} Wins!`;
    msg.textContent = gs.resultMessage || `${winner.name} wins the entire pot!`;
    amount.textContent = formatSol(gs.pot);
  } else {
    icon.textContent = '💀';
    title.textContent = 'No Winner';
    msg.textContent = gs.resultMessage || 'Everyone is out.';
    amount.style.display = 'none';
  }

  showScreen('result');
}

function recordMultiTurnAction(action) {
  state.turnSeq += 1;
  state.lastAction = { ...action, seq: state.turnSeq, actorWallet: getPublicKeyString() };
  persistMultiGameState();
}

function startLobbySync() {
  stopLobbySync();
  if (!lobby.joinCode) return;

  const pull = () => {
    const stored = loadOpenLobby(lobby.joinCode);
    if (stored) mergeLobbyFromStore(stored);
  };

  lobbyUnsubscribe = subscribeLobbyUpdates(lobby.joinCode, pull);
  lobbyPollTimer = setInterval(pull, 500);
  pull();
}

function stopLobbySync() {
  if (lobbyPollTimer) {
    clearInterval(lobbyPollTimer);
    lobbyPollTimer = null;
  }
  if (lobbyUnsubscribe) {
    lobbyUnsubscribe();
    lobbyUnsubscribe = null;
  }
}

function mergeLobbyFromStore(stored) {
  if (!stored) return;

  const wallet = getPublicKeyString();
  const isMember = isPlayerInStoredGame(stored, wallet);
  const updatedAt = stored.updatedAt || 0;

  if (!lobby.active) {
    if (isMember && (stored.status === 'started' || stored.status === 'finished') && stored.gameState) {
      enterStoredMultiGame(stored);
    }
    return;
  }

  if (lobby.joinCode && stored.joinCode !== lobby.joinCode) return;

  if (updatedAt && updatedAt <= lastMergedLobbyAt && stored.status === lobby.status) {
    const sameGame =
      stored.status !== 'started' && stored.status !== 'finished'
        ? true
        : stored.gameState?.turnSeq === lobby.gameState?.turnSeq;
    if (sameGame) return;
  }

  lastMergedLobbyAt = updatedAt;

  lobby.rules = normalizeLobbyRules(stored.rules);
  lobby.players = stored.players.map((p) => ({ ...p }));
  lobby.departedPlayers = (stored.departedPlayers || []).map((p) => ({ ...p }));
  lobby.hostWallet = stored.hostWallet || null;
  lobby.hostId = stored.hostId;
  lobby.status = stored.status || 'open';
  lobby.gameState = stored.gameState || null;
  syncNextPlayerIdFromLobby();

  if ((stored.status === 'started' || stored.status === 'finished') && stored.gameState) {
    void syncMultiGameFromStore(stored.gameState);
    return;
  }

  renderLobby();
}

function isLobbyHost() {
  const wallet = getPublicKeyString();
  if (!wallet) return false;
  const me = lobby.players.find((p) => p.wallet === wallet);
  if (me?.isHost) return true;
  return !!(me && lobby.hostWallet && wallet === lobby.hostWallet);
}

function isHostPresent() {
  return lobby.players.some((p) => p.isHost || p.wallet === lobby.hostWallet);
}

function canStartMultiGame() {
  if (!isHostPresent()) return false;
  if (lobby.players.length < lobby.rules.minPlayers) return false;
  return true;
}

function getStartBlockReason() {
  if (!isHostPresent()) return 'The host must be in the lobby to start.';
  if (lobby.players.length < lobby.rules.minPlayers) {
    return `Need at least ${lobby.rules.minPlayers} players (currently ${lobby.players.length}). Share the join key.`;
  }
  if (!isLobbyHost()) return 'Only the host can start the game.';
  return '';
}

function isInCurrentLobby() {
  const wallet = getPublicKeyString();
  return lobby.players.some((p) => p.wallet === wallet);
}

async function copyJoinKey() {
  if (!lobby.joinCode) return;
  try {
    await navigator.clipboard.writeText(lobby.joinCode);
    flashCopyBtn('#copy-join-key-btn', 'Copied!');
  } catch {
    window.prompt('Copy join key:', lobby.joinCode);
  }
}

async function copyJoinLink() {
  if (!lobby.joinCode) return;
  const link = buildJoinLink(lobby.joinCode);
  try {
    await navigator.clipboard.writeText(link);
    flashCopyBtn('#copy-join-link-btn', 'Copied!');
  } catch {
    window.prompt('Copy join link:', link);
  }
}

function flashCopyBtn(selector, label) {
  const btn = $(selector);
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = label;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove('copied');
  }, 2000);
}

function loadLobbyFromStore(code) {
  const stored = loadOpenLobby(code);
  if (!stored) {
    alert('Invalid join key. Check the code and try again.');
    return false;
  }

  const wallet = getPublicKeyString();
  const isMember = isPlayerInStoredGame(stored, wallet);

  if (stored.status === 'open') {
    Object.assign(lobby, hydrateLobbyFromStore(stored));
    lobby.gameState = null;
    lobby.active = true;
    syncNextPlayerIdFromLobby();
    startLobbySync();
    return true;
  }

  if (stored.status === 'started' || stored.status === 'finished') {
    if (!isMember) {
      alert('This game is already in progress and you are not a player in it.');
      return false;
    }
    if (!isAliveInStoredGame(stored, wallet)) {
      alert('You left or were eliminated from this game. You cannot rejoin.');
      return false;
    }
    enterStoredMultiGame(stored);
    return true;
  }

  alert('This lobby has closed.');
  return false;
}

async function addPlayerToLobby({ name, wallet, isRejoin = false }) {
  const stake = getFixedStake();

  if (isRejoin) {
    const departed = findDepartedPlayer(wallet) || getRejoinRecord(wallet);
    if (!departed) {
      throw new Error('Could not find your saved seat for this lobby.');
    }

    const rejoinName = name || departed.name;

    await runTx(
      departed.isHost ? 'Rejoining as host — restoring stake' : 'Rejoining lobby — restoring stake',
      () => joinGameOnChain({ gamePda: lobby.gamePda, joiner: getWallet(), betSol: stake })
    );

    lobby.players.push({
      id: departed.id,
      name: rejoinName,
      bet: stake,
      isHost: !!departed.isHost,
      wallet,
    });

    if (departed.isHost) {
      lobby.hostId = departed.id;
      lobby.hostWallet = wallet;
    }

    lobby.departedPlayers = lobby.departedPlayers.filter((p) => p.wallet !== wallet);
    persistLobby();
    return { rejoined: true, isHost: !!departed.isHost };
  }

  if (lobby.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('That name is already taken in this lobby.');
  }

  await runTx('Depositing fixed stake to smart contract', () =>
    joinGameOnChain({ gamePda: lobby.gamePda, joiner: getWallet(), betSol: stake })
  );

  lobby.players.push({
    id: createPlayerId(),
    name,
    bet: stake,
    isHost: false,
    wallet,
  });

  persistLobby();
  return { rejoined: false, isHost: false };
}

async function joinWithCodeFromSetup() {
  const code = $('#join-code')?.value.trim().toUpperCase();
  const name = $('#join-setup-name')?.value.trim() || getUsername();

  if (!code || code.length !== 6) {
    alert('Enter the 6-character join key from the host.');
    return;
  }

  if (!loadLobbyFromStore(code)) return;

  const wallet = getPublicKeyString();
  const rejoin = getRejoinRecord(wallet);

  clearJoinCodeFromUrl();

  if (isInCurrentLobby()) {
    startLobbySync();
    if (lobby.status === 'started' || lobby.status === 'finished') {
      const stored = loadOpenLobby(lobby.joinCode);
      if (stored?.gameState) void syncMultiGameFromStore(stored.gameState);
    } else {
      showScreen('lobby');
      renderLobby();
    }
    updateRejoinHint();
    return;
  }

  if (lobby.status !== 'open') {
    alert('This game has already started. You must have joined before the host started.');
    return;
  }

  if (!rejoin && lobby.players.length >= lobby.rules.maxPlayers) {
    alert('Lobby is full.');
    detachLocalLobbyView();
    return;
  }

  if (!name && !rejoin) {
    alert('Enter your name to join.');
    return;
  }

  try {
    const result = await addPlayerToLobby({
      name: name || rejoin?.name,
      wallet,
      isRejoin: !!rejoin,
    });

    saveLastLobbyForWallet(wallet, lobby.joinCode);
    startLobbySync();
    showScreen('lobby');
    renderLobby();
    updateRejoinHint();

    if (result.rejoined && result.isHost) {
      setTxStatus('Welcome back — host controls restored.');
      setTimeout(() => setTxStatus(''), 3000);
    }
  } catch (err) {
    alert(err.message || 'Could not join lobby.');
    detachLocalLobbyView();
  }
}

async function openLobby() {
  const hostName = getUsername() || $('#host-name').value.trim() || 'Host';

  resetLobby();
  lobby.active = true;
  lobby.status = 'open';
  lobby.gameId = Date.now();
  syncHostRulesFromSetup();
  const stake = getFixedStake();

  if (stake < 0.01) {
    alert('Fixed stake must be at least 0.01 SOL.');
    resetLobby();
    return;
  }

  let joinCode;
  do {
    joinCode = generateJoinCode();
  } while (loadOpenLobby(joinCode));
  lobby.joinCode = joinCode;

  const hostId = createPlayerId();
  lobby.hostId = hostId;

  try {
    const { gamePda, sig } = await runTx('Creating game on-chain', () =>
      createGameOnChain({
        gameId: lobby.gameId,
        host: getWallet(),
        rules: lobby.rules,
        hostBetSol: stake,
      })
    );

    lobby.gamePda = gamePda;
    lobby.hostWallet = getPublicKeyString();
    lobby.players = [{
      id: hostId,
      name: hostName,
      bet: stake,
      isHost: true,
      wallet: getPublicKeyString(),
    }];
    lobby.departedPlayers = [];

    persistLobby();
    saveLastLobbyForWallet(getPublicKeyString(), joinCode);
    startLobbySync();
    renderLobby();
    showScreen('lobby');
    setTxStatus(`Lobby created · ${sig.slice(0, 8)}…`);
    setTimeout(() => setTxStatus(''), 3000);
  } catch {
    resetLobby();
  }
}

async function leaveLobby() {
  if (isMultiGameInProgress()) {
    return forfeitActiveMultiGame();
  }

  const wallet = getPublicKeyString();
  const me = lobby.players.find((p) => p.wallet === wallet);

  if (!me || !lobby.gamePda) {
    detachLocalLobbyView();
    showScreen('setup');
    updateRejoinHint();
    return;
  }

  const joinCode = lobby.joinCode;

  try {
    await runTx('Leaving lobby — refunding your bet', () =>
      refundPlayerOnChain({
        gamePda: lobby.gamePda,
        playerWallet: wallet,
        betSol: me.bet,
      })
    );

    if (me.isHost) lobby.hostWallet = wallet;
    recordDepartedPlayer(me);
    lobby.players = lobby.players.filter((p) => p.wallet !== wallet);
    persistLobby();
    saveLastLobbyForWallet(wallet, joinCode);

    detachLocalLobbyView();
    showScreen('setup');
    updateRejoinHint();

    setTxStatus(
      me.isHost
        ? `Left lobby — rejoin with key ${joinCode} to get host controls back.`
        : `Left lobby — rejoin anytime with key ${joinCode}.`
    );
    setTimeout(() => setTxStatus(''), 4000);
  } catch {
    /* runTx shows error */
  }
}

async function endLobbyForAll() {
  if (isMultiGameInProgress()) {
    alert('Game is in progress. Everyone must finish — leaving counts as a forfeit loss.');
    return;
  }

  if (!isLobbyHost()) {
    alert('Only the host can end the lobby for everyone.');
    return;
  }

  if (!confirm('End this lobby for all players and refund everyone? This cannot be undone.')) {
    return;
  }

  if (lobby.gamePda && lobby.players.length) {
    try {
      await runTx('Cancelling game and refunding all bets', () =>
        cancelGameOnChain({
          gamePda: lobby.gamePda,
          host: getWallet(),
          players: lobby.players,
        })
      );
    } catch {
      return;
    }
  }

  resetLobby();
  showScreen('setup');
  updateRejoinHint();
}

async function joinLobby() {
  if (!lobby.active || !lobby.gamePda) return;

  if (lobby.status !== 'open') {
    alert('The game has already started.');
    return;
  }

  const wallet = getPublicKeyString();

  if (isInCurrentLobby()) {
    alert('You are already in this lobby.');
    return;
  }

  const rejoin = getRejoinRecord(wallet);
  if (!rejoin && lobby.players.length >= lobby.rules.maxPlayers) {
    alert('Lobby is full.');
    return;
  }

  const name = $('#join-name').value.trim() || getUsername();

  if (!name && !rejoin) {
    alert('Enter your name to join.');
    return;
  }

  if (lobby.players.some((p) => p.wallet === wallet)) {
    alert('Your wallet already joined this lobby.');
    return;
  }

  try {
    const result = await addPlayerToLobby({
      name: name || rejoin?.name,
      wallet,
      isRejoin: !!rejoin,
    });

    saveLastLobbyForWallet(wallet, lobby.joinCode);
    $('#join-name').value = '';
    renderLobby();

    if (result.rejoined && result.isHost) {
      setTxStatus('Welcome back — host controls restored.');
      setTimeout(() => setTxStatus(''), 3000);
    }
  } catch (err) {
    alert(err.message || 'Could not join lobby.');
  }
}

function getLobbyPot() {
  return lobby.players.reduce((sum, p) => sum + p.bet, 0);
}

function renderLobby() {
  lobby.rules = normalizeLobbyRules(lobby.rules);

  const stored = lobby.joinCode ? loadOpenLobby(lobby.joinCode) : null;
  if (
    stored &&
    (stored.status === 'started' || stored.status === 'finished') &&
    stored.gameState &&
    isPlayerInStoredGame(stored, getPublicKeyString())
  ) {
    lobby.status = stored.status;
    lobby.gameState = stored.gameState;
    void syncMultiGameFromStore(stored.gameState);
    return;
  }

  const hostPlayer = lobby.players.find((p) => p.id === lobby.hostId);
  const departedHost = lobby.departedPlayers?.find((p) => p.isHost);
  if (hostPlayer) {
    $('#lobby-host-label').textContent = `Host: ${hostPlayer.name}`;
  } else if (departedHost) {
    $('#lobby-host-label').textContent = `Host: ${departedHost.name} (away — can rejoin)`;
  } else {
    $('#lobby-host-label').textContent = 'Host: —';
  }

  const keyEl = $('#lobby-join-key');
  if (keyEl) keyEl.textContent = lobby.joinCode || '——';

  const keyHint = document.querySelector('.lobby-key-hint');
  if (keyHint) {
    keyHint.innerHTML = 'Share this key so others can join from <strong>Multiplayer → Join with Key</strong>';
  }

  $('#rules-list').innerHTML = renderRulesListHtml(lobby.rules);
  $('#lobby-pot').textContent = formatSol(getLobbyPot());

  const hostStakeCtrl = $('#host-stake-control');
  const stakeInput = $('#lobby-host-stake');
  const stakeHint = $('#host-stake-hint');
  const showHostStake = isLobbyHost() && lobby.status === 'open';

  hostStakeCtrl?.classList.toggle('hidden', !showHostStake);
  if (showHostStake && stakeInput) {
    stakeInput.value = getFixedStake();
    const othersJoined = lobby.players.some((p) => !p.isHost && p.wallet !== lobby.hostWallet);
    if (stakeHint) {
      stakeHint.textContent = othersJoined
        ? 'Players already in keep their stake. New amount applies to future joiners.'
        : 'Set the stake everyone must pay before you start.';
    }
  }

  const hostBulletsCtrl = $('#host-bullets-control');
  const showHostBullets = isLobbyHost() && lobby.status === 'open';
  hostBulletsCtrl?.classList.toggle('hidden', !showHostBullets);
  if (showHostBullets) {
    initBulletLoadSelectors();
    $$('.lobby-bullet-btn').forEach((btn) => {
      const n = parseInt(btn.dataset.bullets, 10);
      btn.classList.toggle('active', n === lobby.rules.bullets);
    });
  }

  const total = lobby.players.length;
  const statusEl = $('#agreement-status');

  if (canStartMultiGame() && isLobbyHost()) {
    statusEl.textContent = 'Enough players — host can start!';
    statusEl.className = 'agreement-status ready';
  } else if (!isHostPresent() && lobby.hostWallet) {
    statusEl.textContent = 'Host stepped out — waiting for host to rejoin with the join key…';
    statusEl.className = 'agreement-status waiting';
  } else if (total < lobby.rules.minPlayers) {
    statusEl.textContent = `${total}/${lobby.rules.minPlayers} players joined — waiting for more`;
    statusEl.className = 'agreement-status waiting';
  } else {
    const reason = getStartBlockReason();
    statusEl.textContent = reason || 'Waiting for host to start';
    statusEl.className = 'agreement-status waiting';
  }

  const list = $('#lobby-players-list');
  list.innerHTML = '';

  lobby.players.forEach((player) => {
    const li = document.createElement('li');
    const isHostRow = player.isHost || player.wallet === lobby.hostWallet;

    const info = document.createElement('div');
    info.className = 'lobby-player-info';
    info.innerHTML = `
      <span class="lobby-player-name">${player.name}${isHostRow ? ' ★' : ''}</span>
      <span class="lobby-player-meta">${isHostRow ? 'Host' : 'Joined'}</span>
    `;

    const bet = document.createElement('span');
    bet.className = 'lobby-player-bet';
    bet.textContent = formatSol(player.bet);

    li.appendChild(info);
    li.appendChild(bet);
    list.appendChild(li);
  });

  const joinPanel = $('#join-panel');
  const memberStatus = $('#lobby-member-status');
  const memberHint = $('#lobby-member-hint');
  const isFull = lobby.players.length >= lobby.rules.maxPlayers;
  const alreadyJoined = isInCurrentLobby();
  const departed = findDepartedPlayer(getPublicKeyString());
  const canRejoin = !alreadyJoined && !!departed;

  pruneDepartedPlayers();

  joinPanel.classList.toggle('hidden', alreadyJoined);
  joinPanel.classList.toggle('full', isFull && !alreadyJoined && !canRejoin);

  const stakeLabel = $('#join-fixed-stake-label');
  if (stakeLabel) {
    stakeLabel.textContent = `Fixed stake: ${formatSol(getFixedStake())} per player`;
  }

  memberStatus?.classList.toggle('hidden', !alreadyJoined);
  if (memberHint && alreadyJoined) {
    if (lobby.status === 'started' || lobby.status === 'finished') {
      memberHint.textContent = 'Game in progress — loading the table…';
    } else if (isLobbyHost()) {
      const block = getStartBlockReason();
      memberHint.textContent = block || 'Press Start Game when ready.';
    } else {
      memberHint.textContent = 'You\'re in — waiting for the host to start.';
    }
  }

  const joinTitle = $('#join-panel-title');
  if (joinTitle) {
    joinTitle.textContent = canRejoin ? 'Rejoin Lobby' : 'Join This Lobby';
  }

  const joinHint = $('#join-panel-hint');
  if (joinHint) {
    if (canRejoin) {
      joinHint.textContent = `Fixed stake: ${formatSol(getFixedStake())} — enter your name to rejoin.`;
    } else {
      joinHint.textContent = `Enter your name to join at ${formatSol(getFixedStake())}.`;
    }
  }

  $('#join-game-btn').disabled = isFull && !canRejoin;

  const startBtn = $('#start-multi-btn');
  const canStart = canStartMultiGame() && isLobbyHost();
  if (startBtn) {
    startBtn.disabled = !canStart;
    startBtn.classList.toggle('btn-ready', canStart);
    startBtn.title = canStart ? 'Start the game' : getStartBlockReason() || 'Not ready to start';
  }
  $('#end-lobby-btn')?.classList.toggle('hidden', !isLobbyHost());

  const leaveBtn = $('#leave-lobby-btn');
  if (leaveBtn) {
    if (lobby.status === 'started') {
      leaveBtn.classList.add('hidden');
    } else {
      leaveBtn.classList.remove('hidden');
      leaveBtn.textContent = isLobbyHost() ? 'Leave (keep lobby open)' : 'Leave Lobby';
    }
  }
}

async function startSingleGame() {
  state.mode = 'single';
  state.baseBet = parseFloat($('#base-bet').value) || 0.1;
  state.bullets = parseInt($('.bullet-btn.active').dataset.bullets, 10);
  resetGameState();

  const bet = getTotalBet();
  state.stake = bet;
  state.winnings = 0;
  state.sessionId = Date.now();

  const name = getUsername() || $('#player-name').value.trim() || 'Player';
  state.players = [{ name, bet, alive: true }];

  try {
    await runTx('Locking stake in smart contract', () =>
      createSoloSessionOnChain({ sessionId: state.sessionId, stakeSol: bet })
    );
    state.pot = bet;
    beginGame(
      `${formatSol(state.stake)} locked on-chain. Survive to earn +${formatSol(getSurviveReward(1))}.`
    );
  } catch {
    state.sessionId = null;
  }
}

async function startMultiGame() {
  const blockReason = getStartBlockReason();
  if (blockReason) {
    alert(blockReason);
    return;
  }

  if (!canStartMultiGame() || !lobby.gamePda) {
    alert('Cannot start the game yet. Check player count and that the host is in the lobby.');
    return;
  }

  const host = lobby.players.find((p) => p.isHost || p.wallet === lobby.hostWallet);
  if (getPublicKeyString() !== host?.wallet) {
    alert('Only the host wallet can start the game.');
    return;
  }

  try {
    await runTx('Starting game on-chain', () =>
      startGameOnChain({ gamePda: lobby.gamePda, host: getWallet() })
    );

    lobby.status = 'started';
    state.turnSeq = 0;
    state.lastAction = null;

    state.mode = 'multi';
    state.bullets = lobby.rules.bullets;
    resetGameState();
    state.turnSeq = 0;

    state.players = lobby.players.map((p) => ({
      name: p.name,
      bet: p.bet,
      alive: true,
      isHost: p.isHost,
      wallet: p.wallet,
    }));

    state.pot = getLobbyPot();
    lastSeenTurnSeq = 0;

    loadCylinder();
    state.lastMessage =
      `${formatSol(state.pot)} on the line. Players take turns — last one standing wins. ${getCurrentPlayer().name} goes first.`;
    state.lastMessageType = '';
    lobby.status = 'started';
    lobby.gameState = buildGameStateSnapshot();
    persistLobby();

    beginGame(state.lastMessage);
    persistMultiGameState();
  } catch {
    /* runTx shows error */
  }
}

function resetGameState() {
  state.round = 1;
  state.survives = 0;
  state.chambersChecked = 0;
  state.gameOver = false;
  state.isProcessing = false;
  state.currentPlayerIndex = 0;
  state.currentChamber = 0;
  state.cylinder = [];
  state.stake = 0;
  state.winnings = 0;
  state.pot = 0;
  state.sessionId = null;
  state.shotId = 0;
  state.lastMessage = '';
  state.lastMessageType = '';
  state.lastAction = null;
  state.winnerWallet = null;
  state.resultMessage = null;
  lastRenderedPot = null;
}

function resetGameUiForNewRound() {
  const triggerBtn = $('#pull-trigger-btn');
  const cashOutBtn = $('#cash-out-btn');
  const hammer = $('#hammer');

  if (triggerBtn) {
    triggerBtn.disabled = false;
    triggerBtn.textContent = 'Pull Trigger';
  }
  if (cashOutBtn) {
    cashOutBtn.disabled = false;
    cashOutBtn.classList.add('hidden');
    cashOutBtn.textContent = 'Cash Out';
  }
  hammer?.classList.remove('cocked', 'fired');
  resetChamberVisuals();
}

function beginGame(message) {
  if (state.mode !== 'multi' || !state.cylinder?.length) {
    loadCylinder();
  } else {
    resetChamberVisuals();
  }
  spinCylinder();
  showScreen('game');
  resetGameUiForNewRound();
  renderGameUI();
  finishTurn();
  setMessage(message);
  refreshWalletUI();
  void ensureAudioContext();
  startGameMusic();
}

function loadCylinder() {
  state.cylinder = Array(CHAMBERS).fill(false);
  const positions = shuffle([...Array(CHAMBERS).keys()]).slice(0, state.bullets);
  positions.forEach((pos) => {
    state.cylinder[pos] = true;
  });
  state.currentChamber = Math.floor(Math.random() * CHAMBERS);
  state.chambersChecked = 0;
  resetChamberVisuals();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function spinCylinder() {
  const cylinderEl = $('#cylinder');
  cylinderEl.classList.add('spinning');
  playCylinderSpin();
  state.currentChamber = Math.floor(Math.random() * CHAMBERS);
  if (state.mode === 'multi') persistMultiGameState();
  setTimeout(() => cylinderEl.classList.remove('spinning'), 1200);
}

function resetChamberVisuals() {
  $$('.chamber').forEach((ch) => {
    ch.classList.remove('fired', 'safe', 'active-chamber', 'loaded', 'spent');
  });
  highlightActiveChamber();
  syncCylinderLoadVisuals(state.cylinder, state.chambersChecked);
}

function highlightActiveChamber() {
  $$('.chamber').forEach((ch) => ch.classList.remove('active-chamber'));
  const active = $(`.chamber[data-index="${state.currentChamber}"]`);
  if (active) active.classList.add('active-chamber');
}

function getAlivePlayers() {
  return state.players.filter((p) => p.alive);
}

function getCurrentPlayer() {
  return state.players[state.currentPlayerIndex];
}

function advanceToNextPlayer() {
  let next = state.currentPlayerIndex;
  do {
    next = (next + 1) % state.players.length;
  } while (!state.players[next].alive && next !== state.currentPlayerIndex);

  state.currentPlayerIndex = next;
}

function pullTrigger() {
  if (state.isProcessing || state.gameOver) return;

  const player = getCurrentPlayer();
  if (!player || !player.alive) return;

  if (state.mode === 'multi') {
    if (!isMyTurn()) {
      setMessage(`Waiting for ${player.name} to pull the trigger.`, '');
      return;
    }
    state.isProcessing = true;
    persistMultiGameState();
  } else {
    state.isProcessing = true;
  }

  $('#pull-trigger-btn').disabled = true;
  $('#cash-out-btn').disabled = true;

  const hammer = $('#hammer');
  hammer.classList.add('cocked');
  playHammerCock();
  state.shotId += 1;
  const shotId = state.shotId;

  setTimeout(async () => {
    if (shotId !== state.shotId || state.gameOver) {
      finishTurn();
      return;
    }

    hammer.classList.remove('cocked');
    hammer.classList.add('fired');

    const isBullet = state.cylinder[state.currentChamber];
    const chamberEl = $(`.chamber[data-index="${state.currentChamber}"]`);

    const aliveBefore = getAlivePlayers().map((p) => p.name);
    const eliminatedBefore = state.players.filter((p) => !p.alive).length;

    if (state.mode === 'multi') {
      duckMusic(true);
      const { playGangCinema } = await getCinema();
      await playGangCinema({
        playerName: player.name,
        survived: !isBullet,
        aliveNames: aliveBefore,
        eliminatedCount: eliminatedBefore,
        totalPlayers: state.players.length,
      });
    } else {
      duckMusic(true);
      const { playShotCinema } = await getCinema();
      await playShotCinema({ playerName: player.name, survived: !isBullet });
    }

    duckMusic(false);

    hammer.classList.remove('fired');

    if (isBullet) {
      chamberEl.classList.add('fired');
      setMessage(`BANG! ${player.name} drops off the chair — dead in the alley.`, 'danger');
      player.alive = false;

      if (state.mode === 'multi') {
        recordMultiTurnAction({ type: 'shot', playerName: player.name, survived: false });
        lastSeenTurnSeq = state.turnSeq;
      }

      handleElimination();
    } else {
      chamberEl.classList.add('safe');
      state.survives += 1;
      state.chambersChecked += 1;

      if (state.mode === 'single') {
        const reward = getSurviveReward(state.survives);
        state.winnings += reward;
        state.pot = getCashOutTotal();
        const profit = getProfit();
        const nextReward = getSurviveReward(state.survives + 1);
        setMessage(
          `Click! +${formatSol(reward)} added. Total ${formatSol(state.pot)} (+${formatSol(profit)} profit). Next click pays +${formatSol(nextReward)}.`,
          'success'
        );
      } else {
        setMessage(`Click! ${player.name} survives — shaky hands pass the revolver.`, 'success');
        recordMultiTurnAction({ type: 'shot', playerName: player.name, survived: true });
        lastSeenTurnSeq = state.turnSeq;
      }

      continueAfterSafe();
    }
  }, 400);
}

function continueAfterSafe() {
  state.currentChamber = (state.currentChamber + 1) % CHAMBERS;

  if (state.chambersChecked >= CHAMBERS) {
    reloadCylinder();
    return;
  }

  if (state.mode === 'multi') {
    advanceToNextPlayer();
    persistMultiGameState();
  }

  resetChamberVisuals();
  renderGameUI();
  finishTurn();
}

function reloadCylinder() {
  state.round += 1;
  loadCylinder();
  spinCylinder();
  renderGameUI();
  setMessage(`Round ${state.round} — Cylinder reloaded and spun.`);

  if (state.mode === 'multi') {
    advanceToNextPlayer();
    renderGameUI();
    persistMultiGameState();
  }

  finishTurn();
}

function handleElimination() {
  renderGameUI();

  if (state.mode === 'single') {
    const finishLoss = () => endGame(null, 'You hit a bullet. Stake forfeited on-chain.');
    if (state.sessionId) {
      runTx('Forfeiting stake on-chain', () => soloForfeitOnChain({ sessionId: state.sessionId }))
        .then(finishLoss)
        .catch(finishLoss);
    } else {
      finishLoss();
    }
    return;
  }

  const alive = getAlivePlayers();

  if (alive.length === 1) {
    const winner = alive[0];
    state.winnerWallet = winner.wallet;
    state.resultMessage = `${winner.name} wins the entire pot — paid from smart contract!`;
    state.gameOver = true;
    recordMultiTurnAction({
      type: 'win',
      winnerName: winner.name,
      winnerWallet: winner.wallet,
    });
    lastSeenTurnSeq = state.turnSeq;

    const finishWin = async () => {
      const { playGangWinCinema } = await getCinema();
      await playGangWinCinema({
        winnerName: winner.name,
        potLabel: formatSol(state.pot),
      });
      endGame(winner, state.resultMessage);
    };

    if (lobby.gamePda) {
      const host = lobby.players.find((p) => p.isHost);
      if (host && getPublicKeyString() === host.wallet && winner.wallet) {
        runTx('Paying winner from escrow', () =>
          declareAndSettleWinner({
            gamePda: lobby.gamePda,
            host: getWallet(),
            winnerPubkey: winner.wallet,
          })
        )
          .then(finishWin)
          .catch(finishWin);
        return;
      }
    }
    finishWin();
    return;
  }

  if (alive.length === 0) {
    state.gameOver = true;
    state.resultMessage = 'Everyone is out. No winner this round.';
    persistMultiGameState();
    endGame(null, state.resultMessage);
    return;
  }

  state.round += 1;
  loadCylinder();
  spinCylinder();
  advanceToNextPlayer();
  renderGameUI();
  setMessage(`Round ${state.round} — ${getCurrentPlayer().name}'s turn.`);
  persistMultiGameState();
  finishTurn();
}

async function cashOut() {
  if (state.isProcessing || state.gameOver || state.mode !== 'single') return;
  if (state.survives === 0) return;

  playCashOut();

  const player = getCurrentPlayer();
  const profit = getProfit();
  const payout = getCashOutTotal();
  const message = `Cashed out after ${state.survives} survive${state.survives > 1 ? 's' : ''} — +${formatSol(profit)} profit on ${formatSol(state.stake)} risk.`;

  try {
    if (state.sessionId) {
      await runTx('Cashing out from smart contract', () =>
        soloCashoutOnChain({ sessionId: state.sessionId, payoutSol: payout })
      );
    }
    endGame(player, message);
  } catch {
    /* runTx shows error */
  }
}

function finishTurn() {
  state.isProcessing = false;

  if (state.mode === 'multi' && !state.gameOver) {
    persistMultiGameState();
  }

  const triggerBtn = $('#pull-trigger-btn');
  if (state.mode === 'multi' && !state.gameOver && triggerBtn) {
    const mine = isMyTurn();
    triggerBtn.disabled = state.isProcessing || !mine;
    triggerBtn.textContent = mine ? 'Pull Trigger' : `Waiting for ${getCurrentPlayer()?.name || '…'}`;
  } else if (triggerBtn) {
    triggerBtn.disabled = false;
  }

  if (state.mode === 'single' && state.survives > 0 && !state.gameOver) {
    $('#cash-out-btn').classList.remove('hidden');
    $('#cash-out-btn').disabled = false;
    $('#cash-out-btn').textContent = `Cash Out ${formatSol(getCashOutTotal())}`;
  } else {
    $('#cash-out-btn').classList.add('hidden');
    $('#cash-out-btn').textContent = 'Cash Out';
  }
}

function endGame(winner, message) {
  state.gameOver = true;
  state.isProcessing = false;
  stopGameMusic();

  if (winner) playWin();
  else if (state.mode === 'single') playLose();

  if (state.mode === 'multi') {
    state.winnerWallet = winner?.wallet || null;
    state.resultMessage = message;
    persistMultiGameState();
  }

  recordGameHistory(winner, message);
  $('#pull-trigger-btn').disabled = true;
  $('#cash-out-btn').classList.add('hidden');

  setTimeout(() => {
    const icon = $('#result-icon');
    const title = $('#result-title');
    const msg = $('#result-message');
    const amount = $('#result-amount');

    amount.style.display = 'block';
    amount.style.color = 'var(--gold)';

    if (winner) {
      icon.textContent = '🏆';
      title.textContent = `${winner.name} Wins!`;
      msg.textContent = message;
      amount.textContent = state.mode === 'single' ? formatSol(getCashOutTotal()) : formatSol(state.pot);
    } else if (state.mode === 'single') {
      icon.textContent = '💀';
      title.textContent = 'Game Over';
      msg.textContent = message;
      amount.textContent = `-${formatSol(getTotalBet())}`;
      amount.style.color = 'var(--danger)';
    } else {
      icon.textContent = '💀';
      title.textContent = 'No Winner';
      msg.textContent = message;
      amount.style.display = 'none';
    }

    showScreen('result');
  }, 600);
}

function renderGameUI() {
  const isSingle = state.mode === 'single';
  $('#single-stats').classList.toggle('hidden', !isSingle);
  $('#multi-stats').classList.toggle('hidden', isSingle);

  if (isSingle) {
    $('#pot-label').textContent = 'CASH OUT';
    state.pot = getCashOutTotal();
    $('#pot-amount').textContent = formatSol(state.pot);
    $('#pot-sub').textContent =
      state.survives > 0
        ? `${formatSol(state.stake)} stake + ${formatSol(state.winnings)} winnings`
        : `${formatSol(state.stake)} locked on-chain — survive to earn`;

    $('#stat-stake').textContent = formatSol(state.stake);
    $('#stat-profit').textContent = `+${formatSol(getProfit())}`;
    $('#stat-next-reward').textContent = formatSol(getSurviveReward(state.survives + 1));
    $('#stat-odds').textContent = `${getRemainingSurvivalOdds()}%`;
    $('#stat-streak').textContent = state.survives;
    $('#stat-bullets-single').textContent = `${state.bullets} / ${CHAMBERS}`;
    $('#stat-round-single').textContent = state.round;
  } else {
    $('#pot-label').textContent = 'TOTAL POT';
    $('#pot-amount').textContent = formatSol(state.pot);
    $('#pot-sub').textContent = 'Escrow on Solana · last one standing takes all · leave = forfeit';
  }

  const inMulti = state.mode === 'multi' && !state.gameOver;
  $('#forfeit-game-btn')?.classList.toggle('hidden', !inMulti);
  $('#multi-lock-hint')?.classList.toggle('hidden', !inMulti);

  $('#stat-bullets').textContent = `${state.bullets} / ${CHAMBERS}`;
  $('#stat-round').textContent = state.round;
  $('#stat-mode').textContent = isSingle ? 'Single' : 'Multi';

  const list = $('#players-list');
  list.innerHTML = '';

  state.players.forEach((player, i) => {
    const li = document.createElement('li');
    if (!player.alive) li.classList.add('eliminated');
    if (i === state.currentPlayerIndex && player.alive && !state.gameOver) {
      li.classList.add('active');
    }
    if (state.gameOver && player.alive) li.classList.add('winner');

    li.innerHTML = `
      <span>${player.name}${player.isHost ? ' ★' : ''}</span>
      <span>
        <span class="player-bet">${formatSol(player.bet)}</span>
        ${!player.alive ? '<span class="player-status out">OUT</span>' : ''}
      </span>
    `;
    list.appendChild(li);
  });

  const current = getCurrentPlayer();
  const turnEl = $('#turn-indicator');

  if (state.gameOver) {
    turnEl.textContent = 'Game Over';
    turnEl.classList.remove('highlight', 'your-turn');
  } else if (state.mode === 'single') {
    turnEl.textContent = current?.alive ? 'Your Turn' : 'Game Over';
    turnEl.classList.toggle('highlight', !!current?.alive);
    turnEl.classList.toggle('your-turn', !!current?.alive);
  } else if (current?.alive) {
    const alive = getAlivePlayers().length;
    if (isMyTurn()) {
      turnEl.textContent = `Your Turn · ${alive} left`;
    } else {
      turnEl.textContent = `${current.name}'s Turn · ${alive} left`;
    }
    const mine = isMyTurn();
    turnEl.classList.toggle('highlight', mine);
    turnEl.classList.toggle('your-turn', mine);
  }

  const potVal = isSingle ? getCashOutTotal() : state.pot;
  const potChanged = lastRenderedPot !== null && lastRenderedPot !== potVal;
  lastRenderedPot = potVal;

  refreshGameVisuals({
    bullets: state.bullets,
    cylinder: state.cylinder,
    chambersChecked: state.chambersChecked,
    highlightTurn: state.mode === 'single' ? !!current?.alive && !state.gameOver : isMyTurn() && !state.gameOver,
    gameOver: state.gameOver,
    potChanged,
  });

  if (state.mode === 'multi' && !state.gameOver) {
    const triggerBtn = $('#pull-trigger-btn');
    if (triggerBtn) {
      const mine = isMyTurn();
      triggerBtn.disabled = state.isProcessing || !mine;
      triggerBtn.textContent = mine ? 'Pull Trigger' : `Waiting for ${current?.name || '…'}`;
    }
  } else if (state.mode === 'single' && !state.gameOver) {
    const triggerBtn = $('#pull-trigger-btn');
    if (triggerBtn) {
      triggerBtn.disabled = state.isProcessing;
      triggerBtn.textContent = 'Pull Trigger';
    }
  }

  highlightActiveChamber();
}

function setMessage(text, type = '') {
  state.lastMessage = text;
  state.lastMessageType = type;
  const box = $('#message-box');
  box.textContent = text;
  box.className = 'message-box';
  if (type) box.classList.add(type);
}

function showScreen(name) {
  setupScreen.classList.remove('active');
  lobbyScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  resultScreen.classList.remove('active');
  historyScreen?.classList.remove('active');

  if (name === 'setup') setupScreen.classList.add('active');
  else if (name === 'lobby') lobbyScreen.classList.add('active');
  else if (name === 'game') gameScreen.classList.add('active');
  else if (name === 'result') resultScreen.classList.add('active');
  else if (name === 'history') historyScreen?.classList.add('active');

  if (name === 'setup') {
    stopGameMusic();
  }

  const toolbar = document.getElementById('screen-toolbar');
  const menuToggle = document.getElementById('nav-menu-toggle');
  const showToolbar = ['lobby', 'result', 'history'].includes(name);
  toolbar?.classList.toggle('hidden', !showToolbar);
  menuToggle?.classList.toggle('hidden', name !== 'game');

  document.body.classList.toggle('in-game', name === 'game');

  if (name === 'game') {
    window.scrollTo(0, 0);
  }

  const crumbs = {
    game: 'Active Mission',
    lobby: 'Operation Lobby',
    result: 'Mission Report',
    history: 'Bet History',
  };
  const crumbEl = document.getElementById('toolbar-crumb');
  if (crumbEl) crumbEl.textContent = crumbs[name] || '';
}

