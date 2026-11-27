<?php
/**
 * 棋手账号的邮件出口：验证链接由这里发出。
 * SMTP 凭据只在服务器侧的 chess_mail_config.php 里，那个文件不入库、
 * 也被 .htaccess 挡着不让直接访问。
 */

require_once __DIR__ . '/PHPMailer/Exception.php';
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

function chess_mail_config() {
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $path = __DIR__ . '/chess_mail_config.php';
    if (!is_readable($path)) {
        error_log('chess mail: missing ' . $path);
        return $cfg = false;
    }
    $loaded = require $path;
    if (!is_array($loaded) || empty($loaded['user']) || empty($loaded['pass'])) {
        error_log('chess mail: chess_mail_config.php did not return credentials');
        return $cfg = false;
    }
    return $cfg = $loaded;
}

function chess_verify_link($token) {
    // 验证只在服务端做完，再把人送回棋盘；棋盘按查询串显示一句话
    return 'https://www.ichessgeek.com/api/v1/chess_verify.php?token=' . urlencode($token);
}

/**
 * @return bool true 表示 SMTP 已接收
 */
function chess_send_verification($to, $nickname, $token) {
    $cfg = chess_mail_config();
    if ($cfg === false) {
        return false;
    }

    $link = chess_verify_link($token);
    $hours = (int) ceil(CHESS_VERIFY_TTL / 3600);
    $name = htmlspecialchars($nickname, ENT_QUOTES, 'UTF-8');

    $text = "你好 {$nickname}：\n\n"
        . "差一步就好 —— 确认这个邮箱就能在 ichessgeek.com 上和其他人下棋。\n\n"
        . "点这个链接确认：\n{$link}\n\n"
        . "链接 {$hours} 小时内有效。链接点不开就把上面整行地址复制到浏览器地址栏。\n"
        . "如果这不是你本人的注册，忽略这封信即可。\n";

    $html = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        . 'max-width:520px;margin:0 auto;padding:24px 16px;color:#222;line-height:1.7">'
        . '<p style="font-size:17px;margin:0 0 12px">你好 <strong>' . $name . '</strong>：</p>'
        . '<p style="margin:0 0 20px">差一步就好 —— 确认这个邮箱就能在 ichessgeek.com 上和其他人下棋。</p>'
        . '<p style="margin:0 0 20px">'
        . '<a href="' . htmlspecialchars($link, ENT_QUOTES, 'UTF-8') . '"'
        . ' style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;'
        . 'padding:12px 20px;border-radius:8px">确认我的邮箱</a></p>'
        . '<p style="margin:0 0 6px;font-size:13px;color:#666">链接点不开就把下面整行复制到浏览器地址栏：</p>'
        . '<p style="margin:0 0 20px;font-size:13px;word-break:break-all;user-select:all">'
        . htmlspecialchars($link, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p style="margin:0;font-size:13px;color:#888">链接 ' . $hours . ' 小时内有效。'
        . '如果这不是你本人的注册，忽略这封信即可。</p>'
        . '</div>';

    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $cfg['host'];
        $mail->Port = (int) ($cfg['port'] ?? 465);
        $mail->SMTPAuth = true;
        $mail->Username = $cfg['user'];
        $mail->Password = $cfg['pass'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->Timeout = 15;

        $mail->setFrom($cfg['from'] ?? $cfg['user'], $cfg['from_name'] ?? 'iChessGeek');
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = '确认你的 ichessgeek 邮箱';
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
        return true;
    } catch (Throwable $e) {
        error_log('chess verification mail failed for ' . $to . ': ' . $e->getMessage());
        return false;
    }
}

function chess_mail_deliver($to, $subject, $text, $html, $replyTo = null) {
    $cfg = chess_mail_config();
    if ($cfg === false || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    if ($replyTo !== null && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $cfg['host'];
        $mail->Port = (int) ($cfg['port'] ?? 465);
        $mail->SMTPAuth = true;
        $mail->Username = $cfg['user'];
        $mail->Password = $cfg['pass'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->Timeout = 15;
        $mail->setFrom($cfg['from'] ?? $cfg['user'], $cfg['from_name'] ?? 'iChessGeek');
        $mail->addAddress($to);
        if ($replyTo !== null) {
            $mail->addReplyTo($replyTo);
        }
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
        return true;
    } catch (Throwable $e) {
        error_log('chess marketplace mail failed: ' . $e->getMessage());
        return false;
    }
}

function chess_inquiry_preference_text(array $pref) {
    $budgetMin = $pref['budget_min_cny'] ?? null;
    $budgetMax = $pref['budget_max_cny'] ?? null;
    if ($budgetMin !== null && $budgetMax !== null) {
        $budget = $budgetMin . '–' . $budgetMax . ' 元 / 60 分钟';
    } elseif ($budgetMin !== null) {
        $budget = $budgetMin . ' 元以上 / 60 分钟';
    } elseif ($budgetMax !== null) {
        $budget = $budgetMax . ' 元以内 / 60 分钟';
    } else {
        $budget = '未填写';
    }
    $lines = [
        '当前水平：' . ($pref['level'] ?? '未填写'),
        '学习目标：' . ($pref['goals'] ?? '未填写'),
        '上课形式：' . ($pref['formats'] ?? '未填写'),
        '方便时段：' . ($pref['slots'] ?? '未填写'),
        '时区：' . ($pref['timezone'] ?? '未填写'),
        '授课语言：' . ($pref['language'] ?? '未填写'),
        '预算：' . $budget,
        '详细时间：' . ($pref['schedule_note'] ?? ''),
        '自我介绍：' . ($pref['note'] ?? ''),
    ];
    return implode("\n", $lines);
}

/** 先交给教练，再给学员回执；学员回执不包含教练邮箱。 */
function chess_send_coach_inquiry($coachEmail, $coachName, $studentEmail, $studentName, $message, array $pref) {
    $preferenceText = chess_inquiry_preference_text($pref);
    $coachText = "你好 {$coachName}：\n\n"
        . "有学员通过 ichessgeek 预约你的课程。\n\n"
        . "学员：{$studentName}\n"
        . "学员邮箱：{$studentEmail}\n\n"
        . "预约说明：\n{$message}\n\n"
        . "学员偏好：\n{$preferenceText}\n\n"
        . "请直接回复这封邮件联系学员。\n";
    $coachHtml = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        . 'max-width:640px;margin:0 auto;padding:24px 16px;color:#222;line-height:1.7">'
        . '<p>你好 ' . htmlspecialchars($coachName, ENT_QUOTES, 'UTF-8') . '：</p>'
        . '<p>有学员通过 ichessgeek 预约你的课程。</p>'
        . '<p><strong>学员：</strong>' . htmlspecialchars($studentName, ENT_QUOTES, 'UTF-8') . '<br>'
        . '<strong>学员邮箱：</strong>' . htmlspecialchars($studentEmail, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><strong>预约说明：</strong><br>' . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) . '</p>'
        . '<p><strong>学员偏好：</strong><br>' . nl2br(htmlspecialchars($preferenceText, ENT_QUOTES, 'UTF-8')) . '</p>'
        . '<p>请直接回复这封邮件联系学员。</p></div>';
    $coachSent = chess_mail_deliver(
        $coachEmail,
        'ichessgeek 学员预约',
        $coachText,
        $coachHtml,
        $studentEmail
    );
    if (!$coachSent) {
        return ['coach' => false, 'student' => false];
    }

    $studentText = "你好 {$studentName}：\n\n"
        . "你的预约已通过 ichessgeek 转交给教练 {$coachName}。\n"
        . "教练会直接回复你的账号邮箱；平台不会公开教练的邮箱。\n\n"
        . "如果一直没有收到回复，你可以检查垃圾邮件文件夹。\n";
    $studentHtml = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        . 'max-width:520px;margin:0 auto;padding:24px 16px;color:#222;line-height:1.7">'
        . '<p>你好 ' . htmlspecialchars($studentName, ENT_QUOTES, 'UTF-8') . '：</p>'
        . '<p>你的预约已通过 ichessgeek 转交给教练 '
        . htmlspecialchars($coachName, ENT_QUOTES, 'UTF-8') . '。</p>'
        . '<p>教练会直接回复你的账号邮箱；平台不会公开教练的邮箱。</p>'
        . '<p>如果一直没有收到回复，你可以检查垃圾邮件文件夹。</p></div>';
    $studentSent = chess_mail_deliver(
        $studentEmail,
        'ichessgeek 预约已转交',
        $studentText,
        $studentHtml
    );
    if (!$studentSent) {
        error_log('chess inquiry confirmation failed after coach delivery');
    }
    return ['coach' => true, 'student' => $studentSent];
}
