# ProjectTree 部署脚本：本地构建 -> 打包上传 -> 服务器 docker build & up
# 用法: powershell -ExecutionPolicy Bypass -File .\deploy.ps1 [-SkipBuild]
param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Key = Join-Path $Root ".ssh\aliyun-ubuntu.pem"
$Remote = "root@116.62.148.75"
$RemoteDir = "/opt/projecttree"
$Stage = Join-Path $Root ".deploy-tmp\pkg"
$Zip = Join-Path $Root ".deploy-tmp\projecttree.tar.gz"

function Invoke-Ssh([string]$Cmd) {
  ssh -i $Key -o IdentitiesOnly=yes $Remote $Cmd
  if ($LASTEXITCODE -ne 0) { throw "SSH 失败 (exit $LASTEXITCODE): $Cmd" }
}

if (-not $SkipBuild) {
  Write-Host "[1/6] 本地构建..." -ForegroundColor Cyan
  $env:NODE_OPTIONS = "--max-old-space-size=4096"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "构建失败" }
}
if (-not (Test-Path "$Root\.next\standalone\server.js")) { throw "缺少 .next/standalone/server.js" }

Write-Host "[2/6] 打包产物..." -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
Copy-Item -Recurse "$Root\.next\standalone" "$Stage\standalone"
Copy-Item -Recurse "$Root\.next\static"     "$Stage\static"
Copy-Item -Recurse "$Root\public"           "$Stage\public"
Copy-Item "$Root\Dockerfile"                          "$Stage\Dockerfile"
Copy-Item "$Root\docker-compose.projecttree.yml"      "$Stage\docker-compose.yml"
Remove-Item -Force "$Stage\standalone\.env" -ErrorAction SilentlyContinue
if (Test-Path $Zip) { Remove-Item -Force $Zip }
tar -czf $Zip -C $Stage .
if ($LASTEXITCODE -ne 0) { throw "打包失败" }

Write-Host "[3/6] 上传..." -ForegroundColor Cyan
Invoke-Ssh "mkdir -p $RemoteDir/secrets && rm -rf $RemoteDir/app && mkdir -p $RemoteDir/app"
scp -i $Key -o IdentitiesOnly=yes $Zip "${Remote}:$RemoteDir/app.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "上传失败" }

Write-Host "[4/6] 解压并构建镜像..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemoteDir && rm -rf app && mkdir app && tar -xzf app.tar.gz -C app && rm -f app.tar.gz && docker build -t projecttree:prod app"

Write-Host "[5/6] 启动容器..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemoteDir/app && docker compose -p projecttree up -d --force-recreate"

Write-Host "[6/6] 健康检查..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
Invoke-Ssh "docker ps --filter name=projecttree-app --format '{{.Names}} {{.Status}}'; docker exec projecttree-app node -e ""fetch('http://127.0.0.1:3000/sign-in').then(r=>{console.log('LOCAL_HTTP',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"""

Write-Host "部署完成: https://projecttree.feelo.top" -ForegroundColor Green
