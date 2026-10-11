/** Pure rules and simulation. Rendering and keyboard input are deliberately separate. */
export const COURT = Object.freeze({ halfWidth: 4.115, halfLength: 11.885, serviceLine: 6.4, net: 0.914 });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const GRAVITY = 9.8;
const BALL_RADIUS = 0.095;
export const PACES = Object.freeze({ relaxed: .85, standard: 1, brisk: 1.12 });
const SHOT_BUFFER = .12;

export class MatchScore {
  constructor(firstServer = 0) {
    this.points = [0, 0];
    this.games = [0, 0];
    this.firstServer = firstServer;
    this.server = firstServer;
    this.tiebreak = false;
    this.winner = null;
    this.finalTiebreak = null;
  }
  get pointNumber() { return this.points[0] + this.points[1]; }
  get deuceSide() { return this.pointNumber % 2 === 0; }
  labels() {
    if (this.tiebreak) return this.points.map(String);
    if (this.points.every(p => p >= 3)) {
      const difference = this.points[0] - this.points[1];
      return difference === 0 ? ['40', '40'] : difference > 0 ? ['AD', '40'] : ['40', 'AD'];
    }
    return this.points.map(p => ['0', '15', '30', '40'][p] ?? '40');
  }
  get deuce() { return !this.tiebreak && this.points[0] >= 3 && this.points[0] === this.points[1]; }
  award(player) {
    if (player !== 0 && player !== 1) throw new RangeError('Unknown player');
    if (this.winner !== null) return { match: true, game: false, winner: this.winner };
    this.points[player]++;
    const other = 1 - player;
    const target = this.tiebreak ? 7 : 4;
    if (this.points[player] >= target && this.points[player] - this.points[other] >= 2) {
      if (this.tiebreak) this.finalTiebreak = [...this.points];
      this.games[player]++;
      if (this.tiebreak || (this.games[player] >= 6 && this.games[player] - this.games[other] >= 2)) {
        this.winner = player;
        return { match: true, game: true, winner: player };
      }
      this.points = [0, 0];
      this.server = 1 - this.server;
      if (this.games.every(g => g === 6)) {
        this.tiebreak = true;
        this.tiebreakFirstServer = this.server;
      }
      return { match: false, game: true, winner: player };
    }
    if (this.tiebreak) {
      // First server serves once, then players alternate two-point service turns.
      const turn = Math.floor((this.pointNumber + 1) / 2);
      this.server = turn % 2 ? 1 - this.tiebreakFirstServer : this.tiebreakFirstServer;
    }
    return { match: false, game: false, winner: player };
  }
}

