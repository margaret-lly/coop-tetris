/* 合作俄罗斯方块前端逻辑：只负责渲染和按键，棋盘计算都在服务端 */

const $ = (id) => document.getElementById(id);

const skin = window.SKIN || {};
const pieceColors = skin.pieceColors || {};

let socket = null;
let myIndex = -1;
let state = null;

const boardEl = $("board");
const cells = [];

// 初始化棋盘格子
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 10; x++) {
    const c = document.createElement("div");
    c.className = "cell";
    boardEl.appendChild(c);
    cells.push(c);
  }
}

function playerName(i) {
  const s = skin.players && skin.players[i];
  return (s && s.name) || `玩家 ${i + 1}`;
}

function connectAndJoin(code, name) {
  socket = io();

  socket.on("room_state", (data) => {
    state = data;
    render();
  });

  socket.on("connect_error", () => {
    $("home-msg").textContent = "连不上服务器，请确认后端已启动";
  });

  socket.emit("join_room", { roomCode: code, playerName: name }, (ack) => {
    if (ack && ack.ok) {
      myIndex = ack.playerIndex;
      $("home").classList.add("hidden");
      $("game").classList.remove("hidden");
    } else {
      $("home-msg").textContent = (ack && ack.message) || "加入失败";
    }
  });
}

async function createRoom() {
  const name = $("name-input").value.trim() || "玩家 1";
  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建失败");
    connectAndJoin(data.roomCode, name);
  } catch (e) {
    $("home-msg").textContent = e.message;
  }
}

function joinRoom() {
  const name = $("name-input").value.trim() || "玩家 2";
  const code = $("code-input").value.trim().toUpperCase();
  if (!code) {
    $("home-msg").textContent = "请输入房间码";
    return;
  }
  connectAndJoin(code, name);
}

$("create-btn").addEventListener("click", createRoom);
$("join-btn").addEventListener("click", joinRoom);

// ---------- 渲染 ----------
function render() {
  if (!state) return;

  $("room-code").textContent = state.code;
  $("score").textContent = state.score;
  $("lines").textContent = state.lines;

  // 玩家列表
  const playersEl = $("players");
  playersEl.innerHTML = "";
  state.players.forEach((p, i) => {
    const s = skin.players && skin.players[i];
    const div = document.createElement("div");
    div.className = "player" + (i === state.activeIndex ? " active" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = (s && s.color) || "#222d36";
    if (s && s.avatar) {
      const img = document.createElement("img");
      img.src = s.avatar;
      avatar.appendChild(img);
    } else {
      avatar.textContent = (p.name || "?")[0].toUpperCase();
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    const b = document.createElement("b");
    b.textContent = p.name;
    const span = document.createElement("span");
    span.textContent = i === myIndex ? "你" : "已加入";
    meta.append(b, span);

    div.append(avatar, meta);
    playersEl.appendChild(div);
  });

  // 回合提示
  const badge = $("turn-badge");
  if (state.status === "over") {
    badge.textContent = "游戏结束";
  } else if (state.status === "waiting") {
    badge.textContent = "等待另一位玩家加入…";
  } else {
    const active = state.players[state.activeIndex];
    const label = active ? active.name : "";
    badge.textContent =
      state.activeIndex === myIndex ? `轮到你了：${label}` : `轮到 ${label}`;
  }

  // 棋盘
  const settled = state.board;
  const current = state.current;
  const overlay = new Map();
  if (current) {
    current.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        const by = current.row + y;
        const bx = current.col + x;
        if (by >= 0 && by < 20 && bx >= 0 && bx < 10) {
          overlay.set(by * 10 + bx, current.type);
        }
      });
    });
  }

  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 10; x++) {
      const idx = y * 10 + x;
      const cell = cells[idx];
      const type = overlay.get(idx) || settled[y][x];
      if (type) {
        cell.className = "cell filled";
        cell.style.background = pieceColors[type] || "#7c9eff";
      } else {
        cell.className = "cell";
        cell.style.background = "";
      }
    }
  }

  // 结束遮罩
  const over = $("over");
  if (state.status === "over") {
    over.classList.remove("hidden");
    $("over-stat").textContent = `得分 ${state.score} · 消行 ${state.lines}`;
  } else {
    over.classList.add("hidden");
  }
}

// ---------- 按键 ----------
const KEYS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowUp: "rotate",
  " ": "hard",
};

document.addEventListener("keydown", (e) => {
  if (!socket || !state) return;
  const action = KEYS[e.key];
  if (!action) return;
  e.preventDefault();
  if (state.status !== "playing") return;
  if (myIndex !== state.activeIndex) return; // 非当前回合
  socket.emit(action);
});

// ---------- 整页等比缩放：把 1440×900 设计画布等比塞进当前视口 ----------
// 只影响显示比例，不改任何游戏逻辑；棋盘、信息卡、立绘、标题一起缩放。
const STAGE_W = 1440;
const STAGE_H = 900;

function fitStage() {
  const game = $("game");
  if (!game) return;
  // 宽屏（>1100px）走整体等比缩放；窄屏交给 style.css 的断点布局，不缩放
  const scale =
    window.innerWidth > 1100
      ? Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
      : 1;
  game.style.setProperty("--stage-scale", String(scale));
}

fitStage();
window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", fitStage);
