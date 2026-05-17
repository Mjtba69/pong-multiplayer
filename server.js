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

const GW = 800;
const GH = 600;
const PW = 12;
const PH = 90;
const BR = 7;
const PADDLE_SPEED = 7;
const BALL_BASE_SPEED = 5;
const BALL_MAX_SPEED = 12;
const BALL_ACCEL = 1.02;
const WIN_SCORE = 5;
const MIN_ANGLE = 0.3;

const rooms = {};

function createRoom(roomId) {
  rooms[roomId] = {
    players: {},
    ball: { x: GW / 2, y: GH / 2, vx: 0, vy: 0, speed: BALL_BASE_SPEED },
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    paddles: [
      { x: 25, y: GH / 2 - PH / 2 },
      { x: GW - 25 - PW, y: GH / 2 - PH / 2 },
      { x: GW / 2 - PH / 2, y: 25 },
      { x: GW / 2 - PH / 2, y: GH - 25 - PW },
    ],
    state: 'waiting',
    loop: null,
    countdown: null,
    playerSlots: [null, null, null, null],
    lastScorer: null,
  };
  return rooms[roomId];
}

function getPlayerSlot(room) {
  for (let i = 0; i < 4; i++) {
    if (!room.playerSlots[i]) return i;
  }
  return -1;
}

function launchBall(room, towardSlot) {
  const angle = (Math.random() - 0.5) * Math.PI * 0.6;
  let dirX, dirY;

  if (towardSlot === 0) { dirX = 1; dirY = Math.sin(angle); }
  else if (towardSlot === 1) { dirX = -1; dirY = Math.sin(angle); }
  else if (towardSlot === 2) { dirX = Math.sin(angle); dirY = 1; }
  else if (towardSlot === 3) { dirX = Math.sin(angle); dirY = -1; }
  else { dirX = Math.random() > 0.5 ? 1 : -1; dirY = (Math.random() - 0.5) * 0.6; }

  let vx = dirX * room.ball.speed;
  let vy = dirY * room.ball.speed;

  if (Math.abs(vx) < room.ball.speed * MIN_ANGLE) {
    vx = vx >= 0 ? room.ball.speed * MIN_ANGLE : -room.ball.speed * MIN_ANGLE;
  }
  if (Math.abs(vy) < room.ball.speed * MIN_ANGLE) {
    vy = vy >= 0 ? room.ball.speed * MIN_ANGLE : -room.ball.speed * MIN_ANGLE;
  }

  room.ball.vx = vx;
  room.ball.vy = vy;
}

function resetBall(room, towardSlot) {
  room.ball.x = GW / 2;
  room.ball.y = GH / 2;
  room.ball.speed = BALL_BASE_SPEED;
  launchBall(room, towardSlot !== undefined ? towardSlot : room.lastScorer);
}

function checkPaddleCollision(room, slot) {
  const ball = room.ball;
  const pid = room.playerSlots[slot];
  if (!pid) return false;

  const p = room.paddles[slot];
  let padLeft, padRight, padTop, padBottom;

  if (slot === 0) {
    padLeft = p.x; padRight = p.x + PW; padTop = p.y; padBottom = p.y + PH;
  } else if (slot === 1) {
    padLeft = p.x; padRight = p.x + PW; padTop = p.y; padBottom = p.y + PH;
  } else if (slot === 2) {
    padLeft = p.x; padRight = p.x + PH; padTop = p.y; padBottom = p.y + PW;
  } else {
    padLeft = p.x; padRight = p.x + PH; padTop = p.y; padBottom = p.y + PW;
  }

  if (ball.x + BR > padLeft && ball.x - BR < padRight &&
      ball.y + BR > padTop && ball.y - BR < padBottom) {

    if (slot === 0 || slot === 1) {
      ball.vx = -ball.vx * BALL_ACCEL;
      ball.x = slot === 0 ? padRight + BR : padLeft - BR;
      const relY = (ball.y - (p.y + PH / 2)) / (PH / 2);
      ball.vy += relY * 2;
    } else {
      ball.vy = -ball.vy * BALL_ACCEL;
      ball.y = slot === 2 ? padBottom + BR : padTop - BR;
      const relX = (ball.x - (p.x + PH / 2)) / (PH / 2);
      ball.vx += relX * 2;
    }

    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed > BALL_MAX_SPEED) {
      ball.vx = (ball.vx / speed) * BALL_MAX_SPEED;
      ball.vy = (ball.vy / speed) * BALL_MAX_SPEED;
    }

    if (Math.abs(ball.vx) < 1.5) {
      ball.vx = ball.vx >= 0 ? 1.5 : -1.5;
    }
    if (Math.abs(ball.vy) < 1.5) {
      ball.vy = ball.vy >= 0 ? 1.5 : -1.5;
    }

    return true;
  }
  return false;
}

