/**
 * Shot cinemas — spy interrogation (solo) + slum addict roulette (multi).
 */

import {
  playCinemaTension,
  playCinemaAim,
  playShotResult,
  playWin,
} from './audio.js';

function ensureCinemaStyles() {
  if (document.getElementById('cinema-css')) return;
  const link = document.createElement('link');
  link.id = 'cinema-css';
  link.rel = 'stylesheet';
  link.href = 'cinema.css';
  document.head.appendChild(link);
}

ensureCinemaStyles();

const SLUM_OPENERS = [
  'The alley reeks of piss and burnt foil. Nobody out here gets saved.',
  'Cardboard walls. Rusted needle. One click left to feel something.',
  'Homeless, hooked, desperate — the slums keep score in bodies.',
  'Another night in the cut. The revolver passes hand to shaking hand.',
];

const SLUM_AIM = [
  '{name} presses cold steel to their own temple.',
  'Twitching fingers. {name} stares down the barrel.',
  '{name} mutters a prayer nobody in this alley believes.',
  'The chair creaks. {name} pulls the hammer back.',
];

const SLUM_SURVIVE = [
  'Click. Empty. {name} slumps — laughing or crying, hard to tell.',
  'The chamber clicks dry. {name} lives another miserable round.',
  'No bullet. Shaking hands drop the piece. {name} survives.',
  'Click. {name} exhales rank breath — still in the game.',
];

const SLUM_DEATH = [
  'BANG. {name} drops off the chair. The alley swallows another soul.',
  '{name} is gone. {remaining} left in this dead-end game.',
  'Blood on the bricks. {name} won\'t need another fix.',
  '{name} folds. {remaining} addicts still breathing… for now.',
];

const SLUM_FINAL = [
  'Only {remaining} left. The slums don\'t forgive.',
  '{remaining} souls left. One chair. One pot.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function resetFrame(frame) {
  if (!frame) return;
  frame.style.animation = 'none';
  void frame.offsetWidth;
  frame.style.animation = '';
  frame.style.filter = '';
}

function schedule(timers, fn, ms) {
  timers.push(setTimeout(fn, ms));
}

function clearCinema(cinema, timers, extra = () => {}) {
  cinema.classList.remove(
    'cinema-active',
    'phase-tension',
    'phase-aim',
    'phase-shot',
    'phase-survive',
    'phase-death',
    'slum-phase-high',
    'slum-phase-aim',
    'slum-phase-shot',
    'slum-phase-survive',
    'slum-phase-death',
    'slum-phase-win'
  );
  cinema.classList.add('hidden');
  timers.forEach(clearTimeout);
  extra();
}

/** Solo — spy interrogation */
export function playShotCinema({ playerName, survived }) {
  return new Promise((resolve) => {
    const cinema = document.getElementById('shot-cinema');
    const caption = document.getElementById('cinema-caption');
    const subtitle = document.getElementById('cinema-subtitle');
    const resultSurvive = document.getElementById('cinema-result-survive');
    const resultDeath = document.getElementById('cinema-result-death');

    if (!cinema) {
      resolve();
      return;
    }

    const name = (playerName || 'Subject').toUpperCase();
    caption.textContent = `${name} — ROOM 7`;
    subtitle.textContent = survived
      ? 'Tell us what you know… one wrong answer and it ends here.'
      : 'No more games. This is the last chamber.';

    resultSurvive?.classList.add('hidden');
    resultDeath?.classList.add('hidden');

    cinema.classList.remove(
      'hidden',
      'phase-tension',
      'phase-aim',
      'phase-shot',
      'phase-survive',
      'phase-death'
    );

    resetFrame(cinema.querySelector('.cinema-frame'));
    cinema.classList.add('cinema-active', 'phase-tension');
    playCinemaTension();

    const timers = [];

    schedule(timers, () => {
      subtitle.textContent = 'Where are the documents?';
    }, 2200);

    schedule(timers, () => {
      cinema.classList.remove('phase-tension');
      cinema.classList.add('phase-aim');
      subtitle.textContent = '…';
      playCinemaAim();
    }, 3800);

    schedule(timers, () => {
      cinema.classList.remove('phase-aim');
      cinema.classList.add('phase-shot');
      subtitle.textContent = '';
      playShotResult(survived);
    }, 5200);

    schedule(timers, () => {
      cinema.classList.remove('phase-shot');
      cinema.classList.add(survived ? 'phase-survive' : 'phase-death');

      if (survived) {
        subtitle.textContent = 'Click. Empty chamber.';
        resultSurvive?.classList.remove('hidden');
      } else {
        resultDeath?.classList.remove('hidden');
      }
    }, 5450);

    schedule(timers, () => {
      clearCinema(cinema, timers, () => {
        subtitle.textContent = '';
        resultSurvive?.classList.add('hidden');
        resultDeath?.classList.add('hidden');
        resolve();
      });
    }, survived ? 9200 : 9800);
  });
}

