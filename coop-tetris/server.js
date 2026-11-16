/**
 * Co-op Tetris 服务端
 * - 单张棋盘、两人轮流落块（接力合作），无垃圾行、无对战攻击
 * - 房间码加入；棋盘状态由服务端计算并广播
 * - 前端为静态文件，由本服务一并托管，启动一个终端即可
 */

const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const COLS = 10;
const ROWS = 20;
const MAX_PLAYERS = 2;

// ---------- 方块定义 ----------
const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const TYPES = Object.keys(SHAPES);
const LINE_SCORES = [0, 100, 300, 500, 800];

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotateCW(matrix) {
  const n = matrix.length;
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => matrix[n - 1 - x][y])
  );
}

function makeBag() {
  const bag = [...TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function collide(board, shape, col, row) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const bx = col + x;
      const by = row + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ---------- 房间状态 ----------
const rooms = new Map();

function nextPiece(room) {
  if (room.bag.length === 0) room.bag = makeBag();
  const type = room.bag.pop();
  const shape = SHAPES[type].map((r) => [...r]);
  const col = Math.floor((COLS - shape[0].length) / 2);
  const piece = { type, shape, col, row: 0 };
  if (collide(room.board, shape, col, 0)) {
    room.current = null;
    room.status = "over";
  } else {
    room.current = piece;
  }
  return piece;
}

function createRoom() {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room = {
    code,
    players: [],
    activeIndex: 0,
    board: emptyBoard(),
    bag: makeBag(),
    current: null,
    score: 0,
    lines: 0,
    status: "waiting",
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, socketId, name) {
  room.players.push({
    socketId: socketId || null,
    name: String(name || "玩家").slice(0, 16),
  });
}

function publicState(room) {
  return {
    code: room.code,
    status: room.status,
    score: room.score,
    lines: room.lines,
    activeIndex: room.activeIndex,
    board: room.board,
    current: room.current
      ? { type: room.current.type, shape: room.current.shape, col: room.current.col, row: room.current.row }
      : null,
    players: room.players.map((p, i) => ({ name: p.name, index: i })),
  };
}

// ---------- 落地 / 消行 / 换人 ----------
function lockPiece(room) {
  const piece = room.current;
  if (!piece) return;
  piece.shape.forEach((rowCells, y) => {
    rowCells.forEach((cell, x) => {
      if (!cell) return;
      const by = piece.row + y;
      const bx = piece.col + x;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
        room.board[by][bx] = piece.type;
      }
    });
  });

  // 消行（合作共享）
  const remain = [];
  let cleared = 0;
  for (let y = 0; y < ROWS; y++) {
    if (room.board[y].every(Boolean)) {
      cleared++;
    } else {
      remain.push(room.board[y]);
    }
  }
  if (cleared > 0) {
    while (remain.length < ROWS) remain.unshift(Array(COLS).fill(null));
    room.board = remain;
    room.lines += cleared;
    room.score += LINE_SCORES[cleared];
  }

  // 回合切换
  room.activeIndex = 1 - room.activeIndex;
  nextPiece(room);

  if (room.status !== "over" && room.players.length >= 2) {
    room.status = "playing";
  }
}

// ---------- 自动下落（重力） ----------
const FALL_MS = 900;

function tickRoom(room) {
  if (room.status !== "playing") return;
  const piece = room.current;
  if (!piece) return;

  if (!collide(room.board, piece.shape, piece.col, piece.row + 1)) {
    piece.row++;
  } else {
    // 已经落到底，自动锁定并换人
    lockPiece(room);
  }
  io.to(room.code).emit("room_state", publicState(room));
}

function startGravity(room) {
  if (room.timer) return;
  room.timer = setInterval(() => tickRoom(room), FALL_MS);
}

function stopGravity(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

// 玩家变动后重新编号，保证 activeIndex 与 socket 上的 playerIndex 对得上
function reindexPlayers(room) {
  const sockets = io.sockets.sockets;
  room.players.forEach((p, i) => {
    const s = p.socketId ? sockets.get(p.socketId) : null;
    if (s) s.data.playerIndex = i;
  });
  if (room.activeIndex >= room.players.length) room.activeIndex = 0;
}

// ---------- HTTP ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"], credentials: true },
});

app.use(
  express.json(),
  express.static(path.join(__dirname, "client"))
);

app.get("/health", (_req, res) => res.json({ status: "OK" }));

app.post("/api/rooms", (req, res) => {
  try {
    const name = (req.body && req.body.playerName) || "玩家";
    const room = createRoom();
    res.status(201).json({ roomCode: room.code });
  } catch (e) {
    res.status(500).json({ error: "创建房间失败" });
  }
});

app.get("/api/rooms/:code", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "房间不存在" });
  res.json({ exists: true, players: room.players.length, status: room.status });
});

