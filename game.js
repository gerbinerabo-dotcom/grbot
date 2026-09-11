const board = document.querySelector('#game-board');
const balanceElement = document.querySelector('#coin-balance');
const levelElement = document.querySelector('#player-level');
const incomeElement = document.querySelector('#income-rate');
const buyButton = document.querySelector('#buy-button');
const buyCostElement = document.querySelector('#buy-cost');
const emptyState = document.querySelector('#empty-state');
const toast = document.querySelector('#toast');
const statusText = document.querySelector('#status-text');
const tabs = document.querySelectorAll('.game-tab');
const screens = document.querySelectorAll('.game-screen');
const claimBonusButton = document.querySelector('#claim-bonus-button');
const bonusStatus = document.querySelector('#bonus-status');
const bonusTimer = document.querySelector('#bonus-timer');
const bonusReward = document.querySelector('#bonus-reward');
const wheelDisc = document.querySelector('#wheel-disc');
const wheelResult = document.querySelector('#wheel-result');
const spinButton = document.querySelector('#spin-button');
const spinStatus = document.querySelector('#spin-status');
const resetButton = document.querySelector('#reset-button');

const SLOT_COUNT = 16;
const BASE_BUY_COST = 40;
const STORAGE_KEY = 'merge-plane-state-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const BONUS_REWARDS = [100, 250, 500];
const WHEEL_PRIZES = [
  { type: 'coins', value: 150, label: '150 монет' },
  { type: 'plane', value: 1, label: 'самолет 1 уровня' },
  { type: 'boost', value: 10 * 60 * 1000, label: 'x2 доход на 10 минут' },
  { type: 'coins', value: 300, label: '300 монет' },
  { type: 'plane', value: 2, label: 'самолет 2 уровня' },
  { type: 'boost', value: 10 * 60 * 1000, label: 'x2 доход на 10 минут' },
];
const PLANE_INCOME = [0, 1, 3, 8, 20, 48, 110];
const PLANE_COLORS = ['#56c7ef', '#46b6e3', '#ffcb4d', '#ff9c55', '#fb6c7a', '#bd82ed', '#5f87ff'];

let coins = 120;
let buyCost = BASE_BUY_COST;
let planes = [1, 1];
let playerLevel = 1;
let dailyBonusLastClaim = 0;
let dailyBonusStreak = 0;
let wheelLastSpin = 0;
let incomeBoostUntil = 0;
let dragSourceIndex = null;
let dragSourcePlane = null;
let activePointerId = null;
let toastTimer;
let saveTimer;
let cloudStorageAvailable = false;
let wheelIsSpinning = false;
let wheelSpinTimer = null;

function getCloudStorage() {
  return window.Telegram?.WebApp?.CloudStorage || null;
}

function getState() {
  return { coins, buyCost, playerLevel, planes, dailyBonusLastClaim, dailyBonusStreak, wheelLastSpin, incomeBoostUntil };
}

function isValidState(state) {
  return state && Number.isFinite(state.coins) && Number.isFinite(state.buyCost)
    && Number.isFinite(state.playerLevel) && Array.isArray(state.planes)
    && state.planes.every((level) => Number.isInteger(level) && level > 0);
}

function applyState(state) {
  if (!isValidState(state)) return false;
  coins = Math.max(0, state.coins);
  buyCost = Math.max(BASE_BUY_COST, state.buyCost);
  playerLevel = Math.max(1, state.playerLevel);
  planes = state.planes.slice(0, SLOT_COUNT);
  dailyBonusLastClaim = Number.isFinite(state.dailyBonusLastClaim) ? state.dailyBonusLastClaim : 0;
  dailyBonusStreak = Number.isInteger(state.dailyBonusStreak) ? Math.max(0, state.dailyBonusStreak) : 0;
  wheelLastSpin = Number.isFinite(state.wheelLastSpin) ? state.wheelLastSpin : 0;
  incomeBoostUntil = Number.isFinite(state.incomeBoostUntil) ? state.incomeBoostUntil : 0;
  return true;
}

