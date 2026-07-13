<?php
include_once __DIR__ . '/common.php';

unset($_SESSION['budget_auth']);
session_destroy();

header('Location: login.php');
exit;
