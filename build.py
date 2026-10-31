"""Builds the installers from src/ultrawide.js:
  install-ultrawide.bat  (Windows)       from src/installer-template.bat
  install-ultrawide.sh   (Linux/macOS)   from src/installer-template.sh

Run after changing any file in src/:  python build.py
"""
import os

here = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(here, "src", name), encoding="ascii") as f:
        return f.read().replace("\r\n", "\n")


js = read("ultrawide.js").rstrip("\n")
lines = js.split("\n")
# .bat embeds the script in a PowerShell literal here-string (ends at a line starting with '@);
# .sh embeds it in a quoted heredoc (ends at a line reading __UW_JS_END__).
if any(l.startswith("'@") for l in lines):
    raise SystemExit("ultrawide.js has a line starting with '@ (would end the PowerShell here-string)")
if "__UW_JS_END__" in lines:
    raise SystemExit("ultrawide.js has a line reading __UW_JS_END__ (would end the heredoc)")

for template, out_name, newline in [
    ("installer-template.bat", "install-ultrawide.bat", "\r\n"),  # batch files need CRLF
    ("installer-template.sh", "install-ultrawide.sh", "\n"),      # shell scripts need LF
]:
    text = read(template)
    if text.count("__ULTRAWIDE_JS__") != 1:
        raise SystemExit("placeholder missing from " + template)
    text = text.replace("__ULTRAWIDE_JS__", js).replace("\n", newline)
    with open(os.path.join(here, out_name), "w", encoding="ascii", newline="") as f:
        f.write(text)
    print("wrote %s (%d bytes)" % (out_name, len(text)))