function saveState() {
  const serialized = JSON.stringify(getState());
  localStorage.setItem(STORAGE_KEY, serialized);
  const cloudStorage = getCloudStorage();
  if (cloudStorage && cloudStorageAvailable) {
    try {
      cloudStorage.setItem(STORAGE_KEY, serialized, (error) => {
        if (error) {
          cloudStorageAvailable = false;
          setStatus('Локальное сохранение активно');
        }
      });
    } catch {
      setStatus('Локальное сохранение активно');
    }
  }
}

function resetGame() {
  if (!window.confirm('Сбросить прогресс игры?')) return;

  clearTimeout(wheelSpinTimer);
  wheelSpinTimer = null;
  coins = 120;
  buyCost = BASE_BUY_COST;
  planes = [1, 1];
  playerLevel = 1;
  dailyBonusLastClaim = 0;
  dailyBonusStreak = 0;
  wheelLastSpin = 0;
  incomeBoostUntil = 0;
  wheelIsSpinning = false;
  wheelDisc.style.transform = 'rotate(0deg)';
  wheelResult.textContent = 'Крути колесо и забирай приз';
  saveState();
  render();
  showToast('Прогресс сброшен');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 150);
}

function loadLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function loadCloudState() {
  const cloudStorage = getCloudStorage();
  if (!cloudStorage) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      cloudStorage.getItem(STORAGE_KEY, (error, value) => {
        cloudStorageAvailable = !error;
        if (error || !value) return resolve(null);
        try { resolve(JSON.parse(value)); } catch { resolve(null); }
      });
    } catch {
      cloudStorageAvailable = false;
      resolve(null);
    }
  });
}

async function init() {
  applyState(loadLocalState());
  render();
  const cloudState = await loadCloudState();
  if (applyState(cloudState)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
    render();
  }
  setStatus(cloudStorageAvailable ? 'Синхронизация включена' : 'Локальное сохранение активно');
}

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}

function formatCoins(value) {
  return Math.floor(value).toLocaleString('ru-RU');
}

function getIncome() {
  const baseIncome = planes.reduce((total, level) => total + (PLANE_INCOME[level] || 0), 0);
  return Date.now() < incomeBoostUntil ? baseIncome * 2 : baseIncome;
}

function render() {
  board.innerHTML = '';
  const income = getIncome();
  playerLevel = Math.max(playerLevel, Math.max(...planes, 0));

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.slotIndex = slotIndex;

    if (planes[slotIndex]) {
      slot.append(createPlane(planes[slotIndex], slotIndex));
    }
    board.append(slot);
  }

  balanceElement.textContent = formatCoins(coins);
  buyCostElement.textContent = formatCoins(buyCost);
  incomeElement.textContent = formatCoins(income);
  levelElement.textContent = playerLevel;
  buyButton.disabled = coins < buyCost || planes.length >= SLOT_COUNT;
  emptyState.hidden = planes.length > 0;
  renderMiniGames();
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function renderMiniGames() {
  const now = Date.now();
  const bonusRemaining = dailyBonusLastClaim + DAY_MS - now;
  const nextBonus = BONUS_REWARDS[Math.min(dailyBonusStreak, BONUS_REWARDS.length - 1)];
  const spinRemaining = wheelLastSpin + DAY_MS - now;

  bonusReward.textContent = `${nextBonus} ✦`;
  claimBonusButton.disabled = bonusRemaining > 0;
  bonusStatus.textContent = bonusRemaining > 0 ? 'Следующий бонус через' : 'Бонус готов';
  bonusTimer.textContent = bonusRemaining > 0 ? formatDuration(bonusRemaining) : `Награда: ${nextBonus} ✦`;

  spinButton.disabled = wheelIsSpinning || spinRemaining > 0;
  spinStatus.textContent = wheelIsSpinning ? 'КРУТИТСЯ...' : spinRemaining > 0 ? formatDuration(spinRemaining) : 'БЕСПЛАТНО';
}

