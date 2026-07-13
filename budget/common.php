<?php
session_start();
date_default_timezone_set('Asia/Seoul');
include_once __DIR__ . '/config.php';

// DB 연결 (없으면 파일/테이블 자동 생성)
function db()
{
    static $pdo = null;

    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . __DIR__ . '/data/budget.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS members (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                is_active  INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS expenses (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id  INTEGER,             -- NULL 이면 '공동' 지출
                amount     INTEGER NOT NULL,
                category   TEXT NOT NULL,
                memo       TEXT,
                spent_date TEXT NOT NULL,       -- YYYY-MM-DD
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        ");
    }

    return $pdo;
}

// 로그인 확인
function require_login()
{
    if (empty($_SESSION['budget_auth'])) {
        header('Location: login.php');
        exit;
    }
}

// XSS 방지 출력
function h($str)
{
    return htmlspecialchars((string)$str, ENT_QUOTES, 'UTF-8');
}

// 멤버 색상 (id 기준 자동 배정, 공동은 별도 색)
function member_color($member_id)
{
    if ($member_id === null || $member_id === '') {
        return '#6c5ce7'; // 공동 - 보라
    }
    $palette = array('#0984e3', '#e17055', '#00b894', '#d63031', '#e84393', '#fdcb6e', '#00cec9');
    return $palette[intval($member_id) % count($palette)];
}
