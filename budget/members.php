<?php
include_once __DIR__ . '/common.php';
require_login();

$DB = db();

// ─── 멤버 추가 / 숨김 / 복구 ───
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $action = trim($_POST['action'] ?? '');

    if ($action === 'add') {
        $name = trim($_POST['name'] ?? '');
        if ($name !== '') {
            $stmt = $DB->prepare("INSERT INTO members (name) VALUES (?)");
            $stmt->execute(array($name));
        }
    }

    if ($action === 'toggle') {
        $stmt = $DB->prepare("UPDATE members SET is_active = 1 - is_active WHERE id = ?");
        $stmt->execute(array(intval($_POST['id'] ?? 0)));
    }

    header('Location: members.php');
    exit;
}

// 멤버 목록 + 누적 기록 수
$members = $DB->query("
    SELECT m.*, COUNT(e.id) AS expense_count
    FROM members m
    LEFT JOIN expenses e ON e.member_id = m.id
    GROUP BY m.id
    ORDER BY m.id ASC
")->fetchAll();
?>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>가족 관리 - <?= h($BUDGET_TITLE) ?></title>
    <link rel="stylesheet" href="style.css?v=1">
</head>
<body>
<div class="wrap">

    <header class="top">
        <h1>가족 관리</h1>
        <div class="top-links">
            <a href="index.php">가계부로</a>
        </div>
    </header>

    <!-- 멤버 추가 -->
    <section class="card add-card">
        <form method="post" class="add-row">
            <input type="hidden" name="action" value="add">
            <input type="text" name="name" maxlength="20" placeholder="이름 (예: 남편, 아내)" required autocomplete="off">
            <button type="submit" class="btn-add">추가</button>
        </form>
        <p class="add-hint">"공동"은 기본으로 있어서 따로 추가하지 않아도 돼요.</p>
    </section>

    <!-- 멤버 목록 -->
    <section class="list">
        <?php if (!$members): ?>
            <p class="empty">아직 등록된 가족이 없어요.</p>
        <?php endif; ?>

        <?php foreach ($members as $m): ?>
            <div class="row member-row <?= $m['is_active'] ? '' : 'inactive' ?>">
                <span class="row-who" style="--chip: <?= member_color($m['id']) ?>"><?= h($m['name']) ?></span>
                <div class="row-main">
                    <span class="row-memo">기록 <?= number_format($m['expense_count']) ?>건<?= $m['is_active'] ? '' : ' · 숨김 상태' ?></span>
                </div>
                <form method="post">
                    <input type="hidden" name="action" value="toggle">
                    <input type="hidden" name="id" value="<?= $m['id'] ?>">
                    <button type="submit" class="btn-toggle"><?= $m['is_active'] ? '숨기기' : '복구' ?></button>
                </form>
            </div>
        <?php endforeach; ?>
    </section>

    <p class="add-hint" style="margin-top:12px;">숨긴 가족은 입력 화면에서만 빠지고, 지난 기록은 그대로 남아요.</p>
</div>
</body>
</html>
