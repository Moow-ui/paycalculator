[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== 1. Checking assets/js/wage-core.js ==="
if (Test-Path "assets\js\wage-core.js") {
    Write-Host "PASS: assets/js/wage-core.js exists."
} else {
    Write-Error "FAIL: assets/js/wage-core.js missing!"
}

Write-Host "`n=== 2. Checking index.html ==="
$rootHtml = [System.IO.File]::ReadAllText("index.html", [System.Text.Encoding]::UTF8)
if ($rootHtml.Contains('<link rel="canonical" href="https://albanboss.moow-ui.workers.dev/wage/">') -and
    $rootHtml.Contains('window.location.search') -and
    $rootHtml.Contains('https://albanboss.moow-ui.workers.dev/wage/') -and
    $rootHtml.Contains('<a id="redirect-link"')) {
    Write-Host "PASS: root index.html has canonical, redirect logic, and fallback link."
} else {
    Write-Error "FAIL: root index.html check failed!"
}

Write-Host "`n=== 3. Checking wage/index.html ==="
$wageHtml = [System.IO.File]::ReadAllText("wage\index.html", [System.Text.Encoding]::UTF8)
if ($wageHtml.Contains('<link rel="canonical" href="https://albanboss.moow-ui.workers.dev/wage/">') -and
    $wageHtml.Contains('window.location.search') -and
    $wageHtml.Contains('https://albanboss.moow-ui.workers.dev/wage/') -and
    $wageHtml.Contains('<a id="redirect-link"')) {
    Write-Host "PASS: wage/index.html has canonical, redirect logic, and fallback link."
} else {
    Write-Error "FAIL: wage/index.html check failed!"
}

Write-Host "`n=== 4. Checking README.md ==="
$readmeLines = [System.IO.File]::ReadAllLines("README.md", [System.Text.Encoding]::UTF8)
$firstLine = $readmeLines[0]
Write-Host "README first line: $firstLine"
# Base64 encoded for "보관용 저장소. 사장님 시급 계산기는 albaNboss 저장소의 wage/ 에서 운영"
$expectedB64 = "67O06rSA7JqpIOyggOyepeqzoC4g7IKs7Jql64uYIOyLnOq4iCDqs4TkeyCsOq4sOuKlCBhbGJhTmJvc3Mg7KCA7JqleeqzoOydmCB3YWdlLyDshared7JeQ7IScIOymrOyYg=="
# Instead of hardcoding base64 with potential typos, decode bytes from UTF8 directly:
# Let's verify character by character or check exact expected length and characters
$expectedBytes = [byte[]](0xeb, 0xb3, 0xb4, 0xea, 0xb4, 0x80, 0xec, 0x9a, 0xa9, 0x20, 0xec, 0xa0, 0x80, 0xec, 0x9e, 0xa5, 0xec, 0x86, 0x8c, 0x2e, 0x20, 0xec, 0x82, 0xac, 0xec, 0x9e, 0xa5, 0xeb, 0x8b, 0x98, 0x20, 0xec, 0x8b, 0x9c, 0xea, 0xb8, 0x89, 0x20, 0xea, 0xb3, 0x84, 0xec, 0x82, 0xb0, 0xea, 0xb8, 0xb0, 0xeb, 0x8a, 0x94, 0x20, 0x61, 0x6c, 0x62, 0x61, 0x4e, 0x62, 0x6f, 0x73, 0x73, 0x20, 0xec, 0xa0, 0x80, 0xec, 0x9e, 0xa5, 0xec, 0x86, 0x8c, 0xec, 0x9d, 0x98, 0x20, 0x77, 0x61, 0x67, 0x65, 0x2f, 0x20, 0xec, 0x97, 0x90, 0xec, 0x84, 0x9c, 0x20, 0xec, 0x9a, 0xb4, 0xec, 0x98, 0x81)
$firstLineBytes = [System.Text.Encoding]::UTF8.GetBytes($firstLine)

$diff = $false
if ($firstLineBytes.Length -ne $expectedBytes.Length) {
    $diff = $true
} else {
    for ($i = 0; $i -lt $firstLineBytes.Length; $i++) {
        if ($firstLineBytes[$i] -ne $expectedBytes[$i]) {
            $diff = $true
            break
        }
    }
}

if (-not $diff) {
    Write-Host "PASS: README.md first line matches requirement."
} else {
    Write-Error "FAIL: README.md first line mismatch!"
}

Write-Host "`n=== 5. Checking CHANGELOG.md ==="
if (Test-Path "CHANGELOG.md") {
    Write-Host "PASS: CHANGELOG.md exists."
    $changelog = [System.IO.File]::ReadAllText("CHANGELOG.md", [System.Text.Encoding]::UTF8)
    Write-Host $changelog
} else {
    Write-Error "FAIL: CHANGELOG.md missing!"
}

Write-Host "`n=== 6. Git Status & Config ==="
git config --local user.name
git config --local user.email
git status
