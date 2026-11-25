<?php
/**
 * 棋手账号层的唯一入口：会话、限流、校验、令牌、统一响应。
 * chess_* 端点都应 require 本文件，不要再各自写一份。
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 *
 * 与 admin_guard.php 的区别：那份管后台（cookie 只作用于 /api/v1），
 * 这份管下棋的人（cookie 要作用到 /chess，所以 path=/）。两者互不相认。
 */

// 教练偏好的选项白名单在 chess_coach_core.php，下面那句"缩到多少个字"要引用同一个数
require_once __DIR__ . '/chess_coach_core.php';

const CHESS_FAIL_WINDOW = 900;      // 15 分钟
const CHESS_FAIL_LIMIT = 5;         // 同一 IP 的登录失败次数
const CHESS_REGISTER_WINDOW = 3600; // 同一 IP 每小时最多注册
// 按"真建成的账号"计，不是按失败计：一个班的孩子常共用校园网这一个 IP，
// 卡太紧会把想下棋的人挡在门外，所以留到 10 个/小时。
const CHESS_REGISTER_LIMIT = 10;
const CHESS_RESEND_LIMIT = 3;       // 重发邮件按小时限，发信量是另一笔账
const CHESS_VERIFY_TTL = 172800;    // 验证链接 48 小时有效
const CHESS_MIN_PASSWORD = 8;
const CHESS_MAX_PASSWORD = 72;      // bcrypt 在这之后静默丢弃

// 开房和进房各自限一个数。进别人房间的唯一正当途径是对方把 6 位码给你，
// 所以"猜码"要么是根本不成立、要么就是有人在扫 —— 扫就得限，
// 顺带也挡住一个人拿账号批量占房。
const CHESS_ROOM_WINDOW = 3600;
const CHESS_ROOM_CREATE_LIMIT = 8;  // 同一 IP 每小时真开出来的房间
const CHESS_JOIN_WINDOW = 900;
const CHESS_JOIN_LIMIT = 20;        // 同一 IP 15 分钟内"查无此房"的次数

/**
 * 每个错误一个稳定 code，中文提示留在这里当兜底。
 * 棋盘（/chess）的界面是英文的，它按 code 出英文句子；加新错误时两边都要动，
 * 但 code 是契约、中文/英文都只是措辞，改文案不必改代码。
 */
const CHESS_ERRORS = [
    'service' => ['服务器暂时不可用', 503],
    'server' => ['操作失败，请稍后再试', 500],
    'method' => ['不支持的请求方法', 405],
    'content_type' => ['请提交 JSON', 415],
    'bad_body' => ['请求体格式不对', 400],
    'sign_in_required' => ['请先登录', 401],
    'no_such_player' => ['找不到这个账号', 404],
    'too_many_logins' => ['失败次数太多，请 15 分钟后再试', 429],
    'too_many_registrations' => ['这个网络这一小时注册的次数太多了，稍后再试或联系 admin@ichessgeek.com', 429],
    'too_many_sends' => ['发送次数太多，稍后再试', 429],
    'mail_failed' => ['邮件还是发不出去，请联系 admin@ichessgeek.com', 502],
    'bad_credentials' => ['邮箱或密码不正确', 401],
    'missing_fields' => ['请填写邮箱和密码', 400],
    'bad_email' => ['邮箱格式不对', 400],
    'short_nickname' => ['昵称至少 2 个字', 400],
    'short_password' => ['密码至少 ' . CHESS_MIN_PASSWORD . ' 位', 400],
    'long_password' => ['密码太长了', 400],
    'weak_password' => ['这个密码太常见了，换一个', 400],
    'verify_failed' => ['验证暂时不可用，请稍后再试', 500],

    // 房间（P2）。这些 code 是棋盘的契约：界面按 code 出句子，中文只当兜底。
    'verify_required' => ['请先点邮件里的链接验证邮箱，验证后才能和人下', 403],
    'bad_room_code' => ['房间码格式不对', 400],
    'no_such_room' => ['找不到这个房间，检查下房间码', 404],
    'room_full' => ['这个房间已经两个人了', 409],
    'room_not_active' => ['这局现在不能走子', 409],
    'room_over' => ['这局已经结束了', 409],
    'not_room_member' => ['你不是这个房间的棋手', 403],
    'not_your_turn' => ['还没轮到你走', 409],
    'illegal_move' => ['这一步不合法', 400],
    'flagged' => ['时间已经走完，这步不算', 409],
    'stale_move' => ['局面已经变了，这一步没记下（对手可能刚走完）', 409],
    'bad_room_time' => ['每方时间要在 10 秒到 1 小时之间', 400],
    'bad_room_color' => ['颜色只能是白、黑或随机', 400],
    'too_many_rooms' => ['这个网络开房间的次数太多了，稍后再试', 429],
    'too_many_joins' => ['房间码试的次数太多，请核对之后再试', 429],

    // 教练偏好（P3）。界面按 code + field 出句子，中文只当兜底。
    'bad_pref' => ['这些选项里有一项不对，请再检查一遍', 400],
    'long_note' => ['说明太长了，请缩到 ' . COACH_NOTE_MAX . ' 个字以内', 400],
    'bad_note' => ['说明里有打不出来的字符，重写一遍就好', 400],
];

