<?php
/**
 * 教练图片 —— 下发一张。GET ?c=<player_id>&f=<文件名>
 *
 * 为什么不走静态地址：目录 v1/coach_media/ 里那张 .htaccess 写着 Require all denied，
 * 这些字节只能从这一条路出去。换来的是两件实在的事 ——
 *   1. 删掉的照片当场 404（判据是"这一行还指着它"），不是留在盘上任人按 URL 取；
 *   2. 服务端不需要相信任何人给的路径：目录是 (int)player_id，文件名先过
 *      COACH_IMAGE_PATTERN（那 24 位十六进制 + 三种扩展名），拼不出 "../" 这种形状。
 *
 * 不判登录、不判够不够格：名录页上每张头像都要能显示，而一个没登录的人
 * 本来就看得到名录。够不够格的门在上传那一路（photo_save）。
 *
 * 文件名本身是一道口令（服务端随机生成，没人能猜），所以这一条可以放开缓存：
 * 名录一页十几张图，重复下发是这台机器上最贵的一件事。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$coachId = (int) ($_GET['c'] ?? 0);
$name = (string) ($_GET['f'] ?? '');
$conn = chess_db();

try {
    if ($coachId < 1 || !preg_match(COACH_IMAGE_PATTERN, $name)) {
        chess_err('no_such_coach');
    }
    $row = chess_profile_row($conn, $coachId);
    $path = $row === null ? null : chess_coach_media_path($coachId, $name, $row);
    if ($path === null) {
        chess_err('no_such_coach');
    }

    $type = match (strtolower((string) pathinfo($name, PATHINFO_EXTENSION))) {
        'png' => 'image/png',
        'webp' => 'image/webp',
        default => 'image/jpeg',
    };
    $size = (int) (@filesize($path) ?: 0);

    header('Content-Type: ' . $type);
    header('Content-Length: ' . $size);
    header('Cache-Control: public, max-age=604800, immutable');
    header('X-Content-Type-Options: nosniff');
    // 图片不该被别的站点当成自己的内容框进来
    header('X-Frame-Options: DENY');
    readfile($path);
} catch (Throwable $e) {
    chess_fail($e, 'coach photo read');
}
