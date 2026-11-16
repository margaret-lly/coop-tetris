/**
 * 皮肤配置 —— 想换角色/配色只改这一个文件，不用动游戏逻辑。
 *
 * 方块颜色：pieceColors 里每个字母对应一种方块。
 * 玩家形象：players 两项分别是玩家 1 / 玩家 2。
 *   - name：界面上显示的名字（进房时输入的名字会覆盖它）
 *   - color：该玩家头像底色 / 高亮色
 *   - avatar：角色图片路径，图片放 client/assets/ 里；留空显示名字首字母
 */
window.SKIN = {
  // 淡彩配色，贴合整体淡紫白色调，同时保证七种方块可区分
  pieceColors: {
    I: "#7fa6d4",
    O: "#eebf74",
    T: "#a98ac9",
    S: "#7fb9a3",
    Z: "#dd9299",
    J: "#8b90cf",
    L: "#cba275",
  },
  players: [
    { name: "玩家 1", color: "#e7e1f5", avatar: "assets/face-angel.webp" },
    { name: "玩家 2", color: "#e3deef", avatar: "assets/face-demon.webp" },
  ],
  boardBg: "#ffffff",
  emptyCell: "#f8f6fd",
  accent: "#47435a",
};
