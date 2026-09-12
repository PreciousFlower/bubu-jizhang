#!/usr/bin/env node
/**
 * 构建前准备贴图。
 *
 * 背景：仓库里刻意不包含从网上搜集的卡通贴图（版权原因，不再分发），
 * 所以部署时需要在构建阶段现场采集一次。
 *
 * 行为：
 *   - 默认：采集 → 视觉筛选 → 重建 webp，让线上站点有真实贴图
 *   - 设了 SKIP_ASSETS=1：直接跳过，界面会退回 emoji 占位
 *   - 采集失败（图床不可达等）：不中断构建，只打印警告（记账功能不依赖贴图）
 *
 * 用法：node scripts/prepare-assets.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MANIFEST = join(ROOT, 'public', 'bubu', 'manifest.json')

const run = (script, args = []) => {
  console.log(`\n$ node scripts/${script} ${args.join(' ')}`.trimEnd())
  const r = spawnSync(process.execPath, [join(__dirname, script), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
  })
  return r.status === 0
}

console.log('════ 准备贴图素材 ════')

if (process.env.SKIP_ASSETS === '1') {
  console.log('SKIP_ASSETS=1，跳过贴图采集。界面会使用 emoji 占位。')
  process.exit(0)
}

if (existsSync(MANIFEST) && process.env.FORCE_ASSETS !== '1') {
  console.log('已存在 public/bubu/manifest.json，跳过采集。')
  console.log('（想强制重采：设 FORCE_ASSETS=1）')
  process.exit(0)
}

const fetched = run('fetch-assets.mjs', ['--per-key', process.env.ASSETS_PER_KEY || '12'])
if (!fetched) {
  console.warn('\n⚠️ 贴图采集失败（可能是图床不可达或限流）。')
  console.warn('   构建继续，界面将使用 emoji 占位，不影响记账与 AI 识别功能。')
  process.exit(0)
}

const reviewed = run('review-assets.mjs', ['--vision'])
if (!reviewed) {
  console.warn('\n⚠️ 视觉筛选失败，改用不带筛选的重建方式。')
  const rebuilt = run('review-assets.mjs', ['--reprocess'])
  if (!rebuilt) {
    console.warn('⚠️ 贴图重建也失败了，继续构建（界面用 emoji 占位）。')
  }
}

console.log('\n════ 贴图准备结束 ════')
