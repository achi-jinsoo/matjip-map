#!/usr/bin/env bash
# 빔테이블 맛지도 썸네일 빌드 스크립트
# ------------------------------------------------------------
# 왜 필요한가:
#   브라우저에서는 인스타 릴스 썸네일을 직접 못 가져온다.
#   - 인스타 /media/ 직링크는 <img> 로 못 띄움(핫링크 차단, onerror)
#   - weserv 프록시는 인스타 /media/ 주소를 404로 거부
#   - microlink 폴백은 무료 50건/일이라 금방 소진(429) → 썸네일이 안 뜸
#   반면 "일반 요청"(브라우저 아님)으로는 인스타 /media/ 가 302→CDN jpg 로 잘 내려온다.
#   그래서 이 스크립트로 "한 번" 받아서 thumbs/{code}.jpg 정적 파일로 저장하고,
#   사이트는 그 정적 파일을 띄운다(즉시·무한 안정·무료, Netlify가 CDN 캐시).
#
# 사용법:
#   bash tools/build-thumbs.sh          # 새 가게(없는 썸네일)만 받기
#   bash tools/build-thumbs.sh --force  # 전부 다시 받기
#
# 가게 추가 후엔 이 스크립트 한 번 돌리고 git push 하면 끝.
set -u

SHEET_ID="1zywnse66Gy7ylIVQlu5nGxzzbpfiMQKGbywmclSCETQ"
SHEET_CSV="https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/thumbs"
MAXDIM=480          # 긴 변 기준 리사이즈(px) — 카드용으론 충분, 용량 절약
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

mkdir -p "$OUT"

echo "▶ 시트 CSV 내려받는 중…"
CSV="$(curl -sL --max-time 30 "$SHEET_CSV")"
if [ -z "$CSV" ]; then echo "✗ 시트를 못 읽었습니다."; exit 1; fi

CODES="$(printf '%s' "$CSV" \
  | grep -oE "instagram\.com/(reel|reels|p|tv)/[A-Za-z0-9_-]+" \
  | sed -E 's#.*/##' | sort -u)"

total=$(printf '%s\n' "$CODES" | grep -c . )
echo "▶ 릴스 코드 ${total}개 발견"

ok=0; skip=0; fail=0; i=0
while IFS= read -r c; do
  [ -z "$c" ] && continue
  i=$((i+1))
  dest="$OUT/$c.jpg"
  if [ "$FORCE" -eq 0 ] && [ -f "$dest" ]; then
    skip=$((skip+1)); continue
  fi
  tmp="$(mktemp)"
  curl -sL --max-time 20 -A "Mozilla/5.0" \
    "https://www.instagram.com/p/$c/media/?size=l" -o "$tmp"
  ct="$(file --mime-type -b "$tmp" 2>/dev/null)"
  sz="$(stat -f%z "$tmp" 2>/dev/null || stat -c%s "$tmp" 2>/dev/null)"
  if [ "$ct" = "image/jpeg" ] && [ "${sz:-0}" -gt 2000 ]; then
    mv "$tmp" "$dest"
    # 리사이즈(있으면 sips). 실패해도 원본 유지.
    if command -v sips >/dev/null 2>&1; then
      sips -Z "$MAXDIM" -s formatOptions 80 "$dest" >/dev/null 2>&1 || true
    fi
    ok=$((ok+1)); printf "  [%3d/%3d] ✓ %s (%s)\n" "$i" "$total" "$c" "$(stat -f%z "$dest" 2>/dev/null || echo "?")B"
  else
    rm -f "$tmp"
    fail=$((fail+1)); printf "  [%3d/%3d] ✗ %s (type=%s size=%s)\n" "$i" "$total" "$c" "$ct" "${sz:-0}"
  fi
done <<EOF
$CODES
EOF

echo "────────────────────────────────"
echo "완료: 받음 $ok · 건너뜀(이미 있음) $skip · 실패 $fail · 총 $total"
[ "$fail" -gt 0 ] && echo "※ 실패분은 비공개/삭제된 게시물일 수 있습니다. 사이트는 그런 건 microlink 폴백으로 시도합니다."
exit 0
