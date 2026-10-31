<# : batch part (PowerShell sees this whole block as a comment)
@echo off
setlocal
set "UW_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:UW_SELF))"
set "UW_RC=%ERRORLEVEL%"
if not defined UW_NOPAUSE pause
if "%UW_RC%"=="0" if /i "%~n0"=="uninstall-ultrawide" (goto) 2>nul & del "%~f0"
exit /b %UW_RC%
#>

# CrossCode ultrawide patch - installer / uninstaller.
# Put this file in the CrossCode folder (next to CrossCode.exe) and run it.
# Installing creates uninstall-ultrawide.bat (a copy of this file); a file name containing
# "uninstall" reverses the changes.

$ErrorActionPreference = 'Stop'
$self      = $env:UW_SELF
$root      = Split-Path -Parent $self
$uninstall = (Split-Path -Leaf $self) -match 'uninstall'
$jsPath    = Join-Path $root 'assets\js\game.compiled.js'
$htmlPath  = Join-Path $root 'assets\node-webkit.html'
$modPath   = Join-Path $root 'assets\ultrawide.js'
$unPath    = Join-Path $root 'uninstall-ultrawide.bat'
$utf8      = New-Object System.Text.UTF8Encoding($false)

# Edits to game.compiled.js (all inside ig.Gui._updateRecursive). Each find string must
# occur exactly once, otherwise nothing is changed.
$edits = @(
  @{ Find    = 'H=H+(x.align.x==ig.GUI_ALIGN.X_RIGHT?-F.offsetX:F.offsetX);'
     Replace = 'H=H+(x.align.x==ig.GUI_ALIGN.X_RIGHT?-F.offsetX:F.offsetX);if(window.uwX){var uwx=uwX(x,f,F.offsetX);if(uwx!==null)H=b+uwx}' },
  @{ Find    = 'if(E&&(x._visible||x.invisibleUpdate)){J=false;x.gui.update()}'
     Replace = 'if(E&&(x._visible||x.invisibleUpdate)){J=false;window.uwCur=x;x.gui.update();window.uwCur=null}' },
  @{ Find    = 'J&&G&&x.gui.update();'
     Replace = 'if(J&&G){window.uwCur=x;x.gui.update();window.uwCur=null}' }
)
$marker     = 'window.uwX'
$htmlAnchor = '<script type="text/javascript" src="js/game.compiled.js"></script>'
$htmlTag    = '<script type="text/javascript" src="ultrawide.js"></script>'

function Fail($msg) {
  Write-Host ''
  Write-Host "ERROR: $msg" -ForegroundColor Red
  Write-Host 'No files were changed.'
  exit 1
}
function Count($text, $s) { return ([regex]::Matches($text, [regex]::Escape($s))).Count }
function Save($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }

if (-not (Test-Path -LiteralPath $jsPath) -or -not (Test-Path -LiteralPath $htmlPath)) {
  Fail "CrossCode files not found. Put this file in the CrossCode folder (next to CrossCode.exe).`n       Looked in: $root"
}
$js   = [IO.File]::ReadAllText($jsPath)
$html = [IO.File]::ReadAllText($htmlPath)
$nl   = if ($html.Contains("`r`n")) { "`r`n" } else { "`n" }
$jsPatched = $js.Contains($marker)
$htmlHasTag = (Count $html $htmlTag) -gt 0

if ($uninstall) {
  # ---------------- uninstall ----------------
  if (-not $jsPatched -and -not $htmlHasTag -and -not (Test-Path -LiteralPath $modPath)) {
    Write-Host 'The ultrawide patch is not installed. Nothing to do.'
    exit 0
  }
  if ($jsPatched) {
    foreach ($e in $edits) {
      if ((Count $js $e.Replace) -ne 1) {
        Fail "game.compiled.js does not look like this patch changed it.`n       Use Steam > CrossCode > Properties > Installed Files > Verify integrity instead."
      }
    }
    foreach ($e in $edits) { $js = $js.Replace($e.Replace, $e.Find) }
    Save $jsPath $js
  }
  if ($htmlHasTag) {
    $html = $html.Replace($htmlTag + $nl, '').Replace($htmlTag, '')
    Save $htmlPath $html
  }
  if (Test-Path -LiteralPath $modPath) { Remove-Item -LiteralPath $modPath -Force }
  Write-Host 'Ultrawide patch removed. The game is back to 16:9.' -ForegroundColor Green
  exit 0
}

# ---------------- install ----------------
$modJs = @'
__ULTRAWIDE_JS__
'@
$modJs = $modJs.Replace("`r`n", "`n") + "`n"

if (-not $jsPatched) {
  foreach ($e in $edits) {
    $n = Count $js $e.Find
    if ($n -ne 1) {
      Fail "This CrossCode version is not supported (expected code found $n times instead of once).`n       The patch was made for CrossCode 1.4.2-4."
    }
  }
}
if (-not $htmlHasTag -and (Count $html $htmlAnchor) -ne 1) {
  Fail 'node-webkit.html does not look like the original CrossCode file.'
}

Save $modPath $modJs
if (-not $jsPatched) {
  foreach ($e in $edits) { $js = $js.Replace($e.Find, $e.Replace) }
  Save $jsPath $js
}
if (-not $htmlHasTag) {
  $html = $html.Replace($htmlAnchor, $htmlTag + $nl + $htmlAnchor)
  Save $htmlPath $html
}
Copy-Item -LiteralPath $self -Destination $unPath -Force

if ($jsPatched -and $htmlHasTag) {
  Write-Host 'The ultrawide patch was already installed; ultrawide.js has been updated.' -ForegroundColor Green
} else {
  Write-Host 'Ultrawide patch installed.' -ForegroundColor Green
}
Write-Host 'Keep the in-game Display Type on "Fit" and play in fullscreen.'
Write-Host 'To remove it, run uninstall-ultrawide.bat in this folder.'
exit 0
