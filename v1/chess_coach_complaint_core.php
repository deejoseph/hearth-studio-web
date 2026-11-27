<?php
/**
 * 教练申诉的规则层：校验、状态白名单和公开/私有字段白名单。
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

require_once __DIR__ . '/chess_coach_core.php';

const COACH_COMPLAINT_STATUSES = ['pending', 'upheld', 'rejected'];
const COACH_COMPLAINT_SEVERITIES = ['normal', 'severe'];
const COACH_COMPLAINT_TEXT_MIN = 20;
const COACH_COMPLAINT_TEXT_MAX = 3000;
const COACH_COMPLAINT_PUBLIC_MAX = 3000;
const COACH_RESTORE_REASON_MAX = 1000;

function coach_complaint_text_normalize($data) {
    $fail = static function ($code, $field = null) {
        return ['ok' => false, 'coach_id' => null, 'text' => '', 'text_hash' => null,
            'code' => $code, 'field' => $field];
    };
    if (!is_array($data)) {
        return $fail('bad_body');
    }
    $coachId = coach_positive_id($data['coach_id'] ?? null);
    if ($coachId === null) {
        return $fail('bad_coach_id', 'coach_id');
    }
    $given = $data['text'] ?? '';
    if (!is_string($given)) {
        return $fail('bad_complaint', 'text');
    }
    $text = coach_trim($given);
    if ($text !== '' && !coach_is_utf8($text)) {
        return $fail('bad_complaint', 'text');
    }
    $len = coach_len($text);
    if ($len < COACH_COMPLAINT_TEXT_MIN || $len > COACH_COMPLAINT_TEXT_MAX) {
        return $fail($len < COACH_COMPLAINT_TEXT_MIN ? 'short_complaint' : 'long_complaint', 'text');
    }
    return ['ok' => true, 'coach_id' => $coachId, 'text' => $text,
        'text_hash' => hash('sha256', $coachId . ':' . $text), 'code' => null, 'field' => null];
}

function coach_complaint_status($value, $allowEmpty = false) {
    $key = coach_key($value);
    if ($allowEmpty && ($key === null || $key === '')) {
        return null;
    }
    return $key !== null && in_array($key, COACH_COMPLAINT_STATUSES, true) ? $key : '';
}

function coach_complaint_severity($value) {
    $key = coach_key($value);
    return $key !== null && in_array($key, COACH_COMPLAINT_SEVERITIES, true) ? $key : null;
}

function coach_complaint_decision_normalize(array $data, array $current = []) {
    $fail = static function ($code, $field) {
        return ['ok' => false, 'action' => null, 'public_text' => '', 'severity' => 'normal',
            'revoke' => false, 'code' => $code, 'field' => $field];
    };
    $action = coach_key($data['action'] ?? null);
    if ($action !== 'uphold' && $action !== 'reject') {
        return $fail('bad_action', 'action');
    }
    if (array_key_exists('severity', $data) && $data['severity'] !== null && $data['severity'] !== '') {
        $severity = coach_complaint_severity($data['severity']);
        if ($severity === null) {
            return $fail('bad_severity', 'severity');
        }
    } else {
        $severity = coach_complaint_severity($current['severity'] ?? null) ?? 'normal';
    }
    if (array_key_exists('revoke', $data) && !is_bool($data['revoke'])) {
        return $fail('bad_revoke', 'revoke');
    }
    $revoke = ($data['revoke'] ?? false) === true;
    if ($action === 'reject') {
        if ($revoke) {
            return $fail('bad_revoke', 'revoke');
        }
        return ['ok' => true, 'action' => 'reject', 'public_text' => '', 'severity' => $severity,
            'revoke' => false, 'code' => null, 'field' => null];
    }
    $given = $data['public_text'] ?? null;
    if (!is_string($given)) {
        return $fail('bad_public_text', 'public_text');
    }
    $publicText = coach_trim($given);
    if ($publicText !== '' && !coach_is_utf8($publicText)) {
        return $fail('bad_public_text', 'public_text');
    }
    if ($publicText === '' || coach_len($publicText) > COACH_COMPLAINT_PUBLIC_MAX) {
        return $fail('bad_public_text', 'public_text');
    }
    if ($revoke && $severity !== 'severe') {
        return $fail('bad_revoke', 'revoke');
    }
    return ['ok' => true, 'action' => 'uphold', 'public_text' => $publicText,
        'severity' => $severity, 'revoke' => $revoke, 'code' => null, 'field' => null];
}

function coach_restore_reason_normalize($value) {
    if (!is_string($value)) {
        return ['ok' => false, 'reason' => '', 'code' => 'bad_restore_reason'];
    }
    $reason = coach_trim($value);
    if ($reason === '' || !coach_is_utf8($reason) || coach_len($reason) > COACH_RESTORE_REASON_MAX) {
        return ['ok' => false, 'reason' => '', 'code' => 'bad_restore_reason'];
    }
    return ['ok' => true, 'reason' => $reason, 'code' => null];
}

/** 公开申诉只含管理员批准发表的四个字段。 */
function coach_complaint_public($row) {
    return [
        'id' => (int) ($row['id'] ?? 0),
        'public_text' => (string) ($row['public_text'] ?? ''),
        'severity' => (string) ($row['severity'] ?? 'normal'),
        'published_at' => $row['published_at'] ?? null,
    ];
}

