import { TennisGame } from './game.js';
import { CourtScene } from './scene.js';
import { GameControls } from './controls.js';

const $ = id => document.getElementById(id);
let gender = 'male';
let movementMode = 'auto';
let game = null;
let scene = null;
let currentScreen = 'selection';
let lastFrame = 0;
let audio = null;
const dialogs = [...document.querySelectorAll('dialog')];
const touchMedia = matchMedia('(max-width: 750px), (pointer: coarse)');

function playSound(type) {
  if (!audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(type === 'hit' ? 480 : type === 'bounce' ? 240 : 690, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(120, audio.currentTime + .08);
  gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .1);
  oscillator.start(); oscillator.stop(audio.currentTime + .11);
}
function unlockSound() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Audio is optional. */ }
}
function selectPlayer(value) {
  gender = value;
  document.querySelectorAll('[data-gender]').forEach(button => {
    const selected = button.dataset.gender === gender;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.selection-mark').textContent = selected ? '選択中' : '選択する';
  });
  $('rival-photo').src = `tennis/assets/${gender}-rival.png`;
  $('rival-photo').alt = gender === 'male' ? '黒と青のウェアを着たワイルドな男子ライバル' : 'カーリーヘアで紫と黒のウェアを着た女子ライバル';
  $('rival-description').textContent = gender === 'male' ? 'ワイルドなパワープレーヤー' : '冷静で精悍なライバル';
}
function resetInput() {
  controls.reset();
  if (game) { game.setMovement(0, 0); game.setAim(0); }
}
function setMovementMode(mode) {
  movementMode = mode === 'manual' ? 'manual' : 'auto';
  resetInput();
  if (game) game.setMovementMode(movementMode);
  document.querySelectorAll('input[name="movement"],input[name="pause-movement"]').forEach(radio => { radio.checked = radio.value === movementMode; });
  $('movement-description').textContent = movementMode === 'auto' ? '移動はおまかせ。打つ操作に集中。' : 'WASD / スティックで、ボールを追おう。';
  $('movement-stick').classList.toggle('inactive', movementMode === 'auto');
  $('movement-stick').setAttribute('aria-disabled', String(movementMode === 'auto'));
  $('stick-caption').textContent = movementMode === 'auto' ? '自動移動' : 'スティックで移動';
}
function handleEvent(event) {
  if (event.type === 'point' || event.type === 'finished') resetInput();
  if (event.type === 'hit' || event.type === 'bounce') playSound(event.type);
  if (event.type === 'finished') {
    playSound('win');
    $('result-title').textContent = event.player === 0 ? 'YOU WIN' : 'RIVAL WINS';
    $('result-score').textContent = game.score.games.join(' – ');
    $('result-message').textContent = (event.player === 0 ? 'ナイスプレイ。コートはあなたのもの。' : '次の一球で、流れを変えよう。') + (game.score.finalTiebreak ? ` タイブレーク ${game.score.finalTiebreak.join('–')}` : '');
    $('result-dialog').showModal();
  }
}
function closeDialogs() { dialogs.forEach(dialog => { if (dialog.open) dialog.close(); }); }
function startMatch() {
  closeDialogs(); resetInput(); unlockSound();
  $('selection').hidden = true; $('match').hidden = false; $('pause-button').hidden = false;
  currentScreen = 'match';
  try {
    scene ??= new CourtScene($('court'), () => {
      pauseGame();
      $('pause-dialog').querySelector('p').textContent = '3D描画が停止しました。ページを再読み込みしてください。';
    });
    scene.setGender(gender); scene.resize();
    game = new TennisGame({ onEvent: handleEvent, movementMode });
    updateUI();
    // Move focus away from the start button: Space now belongs to the game.
    document.activeElement?.blur();
  } catch (error) {
    console.error(error);
    backToSelection();
    const message = document.createElement('p'); message.className = 'webgl-error'; message.setAttribute('role', 'alert');
    message.textContent = '3D描画を開始できませんでした。WebGL対応ブラウザで、ハードウェアアクセラレーションを有効にしてください。';
    document.querySelector('.webgl-error')?.remove(); document.querySelector('.selection-heading').append(message);
  }
}
function backToSelection() {
  resetInput();
  if (game) game.paused = true;
  closeDialogs();
  currentScreen = 'selection'; $('match').hidden = true; $('selection').hidden = false; $('pause-button').hidden = true;
  $('start-button').focus();
}
function pauseGame() {
  if (!game || currentScreen !== 'match' || game.phase === 'finished' || dialogs.some(d => d.open)) return;
  resetInput(); game.paused = true; $('pause-dialog').showModal();
}
function resumeGame() { resetInput(); closeDialogs(); if (game) game.paused = false; document.activeElement?.blur(); }
function showHelp() {
  if (dialogs.some(d => d.open)) return;
  resetInput();
  if (game && currentScreen === 'match') game.paused = true;
  $('help-dialog').showModal();
}
function closeHelp() { $('help-dialog').close(); if (game && currentScreen === 'match') game.paused = false; document.activeElement?.blur(); }
function input(action) {
  if (!game || currentScreen !== 'match' || dialogs.some(d => d.open)) return;
  if (action === 'hit') { unlockSound(); game.hit(); }
  else if (action === 'left') game.setAim(-1);
  else if (action === 'right') game.setAim(1);
  else if (action === 'center') game.setAim(0);
  else if (action === 'depth') game.setAim(game.aim.x, 1 - game.aim.depth);
  else if (action === 'deep') game.setAim(game.aim.x, 0);
  else if (action === 'short') game.setAim(game.aim.x, 1);
  updateUI();
}
function updateUI() {
  if (!game) return;
  const score = game.score, labels = score.labels();
  for (const [i, player] of ['you', 'rival'].entries()) {
    $(`games-${player}`).textContent = score.games[i]; $(`points-${player}`).textContent = labels[i];
    $(`serve-${player}`).classList.toggle('active', score.server === i);
  }
  $('point-heading').textContent = score.tiebreak ? 'TIEBREAK' : 'POINT';
  $('score-detail').textContent = score.tiebreak ? 'タイブレーク · 7点以上、2点差' : score.deuce ? 'DEUCE · 2点差でゲーム獲得' : `1セットマッチ · ${score.server === 0 ? 'あなた' : '相手'}のサーブ`;
  $('aim-label').textContent = `狙い：${game.aim.x < 0 ? '左' : game.aim.x > 0 ? '右' : 'センター'} · ${game.aim.depth ? '浅め' : '深め'}`;
  $('feedback').textContent = game.feedback;
  for (const button of document.querySelectorAll('.touch-aim button[data-input]')) {
    const aim = { left: -1, center: 0, right: 1 }[button.dataset.input];
    if (aim !== undefined) button.setAttribute('aria-pressed', String(game.aim.x === aim));
  }
  $('touch-depth').textContent = game.aim.depth ? '浅め' : '深め';
  $('touch-depth').setAttribute('aria-label', game.aim.depth ? '深い球に切り替える' : '浅い球に切り替える');
  const touch = touchMedia.matches;
  const hitKey = touch ? '打球ボタン' : 'SPACE';
  let status, hint;
  const phase = game.phase;
  $('timing-meter').hidden = phase !== 'serve-toss' || score.server !== 0;
  if (phase === 'serve-ready') {
    status = score.server === 0 ? (game.faults ? `セカンドサーブ · ${hitKey}でトス` : `${hitKey}でトス`) : '相手のサーブ';
    hint = score.server === 0 ? (touch ? 'コースを選んで、もう一度タップ' : '← → コースを選ぶ。次のSPACEで打つ') : '返球の合図を待とう';
  } else if (phase === 'serve-toss') {
    status = score.server === 0 ? `緑のゾーンで ${touch ? 'タップ' : 'SPACE'}！` : '相手のサーブ';
    hint = score.server === 0 ? 'タイミングよく、もう一度押そう' : 'ボールに集中しよう';
    $('timing-cursor').style.left = `${Math.min(100, game.phaseTime / 1.4 * 100)}%`;
  } else if (phase === 'rally') {
    status = game.canHit ? (touch ? '今、打とう！' : '今、SPACE！') : game.incoming ? '準備しよう…' : '相手が返球中';
    hint = game.canHit ? (touch ? 'コースを選んで、打球ボタン' : '← → で狙って、打とう') : `ラリー ${game.rallyCount + 1} · ${game.movementMode === 'manual' ? (touch ? 'スティックで移動' : 'WASD で移動') : '移動は自動'}`;
  } else if (phase === 'fault') {
    status = 'フォルト · セカンドサーブ'; hint = `${hitKey}で次のサーブへ`;
  } else if (phase === 'point-over') {
    status = game.pointWinner === 0 ? 'あなたのポイント' : '相手のポイント'; hint = `${game.pointReason === 'DOUBLE FAULT' ? 'ダブルフォルト · ' : ''}${hitKey}で次のポイントへ`;
  } else { status = score.winner === 0 ? 'YOU WIN' : 'RIVAL WINS'; hint = '1セットマッチ終了'; }
  document.querySelector('.touch-hit').textContent = phase === 'serve-ready' && score.server === 0 ? 'トス' : phase === 'serve-toss' && score.server === 0 ? 'サーブ' : ['fault', 'point-over'].includes(phase) ? '次へ' : '打つ';
  document.querySelector('.touch-hit').classList.toggle('ready', game.canHit);
  $('status').textContent = status; $('hint').textContent = hint;
  $('status').style.color = game.canHit ? '#527a15' : '';
}

