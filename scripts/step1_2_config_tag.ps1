git config --local user.name "Moow-ui"
git config --local user.email "Moow-ui@users.noreply.github.com"

Write-Host "=== Git Config ==="
git config --local user.name
git config --local user.email

Write-Host "=== Create Tag ==="
git tag archive/2026-09-23-paycalculator

Write-Host "=== Push Tag ==="
git push origin archive/2026-09-23-paycalculator
