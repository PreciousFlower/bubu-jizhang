#!/usr/bin/env node
/**
 * 生成 Hugging Face Space 的精简上传包。
 *
 * 用途：Spaces 支持在网页上直接拖拽上传文件，不需要 git、不需要 token。
 * 但网页上传传整个项目会很乱（日志、评测夹具、Git 历史都不需要），
 * 这个脚本挑出「构建镜像真正需要的文件」放进 .hf-upload/，
 * 你把那个文件夹里的内容拖进 Space 就行。
 *
 * 用法：node scripts/make-space-package.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.hf-upload')

/** 镜像构建与运行需要的文件（少一个就构建失败，多一个只是浪费） */
const FILES = [
  // Spaces 靠它识别 SDK 与端口
  'README.md',
  // 容器定义
  'Dockerfile',
  '.dockerignore',
  // 依赖清单
  'package.json',
  'package-lock.json',
  // 前端构建配置
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tailwind.config.js',
  'postcss.config.js',
  // 运行时行为
  '.npmrc',
]

const DIRS = [
  'src', // 前端源码
  'server', // 后端
  'public', // 站点图标（贴图是构建时采集的，不在仓库里）
  'scripts', // 构建期脚本：准备素材、自检等
]

/**
 * 明确不需要进上传包的东西。
 *
 * ⚠️ 关键：public/bubu/ 里是本机采集的贴图（版权素材），绝对不能上传到公开的 Space。
 * 云端构建时会用 scripts/prepare-assets.mjs 自行采集，本地这份不需要、也不应该跟着走。
 */
const EXCLUDE_RE = [
  /\.log$/,
  /^fixtures\//,
  /^logs\//,
  /^data\//,
  /^dist\//,
  /^public\/bubu\/.*\.(webp|jpg|jpeg|png|gif)$/i, // 版权贴图
  /^public\/bubu\/manifest\.json$/,
  /^public\/bubu\/_contact-sheet\.html$/,
  /^\.hf-upload\//,
]

const relOf = (p) => p.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '')
const shouldSkip = (p) => EXCLUDE_RE.some((re) => re.test(relOf(p)))

/** 递归统计目录的文件数与体积 */
function walk(dir) {
  let n = 0
  let b = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      const r = walk(p)
      n += r.n
      b += r.b
    } else {
      n++
      b += statSync(p).size
    }
  }
  return { n, b }
}

console.log('════ 生成 Hugging Face Space 上传包 ════\n')

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

let count = 0
let bytes = 0

for (const f of FILES) {
  const src = join(ROOT, f)
  if (!existsSync(src)) {
    console.warn(`  ⚠️ 缺少 ${f}`)
    continue
  }
  cpSync(src, join(OUT, f))
  count++
}

for (const d of DIRS) {
  const src = join(ROOT, d)
  if (!existsSync(src)) {
    console.warn(`  ⚠️ 缺少目录 ${d}/`)
    continue
  }
  cpSync(src, join(OUT, d), { recursive: true, filter: (s) => !shouldSkip(s) })
}

// Spaces 的 README 必须有 YAML 头，这里做一次校验
const pkgReadme = join(OUT, 'README.md')
if (existsSync(pkgReadme)) {
  const head = readFileSync(pkgReadme, 'utf8').slice(0, 400)
  const hasSdk = /^---[\s\S]*?sdk:\s*docker/m.test(head)
  const hasPort = /app_port:\s*7860/.test(head)
  console.log(`  README YAML: sdk=docker ${hasSdk ? '✅' : '❌'}  app_port=7860 ${hasPort ? '✅' : '❌'}`)
}

// 统计
const stat = walk(OUT)

console.log(`\n上传包位置：${OUT}`)
console.log(`文件数：${stat.n}   体积：${(stat.b / 1024 / 1024).toFixed(2)} MB`)

// 安全校验：版权贴图绝不能进上传包
const { readdirSync: rd } = await import('node:fs')
const bubuDir = join(OUT, 'public', 'bubu')
if (existsSync(bubuDir)) {
  const imgs = rd(bubuDir).filter((f) => /\.(webp|jpg|jpeg|png|gif)$/i.test(f))
  if (imgs.length) {
    console.error(`\n❌ 上传包里混进了 ${imgs.length} 张版权贴图，已中止。请检查排除规则。`)
    process.exit(1)
  }
  console.log(`版权贴图检查：✅ 未包含（public/bubu 只有 ${rd(bubuDir).length} 个必要文件）`)
}

console.log('\n下一步：打开你的 Space 页面 → Files 标签 → Add file → Upload files，')
console.log('把 .hf-upload 文件夹【里面的内容】全部拖进去（注意不要多套一层目录）。')
