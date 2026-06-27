export const CONFIG = {
  network: 'mock',
  mockMode: true,
  /** Practice SOL every new user starts with */
  newUserAirdropSol: 100,
  programId: 'RouG1111111111111111111111111111111111111',
  txDelayMs: 0,
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
