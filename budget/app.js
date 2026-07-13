// ─── 우리집 가계부 ───
const API = '/api/family';

const EXPENSE_CATEGORIES = [
    '투자', '식비', '카페/간식', '생활/마트', '교통/차량', '주거/공과금',
    '의료/건강', '문화/여가', '의류/미용', '경조사/선물', '기타',
];
const INCOME_CATEGORIES = ['급여', '상여', '용돈', '금융수입', '중고판매', '기타수입'];

const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

let token = localStorage.getItem('familyToken') || '';
let state = {
    ym: todayYm(),
    selectedDate: todayDate(),
    entryType: 'expense',      // 입력 폼: 지출/수입
    members: [],
    entries: [],
    comments: {},              // { 'YYYY-MM-DD': '코멘트' }
};

// ── 유틸 ──
function pad(n) { return String(n).padStart(2, '0'); }

function todayYm() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function todayDate() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function shiftYm(ym, diff) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + diff, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function fmt(num) {
    return Number(num || 0).toLocaleString('ko-KR');
}

function isIncome(entry) {
    return entry.type === 'income';
}

// 멤버 색상 (id 해시 기반, 공동은 보라)
function memberColor(memberId) {
    if (!memberId) return '#6c5ce7';
    const palette = ['#0984e3', '#e17055', '#00b894', '#d63031', '#e84393', '#fdcb6e', '#00cec9'];
    let hash = 0;
    for (const ch of String(memberId)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
}

function memberName(memberId) {
    if (!memberId) return '공동';
    const m = state.members.find((v) => v.id === memberId);
    return m ? m.name : '(삭제된 멤버)';
}

// ── API ──
async function api(action, data = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;

    const res = await fetch(API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...data }),
    });
    const out = await res.json().catch(() => ({}));

    if (res.status === 401 && action !== 'login') {
        lock();
        throw new Error('다시 로그인해 주세요.');
    }
    if (!res.ok) throw new Error(out.error || '오류가 발생했어요.');
    return out;
}

// ── 화면 전환 ──
function show(screen) {
    for (const id of ['screen-login', 'screen-main', 'screen-members']) {
        document.getElementById(id).hidden = (id !== 'screen-' + screen);
    }
}

function lock() {
    token = '';
    localStorage.removeItem('familyToken');
    show('login');
}

// ── 공통 렌더 조각 ──
function entryRow(e) {
    const income = isIncome(e);
    return `<div class="row">
        <span class="row-who" style="--chip:${memberColor(e.memberId)}">${esc(memberName(e.memberId))}</span>
        <div class="row-main">
            <span class="row-category">${esc(e.category)}</span>
            ${e.memo ? `<span class="row-memo">${esc(e.memo)}</span>` : ''}
        </div>
        <span class="row-amount ${income ? 'income' : ''}">${income ? '+' : '-'}${fmt(e.amount)}원</span>
        <button type="button" class="btn-del" data-del="${esc(e.id)}" aria-label="삭제">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    </div>`;
}

