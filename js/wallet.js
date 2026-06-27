import { CONFIG, lamportsToSol, roundSol } from './config.js';

const STORAGE_USER = 'rr_current_user';
const STORAGE_PREFIX = 'rr_wallet_';
const BALANCE_PREFIX = 'rr_balance_';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

let walletAddress = null;
let username = null;

function walletStorageKey(name) {
  return `${STORAGE_PREFIX}${name.toLowerCase()}`;
}

function balanceKey(address) {
  return `${BALANCE_PREFIX}${address}`;
}

function generateAddress() {
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  for (let i = 0; i < 44; i += 1) {
    out += BASE58[bytes[i % 32] % BASE58.length];
  }
  return out;
}

export function getWallet() {
  if (!walletAddress) return null;
  return {
    publicKey: {
      toBase58: () => walletAddress,
    },
  };
}

export function getUsername() {
  return username;
}

export function getPublicKeyString() {
  return walletAddress ?? '';
}

export function isLoggedIn() {
  return !!walletAddress && !!username;
}

export function getBalanceForAddress(address) {
  if (!address) return 0;
  const raw = localStorage.getItem(balanceKey(address));
  return raw ? roundSol(parseFloat(raw)) : 0;
}

export function setBalanceForAddress(address, sol) {
  localStorage.setItem(balanceKey(address), String(roundSol(sol)));
}

export function creditAddress(address, amount) {
  const next = roundSol(getBalanceForAddress(address) + amount);
  setBalanceForAddress(address, next);
  return next;
}

export function debitAddress(address, amount) {
  const current = getBalanceForAddress(address);
  if (current < amount - 0.0000001) {
    throw new Error(`Insufficient SOL (have ${formatBalance(current)}, need ${formatBalance(amount)})`);
  }
  const next = roundSol(current - amount);
  setBalanceForAddress(address, next);
  return next;
}

function formatBalance(sol) {
  return `${roundSol(sol).toFixed(4)} SOL`;
}

export async function getBalance() {
  if (!walletAddress) return 0;
  return getBalanceForAddress(walletAddress);
}

export function login(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a username');
  if (trimmed.length < 2) throw new Error('Username must be at least 2 characters');

  let address = localStorage.getItem(walletStorageKey(trimmed));
  const isNew = !address;

  if (!address) {
    address = generateAddress();
    localStorage.setItem(walletStorageKey(trimmed), address);
  }

  walletAddress = address;
  username = trimmed;
  localStorage.setItem(STORAGE_USER, trimmed);

  return { username: trimmed, publicKey: address, isNew };
}

export function restoreSession() {
  const savedUser = localStorage.getItem(STORAGE_USER);
  if (!savedUser) return false;

  const address = localStorage.getItem(walletStorageKey(savedUser));
  if (!address) return false;

  walletAddress = address;
  username = savedUser;
  return true;
}

export function logout() {
  walletAddress = null;
  username = null;
  localStorage.removeItem(STORAGE_USER);
}

export async function refreshWalletUI() {
  const nav = document.getElementById('top-nav');
  if (!nav || !isLoggedIn()) return;

  const balance = await getBalance();
  const userEl = document.getElementById('nav-username');
  const balEl = document.getElementById('nav-balance');
  const addrEl = document.getElementById('nav-wallet-address');

  if (userEl) userEl.textContent = username;
  if (balEl) balEl.textContent = `${lamportsToSol(balance * 1_000_000_000)} SOL`;
  if (addrEl) addrEl.textContent = walletAddress;

  nav.classList.remove('hidden');
}

/** New users receive mock practice SOL instantly. */
export async function airdropPracticeSol(amountSol = CONFIG.newUserAirdropSol) {
  if (!walletAddress) throw new Error('No wallet');

  setBalanceForAddress(walletAddress, amountSol);
  await refreshWalletUI();

  return {
    sig: mockSignature('airdrop'),
    amountSol,
    balance: getBalanceForAddress(walletAddress),
  };
}

export function mockSignature(kind = 'tx') {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => BASE58[b % BASE58.length])
    .join('');
  return `${rand.slice(0, 44)}${kind === 'airdrop' ? 'A' : 'T'}`;
}

export function delay(ms = CONFIG.txDelayMs) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
