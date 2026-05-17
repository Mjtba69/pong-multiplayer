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
const MAX_SCORE = 5;
const WIN_SCORE = 5;

const rooms = {};

function createRoom(roomId) {
  rooms[roomId] = {
    players: {},
    ball: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      vx: 4,
      vy: 3,
      size: BALL_SIZE,
    },
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
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

function getPaddlePosition(slot) {
  const pad = PADDLE_HEIGHT;
  const margin = 30;
  switch (slot) {
    case 0: return { x: margin, y: GAME_HEIGHT / 2 - pad / 2, w: PADDLE_WIDTH, h: pad }; // left
    case 1: return { x: GAME_WIDTH - margin - PADDLE_WIDTH, y: GAME_HEIGHT / 2 - pad / 2, w: PADDLE_WIDTH, h: pad }; // right
    case 2: return { x: GAME_WIDTH / 2 - pad / 2, y: margin, w: pad, h: PADDLE_WIDTH }; // top
    case 3: return { x: GAME_WIDTH / 2 - pad / 2, y: GAME_HEIGHT - margin - PADDLE_WIDTH, w: pad, h: PADDLE_WIDTH }; // bottom
  }
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

  const slots = [0, 1, 2, 3];
  for (const slot of slots) {
    const playerId = room.playerSlots[slot];
    if (!playerId) continue;
    const p = room.players[playerId];
    if (!p) continue;
    const paddle = getPaddlePosition(slot);

    if (slot === 0 || slot === 1) {
      const padLeft = paddle.x;
      const padRight = paddle.x + paddle.w;
      const padTop = paddle.y;
      const padBottom = paddle.y + paddle.h;

      if (
        ball.x - ball.size / 2 <= padRight &&
        ball.x + ball.size / 2 >= padLeft &&
        ball.y + ball.size / 2 >= padTop &&
        ball.y - ball.size / 2 <= padBottom
      ) {
        ball.vx = -ball.vx * 1.05;
        ball.x = slot === 0 ? padRight + ball.size / 2 : padLeft - ball.size / 2;
        const relativeY = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
        ball.vy += relativeY * 0.5;
      }
    } else {
      const padLeft = paddle.x;
      const padRight = paddle.x + paddle.w;
      const padTop = paddle.y;
      const padBottom = paddle.y + paddle.h;

      if (
        ball.y - ball.size / 2 <= padBottom &&
        ball.y + ball.size / 2 >= padTop &&
        ball.x + ball.size / 2 >= padLeft &&
        ball.x - ball.size / 2 <= padRight
      ) {
        ball.vy = -ball.vy * 1.05;
        ball.y = slot === 2 ? padBottom + ball.size / 2 : padTop - ball.size / 2;
        const relativeX = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        ball.vx += relativeX * 0.5;
      }
    }
  }

  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const maxSpeed = 10;
  if (speed > maxSpeed) {
    ball.vx = (ball.vx / speed) * maxSpeed;
    ball.vy = (ball.vy / speed) * maxSpeed;
  }

  let scored = false;
  if (ball.x - ball.size / 2 <= 0) {
    if (room.playerSlots[0]) {
      room.scores[0] = WIN_SCORE;
      scored = true;
    }
  }
  if (ball.x + ball.size / 2 >= GAME_WIDTH) {
    if (room.playerSlots[1]) {
      room.scores[1] = WIN_SCORE;
      scored = true;
    }
  }
  if (ball.y - ball.size / 2 <= 0) {
    if (room.playerSlots[2]) {
      room.scores[2] = WIN_SCORE;
      scored = true;
    }
  }
  if (ball.y + ball.size / 2 >= GAME_HEIGHT) {
    if (room.playerSlots[3]) {
      room.scores[3] = WIN_SCORE;
      scored = true;
    }
  }

  if (scored) {
    let winner = null;
    for (const s of slots) {
      if (room.scores[s] >= WIN_SCORE && room.playerSlots[s]) {
        winner = room.playerSlots[s];
        break;
      }
    }
    room.state = 'gameover';
    clearInterval(room.loop);
    io.to(roomId).emit('gameOver', { winner, scores: room.scores });
    return;
  }

  const data = {
    ball: { x: ball.x, y: ball.y },
    scores: room.scores,
  };
  io.to(roomId).emit('gameState', data);
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
    room.players[socket.id] = {
      id: socket.id,
      name: data.name || `Player ${slot + 1}`,
      slot,
      ready: false,
    };

    socket.emit('assigned', { slot, roomId });
    io.to(roomId).emit('playersUpdate', {
      players: room.playerSlots.map((pid, i) =>
        pid ? { name: room.players[pid]?.name, slot: i } : null
      ),
    });

    if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
      setTimeout(() => {
        if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
          room.state = 'playing';
          resetBall(room);
          io.to(roomId).emit('gameStart', { scores: room.scores });

          room.loop = setInterval(() => gameLoop(roomId), 1000 / 60);
        }
      }, 2000);
    }
  });

  socket.on('paddleMove', (data) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (!player || room.state !== 'playing') return;

    const slot = player.slot;
    const paddle = getPaddlePosition(slot);

    if (slot === 0) {
      paddle.y = Math.max(0, Math.min(GAME_HEIGHT - paddle.h, data.y));
    } else if (slot === 1) {
      paddle.y = Math.max(0, Math.min(GAME_HEIGHT - paddle.h, data.y));
    } else if (slot === 2) {
      paddle.x = Math.max(0, Math.min(GAME_WIDTH - paddle.w, data.x));
    } else if (slot === 3) {
      paddle.x = Math.max(0, Math.min(GAME_WIDTH - paddle.w, data.x));
    }

    room.players[socket.id].paddle = { ...paddle };
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
        io.to(currentRoom).emit('gameOver', {
          winner: null,
          scores: room.scores,
          message: 'A player disconnected',
        });
      }

      io.to(currentRoom).emit('playersUpdate', {
        players: room.playerSlots.map((pid, i) =>
          pid ? { name: room.players[pid]?.name, slot: i } : null
        ),
      });

      const activePlayers = room.playerSlots.filter(Boolean).length;
      if (activePlayers === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pong server running on port ${PORT}`);
});
