#!/bin/sh
# CrossCode ultrawide patch - installer / uninstaller (Linux, Steam Deck, macOS).
# Put this file in the CrossCode folder (the one containing the "assets" folder) and run:
#     sh install-ultrawide.sh
# Installing creates uninstall-ultrawide.sh (a copy of this file); a file name containing
# "uninstall" reverses the changes.

SELF=$0
case "$SELF" in */*) ;; *) SELF="./$SELF" ;; esac
ROOT=$(cd "$(dirname "$SELF")" && pwd)
JS="$ROOT/assets/js/game.compiled.js"
HTML="$ROOT/assets/node-webkit.html"
MOD="$ROOT/assets/ultrawide.js"
UNINST="$ROOT/uninstall-ultrawide.sh"
case "$(basename "$SELF")" in *uninstall*) MODE=uninstall ;; *) MODE=install ;; esac

# Edits to game.compiled.js (all inside ig.Gui._updateRecursive). Each find string must
# occur exactly once, otherwise nothing is changed.
F1='H=H+(x.align.x==ig.GUI_ALIGN.X_RIGHT?-F.offsetX:F.offsetX);'
R1='H=H+(x.align.x==ig.GUI_ALIGN.X_RIGHT?-F.offsetX:F.offsetX);if(window.uwX){var uwx=uwX(x,f,F.offsetX);if(uwx!==null)H=b+uwx}'
F2='if(E&&(x._visible||x.invisibleUpdate)){J=false;x.gui.update()}'
R2='if(E&&(x._visible||x.invisibleUpdate)){J=false;window.uwCur=x;x.gui.update();window.uwCur=null}'
F3='J&&G&&x.gui.update();'
R3='if(J&&G){window.uwCur=x;x.gui.update();window.uwCur=null}'
MARKER='window.uwX'
ANCHOR='<script type="text/javascript" src="js/game.compiled.js"></script>'
TAG='<script type="text/javascript" src="ultrawide.js"></script>'

fail() {
  echo ""
  echo "ERROR: $1"
  [ -n "$2" ] && echo "       $2"
  echo "No files were changed."
  exit 1
}
die_write() {
  rm -f "$JS.uwwork" "$JS.uwtmp" "$HTML.uwtmp"
  echo ""
  echo "ERROR: could not write $1 (disk full or no permission?)."
  echo "       If the game no longer starts, verify the game files in Steam."
  exit 1
}

# (BINMODE=3 keeps bytes untouched in Windows awk ports; other awks ignore it.)
# swap_js R1 F1 R2 F2 R3 F3 -> applies the three replacements to a work copy of
# game.compiled.js, then writes it back in one step
swap_js() {
  cp "$JS" "$JS.uwwork" || die_write "$JS"
  replace "$JS.uwwork" "$1" "$2" && replace "$JS.uwwork" "$3" "$4" && replace "$JS.uwwork" "$5" "$6" \
    && cat "$JS.uwwork" > "$JS" || die_write "$JS"
  rm -f "$JS.uwwork"
}

# count FILE STRING -> number of occurrences (strings never span lines in these files)
count() {
  UW_S=$2 awk -v BINMODE=3 'BEGIN { s = ENVIRON["UW_S"]; n = 0 }
    { line = $0; while ((i = index(line, s)) > 0) { n++; line = substr(line, i + length(s)) } }
    END { print n }' "$1"
}

# replace FILE FIND REPLACE -> replaces every occurrence, in place
replace() {
  UW_F=$2 UW_R=$3 awk -v BINMODE=3 'BEGIN { f = ENVIRON["UW_F"]; r = ENVIRON["UW_R"] }
    { line = $0; out = ""
      while ((i = index(line, f)) > 0) { out = out substr(line, 1, i - 1) r; line = substr(line, i + length(f)) }
      print out line }' "$1" > "$1.uwtmp" && cat "$1.uwtmp" > "$1" && rm -f "$1.uwtmp"
}

# insert_before FILE ANCHOR LINE -> inserts LINE above the line containing ANCHOR
insert_before() {
  UW_A=$2 UW_L=$3 awk -v BINMODE=3 'BEGIN { a = ENVIRON["UW_A"]; l = ENVIRON["UW_L"] }
    { if (index($0, a) > 0) { cr = (substr($0, length($0)) == "\r") ? "\r" : ""; print l cr } print }' "$1" > "$1.uwtmp" \
    && cat "$1.uwtmp" > "$1" && rm -f "$1.uwtmp"
}

# delete_line FILE TEXT -> removes lines containing TEXT
delete_line() {
  UW_T=$2 awk -v BINMODE=3 'BEGIN { t = ENVIRON["UW_T"] } index($0, t) == 0 { print }' "$1" > "$1.uwtmp" \
    && cat "$1.uwtmp" > "$1" && rm -f "$1.uwtmp"
}

[ -f "$JS" ] && [ -f "$HTML" ] || \
  fail "CrossCode files not found. Put this file in the CrossCode folder (the one containing \"assets\")." "Looked in: $ROOT"
[ -w "$JS" ] && [ -w "$HTML" ] || fail "The CrossCode files are not writable." "Check the folder permissions: $ROOT/assets"

JS_PATCHED=0;  [ "$(count "$JS" "$MARKER")" -gt 0 ] && JS_PATCHED=1
HTML_HAS_TAG=0; [ "$(count "$HTML" "$TAG")" -gt 0 ] && HTML_HAS_TAG=1

if [ "$MODE" = uninstall ]; then
  # ---------------- uninstall ----------------
  if [ $JS_PATCHED = 0 ] && [ $HTML_HAS_TAG = 0 ] && [ ! -f "$MOD" ]; then
    echo "The ultrawide patch is not installed. Nothing to do."
    exit 0
  fi
  if [ $JS_PATCHED = 1 ]; then
    for R in "$R1" "$R2" "$R3"; do
      [ "$(count "$JS" "$R")" = 1 ] || \
        fail "game.compiled.js does not look like this patch changed it." "Use Steam > CrossCode > Properties > Installed Files > Verify integrity instead."
    done
    swap_js "$R1" "$F1" "$R2" "$F2" "$R3" "$F3"
  fi
  [ $HTML_HAS_TAG = 1 ] && { delete_line "$HTML" "$TAG" || die_write "$HTML"; }
  rm -f "$MOD"
  echo "Ultrawide patch removed. The game is back to 16:9."
  case "$(basename "$SELF")" in uninstall-ultrawide.sh) rm -f "$SELF" ;; esac
  exit 0
fi

# ---------------- install ----------------
if [ $JS_PATCHED = 0 ]; then
  for F in "$F1" "$F2" "$F3"; do
    N=$(count "$JS" "$F")
    [ "$N" = 1 ] || fail "This CrossCode version is not supported (expected code found $N times instead of once)." "The patch was made for CrossCode 1.4.2-4."
  done
fi
if [ $HTML_HAS_TAG = 0 ] && [ "$(count "$HTML" "$ANCHOR")" != 1 ]; then
  fail "node-webkit.html does not look like the original CrossCode file."
fi

cat > "$MOD" <<'__UW_JS_END__' || fail "Could not write $MOD"
__ULTRAWIDE_JS__
__UW_JS_END__

[ $JS_PATCHED = 0 ] && swap_js "$F1" "$R1" "$F2" "$R2" "$F3" "$R3"
[ $HTML_HAS_TAG = 0 ] && { insert_before "$HTML" "$ANCHOR" "$TAG" || die_write "$HTML"; }
[ "$SELF" -ef "$UNINST" ] || { cp "$SELF" "$UNINST" && chmod +x "$UNINST"; }

if [ $JS_PATCHED = 1 ] && [ $HTML_HAS_TAG = 1 ]; then
  echo "The ultrawide patch was already installed; ultrawide.js has been updated."
else
  echo "Ultrawide patch installed."
fi
echo 'Keep the in-game Display Type on "Fit" and play in fullscreen.'
echo "To remove it, run: sh uninstall-ultrawide.sh"
exit 0
