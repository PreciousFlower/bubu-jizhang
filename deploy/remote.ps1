# 远程执行脚本的公共辅助函数
#
# 用途：通过 base64 把脚本内容传到服务器执行，彻底避开 PowerShell / cmd 的引号与 $ 转义问题。
# 为什么不用文件传输：Windows 上 scp/sftp 与 expect 都受环境限制，base64 内联最可靠。
#
# 用法（服务器地址与密钥路径从环境变量读，不写死在代码里）：
#   $env:BUBU_HOST = "admin@1.2.3.4"
#   $env:BUBU_KEY  = "$env:USERPROFILE\.ssh\my_key"
#   . .\deploy\remote.ps1
#   Invoke-RemoteCommand "whoami"
#   Invoke-RemoteScript -ScriptPath ".\deploy\step1-env.sh"
#
# 注意：PowerShell 默认禁止加载 .ps1（ExecutionPolicy），
# 需要用 `powershell -ExecutionPolicy Bypass -File` 或在当前会话里先 Set-ExecutionPolicy。

function Get-BubuSshArgs {
    $host_ = $env:BUBU_HOST
    if (-not $host_) { throw "请先设置环境变量 BUBU_HOST，例如 admin@1.2.3.4" }
    $key = $env:BUBU_KEY
    $args = @()
    if ($key) { $args += @("-i", $key) }
    $args += @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=NUL",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=20"
    )
    $args += $host_
    return $args
}

function Invoke-RemoteCommand {
    param([Parameter(Mandatory = $true)][string]$Command)
    & ssh @(Get-BubuSshArgs) $Command 2>&1
}

function Invoke-RemoteScript {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)
    $content = Get-Content $ScriptPath -Raw
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))
    & ssh @(Get-BubuSshArgs) "echo $b64 | base64 -d > /tmp/_rs.sh && bash /tmp/_rs.sh" 2>&1
}
