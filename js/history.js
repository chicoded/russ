import { formatSol, roundSol } from './config.js';
import { getPublicKeyString } from './wallet.js';

const HISTORY_PREFIX = 'rr_history_';
const MAX_ENTRIES = 150;

function historyKey(wallet) {
  return `${HISTORY_PREFIX}${wallet}`;
}

export function getBetHistory(wallet = getPublicKeyString()) {
  if (!wallet) return [];
  try {
    const raw = localStorage.getItem(historyKey(wallet));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addBetRecord(record, wallet = getPublicKeyString()) {
  if (!wallet || !record) return null;

  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: record.timestamp || new Date().toISOString(),
    mode: record.mode || 'single',
    outcome: record.outcome || 'loss',
    betSol: roundSol(record.betSol ?? 0),
    payoutSol: roundSol(record.payoutSol ?? 0),
    profitSol: roundSol(record.profitSol ?? 0),
    bullets: record.bullets ?? 0,
    survives: record.survives ?? 0,
    round: record.round ?? 1,
    playerCount: record.playerCount ?? 1,
    gameId: record.gameId ?? null,
    summary: record.summary || '',
  };

  const history = getBetHistory(wallet);
  history.unshift(entry);

  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  localStorage.setItem(historyKey(wallet), JSON.stringify(history));
  return entry;
}

export function clearBetHistory(wallet = getPublicKeyString()) {
  if (!wallet) return;
  localStorage.removeItem(historyKey(wallet));
}

export function getHistoryStats(wallet = getPublicKeyString()) {
  const history = getBetHistory(wallet);

  return history.reduce(
    (acc, row) => {
      acc.games += 1;
      acc.wagered += row.betSol;
      acc.profit += row.profitSol;
      if (row.profitSol > 0) acc.wins += 1;
      else if (row.profitSol < 0) acc.losses += 1;
      return acc;
    },
    { games: 0, wagered: 0, profit: 0, wins: 0, losses: 0 }
  );
}

const OUTCOME_LABELS = {
  cashout: 'Cashed out',
  loss: 'Lost',
  win: 'Won pot',
  eliminated: 'Eliminated',
  forfeit: 'Forfeited',
  no_winner: 'No winner',
};

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function outcomeClass(outcome) {
  if (outcome === 'cashout' || outcome === 'win') return 'win';
  if (outcome === 'loss' || outcome === 'eliminated' || outcome === 'forfeit') return 'loss';
  return 'neutral';
}

export function renderBetHistory() {
  const wallet = getPublicKeyString();
  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const summaryEl = document.getElementById('history-summary');
  const tableWrap = document.querySelector('.history-table-wrap');

  if (!listEl || !emptyEl) return;

  const history = getBetHistory(wallet);
  const stats = getHistoryStats(wallet);

  if (summaryEl) {
    const netClass = stats.profit >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <div class="history-stat">
        <span class="history-stat-label">Games</span>
        <strong>${stats.games}</strong>
      </div>
      <div class="history-stat">
        <span class="history-stat-label">Wagered</span>
        <strong>${formatSol(stats.wagered)}</strong>
      </div>
      <div class="history-stat">
        <span class="history-stat-label">Net P/L</span>
        <strong class="${netClass}">${stats.profit >= 0 ? '+' : ''}${formatSol(stats.profit)}</strong>
      </div>
      <div class="history-stat">
        <span class="history-stat-label">W / L</span>
        <strong>${stats.wins} / ${stats.losses}</strong>
      </div>
    `;
  }

  if (history.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    tableWrap?.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  tableWrap?.classList.remove('hidden');

  listEl.innerHTML = history
    .map((row) => {
      const modeLabel = row.mode === 'multi' ? 'Multi' : 'Solo';
      const outcomeLabel = OUTCOME_LABELS[row.outcome] || row.outcome;
      const profit = row.profitSol;
      const profitText = `${profit >= 0 ? '+' : ''}${formatSol(profit)}`;
      const profitClass = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'neutral';
      const detail =
        row.mode === 'single' && row.survives > 0
          ? `${row.survives} survive${row.survives > 1 ? 's' : ''}`
          : row.mode === 'multi'
            ? `${row.playerCount} players`
            : `${row.bullets} bullets`;

      return `
        <tr>
          <td class="history-date">${formatWhen(row.timestamp)}</td>
          <td><span class="history-mode">${modeLabel}</span></td>
          <td><span class="history-outcome ${outcomeClass(row.outcome)}">${outcomeLabel}</span></td>
          <td>${formatSol(row.betSol)}</td>
          <td>${row.payoutSol > 0 ? formatSol(row.payoutSol) : '—'}</td>
          <td class="history-profit ${profitClass}">${profitText}</td>
          <td class="history-detail">${detail}</td>
        </tr>
      `;
    })
    .join('');
}
