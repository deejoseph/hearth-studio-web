<?php
/**
 * 教练图片 —— 传一张。POST multipart: kind=avatar|photos|certificates, file=<图>
 *
 * 一次一张而不是整批：传完当场就能在界面上看到那一张，而"整批替换"那种写法
 * 会让一次网络中断把已有照片清空 —— 照片是不可再生成的东西。
 *
 * 三道门按顺序过：登录且邮箱验证过 → 这张图是不是真图片 → 事务内复核教练资格。
 * 图片先做轻量校验，资格行加锁后再落盘，避免校验期间被撤销后仍写入。
 *
 * 🔴 类型只认 getimagesize() 读出来的（它看文件头），不认浏览器给的 Content-Type：
 * 那一个是客户端字段，把 .php 改名成 .jpg 再标 image/jpeg 照样能过。
 * 落盘的名字由服务端生成（随机 24 位十六进制 + 真类型给的扩展名），
 * 人给的文件名一个字符都不参与 —— 于是不可能出现 .php、双扩展名、路径分隔符。
 * 目录 v1/coach_media/ 里那张 .htaccess 写着 Require all denied，
 * 这些字节只能从 chess_coach_photo.php 那一侧出去。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    chess_err('method');
}

$playerId = chess_require_verified();
$conn = chess_db();

// kind 只决定写哪一列。别的值退到头像，不拼进 SQL，也不当成目录名。
$kind = $_POST['kind'] ?? '';
$field = in_array($kind, ['photos', 'certificates'], true) ? $kind : 'avatar';

$file = $_FILES['file'] ?? null;
if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    chess_err('bad_image', ['field' => $field]);
}
// is_uploaded_file：只认"这一次 POST 真的经 PHP 上传来的临时文件"，
// 有人拿别的路径混进来（PHP 不会，但这道题的代价是把别人的文件读出来）就到此为止。
$tmp = (string) ($file['tmp_name'] ?? '');
if ($tmp === '' || !is_uploaded_file($tmp)) {
    chess_err('bad_image', ['field' => $field]);
}

$bytes = (int) (@filesize($tmp) ?: 0);
if ($bytes < 1 || $bytes > COACH_IMAGE_BYTES_MAX) {
    chess_err('big_image', ['field' => $field]);
}
// getimagesize 对不是图的东西返回 false，不抛异常 —— 那份 false 交给规则层判。
$info = @getimagesize($tmp);

$storedName = null;
try {
    // 文件落盘不能随 SQL 回滚，所以这里不自动重试整个上传；失败时由 catch 清掉新文件。
    $conn->begin_transaction();
    $result = (static function () use ($conn, $playerId, $field, $info, $bytes, $tmp, &$storedName) {
        chess_lock_player_standing($conn, $playerId);
        if (chess_player_is_revoked($conn, $playerId)) {
            return ['ok' => false, 'code' => 'coach_revoked'];
        }
        if (!chess_player_can_teach($conn, $playerId)) {
            return ['ok' => false, 'code' => 'teacher_only'];
        }
        $ip = chess_client_ip();
        if (chess_attempt_count($conn, 'photo', $ip, CHESS_PHOTO_WINDOW) >= CHESS_PHOTO_LIMIT) {
            return ['ok' => false, 'code' => 'too_many_uploads'];
        }

        [$name, $code] = coach_image_store_name($info, $bytes, bin2hex(random_bytes(12)));
        if ($code !== null) {
            return ['ok' => false, 'code' => $code, 'field' => $field];
        }

        $old = chess_profile_row($conn, $playerId, true) ?? [];
        if ($field !== 'avatar') {
            $isCertificate = $field === 'certificates';
            $max = $isCertificate ? COACH_CERTIFICATES_MAX : COACH_PHOTOS_MAX;
            $tooMany = $isCertificate ? 'too_many_certificates' : 'too_many_photos';
            $existing = array_values(array_filter(array_map('trim',
                explode(',', (string) ($old[$field] ?? '')))));
            [$value, , $bad] = coach_image_list(array_merge($existing, [$name]),
                $max, $field, 'bad_image', $tooMany);
            if ($bad !== null) {
                return ['ok' => false, 'code' => $bad, 'field' => $field];
            }
        } else {
            $value = $name;
        }

        $dir = chess_coach_media_dir($playerId);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            $why = error_get_last();
            error_log('chess coach media: mkdir failed for player ' . $playerId
                . ' (' . ($why['message'] ?? 'unknown') . ')');
            throw new RuntimeException('coach media mkdir failed');
        }
        if (!move_uploaded_file($tmp, $dir . '/' . $name)) {
            error_log('chess coach media: move failed for player ' . $playerId);
            throw new RuntimeException('coach media move failed');
        }
        $storedName = $name;
        if (!chess_profile_set_image($conn, $playerId, $field, $value)) {
            throw new RuntimeException('coach profile image update failed');
        }

        $row = chess_profile_row($conn, $playerId, true);
        if ($row === null) {
            throw new RuntimeException('coach profile image written but missing');
        }
        chess_record_attempt($conn, 'photo', $ip);
        return ['ok' => true, 'row' => $row];
    })();
    $conn->commit();
    $storedName = null;
    if (!$result['ok']) {
        chess_err($result['code'], isset($result['field']) ? ['field' => $result['field']] : []);
    }

    $row = $result['row'];
    chess_coach_media_prune($playerId, chess_coach_media_names($row));
    chess_json([
        'ok' => true,
        'profile' => coach_profile_public($row),
        'filled' => coach_profile_filled(coach_profile_public($row)),
        'listed' => true,
    ]);
} catch (Throwable $e) {
    $conn->rollback();
    if ($storedName !== null) {
        @unlink(chess_coach_media_dir($playerId) . '/' . $storedName);
    }
    chess_fail($e, 'coach photo save');
}