export class TennisGame {
  constructor({ random = Math.random, onEvent = () => {}, movementMode = 'auto', pace = 'standard' } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.score = new MatchScore();
    this.players = [{ x: 1.7, z: 12.35, swing: 0, moving: 0 }, { x: -1.7, z: -10.5, swing: 0, moving: 0 }];
    this.aim = { x: 0, depth: 0 }; // 0 deep, 1 short. Future movement input belongs to a separate controller.
    this.paused = false;
    this.setPace(pace);
    this.clearShotBuffer();
    this.movementMode = movementMode === 'manual' ? 'manual' : 'auto';
    this.movement = { x: 0, z: 0 };
    this.elapsed = 0;
    this.feedback = '';
    this.feedbackTime = 0;
    this.faults = 0;
    this.rallyCount = 0;
    this.ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, visible: true };
    this.preparePoint();
  }
  setPace(pace) { this.pace = Object.hasOwn(PACES, pace) ? pace : 'standard'; this.clearShotBuffer(); }
  clearShotBuffer() { this.shotBuffer = 0; }
  event(type, detail = {}) { this.onEvent({ type, ...detail }); }
  message(text, time = 1) { this.feedback = text; this.feedbackTime = time; }
  preparePoint() {
    if (this.score.winner !== null) return;
    this.clearShotBuffer();
    this.phase = 'serve-ready';
    this.phaseTime = 0;
    this.rallyCount = 0;
    this.bounces = 0;
    this.setMovement(0, 0);
    const server = this.score.server;
    const direction = server === 0 ? 1 : -1;
    const side = this.score.deuceSide ? 1 : -1;
    this.players[server].x = direction * side * 1.7;
    this.players[server].z = direction * 12.35;
    this.players[1 - server].x = -direction * side * 1.4;
    this.players[1 - server].z = -direction * 10.5;
    this.resetBall();
    this.event('ready', { server });
  }
  resetBall() {
    const p = this.players[this.score.server];
    Object.assign(this.ball, { x: p.x + .4, y: 1.15, z: p.z - (this.score.server === 0 ? .3 : -.3), vx: 0, vy: 0, vz: 0, visible: true });
  }
  setAim(x, depth = this.aim.depth) { this.aim.x = clamp(x, -1, 1); this.aim.depth = clamp(depth, 0, 1); }
  setMovementMode(mode) {
    this.clearShotBuffer();
    this.movementMode = mode === 'manual' ? 'manual' : 'auto';
    this.setMovement(0, 0);
  }
  setMovement(x, z) {
    const length = Math.max(1, Math.hypot(x, z));
    this.movement.x = x / length;
    this.movement.z = z / length;
  }
  get canHit() {
    const b = this.ball;
    if (this.movementMode === 'manual') {
      const p = this.players[0];
      return this.incoming && this.bounces === 1 && b.y > .1 && b.y < 2.6 && Math.abs(b.x - p.x) < 1.55 && Math.abs(b.z - p.z) < 1.65;
    }
    return this.phase === 'rally' && this.receiver === 0 && this.bounces === 1 && b.z >= 8.4 && b.z <= 12.65 && b.y > .1 && b.y < 2.6 && Math.abs(b.x - this.players[0].x) < 1.7;
  }
  get incoming() { return this.phase === 'rally' && this.receiver === 0; }
  hit() {
    if (this.paused || this.phase === 'finished') return;
    if (this.phase === 'point-over') { this.faults = 0; this.preparePoint(); return; }
    if (this.phase === 'fault') { this.preparePoint(); return; }
    if (this.score.server === 0 && this.phase === 'serve-ready') {
      this.phase = 'serve-toss'; this.phaseTime = 0; this.event('toss'); return;
    }
    if (this.score.server === 0 && this.phase === 'serve-toss') {
      const timing = this.phaseTime;
      if (timing < .4 || timing > 1.12) { this.serveFault('タイミングが合わず、フォルト'); return; }
      this.serve(0, 1 - Math.abs(timing - .72) / .55); return;
    }
    if (this.canHit) {
      const contactZ = this.movementMode === 'manual' ? this.players[0].z - .35 : 10.1;
      const quality = clamp(1 - Math.abs(this.ball.z - contactZ) / 3.5, .18, 1);
      this.returnShot(0, quality);
      this.message(quality > .78 ? 'NICE SHOT' : 'GOOD RETURN', .65);
    } else if (this.incoming) {
      const p = this.players[0];
      const close = this.movementMode === 'auto' ? this.ball.z > 7.2 && this.ball.z < 8.4 : Math.hypot(this.ball.x - p.x, this.ball.z - p.z) < 2.8;
      if (this.bounces === 1 && close && this.ball.y > .1) {
        this.shotBuffer = SHOT_BUFFER; this.message('打球準備！', SHOT_BUFFER); return;
      }
      this.message(this.movementMode === 'manual' ? 'ボールの近くへ移動しよう' : this.ball.z < 8.4 ? 'まだ早い！ 合図を待とう' : 'ボールが届く場所で打とう', .55);
    }
  }
  serve(player, quality = .9) {
    const direction = player === 0 ? -1 : 1;
    const side = this.score.deuceSide ? 1 : -1;
    // Target always remains in the diagonal service box. Input chooses a lane within it.
    const targetX = direction * side * 2.05 + (player === 0 ? this.aim.x : (this.random() - .5)) * 1.1;
    const p = this.players[player];
    const from = { x: p.x, y: 2.7, z: p.z + direction * .25 };
    this.launch(player, from, { x: targetX, z: direction * 4.8 }, 1.24, true);
    this.players[player].swing = 1;
    this.message(player === 0 && quality > .85 ? 'NICE SERVE' : '', .6);
    this.event('hit', { player, serve: true, quality, position: { ...from } });
  }
  launch(player, from, target, flightTime, serve = false) {
    Object.assign(this.ball, from, {
      vx: (target.x - from.x) / flightTime,
      vz: (target.z - from.z) / flightTime,
      vy: (BALL_RADIUS - from.y + .5 * GRAVITY * flightTime ** 2) / flightTime,
      visible: true,
    });
    this.clearShotBuffer();
    this.lastHitter = player;
    this.receiver = 1 - player;
    this.phase = 'rally';
    this.phaseTime = 0;
    this.bounces = 0;
    this.isServe = serve;
    this.target = target;
    this.aiWillMiss = !serve && player === 0 && this.random() < .045;
    // Predict the horizontal position when the ball reaches the receiver after the bounce.
    const receiverZ = (this.receiver === 0 ? 1 : -1) * 10.1;
    this.interceptX = target.x + this.ball.vx * ((receiverZ - target.z) / (this.ball.vz * .88)) * .88;
  }
  returnShot(player, quality) {
    const direction = player === 0 ? -1 : 1;
    const b = this.ball;
    const targetX = player === 0 ? this.aim.x * 3.45 + (this.random() - .5) * (1 - quality) * 1.4 : (this.random() - .5) * 5.5;
    const depth = player === 0 && this.aim.depth ? 5.3 : 7.5;
    const from = { x: b.x, y: Math.max(b.y, .8), z: b.z };
    this.launch(player, from, { x: targetX, z: direction * depth }, player === 0 ? 1.28 - quality * .18 : 1.32);
    this.rallyCount++;
    this.players[player].swing = 1;
    this.event('hit', { player, quality, position: { ...from } });
  }
  serveFault(reason) {
    this.clearShotBuffer();
    this.faults++;
    if (this.faults >= 2) { this.winPoint(1 - this.score.server, 'DOUBLE FAULT'); return; }
    this.phase = 'fault'; this.phaseTime = 0; this.ball.visible = false;
    this.message('FAULT · セカンドサーブ', 1.8);
    this.event('fault', { reason });
  }
  winPoint(player, reason) {
    if (this.phase === 'point-over' || this.phase === 'finished') return;
    this.clearShotBuffer();
    const result = this.score.award(player);
    this.phase = result.match ? 'finished' : 'point-over';
    this.phaseTime = 0;
    this.ball.visible = false;
    this.pointWinner = player;
    this.pointReason = reason;
    const label = result.match ? (player === 0 ? 'YOU WIN' : 'RIVAL WINS') : result.game ? (player === 0 ? 'GAME · YOU' : 'GAME · RIVAL') : (player === 0 ? 'POINT · YOU' : 'POINT · RIVAL');
    this.message(label, 2.2);
    this.event(result.match ? 'finished' : 'point', { player, reason, game: result.game });
  }
  movePlayers(dt) {
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      p.swing = Math.max(0, p.swing - dt * 3.3);
      if (i === 0 && this.movementMode === 'manual') {
        const canMove = this.phase === 'rally' || (this.score.server === 1 && ['serve-ready', 'serve-toss'].includes(this.phase));
        const dx = canMove ? this.movement.x * 8.7 * dt : 0;
        const dz = canMove ? this.movement.z * 8.7 * dt : 0;
        const oldX = p.x, oldZ = p.z;
        p.x = clamp(p.x + dx, -5.1, 5.1);
        p.z = clamp(p.z + dz, 1.8, 12.35);
        p.moving = Math.hypot(p.x - oldX, p.z - oldZ) > .004 ? (Math.sign(dx) || Math.sign(dz)) : 0;
        continue;
      }
      if (this.phase !== 'rally') { p.moving = 0; continue; }
      const targetX = i === this.receiver ? clamp(this.interceptX, -5.1, 5.1) : this.target.x * .28;
      const speed = i === 0 ? 8.7 : 4.3;
      const delta = clamp(targetX - p.x, -speed * dt, speed * dt);
      p.x += delta;
      p.z += ((i === 0 ? 10.5 : -10.5) - p.z) * Math.min(dt * 4, 1);
      p.moving = Math.abs(delta) > .004 ? Math.sign(delta) : 0;
    }
  }
  update(dt) {
    if (this.paused || this.phase === 'finished') return;
    dt = Math.min(dt, .1) * PACES[this.pace];
    const count = Math.ceil(dt / .008);
    for (let step = 0; step < count; step++) this.step(dt / count);
  }
  step(dt) {
    if (this.phase === 'finished') return;
    this.shotBuffer = Math.max(0, this.shotBuffer - dt);
    this.elapsed += dt; this.phaseTime += dt;
    this.feedbackTime -= dt; if (this.feedbackTime <= 0) this.feedback = '';
    this.movePlayers(dt);
    if (this.phase === 'serve-ready') {
      this.resetBall();
      if (this.score.server === 1 && this.phaseTime > 1.1) { this.phase = 'serve-toss'; this.phaseTime = 0; }
      return;
    }
    if (this.phase === 'serve-toss') {
      this.ball.y = 1.15 + 5 * this.phaseTime - 3.1 * this.phaseTime ** 2;
      if (this.score.server === 1 && this.phaseTime >= .72) this.serve(1);
      else if (this.phaseTime > 1.4) this.serveFault('打ち損じ');
      return;
    }
    if (this.phase === 'fault') { if (this.phaseTime > 1.6) this.preparePoint(); return; }
    if (this.phase === 'point-over') { if (this.phaseTime > 2.2) { this.faults = 0; this.preparePoint(); } return; }
    const b = this.ball;
    const oldZ = b.z; const oldY = b.y; const oldX = b.x;
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt - .5 * GRAVITY * dt ** 2; b.vy -= GRAVITY * dt;
    if (oldZ * b.z <= 0 && oldZ !== b.z) {
      const t = -oldZ / (b.z - oldZ);
      const crossY = oldY + (b.y - oldY) * t;
      const crossX = oldX + (b.x - oldX) * t;
      if (Math.abs(crossX) < 5.6 && crossY < COURT.net + BALL_RADIUS) {
        if (this.isServe) this.serveFault('ネット'); else this.winPoint(this.receiver, 'NET');
        return;
      }
    }
    if (b.y <= BALL_RADIUS && b.vy < 0) {
      this.bounces++;
      if (this.bounces === 1) {
        const inCourt = Math.abs(b.x) <= COURT.halfWidth + BALL_RADIUS && Math.abs(b.z) <= COURT.halfLength + BALL_RADIUS && (this.receiver === 0 ? b.z > 0 : b.z < 0);
        if (this.isServe) {
          const direction = this.lastHitter === 0 ? -1 : 1;
          const side = this.score.deuceSide ? 1 : -1;
          const inBox = inCourt && Math.abs(b.z) <= COURT.serviceLine + BALL_RADIUS && b.x * direction * side >= -BALL_RADIUS;
          if (!inBox) { this.serveFault('サービスボックス外'); return; }
        } else if (!inCourt) { this.winPoint(this.receiver, 'OUT'); return; }
        b.y = BALL_RADIUS; b.vy = -b.vy * .76; b.vx *= .88; b.vz *= .88;
        this.event('bounce', { position: { x: b.x, y: .03, z: b.z } });
      } else { this.winPoint(this.lastHitter, '2 BOUNCES'); return; }
    }
    if (this.shotBuffer > 0 && this.canHit) this.hit();
    if (this.receiver === 1 && this.bounces === 1 && b.z < -9.9 && b.z > -12.7 && b.y > .2 && b.y < 2.6 && Math.abs(b.x - this.players[1].x) < 1.3 && !this.aiWillMiss) {
      this.returnShot(1, .85);
    }
    if (Math.abs(b.z) > 17 || Math.abs(b.x) > 10) this.winPoint(this.lastHitter, 'MISSED RETURN');
  }
}
