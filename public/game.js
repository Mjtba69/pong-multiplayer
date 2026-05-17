const socket = io();
let mySlot = -1;
let roomId = '';
let playerName = '';

const lobby = document.getElementById('lobby');
const gameContainer = document.getElementById('game-container');
const gameoverOverlay = document.getElementById('gameover-overlay');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const controlsInfo = document.getElementById('controls-info');

const keys = {};
let ballPos = null;
let paddles = [null, null, null, null];
let scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
let players = [];
let isPlaying = false;

const GAME_W = 800;
const GAME_H = 600;
const PADDLE_W = 12;
const PADDLE_H = 80;
const PADDLE_SPEED = 5;

document.addEventListener('keydown', (e) => { keys[e.key] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); });
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

document.getElementById('joinBtn').addEventListener('click', joinGame);
document.getElementById('leaveBtn').addEventListener('click', leaveGame);
document.getElementById('playAgainBtn').addEventListener('click', () => { gameoverOverlay.style.display = 'none'; });
document.getElementById('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
document.getElementById('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
  playerName = document.getElementById('nameInput').value.trim() || `Player`;
  const room = document.getElementById('roomInput').value.trim() || undefined;
  socket.emit('joinRoom', { name: playerName, room });
}

function leaveGame() { window.location.reload(); }

socket.on('assigned', (data) => {
  mySlot = data.slot;
  roomId = data.roomId;
  if (data.paddles) paddles = data.paddles;
  lobby.style.display = 'none';
  gameContainer.style.display = 'flex';
  const controls = ['W/S', '↑/↓', 'A/D', '←/→'];
  controlsInfo.textContent = `${controls[mySlot] || 'W/S'} to move paddle`;
  requestAnimationFrame(gameLoop);
});

socket.on('playersUpdate', (data) => {
  players = data.players || [];
  const slots = document.querySelectorAll('.slot');
  const icons = ['️', '➡️', '️', '⬇️'];
  const defaults = ['⬅️ Player 1', '➡️ Player 2', '⬆️ Player 3', '⬇️ Player 4'];
  slots.forEach((el, i) => {
    const p = players[i];
    if (p) { el.className = 'slot filled'; el.textContent = `${icons[i]} ${p.name}`; }
    else { el.className = 'slot empty'; el.textContent = defaults[i]; }
  });
});

socket.on('gameStart', (data) => {
  isPlaying = true;
  gameoverOverlay.style.display = 'none';
  if (data && data.scores) { scores = data.scores; updateScoreboard(scores); }
  if (data && data.paddles) paddles = data.paddles;
});

socket.on('gameState', (data) => {
  if (data.ball) ballPos = data.ball;
  if (data.paddles) paddles = data.paddles;
  if (data.scores) { scores = data.scores; updateScoreboard(scores); }
});

socket.on('gameOver', (data) => {
  isPlaying = false;
  gameoverOverlay.style.display = 'flex';
  const winner = data.winner;
  const scoreText = Object.entries(data.scores || {}).map(([s, sc]) => `${['P1','P2','P3','P4'][s]}: ${sc}`).join(' | ');
  document.getElementById('gameover-detail').textContent = scoreText;

  if (winner === socket.id) {
    document.getElementById('winner-text').className = 'winner';
    document.getElementById('winner-text').textContent = '🏆 You Win!';
  } else {
    document.getElementById('winner-text').className = 'loser';
    document.getElementById('winner-text').textContent = 'Game Over';
  }
});

socket.on('roomFull', (data) => { alert(data.message); });

function updateScoreboard(s) {
  scoreboard.innerHTML = '';
  const labels = ['P1', 'P2', 'P3', 'P4'];
  Object.entries(s || {}).forEach(([slot, score]) => {
    const el = document.createElement('div');
    el.className = 'score-item';
    el.innerHTML = `${labels[slot]}<span class="score-num">${score}</span>`;
    scoreboard.appendChild(el);
  });
}

function drawGame() {
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  // Border
  ctx.strokeStyle = '#1a1d27';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, GAME_W - 2, GAME_H - 2);

  // Center lines
  ctx.strokeStyle = '#252836';
  ctx.setLineDash([10, 15]);
  ctx.beginPath(); ctx.moveTo(GAME_W / 2, 0); ctx.lineTo(GAME_W / 2, GAME_H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, GAME_H / 2); ctx.lineTo(GAME_W, GAME_H / 2); ctx.stroke();
  ctx.setLineDash([]);

  // Ball
  if (ballPos) {
    ctx.shadowColor = '#6ee7b7';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#6ee7b7';
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Paddles
  const colors = ['#6ee7b7', '#f59e0b', '#3b82f6', '#ef4444'];
  const icons = ['️', '➡️', '⬆️', '⬇️'];

  for (let slot = 0; slot < 4; slot++) {
    if (!players[slot]) continue;
    const p = paddles[slot];
    if (!p) continue;

    const isMe = slot === mySlot;
    const color = colors[slot];
    let px, py, pw, ph;

    if (slot === 0) { px = p.x; py = p.y; pw = PADDLE_W; ph = PADDLE_H; }
    else if (slot === 1) { px = p.x; py = p.y; pw = PADDLE_W; ph = PADDLE_H; }
    else if (slot === 2) { px = p.x; py = p.y; pw = PADDLE_H; ph = PADDLE_W; }
    else if (slot === 3) { px = p.x; py = p.y; pw = PADDLE_H; ph = PADDLE_W; }

    ctx.shadowColor = isMe ? color : 'transparent';
    ctx.shadowBlur = isMe ? 10 : 0;
    ctx.fillStyle = isMe ? color : color + '66';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 6);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isMe) {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const labelX = px + pw / 2;
      let labelY;
      if (slot === 0) labelY = py + ph + 16;
      else if (slot === 1) labelY = py - 8;
      else if (slot === 2) labelY = py + ph / 2 + 4;
      else labelY = py + ph / 2 + 4;
      ctx.fillText('YOU', labelX, labelY);
    }
  }
}

function gameLoop() {
  if (isPlaying && mySlot >= 0) {
    if (mySlot === 0) {
      if (keys['w'] || keys['W']) paddles[0].y = Math.max(0, paddles[0].y - PADDLE_SPEED);
      if (keys['s'] || keys['S']) paddles[0].y = Math.min(GAME_H - PADDLE_H, paddles[0].y + PADDLE_SPEED);
      socket.emit('paddleMove', { y: paddles[0].y });
    } else if (mySlot === 1) {
      if (keys['ArrowUp']) paddles[1].y = Math.max(0, paddles[1].y - PADDLE_SPEED);
      if (keys['ArrowDown']) paddles[1].y = Math.min(GAME_H - PADDLE_H, paddles[1].y + PADDLE_SPEED);
      socket.emit('paddleMove', { y: paddles[1].y });
    } else if (mySlot === 2) {
      if (keys['a'] || keys['A']) paddles[2].x = Math.max(0, paddles[2].x - PADDLE_SPEED);
      if (keys['d'] || keys['D']) paddles[2].x = Math.min(GAME_W - PADDLE_H, paddles[2].x + PADDLE_SPEED);
      socket.emit('paddleMove', { x: paddles[2].x });
    } else if (mySlot === 3) {
      if (keys['ArrowLeft']) paddles[3].x = Math.max(0, paddles[3].x - PADDLE_SPEED);
      if (keys['ArrowRight']) paddles[3].x = Math.min(GAME_W - PADDLE_H, paddles[3].x + PADDLE_SPEED);
      socket.emit('paddleMove', { x: paddles[3].x });
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