function chess_err($code, $extra = []) {
    [$message, $status] = CHESS_ERRORS[$code] ?? CHESS_ERRORS['server'];
    chess_json(['ok' => false, 'code' => $code, 'error' => $message] + $extra, $status);
}

function chess_db() {
    static $conn = null;
    if ($conn === null) {
        require_once __DIR__ . '/db_config.php';
        if (!isset($conn)) {
            error_log('chess: db_config.php did not define $conn');
            chess_err('service');
        }
    }
    return $conn;
}

function chess_client_ip() {
    // Cloudflare 在前面，REMOTE_ADDR 恒为边缘地址，只有 CF 的头可信
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return substr($ip, 0, 45);
}

/**
 * 表在首次用到时建，跟留言板那套一致：共享主机上不方便跑迁移脚本。
 */
function chess_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(30) NOT NULL,
        rating INT NOT NULL DEFAULT 400,
        verified_at DATETIME NULL,
        verify_token_hash CHAR(64) NULL,
        verify_expires DATETIME NULL,
        last_seen_at DATETIME NULL,
        external_id VARCHAR(64) NULL,
        external_source VARCHAR(32) NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_chess_email (email),
        UNIQUE KEY uq_chess_external (external_source, external_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_auth_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scope VARCHAR(16) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        tried_at DATETIME NOT NULL,
        INDEX idx_caa (scope, ip, tried_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // 棋谱库：存每个棋手的对局历史，从 localStorage 搬到服务端
    $conn->query("CREATE TABLE IF NOT EXISTS chess_library (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_id INT NOT NULL,
        game_id VARCHAR(40) NOT NULL,
        finished_at BIGINT NOT NULL COMMENT '对局结束时间戳（毫秒）',
        mode ENUM('computer', 'local', 'online') NOT NULL,
        level VARCHAR(12) NULL COMMENT '电脑难度，仅 mode=computer 时有',
        sans JSON NOT NULL COMMENT '走法列表',
        result ENUM('1-0', '0-1', '1/2-1/2', '*') NOT NULL,
        white_name VARCHAR(120) NOT NULL,
        black_name VARCHAR(120) NOT NULL,
        control_initial INT NULL COMMENT '初始时间（毫秒）',
        control_increment INT NULL COMMENT '增量（秒）',
        termination VARCHAR(24) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_player_game (player_id, game_id),
        INDEX idx_player_finished (player_id, finished_at DESC),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

function chess_start_session() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('ichessgeek_chess');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function chess_player_id() {
    chess_start_session();
    return isset($_SESSION['chess_player_id']) ? (int) $_SESSION['chess_player_id'] : 0;
}

/** 当前登录者；未登录直接 401。写库前都先过这一关。 */
function chess_require_player() {
    $id = chess_player_id();
    if ($id > 0) {
        return $id;
    }
    chess_err('sign_in_required');
}

function chess_json($payload, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 只收 JSON body 的 POST。
 * 表单式的跨站 POST 带不上 application/json 这个 Content-Type（浏览器要预检），
 * 加上 cookie 是 SameSite=Lax，这一条就把 CSRF 的主要入口堵住了。
 */
function chess_read_body() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        chess_err('method');
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') === false) {
        chess_err('content_type');
    }
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        chess_err('bad_body');
    }
    return $data;
}

/**
 * 中文昵称要按"字"而不是按"字节"量，且"量长度"和"截断"必须是同一套口径，
 * 否则同一个昵称会被量成两种长度。共享主机不一定编了 mbstring，
 * 所以每个 mb_* 调用都留退路 —— 退路用 preg_split('//u') 同样按码点数。
 */
function chess_chars($s) {
    if (function_exists('mb_str_split')) {
        return mb_str_split($s, 1, 'UTF-8');
    }
    // //u 按 UTF-8 码点切，PCRE 编译必然支持，不依赖 mbstring
    return preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];
}

