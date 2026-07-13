// 가족 앱 API (Netlify Functions v2 + Netlify Blobs)
// POST /api/family  { action, ...데이터 }
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// 비밀번호: Netlify 환경변수 FAMILY_PIN 으로 변경 가능 (기본 0000)
const PIN = process.env.FAMILY_PIN || "0000";
const SECRET = process.env.FAMILY_SECRET || "family-secret-" + PIN;

const makeToken = () =>
  crypto.createHmac("sha256", SECRET).update("family-app-auth").digest("hex");

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const validYm = (s) =>
  /^\d{4}-\d{2}$/.test(s || "") ? s : new Date().toISOString().slice(0, 7);

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청이에요." }, 400);
  }

  const action = String(body.action || "");

  // ── 로그인 ──
  if (action === "login") {
    if (String(body.pin || "") === PIN) return json({ token: makeToken() });
    return json({ error: "비밀번호가 맞지 않아요." }, 401);
  }

  // ── 인증 확인 ──
  const auth = req.headers.get("authorization") || "";
  if (auth !== "Bearer " + makeToken()) {
    return json({ error: "로그인이 필요해요." }, 401);
  }

  // strong: 쓰기 직후에도 항상 최신 데이터를 읽음 (기본 eventual이면 삭제한 데이터가 부활하는 버그 발생)
  const store = getStore({ name: "family-app", consistency: "strong" });
  const getMembers = async () =>
    (await store.get("members", { type: "json" })) || [];
  const getEntries = async (ym) =>
    (await store.get("exp/" + ym, { type: "json" })) || [];
  const getComments = async (ym) =>
    (await store.get("cmt/" + ym, { type: "json" })) || {};

  switch (action) {
    // 멤버 + 해당 월 기록/코멘트 한 번에 조회
    case "state": {
      const ym = validYm(body.ym);
      const [members, entries, comments] = await Promise.all([
        getMembers(),
        getEntries(ym),
        getComments(ym),
      ]);
      return json({ members, entries, comments });
    }

    // ── 멤버 ──
    case "memberAdd": {
      const name = String(body.name || "").trim().slice(0, 20);
      if (!name) return json({ error: "이름을 입력하세요." }, 400);

      const members = await getMembers();
      members.push({
        id: newId(),
        name,
        active: true,
        createdAt: new Date().toISOString(),
      });
      await store.setJSON("members", members);
      return json({ members });
    }

    case "memberToggle": {
      const members = await getMembers();
      const m = members.find((v) => v.id === body.id);
      if (m) m.active = !m.active;
      await store.setJSON("members", members);
      return json({ members });
    }

    case "memberRemove": {
      const members = (await getMembers()).filter((v) => v.id !== body.id);
      await store.setJSON("members", members);
      return json({ members });
    }

    // ── 지출/수입 기록 ──
    case "entryAdd": {
      const date = String(body.date || "");
      const amount = parseInt(String(body.amount || "").replace(/[^\d]/g, ""), 10);

      if (!validDate(date))
        return json({ error: "날짜가 올바르지 않아요." }, 400);
      if (!amount || amount <= 0)
        return json({ error: "금액을 입력하세요." }, 400);

      const ym = date.slice(0, 7);
      const entries = await getEntries(ym);
      entries.push({
        id: newId(),
        date,
        type: body.type === "income" ? "income" : "expense",
        memberId: body.memberId ? String(body.memberId) : null, // null = 공동
        amount,
        category: String(body.category || "기타").slice(0, 20),
        memo: String(body.memo || "").trim().slice(0, 100),
        createdAt: new Date().toISOString(),
      });
      await store.setJSON("exp/" + ym, entries);
      return json({ ym, entries });
    }

    case "entryDelete": {
      const ym = validYm(body.ym);
      const entries = (await getEntries(ym)).filter((v) => v.id !== body.id);
      await store.setJSON("exp/" + ym, entries);
      return json({ ym, entries });
    }

    // ── 날짜별 코멘트 ──
    case "commentSet": {
      const date = String(body.date || "");
      if (!validDate(date))
        return json({ error: "날짜가 올바르지 않아요." }, 400);

      const ym = date.slice(0, 7);
      const text = String(body.text || "").trim().slice(0, 200);
      const comments = await getComments(ym);

      if (text) comments[date] = text;
      else delete comments[date];

      await store.setJSON("cmt/" + ym, comments);
      return json({ ym, comments });
    }
  }

  return json({ error: "알 수 없는 요청이에요." }, 400);
};

export const config = { path: "/api/family" };