function claimDailyBonus() {
  if (Date.now() < dailyBonusLastClaim + DAY_MS) return;
  const now = Date.now();
  if (dailyBonusLastClaim && now - dailyBonusLastClaim > DAY_MS * 2) dailyBonusStreak = 0;
  const reward = BONUS_REWARDS[Math.min(dailyBonusStreak, BONUS_REWARDS.length - 1)];
  dailyBonusStreak += 1;
  dailyBonusLastClaim = now;
  coins += reward;
  render();
  scheduleSave();
  showToast(`Ежедневный бонус: +${reward} монет`);
}

function addPlaneReward(level) {
  if (planes.length >= SLOT_COUNT) return false;
  planes.push(level);
  playerLevel = Math.max(playerLevel, level);
  return true;
}

function awardWheelPrize(prize) {
  if (prize.type === 'coins') coins += prize.value;
  if (prize.type === 'plane' && !addPlaneReward(prize.value)) {
    coins += prize.value * 80;
    prize = { ...prize, label: `${prize.value * 80} монет (ангар заполнен)` };
  }
  if (prize.type === 'boost') incomeBoostUntil = Math.max(Date.now(), incomeBoostUntil) + prize.value;
  wheelResult.textContent = `Приз: ${prize.label}`;
  render();
  scheduleSave();
  showToast(`Колесо: ${prize.label}`);
}

function spinWheel() {
  if (wheelIsSpinning || Date.now() < wheelLastSpin + DAY_MS) return;
  wheelIsSpinning = true;
  wheelLastSpin = Date.now();
  const prizeIndex = Math.floor(Math.random() * WHEEL_PRIZES.length);
  const rotation = 1440 + (360 - prizeIndex * 60);
  wheelDisc.style.transform = `rotate(${rotation}deg)`;
  wheelResult.textContent = 'Колесо выбирает твой приз...';
  renderMiniGames();
  wheelSpinTimer = setTimeout(() => {
    wheelSpinTimer = null;
    wheelIsSpinning = false;
    awardWheelPrize(WHEEL_PRIZES[prizeIndex]);
  }, 3000);
  scheduleSave();
}

function createPlane(level, index) {
  const plane = document.createElement('div');
  plane.className = `plane${level >= 5 ? ' high-level' : ''}${level >= 6 ? ' jet-plane' : ''}`;
  plane.draggable = false;
  plane.dataset.index = index;
  plane.innerHTML = `${createPlaneSvg(level, index)}<span class="plane-level">${level}</span>`;
  plane.addEventListener('pointerdown', (event) => startDrag(event, index, plane));
  return plane;
}

function createPlaneSvg(level, index) {
  if (level >= 6) return createJetSvg(level, index);

  const color = PLANE_COLORS[(level - 1) % PLANE_COLORS.length];
  const lightColor = level >= 5 ? '#fff3a6' : '#ffffff';
  const gradientId = `plane-gradient-${level}-${index}`;
  const wingId = `wing-gradient-${level}-${index}`;
  return `<svg class="plane-svg" viewBox="0 0 180 130" role="img" aria-label="Самолет ${level} уровня" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${lightColor}" stop-opacity=".95"/><stop offset=".35" stop-color="${color}"/><stop offset="1" stop-color="#17254c"/>
      </linearGradient>
      <linearGradient id="${wingId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#17254c"/></linearGradient>
      <filter id="plane-shadow-${level}-${index}" x="-20%" y="-30%" width="150%" height="170%"><feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="#17254c" flood-opacity=".28"/></filter>
    </defs>
    <g class="plane-art" filter="url(#plane-shadow-${level}-${index})">
      <ellipse class="plane-ground-shadow" cx="92" cy="111" rx="55" ry="7"/>
      <g class="plane-propeller"><circle cx="27" cy="65" r="10" fill="#ffc642" stroke="#a66a00" stroke-width="3"/><path d="M27 65C9 55 8 47 15 44c8-3 16 9 16 21zM27 65c18 10 19 18 12 21-8 3-16-9-16-21z" fill="#ff8e4d" stroke="#c85436" stroke-width="2"/></g>
      <path d="M35 57C56 44 105 43 139 60l-6 22c-28 8-67 5-99-5z" fill="url(#${gradientId})" stroke="#17254c" stroke-width="3"/>
      <path d="M112 55c8-14 23-17 33-8l3 18-29 8z" fill="#8ce4f5" stroke="#17254c" stroke-width="3"/>
      <path d="M118 55c6-7 13-9 21-5l-1 10-18 5z" fill="#d9f7ff" opacity=".88"/>
      <path d="M75 48L58 20h35l13 28z" fill="url(#${wingId})" stroke="#17254c" stroke-width="3"/>
      <path d="M74 78L54 105h40l14-28z" fill="url(#${wingId})" stroke="#17254c" stroke-width="3"/>
      <path d="M63 27L75 78M91 22L102 78M61 101L75 78M91 106L102 78" fill="none" stroke="#ffc642" stroke-width="4" stroke-linecap="round"/>
      <path d="M133 60l21-10-4 23-18 9z" fill="${color}" stroke="#17254c" stroke-width="3"/>
      <circle cx="44" cy="64" r="5" fill="#fff" opacity=".75"/><path d="M37 84h55" stroke="#fff" stroke-width="3" opacity=".4" stroke-linecap="round"/>
    </g>
  </svg>`;
}

