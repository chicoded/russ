import { CONFIG, roundSol } from './config.js';
import {
  creditAddress,
  debitAddress,
  delay,
  getPublicKeyString,
  getWallet,
  mockSignature,
} from './wallet.js';

const escrows = new Map();
const soloSessions = new Map();

function escrowKey(gamePda) {
  return `rr_escrow_${gamePda}`;
}

function loadEscrow(gamePda) {
  if (escrows.has(gamePda)) return escrows.get(gamePda);
  const raw = localStorage.getItem(escrowKey(gamePda));
  const data = raw ? JSON.parse(raw) : { pot: 0, bets: {} };
  escrows.set(gamePda, data);
  return data;
}

function saveEscrow(gamePda, data) {
  escrows.set(gamePda, data);
  localStorage.setItem(escrowKey(gamePda), JSON.stringify(data));
}

function clearEscrow(gamePda) {
  escrows.delete(gamePda);
  localStorage.removeItem(escrowKey(gamePda));
}

function walletOf(entity) {
  if (!entity) return getPublicKeyString();
  if (typeof entity === 'string') return entity;
  if (entity.publicKey?.toBase58) return entity.publicKey.toBase58();
  return getPublicKeyString();
}

async function mockTx(type, details, fn) {
  if (CONFIG.txDelayMs > 0) await delay(CONFIG.txDelayMs);
  const result = fn();
  const sig = mockSignature(type);
  return {
    sig,
    type,
    mock: true,
    slot: Math.floor(Date.now() / 1000),
    fee: 0.000005,
    network: CONFIG.network,
    ...details,
    ...result,
  };
}

export async function initContract() {
  return { mock: true, programId: CONFIG.programId };
}

export function isContractReady() {
  return true;
}

export async function createGameOnChain({ gameId, host, rules, hostBetSol }) {
  const hostWallet = walletOf(host);
  const gamePda = `game_${gameId}_${hostWallet.slice(0, 8)}`;
  const vaultPda = `vault_${gamePda}`;

  return mockTx(
    'create_game',
    { gamePda, vaultPda, host: hostWallet, amount: hostBetSol, rules },
    () => {
      debitAddress(hostWallet, hostBetSol);
      saveEscrow(gamePda, { pot: hostBetSol, bets: { [hostWallet]: hostBetSol } });
      return { gamePda, vaultPda };
    }
  );
}

export async function joinGameOnChain({ gamePda, joiner, betSol }) {
  const joinerWallet = walletOf(joiner);

  return mockTx(
    'join_game',
    { gamePda, player: joinerWallet, amount: betSol },
    () => {
      debitAddress(joinerWallet, betSol);
      const escrow = loadEscrow(gamePda);
      escrow.pot = roundSol(escrow.pot + betSol);
      escrow.bets[joinerWallet] = betSol;
      saveEscrow(gamePda, escrow);
      return {};
    }
  );
}

export async function agreeOnChain({ gamePda, player }) {
  const playerWallet = walletOf(player);
  return mockTx('agree', { gamePda, player: playerWallet }, () => ({}));
}

export async function startGameOnChain({ gamePda, host }) {
  const hostWallet = walletOf(host);
  return mockTx('start_game', { gamePda, host: hostWallet }, () => ({}));
}

export async function declareAndSettleWinner({ gamePda, host, winnerPubkey }) {
  const hostWallet = walletOf(host);

  return mockTx(
    'settle_winner',
    { gamePda, host: hostWallet, winner: winnerPubkey },
    () => {
      const escrow = loadEscrow(gamePda);
      const payout = escrow.pot;
      creditAddress(winnerPubkey, payout);
      clearEscrow(gamePda);
      return { payout };
    }
  );
}

export async function cancelGameOnChain({ gamePda, host, players }) {
  const hostWallet = walletOf(host);

  return mockTx(
    'cancel_game',
    { gamePda, host: hostWallet, refunds: players.length },
    () => {
      const escrow = loadEscrow(gamePda);
      players.forEach((p) => {
        const refund = escrow.bets[p.wallet] ?? p.bet ?? 0;
        if (refund > 0) creditAddress(p.wallet, refund);
      });
      clearEscrow(gamePda);
      return {};
    }
  );
}

export async function adjustPlayerStakeOnChain({ gamePda, playerWallet, oldBetSol, newBetSol }) {
  const delta = roundSol(newBetSol - oldBetSol);
  if (Math.abs(delta) < 0.0001) return mockTx('adjust_stake', { gamePda, player: playerWallet }, () => ({}));

  return mockTx(
    'adjust_stake',
    { gamePda, player: playerWallet, from: oldBetSol, to: newBetSol },
    () => {
      const escrow = loadEscrow(gamePda);
      if (delta > 0) {
        debitAddress(playerWallet, delta);
        escrow.pot = roundSol(escrow.pot + delta);
      } else {
        const refund = roundSol(-delta);
        escrow.pot = roundSol(Math.max(0, escrow.pot - refund));
        creditAddress(playerWallet, refund);
      }
      escrow.bets[playerWallet] = newBetSol;
      saveEscrow(gamePda, escrow);
      return {};
    }
  );
}

export async function refundPlayerOnChain({ gamePda, playerWallet, betSol }) {
  return mockTx(
    'refund_player',
    { gamePda, player: playerWallet, amount: betSol },
    () => {
      const escrow = loadEscrow(gamePda);
      escrow.pot = roundSol(Math.max(0, escrow.pot - betSol));
      delete escrow.bets[playerWallet];
      saveEscrow(gamePda, escrow);
      creditAddress(playerWallet, betSol);
      return { refund: betSol };
    }
  );
}

export async function createSoloSessionOnChain({ sessionId, stakeSol }) {
  const playerWallet = getPublicKeyString();
  const sessionPda = `solo_${sessionId}_${playerWallet.slice(0, 8)}`;

  return mockTx(
    'create_solo_session',
    { sessionPda, player: playerWallet, stake: stakeSol },
    () => {
      debitAddress(playerWallet, stakeSol);
      soloSessions.set(sessionPda, { stake: stakeSol, player: playerWallet, settled: false });
      return { sessionPda };
    }
  );
}

export async function soloCashoutOnChain({ sessionId, payoutSol }) {
  const playerWallet = getPublicKeyString();
  const sessionPda = `solo_${sessionId}_${playerWallet.slice(0, 8)}`;

  return mockTx(
    'solo_cashout',
    { sessionPda, player: playerWallet, payout: payoutSol },
    () => {
      const session = soloSessions.get(sessionPda);
      if (session) session.settled = true;
      creditAddress(playerWallet, payoutSol);
      soloSessions.delete(sessionPda);
      return { payout: payoutSol };
    }
  );
}

export async function soloForfeitOnChain({ sessionId }) {
  const playerWallet = getPublicKeyString();
  const sessionPda = `solo_${sessionId}_${playerWallet.slice(0, 8)}`;

  return mockTx(
    'solo_forfeit',
    { sessionPda, player: playerWallet },
    () => {
      soloSessions.delete(sessionPda);
      return { forfeited: true };
    }
  );
}
