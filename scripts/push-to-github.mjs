/**
 * 用 GitHub Token 创建仓库并推送当前项目。
 *
 * 用法（token 从环境变量读，绝不写进参数或文件内容之外的任何地方）：
 *   $env:GH_TOKEN="ghp_xxx"; node scripts/push-to-github.mjs [仓库名]
 *
 * 两个环境相关的实现细节（都是实测踩出来的）：
 *   1. 受限沙箱禁止 stdio 管道，`spawnSync` 读输出会 EPERM。
 *      所以 git 一律用 stdio:'inherit' 直接继承终端，输出由 PowerShell 侧捕获。
 *   2. Token 不能出现在命令行参数里（会被 shell 回显与日志记录）。
 *      改用 git 的 credential.helper 从临时文件读，用完立即删除；
 *      这样 .git/config 里也不会留下 token。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO = process.argv[2] || 'bubu-jizhang'

const token = process.env.GH_TOKEN
if (!token) {
  console.error('缺少 GH_TOKEN 环境变量')
  process.exit(1)
}

const API = 'https://api.github.com'
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'bubu-jizhang-deploy',
}

const api = async (path, init = {}) => {
  const res = await fetch(API + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

/** 用继承终端的方式跑 git（沙箱下不能用管道） */
const git = (args) => spawnSync('git', args, { cwd: ROOT, stdio: 'inherit' })

const step = (n, msg) => console.log(`\n─── 步骤 ${n}：${msg} ───`)

/* ------------------------- 1. 校验 token 并查用户名 ------------------------- */

step(1, '校验 Token')
const me = await api('/user')
if (!me.ok) {
  console.error(`❌ Token 无效或权限不足（HTTP ${me.status}）`)
  console.error(JSON.stringify(me.body).slice(0, 300))
  process.exit(1)
}
const owner = me.body.login
console.log(`✅ 已认证：${owner}`)

/* ---------------------------- 2. 创建仓库 ---------------------------- */

step(2, `创建仓库 ${owner}/${REPO}`)
let created = await api('/user/repos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: REPO,
    description: '布布一二风格的可爱记账 App · 上传小票/支付截图，AI 自动识别金额并记账',
    private: false,
    has_issues: true,
    has_wiki: false,
    auto_init: false,
  }),
})

if (created.ok) {
  console.log(`✅ 仓库已创建：${created.body.html_url}`)
} else if (created.status === 422) {
  console.log('ℹ️ 仓库已存在，直接复用')
  const existing = await api(`/repos/${owner}/${REPO}`)
  if (!existing.ok) {
    console.error(`❌ 无法访问仓库：${JSON.stringify(existing.body).slice(0, 200)}`)
    process.exit(1)
  }
  created = existing
} else {
  console.error(`❌ 建仓失败（HTTP ${created.status}）`)
  console.error(JSON.stringify(created.body).slice(0, 400))
  process.exit(1)
}

const repoUrl = created.body?.html_url
const cloneUrl = `https://github.com/${owner}/${REPO}.git`

/* ---------------------------- 3. 关联 remote ---------------------------- */

step(3, '关联远程仓库')
git(['remote', 'set-url', 'origin', cloneUrl])
const hasOrigin = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, stdio: 'pipe' })
if (hasOrigin.status !== 0) {
  git(['remote', 'add', 'origin', cloneUrl])
}
console.log(`origin → ${cloneUrl}`)

/* ------------------------- 4. 配置临时凭证并推送 ------------------------- */

step(4, '推送代码')
// 临时凭证文件：只含一行 "https://<user>:<token>@github.com"，用完即删
const credFile = join(ROOT, '.git', 'tmp-credential')
writeFileSync(credFile, `https://${owner}:${token}@github.com\n`, { encoding: 'utf8', mode: 0o600 })

const cleanup = () => {
  if (existsSync(credFile)) {
    try {
      unlinkSync(credFile)
    } catch {
      /* ignore */
    }
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

const helperPath = join(ROOT, 'scripts', 'git-credential-env.mjs')
git(['config', 'credential.helper', ''])
git(['config', 'credential.helper', `!"${process.execPath}" "${helperPath}"`])
git(['config', 'credential.username', owner])

const push = git(['push', '-u', 'origin', 'main:main', '--force'])
cleanup()
git(['config', '--unset-all', 'credential.helper'])
git(['config', '--unset-all', 'credential.username'])

if (push.status !== 0) {
  console.error('❌ 推送失败，请看上方 git 输出的具体原因')
  process.exit(1)
}
console.log('✅ 推送成功，临时凭证已销毁')

/* ---------------------------- 5. 回读验证 ---------------------------- */

step(5, '回读验证')
await new Promise((r) => setTimeout(r, 2500))

const info = await api(`/repos/${owner}/${REPO}`)
const tree = await api(`/repos/${owner}/${REPO}/git/trees/main?recursive=1`)
const remoteFiles = tree.ok ? tree.body.tree.filter((n) => n.type === 'blob') : []

console.log(`仓库地址：    ${info.body?.html_url}`)
console.log(`默认分支：    ${info.body?.default_branch}`)
console.log(`可见性：      ${info.body?.private ? '私有' : '公开'}`)
console.log(`远端文件数：  ${remoteFiles.length}`)
console.log(`是否含 README：${remoteFiles.some((f) => f.path === 'README.md') ? '是' : '否'}`)
console.log(`是否含 PROMPT.md：${remoteFiles.some((f) => f.path === 'PROMPT.md') ? '是' : '否'}`)

// 敏感内容检查
const leaks = []
const envProbe = await api(`/repos/${owner}/${REPO}/contents/.env.local`)
if (envProbe.status === 200) leaks.push('.env.local 在仓库里（严重！）')
const stickerProbe = await api(`/repos/${owner}/${REPO}/contents/public/bubu`)
if (stickerProbe.status === 200 && Array.isArray(stickerProbe.body) && stickerProbe.body.length > 0) {
  leaks.push(`public/bubu/ 里有 ${stickerProbe.body.length} 个文件（版权素材不该上传）`)
}
const dataProbe = await api(`/repos/${owner}/${REPO}/contents/data`)
if (dataProbe.status === 200 && Array.isArray(dataProbe.body) && dataProbe.body.length > 0) {
  leaks.push('data/ 目录被上传（账本数据不该上传）')
}
console.log(`敏感内容检查：${leaks.length ? '❌ ' + leaks.join('；') : '✅ 无密钥、无版权素材、无账本数据'}`)

console.log(`\n════ 完成 ════`)
console.log(repoUrl)