document.querySelectorAll('[data-gender]').forEach(button => button.addEventListener('click', () => selectPlayer(button.dataset.gender)));
$('start-button').addEventListener('click', startMatch);
$('help-button').addEventListener('click', showHelp);
$('pause-button').addEventListener('click', pauseGame);
$('resume-button').addEventListener('click', resumeGame);
$('help-dialog').querySelectorAll('.close-dialog,.close-help').forEach(button => button.addEventListener('click', closeHelp));
$('rematch-button').addEventListener('click', startMatch);
$('change-player-button').addEventListener('click', backToSelection);
$('quit-button').addEventListener('click', () => { $('pause-dialog').close(); $('quit-dialog').showModal(); });
$('cancel-quit').addEventListener('click', () => { $('quit-dialog').close(); $('pause-dialog').showModal(); });
$('confirm-quit').addEventListener('click', backToSelection);
document.querySelectorAll('input[name="movement"],input[name="pause-movement"]').forEach(radio => radio.addEventListener('change', () => setMovementMode(radio.value)));
for (const dialog of dialogs) dialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (dialog === $('help-dialog')) closeHelp();
  else if (dialog === $('pause-dialog')) resumeGame();
  else if (dialog === $('quit-dialog')) { dialog.close(); $('pause-dialog').showModal(); }
});
const controls = new GameControls({
  enabled: () => currentScreen === 'match' && game && !game.paused && game.phase !== 'finished' && !dialogs.some(d => d.open),
  isManual: () => movementMode === 'manual',
  onAction: input,
  onMovement: (x, z) => { if (game) game.setMovement(x, z); },
  stick: $('movement-stick'),
  buttons: document.querySelectorAll('[data-input]'),
});
document.addEventListener('keydown', event => {
  if (event.code === 'Escape' && !dialogs.some(d => d.open)) { event.preventDefault(); pauseGame(); }
});
window.addEventListener('blur', () => { resetInput(); pauseGame(); });
window.addEventListener('orientationchange', resetInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
function frame(time) {
  const dt = lastFrame ? Math.min((time - lastFrame) / 1000, .1) : .016; lastFrame = time;
  if (currentScreen === 'match' && game && scene) { game.update(dt); updateUI(); scene.render(game); }
  requestAnimationFrame(frame);
}
selectPlayer(gender); setMovementMode(movementMode); requestAnimationFrame(frame);
