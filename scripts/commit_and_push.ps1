[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== 1. Staging and Committing on branch feat/0923-archive-redirect ==="
git add README.md index.html wage/index.html CHANGELOG.md scripts/
git commit -m "[paycalculator] ALBA&BOSS 포털 /wage/로 자동 이동 설정 및 보관용 저장소 전환"

Write-Host "`n=== 2. Verify commit author ==="
git log -n 1

Write-Host "`n=== 3. Checkout main and merge ==="
git checkout main
git merge feat/0923-archive-redirect

Write-Host "`n=== 4. Push to origin main ==="
git push origin main

Write-Host "`n=== 5. Final git log on main ==="
git log -n 2
