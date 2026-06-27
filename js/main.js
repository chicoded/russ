import {
  login,
  logout,
  restoreSession,
  refreshWalletUI,
  getPublicKeyString,
  airdropPracticeSol,
} from './wallet.js';
import { CONFIG } from './config.js';
import { initAudio, ensureAudioContext } from './audio.js';

let gameModule = null;
let gameInitPromise = null;

async function loadGame() {
  if (!gameModule) {
    gameModule = await import('./game.js');
  }
  return gameModule;
}

async function ensureGameInit() {
  if (gameInitPromise) return gameInitPromise;
  gameInitPromise = loadGame().then((mod) => {
    mod.initGame();
    return mod;
  });
  return gameInitPromise;
}

const loginScreen = document.getElementById('login-screen');
const setupScreen = document.getElementById('setup-screen');
const topNav = document.getElementById('top-nav');

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function clearLoginError() {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function setLoginLoading(loading, label) {
  const btn = document.getElementById('login-btn');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? label || 'Creating wallet…' : 'Login & Create Wallet';
  }
}

function showLogin() {
  loginScreen?.classList.add('active');
  setupScreen?.classList.remove('active');
  topNav?.classList.add('hidden');
}

function showApp() {
  loginScreen?.classList.remove('active');
  setupScreen?.classList.add('active');
  refreshWalletUI();
}

function closeNavDropdown() {
  const dropdown = document.getElementById('nav-dropdown');
  const btn = document.getElementById('nav-user-btn');
  dropdown?.classList.add('hidden');
  btn?.classList.remove('open');
  btn?.setAttribute('aria-expanded', 'false');
}

function toggleNavDropdown() {
  const dropdown = document.getElementById('nav-dropdown');
  const btn = document.getElementById('nav-user-btn');
  if (!dropdown || !btn) return;

  const isOpen = !dropdown.classList.contains('hidden');
  if (isOpen) {
    closeNavDropdown();
  } else {
    dropdown.classList.remove('hidden');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

async function handleCopyWallet() {
  const btn = document.getElementById('copy-wallet-btn');
  const address = getPublicKeyString();
  if (!address) return;

  try {
    await navigator.clipboard.writeText(address);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('copied');
      }, 2000);
    }
  } catch {
    window.prompt('Copy your wallet address:', address);
  }
}

async function handleLogin() {
  clearLoginError();
  const input = document.getElementById('login-username');
  const name = input?.value?.trim();

  if (!name) {
    showLoginError('Enter a username to create your wallet.');
    return;
  }

  setLoginLoading(true, 'Signing in…');

  try {
    await ensureAudioContext();
    const { isNew, publicKey } = login(name);
    await ensureGameInit();
    showApp();

    if (isNew) {
      const { amountSol, balance, sig } = await airdropPracticeSol();
      const tx = document.getElementById('tx-status');
      if (tx) {
        tx.textContent = `Welcome! ${amountSol} mock SOL added · tx ${sig.slice(0, 12)}…`;
        tx.classList.remove('hidden');
      }
      alert(
        `Welcome, ${name}!\n\n` +
          `Wallet: ${publicKey}\n` +
          `Practice balance: ${balance.toFixed(2)} SOL\n\n` +
          'All transactions are simulated for practice — no real money.'
      );
    } else {
      await refreshWalletUI();
    }
  } catch (err) {
    console.error(err);
    showLoginError(err.message || 'Could not create wallet. Try again.');
  } finally {
    setLoginLoading(false);
  }
}

async function handleLogout() {
  const mod = await loadGame();
  if (mod.isMultiGameLockedIn()) {
    if (!confirm('Log out now? You forfeit the game and lose your stake.')) return;
    await mod.abandonMultiGameIfActive();
  }
  logout();
  closeNavDropdown();
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  loginScreen?.classList.add('active');
  topNav?.classList.add('hidden');
  clearLoginError();
}

async function boot() {
  initAudio();
  document.getElementById('login-btn')?.addEventListener('click', handleLogin);
  document.getElementById('login-username')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('nav-user-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNavDropdown();
  });
  document.getElementById('nav-dropdown')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  document.getElementById('copy-wallet-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCopyWallet();
  });
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

  document.addEventListener('click', () => closeNavDropdown());

  if (restoreSession()) {
    try {
      showApp();
      await ensureGameInit();
      await refreshWalletUI();
    } catch (err) {
      console.error(err);
      showLogin();
      showLoginError('Session restore failed. Log in again.');
    }
  } else {
    showLogin();
  }
}

boot().catch((err) => {
  console.error(err);
  showLoginError(`App failed to load: ${err.message}`);
});
