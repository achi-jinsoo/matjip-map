// ─── 우리집 가계부 ───
const API = '/api/family';

const CATEGORIES = [
    '식비', '카페/간식', '생활/마트', '교통/차량', '주거/공과금',
    '의료/건강', '문화/여가', '의류/미용', '경조사/선물', '기타',
];

const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

let token = localStorage.getItem('familyToken') || '';
let state = {
    ym: todayYm(),
    members: [],
    expenses: [],
};

// ── 유틸 ──
function todayYm() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function todayDate() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shiftYm(ym, diff) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + diff, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function fmt(num) {
    return Number(num || 0).toLocaleString('ko-KR');
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

// ── 렌더링 ──
function render() {
    // 월 표시
    const [y, m] = state.ym.split('-');
    document.getElementById('monthLabel').textContent = `${Number(y)}년 ${Number(m)}월`;

    // 합계
    const totals = new Map(); // memberId(null='') → 합계
    let monthTotal = 0;
    for (const e of state.expenses) {
        const key = e.memberId || '';
        totals.set(key, (totals.get(key) || 0) + e.amount);
        monthTotal += e.amount;
    }
    document.getElementById('monthTotal').textContent = fmt(monthTotal) + '원';

    document.getElementById('summaryChips').innerHTML = [...totals.entries()]
        .map(([key, total]) =>
            `<span class="chip" style="--chip:${memberColor(key)}">${esc(memberName(key))} <b>${fmt(total)}원</b></span>`)
        .join('');

    // 입력 폼: 멤버 선택
    const activeMembers = state.members.filter((v) => v.active);
    document.getElementById('addMember').innerHTML =
        '<option value="">공동</option>' +
        activeMembers.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    document.getElementById('addHint').hidden = activeMembers.length > 0;

    // 날짜 기본값: 이번 달이면 오늘, 아니면 그 달 1일
    const dateInput = document.getElementById('addDate');
    if (!dateInput.value || dateInput.value.slice(0, 7) !== state.ym) {
        dateInput.value = state.ym === todayYm() ? todayDate() : state.ym + '-01';
    }

    // 지출 목록 (날짜별 그룹)
    const sorted = [...state.expenses].sort((a, b) =>
        b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));

    const grouped = new Map();
    for (const e of sorted) {
        if (!grouped.has(e.date)) grouped.set(e.date, []);
        grouped.get(e.date).push(e);
    }

    let html = '';
    for (const [date, items] of grouped) {
        const dayTotal = items.reduce((sum, v) => sum + v.amount, 0);
        const week = WEEK_NAMES[new Date(date + 'T00:00:00').getDay()];

        html += `<div class="day-group">
            <div class="day-head">
                <span>${Number(date.slice(8, 10))}일 (${week})</span>
                <span class="day-total">${fmt(dayTotal)}원</span>
            </div>`;

        for (const e of items) {
            html += `<div class="row">
                <span class="row-who" style="--chip:${memberColor(e.memberId)}">${esc(memberName(e.memberId))}</span>
                <div class="row-main">
                    <span class="row-category">${esc(e.category)}</span>
                    ${e.memo ? `<span class="row-memo">${esc(e.memo)}</span>` : ''}
                </div>
                <span class="row-amount">${fmt(e.amount)}원</span>
                <button type="button" class="btn-del" data-del="${esc(e.id)}" aria-label="삭제">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
        }
        html += '</div>';
    }

    document.getElementById('expenseList').innerHTML =
        html || '<p class="empty">이번 달 기록이 아직 없어요.</p>';
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
    state.expenses = out.expenses;
    render();
    renderMembers();
}

// ── CSV 내보내기 ──
function exportCsv() {
    const rows = [['날짜', '누구', '분류', '금액', '메모']];
    const sorted = [...state.expenses].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of sorted) {
        rows.push([e.date, memberName(e.memberId), e.category, e.amount, e.memo || '']);
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

document.getElementById('addForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    try {
        const date = document.getElementById('addDate').value;
        const out = await api('expenseAdd', {
            date,
            memberId: document.getElementById('addMember').value || null,
            amount: document.getElementById('addAmount').value,
            category: document.getElementById('addCategory').value,
            memo: document.getElementById('addMemo').value,
        });
        document.getElementById('addAmount').value = '';
        document.getElementById('addMemo').value = '';

        // 적은 달로 이동해서 바로 보여주기
        state.ym = out.ym;
        state.expenses = out.expenses;
        render();
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('expenseList').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (!btn) return;
    if (!confirm('이 기록을 삭제할까요?')) return;
    try {
        const out = await api('expenseDelete', { ym: state.ym, id: btn.dataset.del });
        state.expenses = out.expenses;
        render();
    } catch (e) {
        alert(e.message);
    }
});

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

// 분류 옵션 채우기
document.getElementById('addCategory').innerHTML =
    CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

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
