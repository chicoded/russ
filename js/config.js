export const CONFIG = {
  network: 'mock',
  mockMode: true,
  /** Practice SOL every new user starts with */
  newUserAirdropSol: 100,
  programId: 'RouG1111111111111111111111111111111111111',
  txDelayMs: 0,
  /**
   * Your live site URL (Vercel). Join links always use this so friends on other phones
   * get the correct address. Example: 'https://russ-xxxx.vercel.app'
   * Leave empty to use the current browser URL.
   */
  publicSiteUrl: '',
  /**
   * Online lobby sync — free Supabase project (see supabase/lobbies.sql).
   * Paste URL + anon key here AND in Vercel env vars for cross-phone join by key.
   */
  lobbySync: {
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
};

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function solToLamports(sol) {
  return Math.round(Number(sol) * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports) {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}

export function formatSol(sol) {
  return `${Number(sol).toFixed(4)} SOL`;
}

export function truncateAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function roundSol(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

export function getPublicSiteOrigin() {
  const configured = CONFIG.publicSiteUrl?.trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function getLobbySyncConfig() {
  return CONFIG.lobbySync || { supabaseUrl: '', supabaseAnonKey: '' };
}

/** Load Supabase + site URL from Vercel env via /api/config */
export async function loadRuntimeConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.publicSiteUrl) {
      CONFIG.publicSiteUrl = String(data.publicSiteUrl).replace(/\/$/, '');
    }
    if (data.supabaseUrl && data.supabaseAnonKey) {
      CONFIG.lobbySync.supabaseUrl = data.supabaseUrl;
      CONFIG.lobbySync.supabaseAnonKey = data.supabaseAnonKey;
    }
  } catch {
    /* offline / local dev */
  }
}