/** Multi — slum addict in chair, self-inflicted roulette */
export function playGangCinema({
  playerName,
  survived,
  aliveNames = [],
  eliminatedCount = 0,
  totalPlayers = 2,
}) {
  return new Promise((resolve) => {
    const cinema = document.getElementById('gang-cinema');
    const caption = document.getElementById('gang-caption');
    const subtitle = document.getElementById('gang-subtitle');
    const playerLabel = document.getElementById('gang-center-name');
    const remaining = document.getElementById('gang-remaining');
    const resultSurvive = document.getElementById('gang-result-survive');
    const resultDeath = document.getElementById('gang-result-death');

    if (!cinema) {
      resolve();
      return;
    }

    const name = playerName || 'Unknown';
    const aliveNow = aliveNames.length;
    const leftAfter = survived ? aliveNow : Math.max(0, aliveNow - 1);

    if (playerLabel) playerLabel.textContent = name.toUpperCase();
    if (caption) caption.textContent = 'SLUM ROULETTE';
    if (remaining) {
      remaining.textContent =
        eliminatedCount > 0
          ? `${eliminatedCount} dead in the alley · ${leftAfter} still playing`
          : `${totalPlayers} in the game`;
    }

    const opener =
      eliminatedCount === 0
        ? pick(SLUM_OPENERS)
        : leftAfter <= 2
          ? fill(pick(SLUM_FINAL), { remaining: leftAfter })
          : pick(SLUM_OPENERS);

    subtitle.textContent = opener;

    resultSurvive?.classList.add('hidden');
    resultDeath?.classList.add('hidden');
    if (resultDeath) resultDeath.textContent = '';

    cinema.classList.remove(
      'hidden',
      'slum-phase-high',
      'slum-phase-aim',
      'slum-phase-shot',
      'slum-phase-survive',
      'slum-phase-death',
      'slum-phase-win'
    );

    resetFrame(cinema.querySelector('.slum-frame'));
    cinema.classList.add('cinema-active', 'slum-phase-high');
    playCinemaTension();

    const timers = [];

    schedule(timers, () => {
      subtitle.textContent = fill(pick(SLUM_AIM), { name });
      cinema.classList.remove('slum-phase-high');
      cinema.classList.add('slum-phase-aim');
      playCinemaAim();
    }, 2200);

    schedule(timers, () => {
      subtitle.textContent = '';
      cinema.classList.remove('slum-phase-aim');
      cinema.classList.add('slum-phase-shot');
      playShotResult(survived);
    }, 4200);

    schedule(timers, () => {
      cinema.classList.remove('slum-phase-shot');

      if (survived) {
        cinema.classList.add('slum-phase-survive');
        subtitle.textContent = fill(pick(SLUM_SURVIVE), { name });
        resultSurvive?.classList.remove('hidden');
        if (remaining) remaining.textContent = `${leftAfter} still in the chair`;
      } else {
        cinema.classList.add('slum-phase-death');
        const deathLine = fill(pick(SLUM_DEATH), { name, remaining: leftAfter });
        subtitle.textContent = deathLine;
        if (resultDeath) {
          resultDeath.textContent = leftAfter <= 1 ? 'One left standing' : `${leftAfter} remain`;
          resultDeath.classList.remove('hidden');
        }
        if (remaining) {
          remaining.textContent = leftAfter <= 1 ? 'Last soul in the alley…' : `${leftAfter} players left`;
        }
      }
    }, 4500);

    schedule(timers, () => {
      clearCinema(cinema, timers, () => {
        subtitle.textContent = '';
        resultSurvive?.classList.add('hidden');
        resultDeath?.classList.add('hidden');
        resolve();
      });
    }, survived ? 9000 : 9600);
  });
}

/** Multi win — last addict standing */
export function playGangWinCinema({ winnerName, potLabel }) {
  return new Promise((resolve) => {
    const cinema = document.getElementById('gang-cinema');
    const subtitle = document.getElementById('gang-subtitle');
    const caption = document.getElementById('gang-caption');
    const playerLabel = document.getElementById('gang-center-name');
    const resultSurvive = document.getElementById('gang-result-survive');
    const remaining = document.getElementById('gang-remaining');

    if (!cinema) {
      resolve();
      return;
    }

    const name = winnerName || 'Winner';

    if (playerLabel) playerLabel.textContent = name.toUpperCase();
    if (caption) caption.textContent = 'LAST ONE STANDING';
    if (remaining) remaining.textContent = '';
    subtitle.textContent = 'The alley goes quiet. Bodies in the shadows. One chair still occupied.';

    resultSurvive?.classList.add('hidden');
    document.getElementById('gang-result-death')?.classList.add('hidden');

    cinema.classList.remove('hidden', 'slum-phase-death', 'slum-phase-survive');
    resetFrame(cinema.querySelector('.slum-frame'));
    cinema.classList.add('cinema-active', 'slum-phase-win');
    playWin();

    const timers = [];

    schedule(timers, () => {
      subtitle.textContent = `${name} takes ${potLabel || 'the pot'} — the slums paid out to the last junkie breathing.`;
      if (resultSurvive) {
        resultSurvive.textContent = 'Walked away from the alley';
        resultSurvive.classList.remove('hidden');
      }
    }, 1800);

    schedule(timers, () => {
      clearCinema(cinema, timers, () => {
        subtitle.textContent = '';
        resultSurvive?.classList.add('hidden');
        if (resultSurvive) resultSurvive.textContent = 'Still breathing';
        resolve();
      });
    }, 6500);
  });
}
