<?php
include_once __DIR__ . '/common.php';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pin = trim($_POST['pin'] ?? '');

    if ($pin === $BUDGET_PIN) {
        $_SESSION['budget_auth'] = true;
        header('Location: index.php');
        exit;
    }

    $error = '비밀번호가 맞지 않아요.';
}

if (!empty($_SESSION['budget_auth'])) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= h($BUDGET_TITLE) ?></title>
    <link rel="stylesheet" href="style.css?v=1">
</head>
<body>
    <div class="login-wrap">
        <div class="login-card">
            <div class="login-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
            </div>
            <h1><?= h($BUDGET_TITLE) ?></h1>
            <p class="login-desc">가족 비밀번호를 입력해 주세요</p>

            <form method="post">
                <input type="password" name="pin" inputmode="numeric" placeholder="비밀번호" autofocus autocomplete="off">
                <?php if ($error): ?>
                    <p class="login-error"><?= h($error) ?></p>
                <?php endif; ?>
                <button type="submit">들어가기</button>
            </form>
        </div>
    </div>
</body>
</html>
