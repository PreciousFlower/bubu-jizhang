#!/usr/bin/env node
/**
 * 建一个最小测试仓库，用来实测「Vercel / Cloudflare 的部署域名在当前网络下能否打开」。
 *
 * 为什么需要：不同网络环境下这些域名的可达性差别很大（国内常见 *.vercel.app 被墙）。
 * 与其把整个 App 部署上去才发现打不开，不如先花两分钟部署一个静态页测一下。
 *
 * 用法（token 从环境变量读）：
 *   $env:GH_TOKEN="ghp_xxx"; node scripts/make-reach-test.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const TEST_DIR = 'E:\\vibecoding\\reach-test'
const REPO = 'bubu-reach-test'

const token = process.env.GH_TOKEN
if (!token) {
  console.error('缺少 GH_TOKEN')
  process.exit(1)
}

const git = (args, cwd = TEST_DIR) => spawnSync('git', args, { cwd, stdio: 'inherit' })

const api = async (path, init = {}) => {
  const res = await fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'reach-test',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

/* ------------------------------ 查用户名 ------------------------------ */

const me = await api('/user')
if (!me.ok) {
  console.error('Token 无效')
  process.exit(1)
}
const owner = me.body.login
console.log(`账号：${owner}`)

/* ------------------------------ 建仓库 ------------------------------ */

let repo = await api('/user/repos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: REPO,
    description: 'Vercel / Cloudflare 部署域名可达性测试（最小静态页，用完可删）',
    private: false,
    auto_init: false,
  }),
})
if (repo.ok) {
  console.log(`仓库已创建：${repo.body.html_url}`)
} else if (repo.status === 422) {
  console.log('仓库已存在，复用')
  repo = await api(`/repos/${owner}/${REPO}`)
} else {
  console.error(`建仓失败 HTTP ${repo.status}：${JSON.stringify(repo.body).slice(0, 300)}`)
  process.exit(1)
}

/* ------------------------------ 初始化并推送 ------------------------------ */

if (!existsSync(`${TEST_DIR}\\.git`)) {
  git(['init', '-b', 'main'])
  git(['config', 'user.name', owner])
  git(['config', 'user.email', '974400809@qq.com'])
}
git(['add', '-A'])
git(['-c', 'user.name=' + owner, '-c', 'user.email=974400809@qq.com', 'commit', '-m', 'test: 可达性测试页（Vercel + Cloudflare）'])

const url = `https://${owner}:${token}@github.com/${owner}/${REPO}.git`
git(['-c', 'credential.helper=', 'push', '--force', url, 'main:main'])

console.log(`\n════ 完成 ════`)
console.log(`测试仓库：https://github.com/${owner}/${REPO}`)
console.log(`\n仓库结构：`)
console.log(`  vercel/index.html      ← 部署到 Vercel 用`)
console.log(`  cloudflare/index.html  ← 部署到 Cloudflare Pages 用`)
