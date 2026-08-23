# Kill ONLY headless Chrome instances created by QA tooling.
# The user's normal Chrome never runs with --headless, so this is safe.
$procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match '--headless' }
$ids = $procs | Select-Object -ExpandProperty ProcessId
Write-Host "Killing $($ids.Count) headless chrome processes"
foreach ($id in $ids) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
$left = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match '--headless' }
Write-Host "Remaining headless chrome: $(($left | Measure-Object).Count)"
