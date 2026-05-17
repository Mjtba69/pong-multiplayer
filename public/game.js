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

const keys = {};
let ballPos = { x: 400, y: 300 };
let paddles = [
  { x: 25, y: 255 },
  { x: 763, y: 255 },
  { x: 355, y: 25 },
  { x: 355, y: 563 },
];
let scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
let players = [];
let isPlaying = false;
let countdownValue = 0;
let frameCount = 0;

const GW = 800;
const GH = 600;
const PW = 12;
const PH = 90;
const BR = 7;
const PADDLE_SPEED = 7;

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

document.getElementById('joinBtn').addEventListener('click', joinGame);
document.getElementById('leaveBtn').addEventListener('click', leaveGame);
document.getElementById('playAgainBtn').addEventListener('click', playAgain);
document.getElementById('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
document.getElementById('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
  const name = document.getElementById('nameInput').value.trim() || `Player`;
  const room = document.getElementById('roomInput').value.trim() || undefined;
  socket.emit('joinRoom', { name, room });
}

function leaveGame() { window.location.reload(); }

function playAgain() {
  gameoverOverlay.style.display = 'none';
  socket.emit('playAgain');
}

socket.on('assigned', (data) => {
  mySlot = data.slot;
  roomId = data.roomId;
  if (data.paddles) paddles = data.paddles;
  lobby.style.display = 'none';
  gameContainer.style.display = 'flex';
  const controls = ['W / S', '↑ / ↓', 'A / D', '← / →'];
  controlsInfo.textContent = `Your controls: ${controls[mySlot]}`;
  requestAnimationFrame(gameLoop);
});

socket.on('playersUpdate', (data) => {
  players = data.players || [];
  const slots = document.querySelectorAll('.slot');
  const icons = ['⬅️', '➡️', '⬆️', '️'];
  const defaults = ['️ Player 1', '➡️ Player 2', '⬆️ Player 3', '⬇️ Player 4'];
  slots.forEach((el, i) => {
    const p = players[i];
    if (p) { el.className = 'slot filled'; el.textContent = `${icons[i]} ${p.name}`; }
    else { el.className = 'slot empty'; el.textContent = defaults[i]; }
  });
});

socket.on('countdown', (data) => {
  countdownValue = data.count;
  countdownEl.style.display = 'flex';
  countdownEl.textContent = data.count;
  if (data.count === 1) {
    countdownEl.textContent = 'GO!';
    setTimeout(() => { countdownEl.style.display = 'none'; }, 500);
  }
});

socket.on('gameStart', (data) => {
  isPlaying = true;
  gameoverOverlay.style.display = 'none';
  countdownEl.style.display = 'none';
  if (data && data.scores) { scores = data.scores; updateScoreboard(scores); }
  if (data && data.paddles) paddles = data.paddles;
});

socket.on('gameState', (data) => {
  if (data.ball) ballPos = data.ball;
  if (data.paddles) {
    for (let i = 0; i < 4; i++) {
      if (data.paddles[i] && i !== mySlot) {
        paddles[i] = data.paddles[i];
      }
    }
  }
  if (data.scores) { scores = data.scores; updateScoreboard(scores); }
});

socket.on('gameOver', (data) => {
  isPlaying = false;
  gameoverOverlay.style.display = 'flex';
  const winner = data.winner;
  const scoreText = Object.entries(data.scores || {}).map(([s, sc]) => `${['P1','P2','P3','P4'][s]}: ${sc}`).join('  |  ');
  document.getElementById('gameover-detail').textContent = scoreText;

  if (winner === socket.id) {
    document.getElementById('winner-text').className = 'winner';
    document.getElementById('winner-text').textContent = '🏆 You Win!';
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
    el.innerHTML = `${labels[slot]}<span class="score-num" style="color:${colors[slot]}">${score}</span>`;
    scoreboard.appendChild(el);
  });
}

function drawGame() {
  ctx.clearRect(0, 0, GW, GH);

  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, GW, GH);

  ctx.strokeStyle = '#1a1d27';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, GW - 2, GH - 2);

  ctx.strokeStyle = '#252836';
  ctx.setLineDash([10, 15]);
  ctx.beginPath(); ctx.moveTo(GW / 2, 0); ctx.lineTo(GW / 2, GH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, GH / 2); ctx.lineTo(GW, GH / 2); ctx.stroke();
  ctx.setLineDash([]);

  const colors = ['#6ee7b7', '#f59e0b', '#3b82f6', '#ef4444'];

  for (let slot = 0; slot < 4; slot++) {
    if (!players[slot]) continue;
    const p = paddles[slot];
    if (!p) continue;

    const isMe = slot === mySlot;
    const color = colors[slot];
    let px, py, pw, ph;

    if (slot === 0) { px = p.x; py = p.y; pw = PW; ph = PH; }
    else if (slot === 1) { px = p.x; py = p.y; pw = PW; ph = PH; }
    else if (slot === 2) { px = p.x; py = p.y; pw = PH; ph = PW; }
    else { px = p.x; py = p.y; pw = PH; ph = PW; }

    ctx.shadowColor = isMe ? color : 'transparent';
    ctx.shadowBlur = isMe ? 12 : 0;
    ctx.fillStyle = isMe ? color : color + '55';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 6);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isMe) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const labelX = px + pw / 2;
      let labelY;
      if (slot === 0) labelY = py + ph + 16;
      else if (slot === 1) labelY = py - 8;
      else if (slot === 2) labelY = py - 8;
      else labelY = py + ph + 16;
      ctx.fillText('YOU', labelX, labelY);
    }
  }

  if (ballPos) {
    ctx.shadowColor = '#6ee7b7';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#6ee7b7';
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, BR * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
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
