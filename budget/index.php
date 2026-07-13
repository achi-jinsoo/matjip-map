<?php
include_once __DIR__ . '/common.php';
require_login();

$DB = db();

// ─── 지출 등록 / 삭제 ───
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $action = trim($_POST['action'] ?? '');

    if ($action === 'add') {
        $amount     = intval(str_replace(array(',', ' '), '', $_POST['amount'] ?? ''));
        $member_id  = trim($_POST['member_id'] ?? '');   // '' 이면 공동
        $category   = trim($_POST['category'] ?? '기타');
        $memo       = trim($_POST['memo'] ?? '');
        $spent_date = trim($_POST['spent_date'] ?? date('Y-m-d'));

        if ($amount > 0 && preg_match('/^\d{4}-\d{2}-\d{2}$/', $spent_date)) {
            $stmt = $DB->prepare("INSERT INTO expenses (member_id, amount, category, memo, spent_date) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute(array(
                $member_id === '' ? null : intval($member_id),
                $amount,
                $category,
                $memo,
                $spent_date,
            ));
        }

        header('Location: index.php?ym=' . substr($spent_date, 0, 7));
        exit;
    }

    if ($action === 'delete') {
        $stmt = $DB->prepare("DELETE FROM expenses WHERE id = ?");
        $stmt->execute(array(intval($_POST['id'] ?? 0)));

        header('Location: index.php?ym=' . trim($_POST['ym'] ?? date('Y-m')));
        exit;
    }
}

// ─── 조회할 월 ───
$ym = trim($_GET['ym'] ?? date('Y-m'));
if (!preg_match('/^\d{4}-\d{2}$/', $ym)) {
    $ym = date('Y-m');
}

$month_start = $ym . '-01';
$month_end   = date('Y-m-t', strtotime($month_start));
$prev_ym     = date('Y-m', strtotime($month_start . ' -1 month'));
$next_ym     = date('Y-m', strtotime($month_start . ' +1 month'));

// 멤버 목록
$members = $DB->query("SELECT * FROM members WHERE is_active = 1 ORDER BY id ASC")->fetchAll();