function createJetSvg(level, index) {
  const jetColors = ['#61e7ff', '#58a6ff', '#9b7cff', '#f05cff', '#ff6f91'];
  const color = jetColors[(level - 6) % jetColors.length];
  const accent = level % 2 === 0 ? '#d9f7ff' : '#ffe27a';
  const bodyId = `jet-body-${level}-${index}`;
  const shadowId = `jet-shadow-${level}-${index}`;
  return `<svg class="plane-svg jet-svg" viewBox="0 0 180 130" role="img" aria-label="Футуристичный самолет ${level} уровня" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${bodyId}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset=".22" stop-color="${color}"/><stop offset=".72" stop-color="#26356b"/><stop offset="1" stop-color="#111a3e"/></linearGradient>
      <linearGradient id="jet-wing-${level}-${index}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${accent}"/><stop offset=".35" stop-color="${color}"/><stop offset="1" stop-color="#202957"/></linearGradient>
      <linearGradient id="jet-trail-${level}-${index}" x1="1" y1="0" x2="0" y2="0"><stop stop-color="${accent}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>
      <filter id="${shadowId}" x="-30%" y="-40%" width="170%" height="190%"><feDropShadow dx="0" dy="7" stdDeviation="3" flood-color="#101b3d" flood-opacity=".35"/></filter>
    </defs>
    <g class="jet-art" filter="url(#${shadowId})">
      <path class="jet-trail" d="M51 62C34 55 16 57 4 64c18 1 30 7 46 6zM51 71C31 72 18 78 8 87c18-5 31-5 47-8z" fill="url(#jet-trail-${level}-${index})"/>
      <path d="M48 58L106 51 158 64 106 78 48 72z" fill="url(#${bodyId})" stroke="#111a3e" stroke-width="3"/>
      <path d="M104 51L151 33 132 63 99 66z" fill="url(#jet-wing-${level}-${index})" stroke="#111a3e" stroke-width="3"/>
      <path d="M103 76L145 96 128 69 98 66z" fill="url(#jet-wing-${level}-${index})" stroke="#111a3e" stroke-width="3"/>
      <path d="M75 55L88 29 106 53z" fill="${color}" stroke="#111a3e" stroke-width="3"/>
      <path d="M75 74L87 101 105 76z" fill="${color}" stroke="#111a3e" stroke-width="3"/>
      <path d="M151 33L164 39 151 64 137 62z" fill="${accent}" stroke="#111a3e" stroke-width="3"/>
      <path d="M150 96L164 91 151 67 137 69z" fill="${accent}" stroke="#111a3e" stroke-width="3"/>
      <path d="M112 55l29 9-29 4z" fill="#bff7ff" opacity=".9"/>
      <path d="M54 64h48" stroke="#ffffff" stroke-width="3" opacity=".45" stroke-linecap="round"/>
      <circle cx="48" cy="65" r="6" fill="#111a3e"/><circle cx="48" cy="65" r="3" fill="${accent}"/>
    </g>
  </svg>`;
}

