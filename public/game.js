const socket = io();
let mySlot = -1;
let roomId = '';

const lobby = document.getElementById('lobby');
const gameContainer = document.getElementById('game-container');
const gameoverOverlay = document.getElementById('gameover-overlay');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const controlsInfo = document.getElementById('controls-info');
const countdownEl = document.getElementById('countdown');

const dpr = window.devicePixelRatio || 1;
canvas.width = 800 * dpr;
canvas.height = 600 * dpr;
canvas.style.width = '800px';
canvas.style.height = '600px';
ctx.scale(dpr, dpr);

const keys = {};
let ballPos = { x: 400, y: 300 };
let trail = [];
let particles = [];
let paddles = [
  { x: 25, y: 255 }, { x: 763, y: 255 },
  { x: 355, y: 25 }, { x: 355, y: 563 },
];
let scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
let players = [];
let isPlaying = false;
let frameCount = 0;
let ballSpeed = 0;
let screenShake = 0;
let scorePop = {};
let stars = [];

const GW = 800, GH = 600, PW = 12, PH = 90, BR = 7, PADDLE_SPEED = 7;

for (let i = 0; i < 80; i++) {
  stars.push({ x: Math.random() * GW, y: Math.random() * GH, s: 0.5 + Math.random() * 1.5, b: Math.random() });
}

const sounds = {};
function initAudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  sounds.hit = () => { const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.value = 440; g.gain.value = 0.08; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1); o.start(); o.stop(ac.currentTime + 0.1); };
  sounds.score = () => { const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'square'; o.frequency.value = 660; g.gain.value = 0.12; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3); o.start(); o.stop(ac.currentTime + 0.3); };
  sounds.win = () => { [523, 659, 784, 1047].forEach((f, i) => { const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.1; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15 + i * 0.12); o.start(ac.currentTime + i * 0.12); o.stop(ac.currentTime + 0.3 + i * 0.12); }); };
  sounds.wall = () => { const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'triangle'; o.frequency.value = 220; g.gain.value = 0.05; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05); o.start(); o.stop(ac.currentTime + 0.05); };
  sounds.count = () => { const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15); o.start(); o.stop(ac.currentTime + 0.15); };
}

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

document.addEventListener('click', () => { if (!sounds.hit) initAudio(); }, { once: true });

