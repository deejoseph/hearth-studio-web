-- 棋谱库：存每个棋手的对局历史，从 localStorage 搬到服务端
-- game_id 是前端生成的唯一标识（UUID），用于去重：同一局不会存两次
-- sans 用 JSON 存走法列表，60 局 × 每局几百步，单行几 KB，MySQL JSON 列装得下

CREATE TABLE IF NOT EXISTS chess_library (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  game_id VARCHAR(40) NOT NULL,
  finished_at BIGINT NOT NULL COMMENT '对局结束时间戳（毫秒）',
  mode ENUM('computer', 'local', 'online') NOT NULL,
  level VARCHAR(12) NULL COMMENT '电脑难度，仅 mode=computer 时有',
  sans JSON NOT NULL COMMENT '走法列表 ["e4", "e5", ...]',
  result ENUM('1-0', '0-1', '1/2-1/2', '*') NOT NULL,
  white_name VARCHAR(120) NOT NULL,
  black_name VARCHAR(120) NOT NULL,
  control_initial INT NULL COMMENT '初始时间（毫秒）',
  control_increment INT NULL COMMENT '增量（秒）',
  termination VARCHAR(24) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 同一棋手的同一局只存一次（前端用 game_id 去重，这里再加一道保险）
  UNIQUE KEY uk_player_game (player_id, game_id),

  -- 查询"我的对局"按时间倒序，这个索引让 ORDER BY 走索引而不排序
  INDEX idx_player_finished (player_id, finished_at DESC),

  FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
