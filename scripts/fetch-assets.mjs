/**
 * 贴图采集脚本：从网络搜集「布布一二」相关插画，下载 → 去重 → 清洗 → 落盘。
 *
 * 用法：
 *   node scripts/fetch-assets.mjs                # 全部关键词
 *   node scripts/fetch-assets.mjs cook drink     # 只跑指定关键词
 *   node scripts/fetch-assets.mjs --per-key 12   # 每个关键词取前 N 张
 *
 * 说明：仅供个人学习使用，不商用、不再分发。图片版权归原作者所有。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// 原图放在 public 之外：Vite 会把 public 原样拷进 dist，原始素材没必要进产物
const RAW_DIR = join(ROOT, 'assets-src', 'raw')
const OUT_DIR = join(ROOT, 'public', 'bubu')
const LOG_DIR = join(ROOT, 'logs')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const args = process.argv.slice(2)
const perKey = (() => {
  const i = args.indexOf('--per-key')
  return i >= 0 ? Number(args[i + 1]) : 10
})()
const only = args.filter((a) => !a.startsWith('--') && Number.isNaN(Number(a)))

mkdirSync(RAW_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(LOG_DIR, { recursive: true })

const plan = JSON.parse(readFileSync(join(__dirname, 'asset-plan.json'), 'utf8')).filter(
  (p) => only.length === 0 || only.includes(p.key)
)

const stats = { searched: 0, candidates: 0, downloaded: 0, rejected: 0, dupes: 0, byKey: {} }
const logLines = []

function log(msg) {
  console.log(msg)
  logLines.push(msg)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 用 Bing 图片搜索拿候选原图 URL */
async function searchImages(query, count = 35) {
  const url = `https://cn.bing.com/images/async?q=${encodeURIComponent(query)}&first=1&count=${count}&mmasync=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`搜索返回 ${res.status}`)
  const html = await res.text()
  const urls = [...html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)].map((m) => m[1])
  const titles = [...html.matchAll(/t&quot;:&quot;(.*?)&quot;/g)].map((m) => m[1])
  return urls.map((u, i) => ({ url: u, title: titles[i] ?? '' }))
}

function detectImage(buf) {
  const hex = buf.subarray(0, 12).toString('hex')
  if (hex.startsWith('ffd8ff')) return 'jpg'
  if (hex.startsWith('89504e47')) return 'png'
  if (hex.startsWith('47494638')) return 'gif'
  if (buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buf.subarray(4, 12).toString('ascii').includes('ftyp')) return 'heic'
  return null
}

async function download(url, referer = 'https://cn.bing.com/') {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf
}

/** 主流程：逐关键词 搜索 → 下载 → 校验 → 落盘 */
const seenHashes = new Set()

// 先把已存在的 raw 文件哈希装进集合，支持断点续跑
for (const f of existsSync(RAW_DIR) ? readdirSync(RAW_DIR) : []) {
  if (f.endsWith('.json')) continue
  try {
    seenHashes.add(createHash('sha256').update(readFileSync(join(RAW_DIR, f))).digest('hex'))
  } catch {
    /* ignore */
  }
}

for (const item of plan) {
  log(`\n=== [${item.key}] ${item.label} ← 搜索「${item.query}」 ===`)
  stats.byKey[item.key] = { saved: 0, files: [] }
  let candidates = []
  try {
    candidates = await searchImages(item.query)
    stats.searched++
  } catch (e) {
    log(`  搜索失败：${e.message}`)
    continue
  }
  stats.candidates += candidates.length
  log(`  候选 ${candidates.length} 条，尝试下载前 ${perKey} 条`)

  let saved = 0
  const usedHosts = new Map()
  for (const c of candidates) {
    if (saved >= perKey) break
    if (!/^https?:\/\//.test(c.url)) continue
    let host = ''
    try {
      host = new URL(c.url).host
    } catch {
      continue
    }
    // 同一图床最多取 4 张，避免风格单一
    if ((usedHosts.get(host) ?? 0) >= 4) continue
    try {
      const buf = await download(c.url)
      if (buf.length < 20_000) {
        stats.rejected++
        log(`  - 跳过（${buf.length}B 太小）`)
        continue
      }
      const kind = detectImage(buf)
      if (!kind) {
        stats.rejected++
        log(`  - 跳过（非图片格式）`)
        continue
      }
      const hash = createHash('sha256').update(buf).digest('hex')
      if (seenHashes.has(hash)) {
        stats.dupes++
        continue
      }
      seenHashes.add(hash)
      const name = `${item.key}-${String(saved + 1).padStart(2, '0')}.${kind}`
      writeFileSync(join(RAW_DIR, name), buf)
      saved++
      stats.downloaded++
      usedHosts.set(host, (usedHosts.get(host) ?? 0) + 1)
      log(`  + ${name}  ${(buf.length / 1024).toFixed(0)}KB  ${host}`)
      await sleep(120) // 轻微限速，避免被图床封
    } catch (e) {
      stats.rejected++
    }
  }
  stats.byKey[item.key].saved = saved
  if (saved < (item.min ?? 2)) {
    log(`  ! 仅拿到 ${saved} 张，低于目标 ${item.min} 张`)
  }
}

const summary = `
采集汇总 ${new Date().toISOString()}
关键词数: ${plan.length}   搜索成功: ${stats.searched}
候选总数: ${stats.candidates}   下载成功: ${stats.downloaded}
去重丢弃: ${stats.dupes}   不合格丢弃: ${stats.rejected}
按关键词:
${Object.entries(stats.byKey)
  .map(([k, v]) => `  ${k.padEnd(10)} ${v.saved}`)
  .join('\n')}
`
log(summary)
writeFileSync(join(LOG_DIR, 'fetch-assets.log'), logLines.join('\n') + '\n', 'utf8')
writeFileSync(join(RAW_DIR, '_fetch-stats.json'), JSON.stringify(stats, null, 2), 'utf8')
console.log(`\n原始素材目录: ${RAW_DIR}`)
console.log(`日志: ${join(LOG_DIR, 'fetch-assets.log')}`)