function handleScoring(room) {
  const ball = room.ball;
  let scored = false;
  let scorerSlot = -1;

  if (ball.x - BR <= 0) {
    if (room.playerSlots[0]) { room.scores[0]++; scorerSlot = 0; }
    else { ball.vx = Math.abs(ball.vx); ball.x = BR + 1; }
    scored = true;
  }
  if (ball.x + BR >= GW) {
    if (room.playerSlots[1]) { room.scores[1]++; scorerSlot = 1; }
    else { ball.vx = -Math.abs(ball.vx); ball.x = GW - BR - 1; }
    scored = true;
  }
  if (ball.y - BR <= 0) {
    if (room.playerSlots[2]) { room.scores[2]++; scorerSlot = 2; }
    else { ball.vy = Math.abs(ball.vy); ball.y = BR + 1; }
    scored = true;
  }
  if (ball.y + BR >= GH) {
    if (room.playerSlots[3]) { room.scores[3]++; scorerSlot = 3; }
    else { ball.vy = -Math.abs(ball.vy); ball.y = GH - BR - 1; }
    scored = true;
  }

  if (scored && scorerSlot >= 0) {
    room.lastScorer = scorerSlot;

    if (room.scores[scorerSlot] >= WIN_SCORE) {
      room.state = 'gameover';
      clearInterval(room.loop);
      io.to(room.id).emit('gameOver', { winner: room.playerSlots[scorerSlot], scores: room.scores });
      return true;
    }

    resetBall(room, scorerSlot);
  }

  return false;
}

function gameLoop(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== 'playing') return;

  const ball = room.ball;
  ball.x += ball.vx;
  ball.y += ball.vy;

  for (let slot = 0; slot < 4; slot++) {
    checkPaddleCollision(room, slot);
  }

  if (handleScoring(room)) return;

  io.to(roomId).emit('gameState', {
    ball: { x: ball.x, y: ball.y },
    paddles: room.paddles,
    scores: room.scores,
  });
}

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let count = 3;
  io.to(roomId).emit('countdown', { count });

  room.countdown = setInterval(() => {
    count--;
    if (count > 0) {
      io.to(roomId).emit('countdown', { count });
    } else {
      clearInterval(room.countdown);
      room.countdown = null;
      room.state = 'playing';
      resetBall(room);
      io.to(roomId).emit('gameStart', { scores: room.scores, paddles: room.paddles });
      room.loop = setInterval(() => gameLoop(roomId), 1000 / 60);
    }
  }, 1000);
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
    room.players[socket.id] = { id: socket.id, name: data.name || `Player ${slot + 1}`, slot };

    socket.emit('assigned', { slot, roomId, paddles: room.paddles });
    io.to(roomId).emit('playersUpdate', {
      players: room.playerSlots.map((pid, i) => pid ? { name: room.players[pid]?.name, slot: i } : null),
    });

    if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
      setTimeout(() => {
        if (room.state === 'waiting' && room.playerSlots.filter(Boolean).length >= 2) {
          startCountdown(roomId);
        }
      }, 1000);
    }
  });

  socket.on('paddleMove', (data) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (!player || room.state !== 'playing') return;

    const slot = player.slot;
    if (slot === 0 || slot === 1) {
      room.paddles[slot].y = Math.max(0, Math.min(GH - PH, data.y));
    } else {
      room.paddles[slot].x = Math.max(0, Math.min(GW - PH, data.x));
    }
  });

  socket.on('playAgain', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];

    room.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    room.state = 'waiting';
    room.lastScorer = null;
    room.paddles = [
      { x: 25, y: GH / 2 - PH / 2 },
      { x: GW - 25 - PW, y: GH / 2 - PH / 2 },
      { x: GW / 2 - PH / 2, y: 25 },
      { x: GW / 2 - PH / 2, y: GH - 25 - PW },
    ];
    room.ball = { x: GW / 2, y: GH / 2, vx: 0, vy: 0, speed: BALL_BASE_SPEED };

    io.to(currentRoom).emit('playAgain', { scores: room.scores, paddles: room.paddles });

    setTimeout(() => {
      if (room.playerSlots.filter(Boolean).length >= 2) {
        startCountdown(currentRoom);
      }
    }, 1500);
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (player) {
      room.playerSlots[player.slot] = null;
      delete room.players[socket.id];

      io.to(currentRoom).emit('playersUpdate', {
        players: room.playerSlots.map((pid, i) => pid ? { name: room.players[pid]?.name, slot: i } : null),
      });

      if (room.state === 'playing' && room.playerSlots.filter(Boolean).length < 2) {
        room.state = 'gameover';
        clearInterval(room.loop);
        io.to(currentRoom).emit('gameOver', { winner: null, scores: room.scores, message: 'Not enough players' });
      }

      if (room.playerSlots.filter(Boolean).length === 0) {
        clearInterval(room.loop);
        clearInterval(room.countdown);
        delete rooms[currentRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pong server running on port ${PORT}`);
});
