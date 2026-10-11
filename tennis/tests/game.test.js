import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchScore, TennisGame, COURT } from '../game.js';
const tick = (game, seconds) => { for (let t = 0; t < seconds; t += 1 / 120) game.update(1 / 120); };
const gameWin = (score, player) => { for (let i = 0; i < 4; i++) score.award(player); };

test('standard scoring, deuce, advantage cancellation and service change', () => {
  const score = new MatchScore();
  assert.deepEqual(score.labels(), ['0', '0']); score.award(0); assert.deepEqual(score.labels(), ['15', '0']);
  score.award(0); assert.deepEqual(score.labels(), ['30', '0']); score.award(0);
  score.award(1); score.award(1); score.award(1); assert.equal(score.deuce, true);
  score.award(0); assert.deepEqual(score.labels(), ['AD', '40']); score.award(1); assert.equal(score.deuce, true);
  score.award(1); const result = score.award(1);
  assert.equal(result.game, true); assert.deepEqual(score.games, [0, 1]); assert.deepEqual(score.points, [0, 0]); assert.equal(score.server, 1);
});
test('a 6–0 set completes, and no extra points can change the result', () => {
  const score = new MatchScore(); for (let i = 0; i < 6; i++) gameWin(score, 0);
  assert.equal(score.winner, 0); assert.deepEqual(score.games, [6, 0]); score.award(1); assert.deepEqual(score.games, [6, 0]);
});
test('5–5 requires a two-game lead and can end 7–5', () => {
  const score = new MatchScore(); for (let i = 0; i < 5; i++) { gameWin(score, 0); gameWin(score, 1); }
  gameWin(score, 0); assert.equal(score.winner, null); gameWin(score, 0); assert.deepEqual(score.games, [7, 5]); assert.equal(score.winner, 0);
});
test('6–6 tiebreak service rotation, deuce-side alternation, two-point margin', () => {
  const score = new MatchScore(); for (let i = 0; i < 6; i++) { gameWin(score, 0); gameWin(score, 1); }
  assert.equal(score.tiebreak, true); assert.equal(score.server, 0);
  const servers = []; for (let i = 0; i < 12; i++) { servers.push(score.server); score.award(i % 2); }
  assert.deepEqual(servers, [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]); assert.equal(score.deuceSide, true);
  score.award(1); assert.equal(score.winner, null); score.award(1);
  assert.equal(score.winner, 1); assert.deepEqual(score.games, [6, 7]); assert.deepEqual(score.finalTiebreak, [6, 8]);
});
test('timed serve and automatic opponent produce a playable incoming ball', () => {
  const game = new TennisGame({ random: () => .5 });
  game.hit(); tick(game, .72); game.hit(); assert.equal(game.phase, 'rally');
  let found = false;
  for (let i = 0; i < 1000; i++) { game.update(1 / 120); if (game.canHit) { found = true; game.hit(); break; } }
  assert.equal(found, true); assert.equal(game.receiver, 1); assert.ok(game.rallyCount >= 2); assert.equal(game.faults, 0);
});
test('normal shots clear the net and bounce in court; multiple rallies remain playable', () => {
  const game = new TennisGame({ random: () => .5 }); game.hit(); tick(game, .72); game.hit();
  let returns = 0;
  for (let i = 0; i < 10000 && returns < 8; i++) {
    game.update(1 / 120);
    if (game.canHit && game.ball.z > 9.8) { game.hit(); returns++; }
    assert.notEqual(game.phase, 'point-over', game.pointReason);
  }
  assert.equal(returns, 8); assert.equal(game.phase, 'rally');
});
test('serve missed twice is a double fault, awards only one point, resets faults', () => {
  const game = new TennisGame(); game.hit(); tick(game, 1.5); assert.equal(game.faults, 1); assert.equal(game.phase, 'fault');
  tick(game, 1.7); game.hit(); tick(game, 1.5);
  assert.deepEqual(game.score.points, [0, 1]); assert.equal(game.pointReason, 'DOUBLE FAULT');
  tick(game, 2.3); assert.equal(game.faults, 0); assert.equal(game.phase, 'serve-ready');
});
test('net, out and two bounces award the correct player', () => {
  const net = new TennisGame(); net.launch(0, { x: 0, y: .2, z: .1 }, { x: 0, z: -5 }, .7); tick(net, .1);
  assert.equal(net.pointReason, 'NET'); assert.deepEqual(net.score.points, [0, 1]);
  const out = new TennisGame(); out.launch(0, { x: 0, y: 2, z: 10 }, { x: COURT.halfWidth + 1, z: -8 }, 1.4); tick(out, 1.6);
  assert.equal(out.pointReason, 'OUT'); assert.deepEqual(out.score.points, [0, 1]);
  const missed = new TennisGame({ random: () => .5 }); missed.hit(); tick(missed, .72); missed.hit();
  let lost = false;
  for (let i = 0; i < 1200; i++) { missed.update(1 / 120); if (missed.phase === 'point-over') { lost = true; break; } }
  assert.equal(lost, true); assert.deepEqual(missed.score.points, [0, 1]);
});
test('pause freezes ball, timers and score', () => {
  const game = new TennisGame(); game.hit(); tick(game, .72); game.hit(); game.paused = true;
  const before = JSON.stringify({ ball: game.ball, score: game.score, time: game.elapsed }); tick(game, 4); game.hit();
  assert.equal(JSON.stringify({ ball: game.ball, score: game.score, time: game.elapsed }), before);
});
test('opponent serves automatically after a game, and fault recovery preserves server', () => {
  const game = new TennisGame({ random: () => .5 }); gameWin(game.score, 0); game.preparePoint();
  assert.equal(game.score.server, 1); tick(game, 2); assert.equal(game.phase, 'rally'); assert.equal(game.lastHitter, 1);
});
for (const movementMode of ['auto', 'manual']) {
  test(`a complete ${movementMode} set can be won through serves and aimed returns`, () => {
    let seed = 42;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const game = new TennisGame({ random, movementMode });
    for (let i = 0; i < 300000 && game.phase !== 'finished'; i++) {
      if (game.phase === 'serve-ready' && game.score.server === 0) game.hit();
      if (game.phase === 'serve-toss' && game.score.server === 0 && game.phaseTime > .71) game.hit();
      if (movementMode === 'manual' && game.phase === 'rally') {
        const player = game.players[0];
        const targetX = game.incoming ? game.interceptX : 0;
        const dx = targetX - player.x, dz = 10.1 - player.z;
        game.setMovement(Math.abs(dx) > .08 ? Math.sign(dx) : 0, Math.abs(dz) > .08 ? Math.sign(dz) : 0);
      }
      if (game.canHit && game.ball.z > 9.9) { game.setAim(game.players[1].x >= 0 ? -1 : 1); game.hit(); }
      game.update(1 / 120);
    }
    assert.equal(game.phase, 'finished'); assert.equal(game.score.winner, 0); assert.ok(game.score.games[0] >= 6);
  });
}
test('a complete simulated set can be lost and produces a final result', () => {
  const game = new TennisGame({ random: () => .5 });
  for (let i = 0; i < 50000 && game.phase !== 'finished'; i++) {
    if (game.phase === 'serve-ready' && game.score.server === 0) game.hit();
    game.update(1 / 60);
  }
  assert.equal(game.phase, 'finished'); assert.deepEqual(game.score.games, [0, 6]); assert.equal(game.score.winner, 1);
});
test('manual movement stops without input, normalizes diagonals and stays on own court', () => {
  const game = new TennisGame({ movementMode: 'manual' });
  game.launch(1, { x: 0, y: 2, z: -10 }, { x: 0, z: 7.5 }, 1.3);
  const before = { ...game.players[0] }; tick(game, .2);
  assert.equal(game.players[0].x, before.x); assert.equal(game.players[0].z, before.z);
  game.setMovement(-1, -1); const start = { ...game.players[0] }; tick(game, .2);
  const distance = Math.hypot(game.players[0].x - start.x, game.players[0].z - start.z);
  assert.ok(Math.abs(distance - 8.7 * .2) < .08, 'diagonal speed must match axial speed');
  game.setMovement(0, 0); const stopped = { ...game.players[0] }; tick(game, .1);
  assert.equal(game.players[0].x, stopped.x); assert.equal(game.players[0].z, stopped.z);
  for (let i = 0; i < 400; i++) { game.phase = 'rally'; game.setMovement(-1, -1); game.movePlayers(.02); }
  assert.equal(game.players[0].x, -5.1); assert.equal(game.players[0].z, 1.8);
});
test('manual server stays fixed through the toss and can move once the serve is hit', () => {
  const game = new TennisGame({ movementMode: 'manual' }); game.setMovement(-1, -1);
  const before = { ...game.players[0] }; game.hit(); tick(game, .72);
  assert.equal(game.players[0].x, before.x); assert.equal(game.players[0].z, before.z);
  game.hit(); tick(game, .1); assert.ok(game.players[0].x < before.x); assert.ok(game.players[0].z < before.z);
});
test('manual short-ball return uses player position, while a distant player cannot hit', () => {
  const game = new TennisGame({ movementMode: 'manual', random: () => .5 });
  game.launch(1, { x: 0, y: 1.7, z: -10.5 }, { x: 0, z: 5.3 }, 1.32);
  game.setMovement(-1, 0); tick(game, 1.7 / 8.7); game.setMovement(0, -1); tick(game, (12.35 - 6.5) / 8.7); game.setMovement(0, 0);
  let reachable = false;
  for (let i = 0; i < 160; i++) { game.update(1 / 120); if (game.canHit) { reachable = true; break; } }
  assert.equal(reachable, true); assert.ok(game.ball.z < 8.4, 'manual contact can happen ahead of the old fixed baseline window');
  game.players[0].x = 4; assert.equal(game.canHit, false); game.players[0].x = 0;
  game.hit(); assert.equal(game.lastHitter, 0); assert.equal(game.receiver, 1);
});
test('switching movement modes and pausing clears or freezes movement without resetting score', () => {
  const game = new TennisGame({ movementMode: 'manual' }); game.score.award(0);
  game.setMovement(1, 1); game.setMovementMode('auto'); assert.deepEqual(game.movement, { x: 0, z: 0 });
  assert.deepEqual(game.score.points, [1, 0]); game.setMovementMode('manual');
  game.launch(1, { x: 0, y: 2, z: -10 }, { x: 0, z: 7.5 }, 1.3); game.setMovement(-1, -1); game.paused = true;
  const before = { ...game.players[0] }; tick(game, 1); assert.deepEqual(game.players[0], before);
});