function chess_len($s) {
    return count(chess_chars($s));
}

function chess_cut($s, $max) {
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max, 'UTF-8');
    }
    return implode('', array_slice(chess_chars($s), 0, $max));
}

function chess_trim($value, $max) {
    return chess_cut(trim((string) ($value ?? '')), $max);
}

function chess_norm_email($value) {
    // 邮箱的本地部分按 RFC 是 ASCII，strtolower 足够；非 ASCII 地址本来也过不了 filter_var
    $email = strtolower(trim((string) ($value ?? '')));
    if ($email === '' || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return '';
    }
    return $email;
}

/**
 * 弱口令黑名单只挡"12345678"这类一撞就中的，不追求全面。
 * 少儿班的用户量下，撞库失败的主要代价是邮箱被拿去试。
 * 返回 code（'' 表示没问题），文案由 CHESS_ERRORS 出。
 */
function chess_password_problem($plain) {
    $len = strlen($plain);
    if ($len < CHESS_MIN_PASSWORD) {
        return 'short_password';
    }
    if ($len > CHESS_MAX_PASSWORD) {
        return 'long_password';
    }
    $weak = ['password', '12345678', '123456789', '1234567890', 'qwertyuiop',
             'iloveyou', 'football', 'baseball', '00000000', 'abcdefgh'];
    if (in_array(strtolower($plain), $weak, true)) {
        return 'weak_password';
    }
    return '';
}

function chess_attempt_count($conn, $scope, $ip, $window) {
    chess_schema($conn);
    $cutoff = date('Y-m-d H:i:s', time() - $window);
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM chess_auth_attempts WHERE scope = ? AND ip = ? AND tried_at > ?");
    $stmt->bind_param("sss", $scope, $ip, $cutoff);
    $stmt->execute();
    $count = (int) $stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    return $count;
}

function chess_record_attempt($conn, $scope, $ip) {
    chess_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_auth_attempts (scope, ip, tried_at) VALUES (?, ?, NOW())");
    $stmt->bind_param("ss", $scope, $ip);
    $stmt->execute();
    $stmt->close();
}

function chess_clear_attempts($conn, $scope, $ip) {
    $stmt = $conn->prepare("DELETE FROM chess_auth_attempts WHERE scope = ? AND ip = ?");
    $stmt->bind_param("ss", $scope, $ip);
    $stmt->execute();
    $stmt->close();
}

/**
 * 令牌只在库里存 SHA-256：数据库被读走也拿不到还能用的验证链接。
 * 返回 [明文令牌（只出现在这一次，用于拼链接）, 落库的哈希]。
 */
function chess_new_token() {
    $plain = bin2hex(random_bytes(32));
    return [$plain, hash('sha256', $plain)];
}

function chess_public_row($row) {
    return [
        'id' => (int) $row['id'],
        'email' => $row['email'],
        'nickname' => $row['nickname'],
        'rating' => (int) $row['rating'],
        'verified' => $row['verified_at'] !== null,
        'verified_at' => $row['verified_at'],
        'created_at' => $row['created_at'],
    ];
}

