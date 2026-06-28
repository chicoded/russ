/**
 * Hitman-style UI polish — bullet load visuals, revolver chamber cues & ambient effects.
 */

let concealChamberLoadout = true;

export function setConcealChamberLoadout(conceal) {
  concealChamberLoadout = conceal;
  const cylinderEl = document.getElementById('cylinder');
  if (cylinderEl) cylinderEl.classList.toggle('concealed', conceal);
}

export function getConcealChamberLoadout() {
  return concealChamberLoadout;
}

function buildBulletRoundsMarkup(count) {
  const cartridges = Array.from({ length: count }, () => '<span class="cartridge"></span>').join('');
  const label = count === 1 ? '1 round' : `${count} rounds`;
  return `<span class="bullet-rounds">${cartridges}</span><span class="bullet-load-label">${label}</span>`;
}

function buildMiniRackMarkup(loaded, total = 6) {
  const cells = Array.from({ length: total }, (_, i) => {
    const filled = i < loaded;
    return `<span class="mini-slot${filled ? ' filled' : ''}">${filled ? '<span class="mini-cartridge"></span>' : ''}</span>`;
  }).join('');
  return `<span class="mini-cartridge-rack" aria-hidden="true">${cells}</span>`;
}

export function initBulletLoadSelectors() {
  document.querySelectorAll('.bullet-btn, .lobby-bullet-btn').forEach((btn) => {
    const n = parseInt(btn.dataset.bullets, 10);
    if (!n || n < 1) return;
    btn.innerHTML = buildBulletRoundsMarkup(n);
    btn.setAttribute('aria-label', `${n} bullet${n > 1 ? 's' : ''} in chamber`);
  });
}

export function syncCylinderLoadVisuals(cylinder = [], chambersChecked = 0) {
  document.querySelectorAll('.chamber').forEach((ch) => {
    const idx = parseInt(ch.dataset.index, 10);
    const resolved = ch.classList.contains('fired') || ch.classList.contains('safe');
    const hasBullet = Boolean(cylinder[idx]) && !resolved;
    const showBullet = hasBullet && !concealChamberLoadout;
    ch.classList.toggle('loaded', showBullet);
    ch.classList.toggle('spent', resolved);
  });

  const cylinderEl = document.getElementById('cylinder');
  if (cylinderEl) {
    cylinderEl.classList.toggle('concealed', concealChamberLoadout);
    if (chambersChecked === 0 && !concealChamberLoadout) {
      cylinderEl.classList.add('cylinder-armed');
      window.setTimeout(() => cylinderEl.classList.remove('cylinder-armed'), 900);
    }
  }
}

export function revealChamberResult(chamberEl, result) {
  if (!chamberEl) return;
  chamberEl.classList.remove('loaded', 'active-chamber');
  chamberEl.classList.add(result === 'bullet' ? 'fired' : 'safe', 'chamber-revealed');
  window.setTimeout(() => chamberEl.classList.remove('chamber-revealed'), 700);
}

export function updateStatBulletRacks(bullets, chambers = 6, chambersRemaining = null) {
  const remaining = chambersRemaining ?? chambers;

  const racks = [
    document.getElementById('stat-bullets-rack'),
    document.getElementById('stat-bullets-rack-single'),
  ].filter(Boolean);

  racks.forEach((rack) => {
    rack.innerHTML = buildMiniRackMarkup(remaining, chambers);
  });

  const textEls = [
    document.getElementById('stat-bullets'),
    document.getElementById('stat-bullets-single'),
  ].filter(Boolean);

  textEls.forEach((el) => {
    el.textContent = `${bullets} / ${chambers}`;
  });

  const roundEls = [
    document.getElementById('stat-round'),
    document.getElementById('stat-round-single'),
  ].filter(Boolean);
  roundEls.forEach((el) => {
    el.textContent = `${remaining} / ${chambers}`;
  });
}

export function refreshGameVisuals({
  bullets = 2,
  cylinder = [],
  chambersChecked = 0,
  chambersRemaining = null,
  highlightTurn = false,
  gameOver = false,
  potChanged = false,
} = {}) {
  syncCylinderLoadVisuals(cylinder, chambersChecked);
  updateStatBulletRacks(bullets, 6, chambersRemaining);

  const turnEl = document.getElementById('turn-indicator');
  const reticle = document.getElementById('target-reticle');
  if (turnEl) {
    turnEl.classList.toggle('highlight', highlightTurn && !gameOver);
    turnEl.classList.toggle('your-turn', highlightTurn && !gameOver);
  }
  if (reticle) {
    reticle.classList.toggle('active', highlightTurn && !gameOver);
  }

  if (potChanged) {
    const pot = document.getElementById('pot-amount');
    if (pot) {
      pot.classList.remove('pot-tick');
      void pot.offsetWidth;
      pot.classList.add('pot-tick');
    }
  }
}

function playScreenEnter(el) {
  if (!el?.classList.contains('active')) return;
  el.classList.remove('screen-enter');
  requestAnimationFrame(() => {
    el.classList.add('screen-enter');
  });
}

function initScreenTransitions() {
  document.querySelectorAll('.screen').forEach((screen) => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName !== 'class') continue;
        const hadActive = m.oldValue?.includes('active');
        const hasActive = m.target.classList.contains('active');
        if (hasActive && !hadActive) {
          playScreenEnter(m.target);
        }
      }
    });
    observer.observe(screen, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    });
  });
}

function initPullTriggerFx() {
  const btn = document.getElementById('pull-trigger-btn');
  const revolver = document.getElementById('revolver');
  if (!btn || !revolver) return;

  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) revolver.classList.add('revolver-ready');
  });
  btn.addEventListener('mouseleave', () => {
    revolver.classList.remove('revolver-ready');
  });
}

export function initUiPolish() {
  setConcealChamberLoadout(true);
  initBulletLoadSelectors();
  initScreenTransitions();
  initPullTriggerFx();
}