/** 教练看自己、管理员看队列都拿不到举报人 ID 或哈希。 */
function coach_complaint_private($row) {
    return [
        'id' => (int) ($row['id'] ?? 0),
        'coach_id' => (int) ($row['coach_id'] ?? 0),
        'text' => (string) ($row['text'] ?? ''),
        'public_text' => (string) ($row['public_text'] ?? ''),
        'status' => (string) ($row['status'] ?? 'pending'),
        'severity' => (string) ($row['severity'] ?? 'normal'),
        'created_at' => $row['created_at'] ?? null,
        'decided_at' => $row['decided_at'] ?? null,
        'published_at' => $row['published_at'] ?? null,
    ];
}

/** 被驳回的原始指控不回到教练屏幕；举报人自己和管理员仍可审计。 */
function coach_complaint_for_coach($row) {
    $out = coach_complaint_private($row);
    if (($row['status'] ?? 'pending') === 'rejected') {
        $out['text'] = '';
        $out['public_text'] = '';
        $out['published_at'] = null;
    }
    return $out;
}

function coach_complaint_admin($row) {
    $restoredAt = $row['restored_at'] ?? null;
    return coach_complaint_private($row) + [
        'coach_name' => (string) ($row['coach_name'] ?? $row['coach_nickname'] ?? ''),
        'coach_nickname' => (string) ($row['coach_nickname'] ?? $row['coach_name'] ?? ''),
        'standing_status' => (string) ($row['standing_status'] ?? 'active'),
        'revoked' => ($row['standing_status'] ?? 'active') === 'revoked'
            && ($restoredAt === null || $restoredAt === ''),
        'restored_at' => $restoredAt,
    ];
}

function coach_complaint_receipt($row) {
    return [
        'id' => (int) ($row['id'] ?? 0),
        'coach_id' => (int) ($row['coach_id'] ?? 0),
        'status' => (string) ($row['status'] ?? 'pending'),
        'created_at' => $row['created_at'] ?? null,
    ];
}

function coach_standing_admin($row) {
    return [
        'coach_id' => (int) ($row['player_id'] ?? $row['coach_id'] ?? 0),
        'status' => (string) ($row['status'] ?? 'active'),
        'was_coach' => (bool) ($row['was_coach'] ?? false),
        'revoked_at' => $row['revoked_at'] ?? null,
        'revoked_by' => isset($row['revoked_by']) ? (int) $row['revoked_by'] : null,
        'revoke_complaint_id' => isset($row['revoke_complaint_id']) ? (int) $row['revoke_complaint_id'] : null,
        'reason' => (string) ($row['reason'] ?? ''),
        'restored_at' => $row['restored_at'] ?? null,
        'restored_by' => isset($row['restored_by']) ? (int) $row['restored_by'] : null,
        'restore_reason' => (string) ($row['restore_reason'] ?? ''),
        'updated_at' => $row['updated_at'] ?? null,
    ];
}
