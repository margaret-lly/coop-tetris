# 合作俄罗斯方块（Co-op Tetris）

同一张棋盘、两人轮流落块的合作版：你放一块，轮到朋友放一块，一起消行、共享得分。没有互相扔垃圾行的对战机制。

## 玩法

- **← / →** 左右移动
- **↓** 下移一格；**已经到底时再按 ↓ 会立刻锁定并换人**
- **↑** 顺时针旋转
- **空格** 直接落到底
- 方块会**每 0.9 秒自动下落一格**，落到底自动锁定
- 方块锁定后自动切换到另一位玩家；非当前回合按键无效。
- 消行得分两人共享；方块在顶部无法生成时游戏结束。

> 想调下落速度：改 `server.js` 顶部的 `const FALL_MS = 900;`（毫秒，数值越小越快），改完重启服务。

## 怎么跑起来（只需一个终端）

前置：电脑装有 Node.js（v16 以上，你之前已经装过）。

**Windows**：双击 `启动.bat`（首次会自动装依赖）。
**Mac / Linux**：终端执行 `./启动.sh`（首次先 `chmod +x 启动.sh`）。

手动方式：

```bash
npm install     # 首次运行装依赖，只需一次
npm start       # 启动服务
```

浏览器打开：**http://localhost:3000/**

## 邀请朋友（同一个 WiFi / 局域网）

1. 启动后服务本身监听在所有网卡上，不需要额外参数。
2. 查你电脑的局域网 IP：
   - Windows：PowerShell 输入 `ipconfig`，找 `IPv4 地址`（一般 `192.168.x.x`）
   - Mac：`ipconfig getifaddr en0`
3. 把 `http://你的IP:3000/` 发给朋友，朋友浏览器直接打开，**不需要装 Node、不需要开任何命令行窗口**。
4. 你点「创建房间」拿到 4 位房间码；朋友点「加入房间」输入房间码即可。
5. 第一次弹 Windows 防火墙提示时，勾选专用网络并允许；被拦了就去「Windows 安全中心 → 防火墙 → 允许应用通过防火墙」放行 Node.js。

> 不在同一个 WiFi 时，局域网 IP 出不去，需要内网穿透工具（如 ngrok），链路更长、延迟更高。

## 部署到线上（平板 / 异地同学也能玩）

局域网这套要求对方的设备跟你在同一个 WiFi。想把链接带到学校、让平板直接打开，就把服务部署到 Render 免费版：

1. 代码推到 GitHub（步骤见下节）
2. Render 新建 Web Service，连这个仓库，配置：
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Plan：Free
3. 部署完拿到 `https://xxx.onrender.com`，平板 / 同学浏览器直接打开即可，**不需要在家开着电脑**

注意事项：

- 免费实例 **15 分钟无人访问会休眠**，第一次打开要等 30–60 秒唤醒；到学校先自己打开链接唤醒，再叫同学进房间。
- 服务端已经写好 `const PORT = process.env.PORT || 3000;`，平台自动分配的端口能直接用，不用改代码。
- 前端用相对路径 `io()` 连接，跟随当前域名，本地和线上都无需改地址。
- 部分校园网会拦 WebSocket：页面能开但进不去房间时，改用手机热点测试。
- 之后改样式/换图，只要把改动推回 GitHub 的 main 分支，Render 会自动重新部署。

## 上传到 GitHub

在项目根目录（就是有 `server.js` 和 `package.json` 的这一层）打开命令行：

```bash
git init
git add .
git commit -m "init coop tetris"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

`node_modules` 已经被 `.gitignore` 排除，不会被上传。

## 目录结构

```
coop-tetris/
├── server.js          # 房间、棋盘、回合、消行、广播（服务端权威）
├── package.json
└── client/
    ├── index.html     # 页面结构
    ├── style.css      # 样式
    ├── game.js        # 渲染 + 按键 + 与服务端通信
    └── skin.js        # 皮肤配置：方块颜色、玩家头像/名字（改这里就行）
```

## 怎么换成朋友喜欢的角色 / 配色

只改 `client/skin.js`：

- `pieceColors`：七种方块的颜色，改成任意十六进制色值。
- `players`：两位玩家的名字、回合高亮颜色；`avatar` 填图片路径（把图片放进 `client/assets/`，例如 `"assets/hero1.png"`），留空则显示名字首字母头像。
- 改完刷新浏览器即可，不用重启服务。

### 换掉角色立绘

现在一共用到四个图位（都在 `client/assets/`）：

| 图位 | 出现位置 |
| --- | --- |
| `angel_game.webp` | 主页左上（站姿天使） |
| `angel_home.webp` | 主页左下（托腮天使）+ 游戏页左下 |
| `demon_game.webp` | 主页右上（奔跑恶魔） |
| `demon_home.webp` | 主页右下（站姿恶魔）+ 游戏页右下 |
| `face-angel.webp` / `face-demon.webp` | 玩家列表里的两个小头像 |

换图最简单的做法：**保持文件名不变**，直接把新图覆盖到 `client/assets/` 里同名文件（新图存成透明底 PNG 或 WebP），刷新浏览器就生效，一行代码都不用改。

想改图位对应的文件，就在 `client/index.html` 里搜 `src="assets/`，一共 6 处，改路径即可。

## 技术说明

- 后端：Node.js + Express + Socket.IO；前端：原生 HTML/CSS/JS，无构建工具，无外部字体/图片依赖（角色图都打包在 `client/assets/`，断网也能正常显示）。
- 棋盘状态由服务端计算，客户端只发操作、收状态，避免两边不同步。
- 协议：建房 `POST /api/rooms`；房间存在性 `GET /api/rooms/:code`；联机事件 `join_room / left / right / down / rotate / hard`；状态广播 `room_state`。
