#!/usr/bin/env bash
# Shoot every standard screen at desktop and phone size, print each document to PDF,
# and total the console/network problems. Exits non-zero if any screen had one.
#
#   sweep.sh <base-url> <out-dir> [doc-id ...]
#
# Screens: home and data; for each document Edit, Live and Page on desktop (full height),
# Live and Page on a phone (one shot per screenful), and the printed PDF rendered to a PNG strip.
here="$(cd "$(dirname "$0")" && pwd)"
base="${1:?base url}"; out="${2:?out dir}"; shift 2
mkdir -p "$out"
problems=0
shot() { # name url args...
  local name="$1" url="$2"; shift 2
  local res
  res="$(node "$here/cdp.mjs" shot "$url" "$out/$name.png" "$@" 2>&1)"
  local n; n=$(grep -c '^CONSOLE' <<<"$res")
  problems=$((problems + n))
  printf '%-28s %s\n' "$name" "$([ "$n" = 0 ] && echo ok || echo "$n problem(s)")"
  grep -E '^(CONSOLE|JS)|timeout|not start' <<<"$res" | sed 's/^/    /'
}
D="--size 1440x900"; P="--size 390x844 --mobile"
shot home "$base/" $D --full
shot data "$base/data" $D --full
shot phone-home "$base/" $P
for id in "$@"; do
  shot "$id-edit" "$base/d/$id?view=edit" $D --full
  shot "$id-live" "$base/d/$id?view=live" $D --full
  shot "$id-page" "$base/d/$id?view=page" $D --full
  shot "$id-phone" "$base/d/$id?view=live" $P --scroll
  shot "$id-phone-page" "$base/d/$id?view=page" $P
  res="$(node "$here/cdp.mjs" pdf "$base/d/$id?view=page" "$out/$id.pdf" 2>&1)"
  n=$(grep -c '^CONSOLE' <<<"$res"); problems=$((problems + n))
  printf '%-28s %s\n' "$id.pdf" "$([ "$n" = 0 ] && echo ok || echo "$n problem(s)")"
  swift "$here/pdfpng.swift" "$out/$id.pdf" "$out/$id-pdf.png" 2>/dev/null | sed 's/^/    /'
done
echo "screens in $out — $problems problem(s)"
[ "$problems" = 0 ]