// ---------- Socket ----------
io.on("connection", (socket) => {
  socket.on("join_room", (data, ack) => {
    const roomCode = String((data && data.roomCode) || "").toUpperCase();
    const name = (data && data.playerName) || "玩家";
    const room = rooms.get(roomCode);

    if (!room) return ack && ack({ ok: false, message: "房间不存在" });
    if (room.players.length >= MAX_PLAYERS)
      return ack && ack({ ok: false, message: "房间已满" });

    // 同名字检查
    if (room.players.some((p) => p.name === name)) {
      return ack && ack({ ok: false, message: "名字重复" });
    }

    addPlayer(room, socket.id, name);
    const joinedIndex = room.players.length - 1;
    socket.join(roomCode);

    if (room.players.length === 1) {
      nextPiece(room);
    } else if (room.status === "waiting") {
      room.status = "playing";
      nextPiece(room);
      startGravity(room);
    }

    socket.data.roomCode = roomCode;
    socket.data.playerIndex = joinedIndex;
    io.to(roomCode).emit("room_state", publicState(room));
    ack && ack({ ok: true, playerIndex: joinedIndex });
  });

  const handleMove = (action) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.status === "over") return;

    const myIndex = socket.data.playerIndex;
    if (myIndex !== room.activeIndex) return; // 非当前回合，忽略
    const piece = room.current;
    if (!piece) return;

    if (action === "left") {
      if (!collide(room.board, piece.shape, piece.col - 1, piece.row)) piece.col--;
    } else if (action === "right") {
      if (!collide(room.board, piece.shape, piece.col + 1, piece.row)) piece.col++;
    } else if (action === "down") {
      // 能下去就下去；已经到底就立刻锁定并换人
      if (!collide(room.board, piece.shape, piece.col, piece.row + 1)) {
        piece.row++;
      } else {
        lockPiece(room);
      }
    } else if (action === "rotate") {
      const rotated = rotateCW(piece.shape);
      // 简单踢墙：原位、左移一格、右移一格、上移一格依次尝试
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (!collide(room.board, rotated, piece.col + k, piece.row)) {
          piece.shape = rotated;
          piece.col += k;
          break;
        }
      }
    } else if (action === "hard") {
      while (!collide(room.board, piece.shape, piece.col, piece.row + 1)) piece.row++;
      lockPiece(room);
    }

    io.to(roomCode).emit("room_state", publicState(room));
  };

  ["left", "right", "down", "rotate", "hard"].forEach((a) =>
    socket.on(a, () => handleMove(a))
  );

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    stopGravity(room);
    room.players = room.players.filter((p) => p.socketId !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }
    // 只要还剩一个人，就停下重力、回到等待状态，重新等对手加入
    reindexPlayers(room);
    room.activeIndex = 0;
    room.status = "waiting";
    io.to(roomCode).emit("room_state", publicState(room));
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Co-op Tetris 运行中：http://localhost:${PORT}/`);
});