// 이번 달 합계 (사람별 + 공동)
$stmt = $DB->prepare("
    SELECT e.member_id, m.name, SUM(e.amount) AS total
    FROM expenses e
    LEFT JOIN members m ON e.member_id = m.id
    WHERE e.spent_date BETWEEN ? AND ?
    GROUP BY e.member_id
");
$stmt->execute(array($month_start, $month_end));
$totals = $stmt->fetchAll();

$month_total = 0;
foreach ($totals as $t) {
    $month_total += intval($t['total']);
}

// 이번 달 지출 목록 (날짜 내림차순)
$stmt = $DB->prepare("
    SELECT e.*, m.name AS member_name
    FROM expenses e
    LEFT JOIN members m ON e.member_id = m.id
    WHERE e.spent_date BETWEEN ? AND ?
    ORDER BY e.spent_date DESC, e.id DESC
");
$stmt->execute(array($month_start, $month_end));
$expenses = $stmt->fetchAll();

// 날짜별로 묶기
$grouped = array();
foreach ($expenses as $e) {
    $grouped[$e['spent_date']][] = $e;
}

$week_names = array('일', '월', '화', '수', '목', '금', '토');
?>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= h($BUDGET_TITLE) ?> - <?= h($ym) ?></title>
    <link rel="stylesheet" href="style.css?v=1">
</head>
<body>
<div class="wrap">

    <!-- 헤더 -->
    <header class="top">
        <h1><?= h($BUDGET_TITLE) ?></h1>
        <div class="top-links">
            <a href="members.php">가족 관리</a>
            <a href="logout.php">잠금</a>
        </div>
    </header>

    <!-- 월 이동 -->
    <div class="month-nav">
        <a href="?ym=<?= h($prev_ym) ?>" class="month-arrow" aria-label="이전 달">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </a>
        <div class="month-label"><?= intval(substr($ym, 0, 4)) ?>년 <?= intval(substr($ym, 5, 2)) ?>월</div>
        <a href="?ym=<?= h($next_ym) ?>" class="month-arrow" aria-label="다음 달">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
    </div>

    <!-- 이번 달 합계 -->
    <section class="summary">
        <div class="summary-total">
            <span>이번 달 지출</span>
            <strong><?= number_format($month_total) ?>원</strong>
        </div>
        <?php if ($totals): ?>
            <div class="summary-chips">
                <?php foreach ($totals as $t): ?>
                    <?php $chip_name = $t['member_id'] === null ? '공동' : ($t['name'] ?: '(삭제된 멤버)'); ?>
                    <span class="chip" style="--chip: <?= member_color($t['member_id']) ?>">
                        <?= h($chip_name) ?> <b><?= number_format($t['total']) ?>원</b>
                    </span>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>

    <!-- 지출 입력 -->
    <section class="card add-card">
        <form method="post" id="addForm">
            <input type="hidden" name="action" value="add">
            <div class="add-row">
                <input type="date" name="spent_date" value="<?= $ym === date('Y-m') ? date('Y-m-d') : h($month_start) ?>" required>
                <select name="member_id">
                    <option value="">공동</option>
                    <?php foreach ($members as $m): ?>
                        <option value="<?= $m['id'] ?>"><?= h($m['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <select name="category">
                    <?php foreach ($BUDGET_CATEGORIES as $c): ?>
                        <option value="<?= h($c) ?>"><?= h($c) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="add-row">
                <input type="text" name="amount" id="amount" inputmode="numeric" placeholder="금액" required autocomplete="off">
                <input type="text" name="memo" placeholder="메모 (선택)" autocomplete="off">
                <button type="submit" class="btn-add">추가</button>
            </div>
        </form>
        <?php if (!$members): ?>
            <p class="add-hint">아직 등록된 가족이 없어요. <a href="members.php">가족 관리</a>에서 먼저 추가해 주세요. (공동 지출은 바로 기록할 수 있어요)</p>
        <?php endif; ?>
    </section>

    <!-- 지출 목록 -->
    <section class="list">
        <?php if (!$grouped): ?>
            <p class="empty">이번 달 기록이 아직 없어요.</p>
        <?php endif; ?>

        <?php foreach ($grouped as $date => $items): ?>
            <?php
            $day_total = 0;
            foreach ($items as $it) { $day_total += intval($it['amount']); }
            $week = $week_names[intval(date('w', strtotime($date)))];
            ?>
            <div class="day-group">
                <div class="day-head">
                    <span><?= intval(substr($date, 8, 2)) ?>일 (<?= $week ?>)</span>
                    <span class="day-total"><?= number_format($day_total) ?>원</span>
                </div>

                <?php foreach ($items as $it): ?>
                    <?php $who = $it['member_id'] === null ? '공동' : ($it['member_name'] ?: '(삭제된 멤버)'); ?>
                    <div class="row">
                        <span class="row-who" style="--chip: <?= member_color($it['member_id']) ?>"><?= h($who) ?></span>
                        <div class="row-main">
                            <span class="row-category"><?= h($it['category']) ?></span>
                            <?php if ($it['memo'] !== '' && $it['memo'] !== null): ?>
                                <span class="row-memo"><?= h($it['memo']) ?></span>
                            <?php endif; ?>
                        </div>
                        <span class="row-amount"><?= number_format($it['amount']) ?>원</span>
                        <form method="post" onsubmit="return confirm('이 기록을 삭제할까요?');">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $it['id'] ?>">
                            <input type="hidden" name="ym" value="<?= h($ym) ?>">
                            <button type="submit" class="btn-del" aria-label="삭제">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </form>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endforeach; ?>
    </section>
</div>

<script>
// 금액 입력 시 자동 콤마
document.getElementById('amount').addEventListener('input', function () {
    const num = this.value.replace(/[^\d]/g, '');
    this.value = num ? Number(num).toLocaleString('ko-KR') : '';
});
</script>
</body>
</html>