document.getElementById('joinBtn').addEventListener('click', joinGame);
document.getElementById('leaveBtn').addEventListener('click', () => { window.location.reload(); });
document.getElementById('playAgainBtn').addEventListener('click', playAgain);
document.getElementById('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
document.getElementById('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
document.getElementById('copyBtn').addEventListener('click', copyRoom);

function joinGame() {
  const name = document.getElementById('nameInput').value.trim() || 'Player';
  const room = document.getElementById('roomInput').value.trim() || undefined;
  socket.emit('joinRoom', { name, room });
}

function playAgain() {
  gameoverOverlay.style.display = 'none';
  socket.emit('playAgain');
}

function copyRoom() {
  if (roomId) {
    navigator.clipboard.writeText(roomId);
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Room Code'; }, 2000);
  }
}

socket.on('assigned', (data) => {
  mySlot = data.slot;
  roomId = data.roomId;
  if (data.paddles) paddles = data.paddles;
  lobby.style.display = 'none';
  gameContainer.style.display = 'flex';
  document.getElementById('roomBadge').textContent = `Room: ${roomId}`;
  const controls = ['W / S', '↑ / ↓', 'A / D', '← / →'];
  controlsInfo.textContent = `Your controls: ${controls[mySlot]}`;
  requestAnimationFrame(gameLoop);
});

socket.on('playersUpdate', (data) => {
  players = data.players || [];
  document.getElementById('playerCount').textContent = `${players.filter(Boolean).length}/4`;
  const slots = document.querySelectorAll('.slot');
  const defaults = ['⬅️ Player 1', '➡️ Player 2', '⬆️ Player 3', '⬇️ Player 4'];
  slots.forEach((el, i) => {
    const p = players[i];
    if (p) { el.className = 'slot filled'; el.innerHTML = `${['⬅️','➡️','⬆️','⬇️'][i]} ${p.name}`; }
    else { el.className = 'slot empty'; el.textContent = defaults[i]; }
  });
});

socket.on('countdown', (data) => {
  countdownEl.style.display = 'flex';
  countdownEl.textContent = data.count;
  countdownEl.style.animation = 'none';
  void countdownEl.offsetHeight;
  countdownEl.style.animation = 'countPulse 0.6s ease-out';
  if (sounds.count) sounds.count();

  if (data.count === 1) {
    setTimeout(() => {
      countdownEl.textContent = 'GO!';
      countdownEl.style.animation = 'none';
      void countdownEl.offsetHeight;
      countdownEl.style.animation = 'countPulse 0.5s ease-out';
      if (sounds.count) { sounds.count(); setTimeout(() => sounds.count(), 100); }
      setTimeout(() => { countdownEl.style.display = 'none'; }, 600);
    }, 900);
  }
});

socket.on('gameStart', (data) => {
  isPlaying = true;
  gameoverOverlay.style.display = 'none';
  countdownEl.style.display = 'none';
  trail = [];
  particles = [];
  screenShake = 0;
  if (data && data.scores) { scores = data.scores; updateScoreboard(scores); }
  if (data && data.paddles) paddles = data.paddles;
});

socket.on('gameState', (data) => {
  if (data.ball) ballPos = data.ball;
  if (data.trail) trail = data.trail;
  if (data.particles) particles = data.particles;
  if (data.ballSpeed !== undefined) ballSpeed = data.ballSpeed;
  if (data.paddles) {
    for (let i = 0; i < 4; i++) {
      if (data.paddles[i] && i !== mySlot) paddles[i] = data.paddles[i];
    }
  }
  if (data.scores) { scores = data.scores; updateScoreboard(scores); }
});

socket.on('scoreFlash', (data) => {
  screenShake = 8;
  scorePop[data.slot] = { time: 1 };
  if (sounds.score) sounds.score();
});

socket.on('gameOver', (data) => {
  isPlaying = false;
  gameoverOverlay.style.display = 'flex';
  const winner = data.winner;
  const s = Object.entries(data.scores || {});
  const scoreText = s.map(([sl, sc]) => `${['P1','P2','P3','P4'][sl]}: ${sc}`).join('  |  ');
  document.getElementById('gameover-detail').textContent = scoreText;

  if (winner === socket.id) {
    document.getElementById('winner-text').className = 'winner';
    document.getElementById('winner-text').textContent = '🏆 You Win!';
    if (sounds.win) sounds.win();
  } else if (data.message) {
    document.getElementById('winner-text').className = 'loser';
    document.getElementById('winner-text').textContent = data.message;
  } else {
    document.getElementById('winner-text').className = 'loser';
    document.getElementById('winner-text').textContent = 'Game Over';
  }
});

socket.on('playAgain', (data) => {
  isPlaying = false;
  if (data && data.scores) { scores = data.scores; updateScoreboard(scores); }
  if (data && data.paddles) paddles = data.paddles;
  ballPos = { x: GW / 2, y: GH / 2 };
  trail = [];
  particles = [];
  screenShake = 0;
});

socket.on('roomFull', (data) => { alert(data.message); });

function updateScoreboard(s) {
  scoreboard.innerHTML = '';
  const labels = ['P1', 'P2', 'P3', 'P4'];
  const colors = ['#6ee7b7', '#f59e0b', '#3b82f6', '#ef4444'];
  Object.entries(s || {}).forEach(([slot, score]) => {
    const el = document.createElement('div');
    el.className = 'score-item';
    el.style.borderColor = colors[slot] + '44';
    const pop = scorePop[slot];
    const anim = pop ? `scorePop 0.3s ease-out` : '';
    el.style.animation = anim;
    el.innerHTML = `${labels[slot]}<span class="score-num" style="color:${colors[slot]}">${score}</span>`;
    scoreboard.appendChild(el);
  });
}

function drawGame() {
  ctx.save();

  if (screenShake > 0) {
    const sx = (Math.random() - 0.5) * screenShake;
    const sy = (Math.random() - 0.5) * screenShake;
    ctx.translate(sx, sy);
    screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
  }

  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, GW, GH);

  stars.forEach(st => {
    st.b += 0.005;
    const alpha = 0.3 + Math.sin(st.b) * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2);
    ctx.fill();
  });

  const colors = ['#6ee7b7', '#f59e0b', '#3b82f6', '#ef4444'];
  for (let i = 0; i < 4; i++) {
    const grad = ctx.createLinearGradient(0, 0, i < 2 ? 0 : GW, i < 2 ? GH : 0);
    grad.addColorStop(0, colors[i] + '15');
    grad.addColorStop(0.5, colors[i] + '08');
    grad.addColorStop(1, colors[i] + '00');
    ctx.fillStyle = grad;

    if (i === 0) ctx.fillRect(0, 0, 4, GH);
    else if (i === 1) ctx.fillRect(GW - 4, 0, 4, GH);
    else if (i === 2) ctx.fillRect(0, 0, GW, 4);
    else ctx.fillRect(0, GH - 4, GW, 4);
  }

  ctx.strokeStyle = '#1a1d27';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, GW - 2, GH - 2);

  const pulse = 0.5 + Math.sin(Date.now() / 800) * 0.3;
  ctx.strokeStyle = `rgba(37,40,54,${pulse})`;
  ctx.setLineDash([10, 15]);
  ctx.beginPath(); ctx.moveTo(GW / 2, 0); ctx.lineTo(GW / 2, GH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, GH / 2); ctx.lineTo(GW, GH / 2); ctx.stroke();
  ctx.setLineDash([]);

  trail.forEach((t, i) => {
    const alpha = (i / trail.length) * 0.25;
    ctx.fillStyle = `rgba(110,231,183,${alpha})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, BR * (0.3 + (i / trail.length) * 0.7), 0, Math.PI * 2);
    ctx.fill();
  });

  particles.forEach(pt => {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  for (let slot = 0; slot < 4; slot++) {
    const p = paddles[slot];
    if (!p) continue;

    const isMe = slot === mySlot;
    const color = colors[slot];
    let px, py, pw, ph;

    if (slot === 0) { px = p.x; py = p.y; pw = PW; ph = PH; }
    else if (slot === 1) { px = p.x; py = p.y; pw = PW; ph = PH; }
    else { px = p.x; py = p.y; pw = PH; ph = PW; }

    if (isMe) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15 + Math.sin(Date.now() / 300) * 5;
      const grad = ctx.createLinearGradient(px, py, px + (slot < 2 ? pw : 0), py + (slot < 2 ? 0 : ph));
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '88');
      ctx.fillStyle = grad;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = color + '44';
    }

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, [6, 6, 6, 6]);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isMe) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const labelX = px + pw / 2;
      const labelY = slot <= 1 ? (slot === 0 ? py + ph + 14 : py - 8) : (slot === 2 ? py - 8 : py + ph + 16);
      ctx.fillText('YOU', labelX, labelY);
    }

    if (players[slot]) {
      ctx.fillStyle = color + 'aa';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      const nameX = px + pw / 2;
      const nameY = slot <= 1 ? (slot === 0 ? py + ph + 26 : py - 18) : (slot === 2 ? py - 18 : py + ph + 28);
      ctx.fillText(players[slot].name, nameX, nameY);
    }
  }

  if (ballPos) {
    const glow = 15 + Math.sin(Date.now() / 200) * 5;
    ctx.shadowColor = '#6ee7b7';
    ctx.shadowBlur = glow;
    ctx.fillStyle = '#6ee7b7';
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(ballPos.x - 2, ballPos.y - 2, BR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isPlaying) {
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`speed: ${ballSpeed.toFixed(1)}`, GW - 10, GH - 10);
  }

  ctx.restore();
}

function gameLoop() {
  frameCount++;

  if (isPlaying && mySlot >= 0) {
    if (mySlot === 0) {
      if (keys['w'] || keys['W']) paddles[0].y = Math.max(0, paddles[0].y - PADDLE_SPEED);
      if (keys['s'] || keys['S']) paddles[0].y = Math.min(GH - PH, paddles[0].y + PADDLE_SPEED);
    } else if (mySlot === 1) {
      if (keys['ArrowUp']) paddles[1].y = Math.max(0, paddles[1].y - PADDLE_SPEED);
      if (keys['ArrowDown']) paddles[1].y = Math.min(GH - PH, paddles[1].y + PADDLE_SPEED);
    } else if (mySlot === 2) {
      if (keys['a'] || keys['A']) paddles[2].x = Math.max(0, paddles[2].x - PADDLE_SPEED);
      if (keys['d'] || keys['D']) paddles[2].x = Math.min(GW - PH, paddles[2].x + PADDLE_SPEED);
    } else if (mySlot === 3) {
      if (keys['ArrowLeft']) paddles[3].x = Math.max(0, paddles[3].x - PADDLE_SPEED);
      if (keys['ArrowRight']) paddles[3].x = Math.min(GW - PH, paddles[3].x + PADDLE_SPEED);
    }

    if (frameCount % 2 === 0) {
      if (mySlot === 0 || mySlot === 1) {
        socket.emit('paddleMove', { y: paddles[mySlot].y });
      } else {
        socket.emit('paddleMove', { x: paddles[mySlot].x });
      }
    }
  }

  Object.keys(scorePop).forEach(k => {
    scorePop[k].time -= 0.03;
    if (scorePop[k].time <= 0) delete scorePop[k];
  });

  drawGame();
  requestAnimationFrame(gameLoop);
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    const [tl, tr, br, bl] = r;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}