/**
 * 统一的失败出口：把 SQL 细节留在 error_log，给用户一句能看懂的话。
 */
function chess_fail(Throwable $e, $context) {
    error_log('chess ' . $context . ': ' . $e->getMessage());
    chess_err('server');
}

/* --------------------------------------------------------------------------
 * 房间（P2）。规则的判定全在 chess_room_core.php，这里只管进出数据库：
 * 建表、按房间码取行、把行还原成规则层要的数组、写回。
 * ------------------------------------------------------------------------ */

/** 毫秒时刻。DATETIME 只到秒，"剩 0.4 秒"和"剩 1.4 秒"会被存成同一个值。 */
function chess_now_ms() {
    return (int) floor(microtime(true) * 1000);
}

/**
 * 房间表在首次用到时建，和账号表一个路子：共享主机上不方便跑迁移脚本。
 *
 * seq 同时是两样东西：poll 的游标（客户端只取 seq > since 的事件），
 * 和写回的乐观锁（UPDATE ... WHERE seq = 期望值，0 行受影响就是有人先走了）。
 * 事件表上那个 UNIQUE (room_id, seq) 是第二层网：真撞上了说明同一手被记了两次。
 */
function chess_room_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code CHAR(6) NOT NULL,
        white_player_id INT NULL,
        black_player_id INT NULL,
        fen VARCHAR(90) NOT NULL,
        status VARCHAR(16) NOT NULL,
        result VARCHAR(24) NULL,
        winner CHAR(1) NULL,
        time_ms INT NOT NULL,
        white_ms INT NOT NULL,
        black_ms INT NOT NULL,
        turn_started_ms BIGINT NULL,
        seq INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_room_code (code),
        INDEX idx_room_white (white_player_id, status),
        INDEX idx_room_black (black_player_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_room_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        seq INT NOT NULL,
        san VARCHAR(16) NOT NULL,
        fen_after VARCHAR(90) NOT NULL,
        played_by INT NOT NULL,
        played_at DATETIME NOT NULL,
        UNIQUE KEY uq_room_seq (room_id, seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

/** 没验证过邮箱的人只能下 AI —— 这是他定的门禁，进房和开房都要过。 */
function chess_require_verified() {
    $id = chess_require_player();
    $conn = chess_db();
    chess_schema($conn);
    $stmt = $conn->prepare("SELECT verified_at FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        chess_err('no_such_player');
    }
    if ($row['verified_at'] === null) {
        chess_err('verify_required');
    }
    return $id;
}

/** 按房间码取一行（不含昵称，昵称由端点另查）。 */
function chess_find_room($conn, $code) {
    chess_room_schema($conn);
    $stmt = $conn->prepare("SELECT id, code, white_player_id, black_player_id, fen, status,
            result, winner, time_ms, white_ms, black_ms, turn_started_ms, seq
        FROM chess_rooms WHERE code = ? LIMIT 1");
    $stmt->bind_param("s", $code);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/**
 * mysqli 取回来的行全是字符串，规则层拿到的却是 int/null 混着写的数组
 * （'white_player_id' 为 null 表示空位）。不做这层还原，规则层里
 * $room['seq'] + 1 之类的比较会按字符串走，边界上出错还看不出来。
 */
function chess_room_from_row($row) {
    $intOrNull = static function ($value) {
        return $value === null ? null : (int) $value;
    };
    return [
        'id' => (int) $row['id'],
        'code' => $row['code'],
        'white_player_id' => $intOrNull($row['white_player_id']),
        'black_player_id' => $intOrNull($row['black_player_id']),
        'fen' => $row['fen'],
        'status' => $row['status'],
        'result' => $row['result'],
        'winner' => $row['winner'],
        'time_ms' => (int) $row['time_ms'],
        'white_ms' => (int) $row['white_ms'],
        'black_ms' => (int) $row['black_ms'],
        'turn_started_ms' => $intOrNull($row['turn_started_ms']),
        'seq' => (int) $row['seq'],
    ];
}

/** 新建房间；房间码撞了就换一个新的再来一次（唯一索引会挡住并发的那一个）。 */
function chess_insert_room($conn, array $room) {
    chess_room_schema($conn);
    for ($try = 0; $try < 5; $try++) {
        $code = $try === 0 ? $room['code'] : chess_room_code();
        $white = $room['white_player_id'];
        $black = $room['black_player_id'];
        $time = $room['time_ms'];
        $fen = $room['fen'];
        $status = $room['status'];
        $stmt = $conn->prepare("INSERT INTO chess_rooms
            (code, white_player_id, black_player_id, fen, status, result, winner,
             time_ms, white_ms, black_ms, turn_started_ms, seq, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, 0, NOW(), NOW())");
        $stmt->bind_param(
            "siissiii",
            $code,
            $white,
            $black,
            $fen,
            $status,
            $time,
            $time,
            $time
        );
        if ($stmt->execute()) {
            $room['code'] = $code;
            $room['id'] = (int) $conn->insert_id;
            $stmt->close();
            return $room;
        }
        $stmt->close();
        error_log('chess room insert try ' . ($try + 1) . ': ' . $conn->error);
        // 只有"房间码已存在"值得重试，别的错重试也一样
        if (stripos((string) $conn->error, 'uq_room_code') === false) {
            return null;
        }
    }
    return null;
}

/**
 * 写回房间。$expectSeq 是取到那一行时的 seq：0 行受影响 = 这行在我们读它之后
 * 被人改过（同一手双击、或对手已经走完），调用方回 stale_move，绝不能覆盖。
 *
 * $expectStatus 是给"不涨 seq 的改动"准备的（认输、超时结案）。这两类只改状态不改 seq，
 * 于是 WHERE seq = 0 对两个同时认输的人都会命中，后写的会把前一个人的
 * resign-white 改成 resign-black —— 比分就错了。加上状态预期就没这个问题：
 * 谁先把 active 改成 over，另一个人的 WHERE 就落空。走子不需要它（seq 一定变），
 * 但走子同样只在 active 时成立，所以一并传。
 */
function chess_write_room($conn, array $room, $expectSeq, $expectStatus = null) {
    $white = $room['white_player_id'];
    $black = $room['black_player_id'];
    $result = $room['result'];
    $winner = $room['winner'];
    $started = $room['turn_started_ms'];
    $sql = "UPDATE chess_rooms SET white_player_id = ?, black_player_id = ?,
            fen = ?, status = ?, result = ?, winner = ?, white_ms = ?, black_ms = ?,
            turn_started_ms = ?, seq = ?, updated_at = NOW()
        WHERE id = ? AND seq = ?" . ($expectStatus === null ? '' : ' AND status = ?');
    $params = [
        $white,
        $black,
        $room['fen'],
        $room['status'],
        $result,
        $winner,
        $room['white_ms'],
        $room['black_ms'],
        $started,
        $room['seq'],
        $room['id'],
        $expectSeq,
    ];
    // 顺序必须和上面 SQL 里的 ? 一一对应：i = 整数，s = 字符串/NULL。
    //  mysqli 只认 i/d/s/b 这四个字符，写进去别的（11-23 线上就是误写了 'a'）
    //  不是"类型宽松一点"，是整条 UPDATE 直接失败。
    $types = 'iissssiiiiii';
    if ($expectStatus !== null) {
        $params[] = $expectStatus;
        $types .= 's';
    }
    // 数错一个 ?、或者写了 mysqli 不认的类型字符，结果都是"房间停在旧状态不动"，
    // 两边各看一份局面。这种错必须当场报出来，所以这里自检一次。
    if (count($params) !== strlen($types) || strlen($types) !== substr_count($sql, '?')
        || preg_match('/[^idbs]/', $types)) {
        error_log('chess write room: bind mismatch (' . strlen($types) . ' types "' . $types
            . '", ' . count($params) . ' params, ' . substr_count($sql, '?') . ' placeholders)');
        return false;
    }
    $stmt = $conn->prepare($sql);
    if ($stmt === false) {
        error_log('chess write room: prepare failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param($types, ...$params);
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess write room: execute failed: ' . $stmt->error);
    }
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/**
 * 抢一个空位。座位是被这条语句本身抢下来的，不能靠 chess_write_room：
 * 进房不涨 seq，两个人同时进同一个房间时两个 WHERE seq = 0 都会命中，
 * 后写的会把前一个人顶出座位。所以按"这个座位还是空的"来卡，
 * 座位名只能取这两个字面值（不能绑定，所以白名单而不是拼接输入）。
 * $seat 由 chess_room_join 的返回值给出，不是用户输入。
 */
function chess_room_claim_seat($conn, $roomId, $seat, $playerId, $nowMs) {
    if ($seat !== 'white_player_id' && $seat !== 'black_player_id') {
        error_log('chess claim seat: unexpected seat ' . var_export($seat, true));
        return false;
    }
    $stmt = $conn->prepare("UPDATE chess_rooms SET {$seat} = ?, status = 'active',
            turn_started_ms = ?, updated_at = NOW()
        WHERE id = ? AND {$seat} IS NULL AND status = 'waiting'");
    $stmt->bind_param("iii", $playerId, $nowMs, $roomId);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/** 记一手棋。和 chess_write_room 在同一个请求里，两个都成功才算走完这一步。 */
function chess_insert_event($conn, $roomId, array $event) {
    $seq = $event['seq'];
    $by = $event['played_by'];
    $stmt = $conn->prepare("INSERT INTO chess_room_events (room_id, seq, san, fen_after, played_by, played_at)
        VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->bind_param("iissi", $roomId, $seq, $event['san'], $event['fen_after'], $by);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

/**
 * seq > $since 的事件，给轮询和掉线重进用。
 * 上限取 200 是因为重进（since=0）要一次把整份棋谱拿回去：一局少儿对弈常见的
 * 是 60–100 手，卡到 60 就会让重进来的人看到半份棋谱。200 条约 24KB，一次性的。
 */
function chess_room_events($conn, $roomId, $since, $cap = 200) {
    $stmt = $conn->prepare("SELECT seq, san, fen_after, played_by, played_at
        FROM chess_room_events WHERE room_id = ? AND seq > ? ORDER BY seq ASC LIMIT " . (int) $cap);
    $stmt->bind_param("ii", $roomId, $since);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'seq' => (int) $row['seq'],
            'san' => $row['san'],
            'fen_after' => $row['fen_after'],
            'played_by' => (int) $row['played_by'],
            'played_at' => $row['played_at'],
        ];
    }
    $stmt->close();
    return $rows;
}

/** 房间里两个人的昵称；规则层不该知道昵称，所以由端点查了传进去。 */
function chess_room_names($conn, array $room) {
    $ids = array_filter([$room['white_player_id'], $room['black_player_id']]);
    if (!$ids) {
        return [];
    }
    $in = implode(',', array_map('intval', $ids));
    $names = [];
    $result = $conn->query("SELECT id, nickname FROM chess_players WHERE id IN ({$in})");
    while ($row = $result->fetch_assoc()) {
        $names[(int) $row['id']] = $row['nickname'];
    }
    return $names;
}

/* --------------------------------------------------------------------------
 * 课堂（P3）。和房间分开：课堂没有计时器、成员是 1 老师 + N 学生、
 * 事件类型不只是走子（还有标注、举手、批准）。
 * ------------------------------------------------------------------------ */

function chess_class_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code CHAR(4) NOT NULL,
        teacher_id INT NOT NULL,
        fen VARCHAR(90) NOT NULL,
        status VARCHAR(16) NOT NULL,
        seq INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_code (code),
        INDEX idx_class_teacher (teacher_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_class_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        player_id INT NOT NULL,
        role VARCHAR(16) NOT NULL,
        hand_status VARCHAR(16) NOT NULL DEFAULT 'none',
        joined_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_player (class_id, player_id),
        INDEX idx_class_hand (class_id, hand_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_class_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        seq INT NOT NULL,
        type VARCHAR(16) NOT NULL,
        data TEXT NOT NULL,
        actor_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_seq (class_id, seq),
        INDEX idx_class_events (class_id, seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

function chess_find_class($conn, $code) {
    chess_class_schema($conn);
    $stmt = $conn->prepare("SELECT id, code, teacher_id, fen, status, seq
        FROM chess_classes WHERE code = ? LIMIT 1");
    $stmt->bind_param("s", $code);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_class_from_row($row) {
    return [
        'id' => (int) $row['id'],
        'code' => $row['code'],
        'teacher_id' => (int) $row['teacher_id'],
        'fen' => $row['fen'],
        'status' => $row['status'],
        'seq' => (int) $row['seq'],
    ];
}

function chess_insert_class($conn, array $class) {
    chess_class_schema($conn);
    for ($try = 0; $try < 5; $try++) {
        $code = $try === 0 ? $class['code'] : chess_class_code();
        $teacher = $class['teacher_id'];
        $fen = $class['fen'];
        $status = $class['status'];
        $stmt = $conn->prepare("INSERT INTO chess_classes
            (code, teacher_id, fen, status, seq, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, NOW(), NOW())");
        $stmt->bind_param("siss", $code, $teacher, $fen, $status);
        if ($stmt->execute()) {
            $class['code'] = $code;
            $class['id'] = (int) $conn->insert_id;
            $stmt->close();
            return $class;
        }
        $stmt->close();
        if (stripos((string) $conn->error, 'uq_class_code') === false) {
            return null;
        }
    }
    return null;
}

function chess_write_class($conn, array $class, $expectSeq) {
    $stmt = $conn->prepare("UPDATE chess_classes SET fen = ?, status = ?, seq = ?, updated_at = NOW()
        WHERE id = ? AND seq = ?");
    $stmt->bind_param("ssiii", $class['fen'], $class['status'], $class['seq'], $class['id'], $expectSeq);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

function chess_class_members($conn, $classId) {
    chess_class_schema($conn);
    $result = $conn->query(
        "SELECT cm.player_id, cm.role, cm.hand_status, p.nickname
        FROM chess_class_members cm
        JOIN chess_players p ON p.id = cm.player_id
        WHERE cm.class_id = {$classId}
        ORDER BY cm.joined_at ASC"
    );
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'player_id' => (int) $row['player_id'],
            'role' => $row['role'],
            'hand_status' => $row['hand_status'],
            'nickname' => $row['nickname'],
        ];
    }
    return $rows;
}

function chess_class_member($conn, $classId, $playerId) {
    $stmt = $conn->prepare("SELECT role, hand_status FROM chess_class_members
        WHERE class_id = ? AND player_id = ? LIMIT 1");
    $stmt->bind_param("ii", $classId, $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_class_add_member($conn, $classId, $playerId, $role) {
    chess_class_schema($conn);
    $stmt = $conn->prepare("INSERT IGNORE INTO chess_class_members
        (class_id, player_id, role, hand_status, joined_at) VALUES (?, ?, ?, 'none', NOW())");
    $stmt->bind_param("iis", $classId, $playerId, $role);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_remove_member($conn, $classId, $playerId) {
    $stmt = $conn->prepare("DELETE FROM chess_class_members WHERE class_id = ? AND player_id = ?");
    $stmt->bind_param("ii", $classId, $playerId);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_set_hand($conn, $classId, $playerId, $status) {
    $stmt = $conn->prepare("UPDATE chess_class_members SET hand_status = ?
        WHERE class_id = ? AND player_id = ?");
    $stmt->bind_param("sii", $status, $classId, $playerId);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_insert_event($conn, $classId, array $event) {
    // 规则层给的是数组，库里存 TEXT，所以在这里编码一次。端点回给客户端的仍是
    // 数组——两边形状一样，客户端不必分「刚发出去的」和「轮询回来的」两种事件。
    $data = is_string($event['data']) ? $event['data'] : json_encode($event['data'], JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare("INSERT INTO chess_class_events (class_id, seq, type, data, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->bind_param("iissi", $classId, $event['seq'], $event['type'], $data, $event['actor_id']);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_events($conn, $classId, $since, $cap = 200) {
    $stmt = $conn->prepare("SELECT seq, type, data, actor_id, created_at
        FROM chess_class_events WHERE class_id = ? AND seq > ? ORDER BY seq ASC LIMIT " . (int) $cap);
    $stmt->bind_param("ii", $classId, $since);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'seq' => (int) $row['seq'],
            'type' => $row['type'],
            // 写进去时是 json_encode 的字符串，读出来还原成对象：客户端不该再解一次，
            // 解错的地方也就不存在了。
            'data' => json_decode((string) $row['data'], true) ?? [],
            'actor_id' => (int) $row['actor_id'],
            'created_at' => $row['created_at'],
        ];
    }
    $stmt->close();
    return $rows;
}

function chess_class_close($conn, $classId, $expectSeq) {
    $stmt = $conn->prepare("UPDATE chess_classes SET status = 'closed', seq = seq + 1, updated_at = NOW()
        WHERE id = ? AND seq = ?");
    $stmt->bind_param("ii", $classId, $expectSeq);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/* --------------------------------------------------------------------------
 * 教练偏好（P3）。什么算一个合法的偏好，全在 chess_coach_core.php；
 * 这里只管建表、取那一行、把一行还原成规则层的形状。
 * ------------------------------------------------------------------------ */

/**
 * 一人一行，player_id 就是主键 —— 这个表没有"多份偏好"可言，
 * 存第二次是改而不是加，所以端点用 ON DUPLICATE KEY UPDATE。
 *
 * 多选存逗号串而不是 JSON：这一列只被"取出自己那一行"用（教练那边的匹配
 * 之后按 FIND_IN_SET 数人），而共享主机的 MySQL 版本没法在这儿验，
 * chess_library 那张表用 JSON 建没建成我此刻也无从查起。逗号串在任何
 * 一个还活着的版本上都是一列 VARCHAR —— 少一个能静默失败的地方。
 */
function chess_coach_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_prefs (
        player_id INT PRIMARY KEY,
        level VARCHAR(16) NOT NULL,
        goals VARCHAR(64) NOT NULL,
        formats VARCHAR(32) NOT NULL,
        slots VARCHAR(64) NOT NULL,
        timezone VARCHAR(40) NOT NULL,
        language VARCHAR(8) NOT NULL,
        note VARCHAR(240) NOT NULL DEFAULT '',
        contact_ok TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_coach_level (level),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

/** 这个人的偏好；没填过返回 null（"没填"是正常状态，不是错误）。 */
function chess_coach_pref_read($conn, $playerId) {
    chess_coach_schema($conn);
    $stmt = $conn->prepare("SELECT level, goals, formats, slots, timezone, language,
            note, contact_ok, updated_at
        FROM chess_coach_prefs WHERE player_id = ? LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/**
 * 存（或改）这个人的偏好。$pref 是 coach_pref_normalize() 通过后的那一份，
 * 所以这里的字段顺序就是规则层的字段顺序，端点不参与判断合不合法。
 *
 * created_at 只在第一次插入时写：ON DUPLICATE KEY UPDATE 那一段里不碰它，
 * 于是"什么时候开始想找教练"和"最后一次改是什么时候"两个时刻都留得住。
 */
function chess_coach_pref_write($conn, $playerId, array $pref) {
    chess_coach_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_coach_prefs
        (player_id, level, goals, formats, slots, timezone, language, note, contact_ok,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE level = VALUES(level), goals = VALUES(goals),
            formats = VALUES(formats), slots = VALUES(slots), timezone = VALUES(timezone),
            language = VALUES(language), note = VALUES(note),
            contact_ok = VALUES(contact_ok), updated_at = NOW()");
    if ($stmt === false) {
        error_log('chess coach pref: prepare failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param(
        "isssssssi",
        $playerId,
        $pref['level'],
        $pref['goals'],
        $pref['formats'],
        $pref['slots'],
        $pref['timezone'],
        $pref['language'],
        $pref['note'],
        $pref['contact_ok']
    );
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach pref: execute failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}
