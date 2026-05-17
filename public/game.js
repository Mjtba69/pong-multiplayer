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
let gameState = null;
let players = [];
let myPaddleY = 300;
let myPaddleX = 400;
let isPlaying = false;

const PADDLE_W = 12;
const PADDLE_H = 80;
const MARGIN = 30;
const GAME_W = 800;
const GAME_H = 600;
const PADDLE_SPEED = 5;

document.addEventListener('keydown', (e) => { keys[e.key] = true; e.preventDefault(); });
document.addEventListener('keyup', (e) => { keys[e.key] = false; e.preventDefault(); });

document.getElementById('joinBtn').addEventListener('click', joinGame);
document.getElementById('leaveBtn').addEventListener('click', leaveGame);
document.getElementById('playAgainBtn').addEventListener('click', () => {
  gameoverOverlay.style.display = 'none';
});

document.getElementById('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});
document.getElementById('roomInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

function joinGame() {
  playerName = document.getElementById('nameInput').value.trim() || `Player`;
  const room = document.getElementById('roomInput').value.trim() || undefined;
  socket.emit('joinRoom', { name: playerName, room });
}

function leaveGame() {
  window.location.reload();
}

socket.on('assigned', (data) => {
  mySlot = data.slot;
  roomId = data.roomId;
  lobby.style.display = 'none';
  gameContainer.style.display = 'flex';

  const controls = ['W/S', '↑/↓', 'A/D', '←/→'];
  controlsInfo.textContent = `${controls[mySlot] || 'W/S'} to move paddle`;

  switch (mySlot) {
    case 0: myPaddleY = 300; break;
    case 1: myPaddleY = 300; break;
    case 2: myPaddleX = 400; break;
    case 3: myPaddleX = 400; break;
  }
});

socket.on('playersUpdate', (data) => {
  players = data.players || [];
  const slots = document.querySelectorAll('.slot');
  slots.forEach((el, i) => {
    const p = players[i];
    if (p) {
      el.className = 'slot filled';
      el.textContent = `${['⬅️', '➡️', '⬆️', '⬇️'][i]} ${p.name}`;
    } else {
      el.className = 'slot empty';
      el.textContent = `${['⬅️ Player 1', '➡️ Player 2', '⬆️ Player 3', '⬇️ Player 4'][i]}`;
    }
  });
});

socket.on('gameStart', (data) => {
  isPlaying = true;
  gameState = 'playing';
  gameoverOverlay.style.display = 'none';
  if (data && data.scores) updateScoreboard(data.scores);
  requestAnimationFrame(gameLoop);
});

socket.on('gameState', (data) => {
  if (gameState === 'playing') {
    gameState = data;
  }
});

socket.on('gameOver', (data) => {
  isPlaying = false;
  gameState = 'gameover';
  const winner = data.winner;
  const scores = data.scores || {};
  updateScoreboard(scores);

  const winnerName = winner && socket.id === winner ? 'You' : (players.find((_, i) => {
    const pid = players[i] ? i : -1;
    return false;
  })?.name || 'Someone');
  gameoverOverlay.style.display = 'flex';

  if (winner === socket.id) {
    document.getElementById('winner-text').className = 'winner';
    document.getElementById('winner-text').textContent = '🏆 You Win!';
  } else {
    document.getElementById('winner-text').className = 'loser';
    document.getElementById('winner-text').textContent = 'Game Over';
  }

  const scoreText = Object.entries(scores)
    .map(([slot, score]) => `${['P1','P2','P3','P4'][slot]}: ${score}`)
    .join(' | ');
  document.getElementById('gameover-detail').textContent = scoreText;
});

socket.on('roomFull', (data) => {
  alert(data.message);
});

function updateScoreboard(scores) {
  scoreboard.innerHTML = '';
  const labels = ['P1', 'P2', 'P3', 'P4'];
  Object.entries(scores || {}).forEach(([slot, score]) => {
    const el = document.createElement('div');
    el.className = 'score-item';
    el.innerHTML = `${labels[slot]}<span class="score-num">${score}</span>`;
    scoreboard.appendChild(el);
  });
}

function drawGame() {
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  ctx.strokeStyle = '#1a1d27';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, GAME_W - 2, GAME_H - 2);

  ctx.strokeStyle = '#252836';
  ctx.setLineDash([10, 15]);
  ctx.beginPath();
  ctx.moveTo(GAME_W / 2, 0);
  ctx.lineTo(GAME_W / 2, GAME_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, GAME_H / 2);
  ctx.lineTo(GAME_W, GAME_H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const ball = gameState && gameState.ball;
  if (ball) {
    ctx.shadowColor = '#6ee7b7';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#6ee7b7';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const colors = ['#6ee7b7', '#f59e0b', '#3b82f6', '#ef4444'];
  const labels = ['⬅️', '➡️', '⬆️', '⬇️'];

  players.forEach((p, slot) => {
    if (!p) return;

    const isMe = slot === mySlot;
    const color = colors[slot] || '#6ee7b7';
    let px, py, pw, ph;

    if (slot === 0) { px = MARGIN; py = myPaddleY; pw = PADDLE_W; ph = PADDLE_H; }
    else if (slot === 1) { px = GAME_W - MARGIN - PADDLE_W; py = myPaddleY; pw = PADDLE_W; ph = PADDLE_H; }
    else if (slot === 2) { px = myPaddleX; py = MARGIN; pw = PADDLE_H; ph = PADDLE_W; }
    else if (slot === 3) { px = myPaddleX; py = GAME_H - MARGIN - PADDLE_W; pw = PADDLE_H; ph = PADDLE_W; }

    ctx.shadowColor = isMe ? color : 'transparent';
    ctx.shadowBlur = isMe ? 10 : 0;
    ctx.fillStyle = isMe ? color : `${color}66`;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isMe) {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const labelX = slot <= 1 ? px + pw / 2 : px + pw / 2;
      const labelY = slot <= 1 ? (slot === 0 ? py + ph + 18 : py - 10) : (slot === 2 ? py + pw / 2 + 4 : py + pw / 2 + 4);
      ctx.fillText('YOU', labelX, labelY);
    }
  });
}

function gameLoop() {
  if (!isPlaying) return;

  if (mySlot >= 0 && gameState === 'playing') {
    if (mySlot === 0) {
      if (keys['w'] || keys['W']) myPaddleY = Math.max(0, myPaddleY - PADDLE_SPEED);
      if (keys['s'] || keys['S']) myPaddleY = Math.min(GAME_H - PADDLE_H, myPaddleY + PADDLE_SPEED);
      socket.emit('paddleMove', { y: myPaddleY });
    } else if (mySlot === 1) {
      if (keys['ArrowUp']) myPaddleY = Math.max(0, myPaddleY - PADDLE_SPEED);
      if (keys['ArrowDown']) myPaddleY = Math.min(GAME_H - PADDLE_H, myPaddleY + PADDLE_SPEED);
      socket.emit('paddleMove', { y: myPaddleY });
    } else if (mySlot === 2) {
      if (keys['a'] || keys['A']) myPaddleX = Math.max(0, myPaddleX - PADDLE_SPEED);
      if (keys['d'] || keys['D']) myPaddleX = Math.min(GAME_W - PADDLE_H, myPaddleX + PADDLE_SPEED);
      socket.emit('paddleMove', { x: myPaddleX });
    } else if (mySlot === 3) {
      if (keys['ArrowLeft']) myPaddleX = Math.max(0, myPaddleX - PADDLE_SPEED);
      if (keys['ArrowRight']) myPaddleX = Math.min(GAME_W - PADDLE_H, myPaddleX + PADDLE_SPEED);
      socket.emit('paddleMove', { x: myPaddleX });
    }
  }

  drawGame();
  requestAnimationFrame(gameLoop);
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    return this;
  };
}
