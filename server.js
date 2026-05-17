const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 14;
const PADDLE_SPEED = 5;
const WIN_SCORE = 5;

const rooms = {};

function createRoom(roomId) {
  rooms[roomId] = {
    players: {},
    ball: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, vx: 4, vy: 3, size: BALL_SIZE },
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    paddles: [
      { x: 30, y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
      { x: GAME_WIDTH - 30 - PADDLE_WIDTH, y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
      { x: GAME_WIDTH / 2 - PADDLE_HEIGHT / 2, y: 30 },
      { x: GAME_WIDTH / 2 - PADDLE_HEIGHT / 2, y: GAME_HEIGHT - 30 - PADDLE_WIDTH },
    ],
    state: 'waiting',
    loop: null,
    playerSlots: [null, null, null, null],
  };
  return rooms[roomId];
}

function getPlayerSlot(room) {
  for (let i = 0; i < 4; i++) {
    if (!room.playerSlots[i]) return i;
  }
  return -1;
}

function resetBall(room) {
  room.ball.x = GAME_WIDTH / 2;
  room.ball.y = GAME_HEIGHT / 2;
  const angle = Math.random() * Math.PI * 2;
  const speed = 4 + Math.random() * 2;
  room.ball.vx = Math.cos(angle) * speed;
  room.ball.vy = Math.sin(angle) * speed;
}

function gameLoop(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== 'playing') return;

  const ball = room.ball;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Paddle collision - left (0) and right (1)
  for (let slot = 0; slot <= 1; slot++) {
    const pid = room.playerSlots[slot];
    if (!pid) continue;
    const p = room.paddles[slot];
    const padLeft = p.x;
    const padRight = p.x + PADDLE_WIDTH;
    const padTop = p.y;
    const padBottom = p.y + PADDLE_HEIGHT;

    if (ball.x - ball.size / 2 <= padRight && ball.x + ball.size / 2 >= padLeft &&
        ball.y + ball.size / 2 >= padTop && ball.y - ball.size / 2 <= padBottom) {
      ball.vx = -ball.vx * 1.05;
      ball.x = slot === 0 ? padRight + ball.size / 2 : padLeft - ball.size / 2;
      const relY = (ball.y - (p.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.vy += relY * 0.5;
    }
  }

  // Paddle collision - top (2) and bottom (3)
  for (let slot = 2; slot <= 3; slot++) {
    const pid = room.playerSlots[slot];
    if (!pid) continue;
    const p = room.paddles[slot];
    const padLeft = p.x;
    const padRight = p.x + PADDLE_HEIGHT;
    const padTop = p.y;
    const padBottom = p.y + PADDLE_WIDTH;

    if (ball.y - ball.size / 2 <= padBottom && ball.y + ball.size / 2 >= padTop &&
        ball.x + ball.size / 2 >= padLeft && ball.x - ball.size / 2 <= padRight) {
      ball.vy = -ball.vy * 1.05;
      ball.y = slot === 2 ? padBottom + ball.size / 2 : padTop - ball.size / 2;
      const relX = (ball.x - (p.x + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.vx += relX * 0.5;
    }
  }

  // Speed cap
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (speed > 10) {
    ball.vx = (ball.vx / speed) * 10;
    ball.vy = (ball.vy / speed) * 10;
  }

  // Scoring
  let scored = false;
  if (ball.x - ball.size / 2 <= 0 && room.playerSlots[0]) { room.scores[0] = WIN_SCORE; scored = true; }
  if (ball.x + ball.size / 2 >= GAME_WIDTH && room.playerSlots[1]) { room.scores[1] = WIN_SCORE; scored = true; }
  if (ball.y - ball.size / 2 <= 0 && room.playerSlots[2]) { room.scores[2] = WIN_SCORE; scored = true; }
  if (ball.y + ball.size / 2 >= GAME_HEIGHT && room.playerSlots[3]) { room.scores[3] = WIN_SCORE; scored = true; }

  if (scored) {
    let winner = null;
    for (let s = 0; s < 4; s++) {
      if (room.scores[s] >= WIN_SCORE && room.playerSlots[s]) { winner = room.playerSlots[s]; break; }
    }
    room.state = 'gameover';
    clearInterval(room.loop);
    io.to(roomId).emit('gameOver', { winner, scores: room.scores });
    return;
  }

  io.to(roomId).emit('gameState', {
    ball: { x: ball.x, y: ball.y },
    paddles: room.paddles,
    scores: room.scores,
  });
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('joinRoom', (data) => {
    const roomId = (data && data.room) || 'lobby';
    if (!rooms[roomId]) createRoom(roomId);
    const room = rooms[roomId];
    const slot = getPlayerSlot(room);

    if (slot === -1) {
      socket.emit('roomFull', { message: 'Room is full (max 4 players)' });
      return;
    }

    currentRoom = roomId;
    socket.join(roomId);
    room.playerSlots[slot] = socket.id;
    room.players[socket.id] = { id: socket.id, name: data.name || `Player ${slot + 1}`, slot, ready: false };

    socket.emit('assigned', { slot, roomId, paddles: room.paddles });
    io.to(roomId).emit('playersUpdate', {
      players: room.playerSlots.map((pid, i) => pid ? { name: room.players[pid]?.name, slot: i } : null),
    });

    if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
      setTimeout(() => {
        if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
          room.state = 'playing';
          resetBall(room);
          io.to(roomId).emit('gameStart', { scores: room.scores, paddles: room.paddles });
          room.loop = setInterval(() => gameLoop(roomId), 1000 / 60);
        }
      }, 1500);
    }
  });

  socket.on('paddleMove', (data) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (!player || room.state !== 'playing') return;

    const slot = player.slot;
    if (slot === 0 || slot === 1) {
      room.paddles[slot].y = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, data.y));
    } else {
      room.paddles[slot].x = Math.max(0, Math.min(GAME_WIDTH - PADDLE_HEIGHT, data.x));
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (player) {
      room.playerSlots[player.slot] = null;
      delete room.players[socket.id];

      if (room.state === 'playing') {
        room.state = 'gameover';
        clearInterval(room.loop);
        io.to(currentRoom).emit('gameOver', { winner: null, scores: room.scores, message: 'A player disconnected' });
      }

      io.to(currentRoom).emit('playersUpdate', {
        players: room.playerSlots.map((pid, i) => pid ? { name: room.players[pid]?.name, slot: i } : null),
      });

      if (room.playerSlots.filter(Boolean).length === 0) delete rooms[currentRoom];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pong server running on port ${PORT}`);
});