function sortEntries(list) {
    return [...list].sort((a, b) =>
        b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ── 렌더링 ──
function render() {
    const [y, m] = state.ym.split('-').map(Number);
    document.getElementById('monthLabel').textContent = `${y}년 ${m}월`;

    renderSummary();
    renderCalendar();
    renderDayPanel();
    renderMonthList();
    renderForm();
}

function renderSummary() {
    let expenseTotal = 0;
    let incomeTotal = 0;
    const expenseByMember = new Map();

    for (const e of state.entries) {
        if (isIncome(e)) {
            incomeTotal += e.amount;
        } else {
            expenseTotal += e.amount;
            const key = e.memberId || '';
            expenseByMember.set(key, (expenseByMember.get(key) || 0) + e.amount);
        }
    }

    document.getElementById('expenseTotal').textContent = fmt(expenseTotal) + '원';
    document.getElementById('incomeTotal').textContent = fmt(incomeTotal) + '원';
    const net = incomeTotal - expenseTotal;
    document.getElementById('netTotal').textContent = (net < 0 ? '-' : '') + fmt(Math.abs(net)) + '원';

    document.getElementById('summaryChips').innerHTML = [...expenseByMember.entries()]
        .map(([key, total]) =>
            `<span class="chip" style="--chip:${memberColor(key)}">${esc(memberName(key))} <b>${fmt(total)}원</b></span>`)
        .join('');
}

function renderCalendar() {
    const [y, m] = state.ym.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();     // 0=일
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = todayDate();

    // 날짜별 집계
    const daily = new Map(); // date → {expense, income}
    for (const e of state.entries) {
        if (!daily.has(e.date)) daily.set(e.date, { expense: 0, income: 0 });
        daily.get(e.date)[isIncome(e) ? 'income' : 'expense'] += e.amount;
    }

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell blank"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const date = state.ym + '-' + pad(d);
        const sums = daily.get(date);
        const weekday = (firstDay + d - 1) % 7;
        const classes = ['cal-cell'];
        if (date === today) classes.push('today');
        if (date === state.selectedDate) classes.push('selected');
        if (weekday === 0) classes.push('sun');
        if (weekday === 6) classes.push('sat');

        html += `<div class="${classes.join(' ')}" data-date="${date}">
            <span class="cal-day">${d}${state.comments[date] ? '<i class="cal-dot"></i>' : ''}</span>
            ${sums && sums.income ? `<span class="cal-income">+${fmt(sums.income)}</span>` : ''}
            ${sums && sums.expense ? `<span class="cal-expense">-${fmt(sums.expense)}</span>` : ''}
        </div>`;
    }

    document.getElementById('calGrid').innerHTML = html;
}

function renderDayPanel() {
    const date = state.selectedDate;
    const [, m, d] = date.split('-').map(Number);
    const week = WEEK_NAMES[new Date(date + 'T00:00:00').getDay()];
    document.getElementById('dayTitle').textContent = `${m}월 ${d}일 (${week})`;

    document.getElementById('commentInput').value = state.comments[date] || '';

    const items = sortEntries(state.entries.filter((e) => e.date === date));
    document.getElementById('dayEntries').innerHTML =
        items.map(entryRow).join('') ||
        '<p class="empty small">이 날의 기록이 아직 없어요.</p>';
}

function renderMonthList() {
    const sorted = sortEntries(state.entries);
    const grouped = new Map();
    for (const e of sorted) {
        if (!grouped.has(e.date)) grouped.set(e.date, []);
        grouped.get(e.date).push(e);
    }

    let html = '';
    for (const [date, items] of grouped) {
        let dayExpense = 0, dayIncome = 0;
        for (const v of items) isIncome(v) ? dayIncome += v.amount : dayExpense += v.amount;
        const week = WEEK_NAMES[new Date(date + 'T00:00:00').getDay()];

        html += `<div class="day-group">
            <div class="day-head">
                <span>${Number(date.slice(8, 10))}일 (${week})${state.comments[date] ? ` <em class="day-comment">${esc(state.comments[date])}</em>` : ''}</span>
                <span class="day-total">${dayIncome ? `<b class="income">+${fmt(dayIncome)}</b> ` : ''}${dayExpense ? `-${fmt(dayExpense)}원` : ''}</span>
            </div>
            ${items.map(entryRow).join('')}
        </div>`;
    }

    document.getElementById('entryList').innerHTML =
        html || '<p class="empty">이번 달 기록이 아직 없어요.</p>';
}

function renderForm() {
    // 지출/수입 토글
    for (const btn of document.querySelectorAll('#typeToggle button')) {
        btn.classList.toggle('on', btn.dataset.type === state.entryType);
    }

    // 분류 옵션
    const cats = state.entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const catSel = document.getElementById('addCategory');
    const prev = catSel.value;
    catSel.innerHTML = cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (cats.includes(prev)) catSel.value = prev;

    // 멤버 옵션
    const memSel = document.getElementById('addMember');
    const prevMem = memSel.value;
    const activeMembers = state.members.filter((v) => v.active);
    memSel.innerHTML =
        '<option value="">공동</option>' +
        activeMembers.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    if ([...memSel.options].some((o) => o.value === prevMem)) memSel.value = prevMem;

    document.getElementById('addHint').hidden = activeMembers.length > 0;
}

function renderMembers() {
    document.getElementById('memberList').innerHTML = state.members.map((m) => `
        <div class="row member-row ${m.active ? '' : 'inactive'}">
            <span class="row-who" style="--chip:${memberColor(m.id)}">${esc(m.name)}</span>
            <div class="row-main">
                <span class="row-memo">${m.active ? '' : '숨김 상태'}</span>
            </div>
            <button type="button" class="btn-toggle" data-toggle="${esc(m.id)}">${m.active ? '숨기기' : '복구'}</button>
            <button type="button" class="btn-toggle btn-danger" data-remove="${esc(m.id)}">삭제</button>
        </div>
    `).join('') || '<p class="empty">아직 등록된 가족이 없어요.</p>';
}

// ── 데이터 로드 ──
async function load() {
    const out = await api('state', { ym: state.ym });
    state.members = out.members;
    state.entries = out.entries;
    state.comments = out.comments;

    // 선택된 날짜가 다른 달이면 보정
    if (state.selectedDate.slice(0, 7) !== state.ym) {
        state.selectedDate = state.ym === todayYm() ? todayDate() : state.ym + '-01';
    }

    render();
    renderMembers();
}

// ── CSV 내보내기 ──
function exportCsv() {
    const rows = [['날짜', '구분', '누구', '분류', '금액', '메모']];
    const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of sorted) {
        rows.push([e.date, isIncome(e) ? '수입' : '지출', memberName(e.memberId), e.category, e.amount, e.memo || '']);
    }
    const csv = '﻿' + rows.map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `가계부_${state.ym}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ── 이벤트 ──
document.getElementById('loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.hidden = true;
    try {
        const out = await api('login', { pin: document.getElementById('pin').value.trim() });
        token = out.token;
        localStorage.setItem('familyToken', token);
        show('main');
        await load();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
    }
});

// 달력 날짜 선택
document.getElementById('calGrid').addEventListener('click', (ev) => {
    const cell = ev.target.closest('[data-date]');
    if (!cell) return;
    state.selectedDate = cell.dataset.date;
    renderCalendar();
    renderDayPanel();
});

// 지출/수입 토글
document.getElementById('typeToggle').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-type]');
    if (!btn) return;
    state.entryType = btn.dataset.type;
    renderForm();
});

// 기록 추가
document.getElementById('addForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    try {
        const out = await api('entryAdd', {
            date: state.selectedDate,
            type: state.entryType,
            memberId: document.getElementById('addMember').value || null,
            amount: document.getElementById('addAmount').value,
            category: document.getElementById('addCategory').value,
            memo: document.getElementById('addMemo').value,
        });
        document.getElementById('addAmount').value = '';
        document.getElementById('addMemo').value = '';
        state.entries = out.entries;
        render();
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
});

// 코멘트 저장
document.getElementById('btnComment').addEventListener('click', async () => {
    const btn = document.getElementById('btnComment');
    btn.disabled = true;
    try {
        const out = await api('commentSet', {
            date: state.selectedDate,
            text: document.getElementById('commentInput').value,
        });
        state.comments = out.comments;
        renderCalendar();
        renderMonthList();
        btn.textContent = '저장됨!';
        setTimeout(() => { btn.textContent = '저장'; }, 1200);
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
});

// 기록 삭제 (선택한 날 패널 + 월 목록 공용)
async function deleteEntry(id) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    try {
        const out = await api('entryDelete', { ym: state.ym, id });
        state.entries = out.entries;
        render();
    } catch (e) {
        alert(e.message);
    }
}
document.getElementById('dayEntries').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (btn) deleteEntry(btn.dataset.del);
});
document.getElementById('entryList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (btn) deleteEntry(btn.dataset.del);
});

// 가족 관리
document.getElementById('memberForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = document.getElementById('memberName');
    try {
        const out = await api('memberAdd', { name: input.value });
        state.members = out.members;
        input.value = '';
        renderMembers();
        render();
    } catch (e) {
        alert(e.message);
    }
});

document.getElementById('memberList').addEventListener('click', async (ev) => {
    const toggleBtn = ev.target.closest('[data-toggle]');
    const removeBtn = ev.target.closest('[data-remove]');
    try {
        if (toggleBtn) {
            const out = await api('memberToggle', { id: toggleBtn.dataset.toggle });
            state.members = out.members;
        } else if (removeBtn) {
            const m = state.members.find((v) => v.id === removeBtn.dataset.remove);
            if (!confirm(`"${m ? m.name : ''}" 멤버를 삭제할까요?\n이미 적은 기록은 "(삭제된 멤버)"로 표시돼요.`)) return;
            const out = await api('memberRemove', { id: removeBtn.dataset.remove });
            state.members = out.members;
        } else {
            return;
        }
        renderMembers();
        render();
    } catch (e) {
        alert(e.message);
    }
});

// 금액 자동 콤마
document.getElementById('addAmount').addEventListener('input', function () {
    const num = this.value.replace(/[^\d]/g, '');
    this.value = num ? Number(num).toLocaleString('ko-KR') : '';
});

// 월 이동 / 화면 이동 / 기타 버튼
document.getElementById('btnPrev').addEventListener('click', async (ev) => {
    ev.preventDefault();
    state.ym = shiftYm(state.ym, -1);
    await load();
});
document.getElementById('btnNext').addEventListener('click', async (ev) => {
    ev.preventDefault();
    state.ym = shiftYm(state.ym, 1);
    await load();
});
document.getElementById('btnMembers').addEventListener('click', (ev) => {
    ev.preventDefault();
    show('members');
});
document.querySelector('.go-members').addEventListener('click', (ev) => {
    ev.preventDefault();
    show('members');
});
document.getElementById('btnBack').addEventListener('click', (ev) => {
    ev.preventDefault();
    show('main');
});
document.getElementById('btnLock').addEventListener('click', (ev) => {
    ev.preventDefault();
    lock();
});
document.getElementById('btnCsv').addEventListener('click', (ev) => {
    ev.preventDefault();
    exportCsv();
});

// ── 시작 ──
(async function init() {
    if (!token) {
        show('login');
        return;
    }
    show('main');
    try {
        await load();
    } catch {
        // 토큰이 만료/변경된 경우 lock()이 이미 처리
    }
})();