function startDrag(event, index, plane) {
  event.preventDefault();
  if (activePointerId !== null) return;

  dragSourceIndex = index;
  dragSourcePlane = plane;
  activePointerId = event.pointerId;
  plane.classList.add('dragging');
  plane.setPointerCapture(activePointerId);
  document.body.classList.add('is-dragging');
  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', endDrag, { once: true });
  document.addEventListener('pointercancel', endDrag, { once: true });
}

function moveDrag(event) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const hoveredSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest('.slot');
  document.querySelectorAll('.drop-target').forEach((slot) => slot.classList.remove('drop-target'));
  if (hoveredSlot) hoveredSlot.classList.add('drop-target');
}

function endDrag(event) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();

  const sourceIndex = dragSourceIndex;
  const draggedPlane = dragSourcePlane;
  if (draggedPlane?.hasPointerCapture(activePointerId)) {
    draggedPlane.releasePointerCapture(activePointerId);
  }
  draggedPlane?.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  document.removeEventListener('pointermove', moveDrag);
  document.querySelectorAll('.drop-target').forEach((slot) => slot.classList.remove('drop-target'));

  const targetSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest('.slot');
  const targetIndex = targetSlot ? Number(targetSlot.dataset.slotIndex) : null;
  if (targetIndex !== null && targetIndex !== sourceIndex) {
    mergePlanes(sourceIndex, targetIndex);
  }
  dragSourceIndex = null;
  dragSourcePlane = null;
  activePointerId = null;
}

/** Объединяет два самолета одного уровня в следующую модель. */
function mergePlanes(sourceIndex, targetIndex) {
  const sourceLevel = planes[sourceIndex];
  const targetLevel = planes[targetIndex];
  if (!sourceLevel || sourceLevel !== targetLevel) {
    showToast(targetLevel ? 'Нужен самолет такого же уровня' : 'Перетащи самолет на другой');
    return;
  }

  planes[targetIndex] = targetLevel + 1;
  planes.splice(sourceIndex, 1);
  playerLevel = Math.max(playerLevel, targetLevel + 1);
  render();
  scheduleSave();
  const upgradedPlane = board.querySelector(`[data-index="${targetIndex}"]`);
  upgradedPlane?.classList.add('merge-pop');
  showToast(`Отлично! Самолет ${targetLevel + 1} уровня готов`);
}

function buyPlane() {
  if (coins < buyCost) {
    showToast('Сначала заработай еще немного монет');
    return;
  }
  if (planes.length >= SLOT_COUNT) {
    showToast('Ангар заполнен: объедини самолеты');
    return;
  }

  coins -= buyCost;
  buyCost = Math.ceil(buyCost * 1.22 / 5) * 5;
  planes.push(1);
  render();
  scheduleSave();
  showToast('Новый самолет в ангаре');
}

/** Каждую секунду начисляет доход всех самолетов на поле. */
function collectIncome() {
  const income = getIncome();
  if (!income) return;
  coins += income;
  render();
  scheduleSave();

  const pop = document.createElement('span');
  pop.className = 'coin-pop';
  pop.textContent = `+${income} ✦`;
  document.querySelector('.balance-card').append(pop);
  setTimeout(() => pop.remove(), 900);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

buyButton.addEventListener('click', buyPlane);
resetButton.addEventListener('click', resetGame);
claimBonusButton.addEventListener('click', claimDailyBonus);
spinButton.addEventListener('click', spinWheel);
setInterval(collectIncome, 1000);
setInterval(() => {
  renderMiniGames();
  if (incomeBoostUntil && Date.now() >= incomeBoostUntil) render();
}, 1000);

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const selectedScreen = tab.dataset.screen;
    tabs.forEach((item) => {
      const isSelected = item === tab;
      item.classList.toggle('is-active', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
    screens.forEach((screen) => {
      const isSelected = screen.id === selectedScreen;
      screen.classList.toggle('is-active', isSelected);
      screen.hidden = !isSelected;
    });
  });
});

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
  document.documentElement.style.setProperty('--telegram-bg', window.Telegram.WebApp.backgroundColor || '#eaf6ff');
}

init();
