/**
 * 贴图清洗与筛选脚本。
 *
 * 做四件事：
 *  1. 用 sharp 读真实像素，剔除纯色/近纯色（多半是 logo 或占位图）、过小、比例过扁的图
 *  2. 白底/透明边裁剪，统一导出 512×512 以内的 WebP 到 public/bubu/
 *  3. 用 deepseek-flash 视觉逐张判定：是否含文字水印、是否多图拼接、画的是不是「小熊/熊猫情侣卡通」
 *  4. 生成 manifest.json 与 _contact-sheet.html 预览墙，方便人工一眼验收
 *
 * 用法：
 *   node scripts/review-assets.mjs            # 只做像素清洗 + 生成预览墙，跳过视觉
 *   node scripts/review-assets.mjs --vision   # 额外调用视觉模型逐张判定
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
loadEnv({ path: join(ROOT, '.env.local'), override: true, quiet: true })

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const RAW_DIR = join(ROOT, 'assets-src', 'raw')
const OUT_DIR = join(ROOT, 'public', 'bubu')
// 预览墙刻意放在 public 之外：public 下的 .html 会被 Vite 当成构建入口一起处理，
// 而这个文件只是给人看的验收工具，不该进产物。
const PREVIEW_FILE = join(ROOT, 'assets-src', '_contact-sheet.html')
const LOG_DIR = join(ROOT, 'logs')
const USE_VISION = process.argv.includes('--vision')

mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(LOG_DIR, { recursive: true })

const plan = JSON.parse(readFileSync(join(__dirname, 'asset-plan.json'), 'utf8'))
const planByKey = new Map(plan.map((p) => [p.key, p]))

const MAX_EDGE = 512
const MIN_EDGE = 160
const SOLID_RATIO_LIMIT = 0.92

const logLines = []
const log = (m) => {
  console.log(m)
  logLines.push(m)
}

/* --------------------------- 1. 像素级清洗与导出 --------------------------- */

/** 统计出现最多的颜色占比，用来识别纯色底/logo */
async function dominantColorRatio(buf) {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const counts = new Map()
  for (let i = 0; i < data.length; i += info.channels) {
    // 量化到 5 位，抗轻微噪声
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = (info.width * info.height) || 1
  return Math.max(...counts.values()) / total
}

/** 判断图片四角是否接近同色（用于决定要不要 trim 白底） */
async function cornerUniformity(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  const px = (x, y) => [data[(y * w + x) * c], data[(y * w + x) * c + 1], data[(y * w + x) * c + 2]]
  const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)]
  let maxDiff = 0
  for (let i = 1; i < 4; i++) {
    for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(corners[0][k] - corners[i][k]))
  }
  return maxDiff // 越小越可能是统一底色
}

/**
 * 从四条边做泛洪填充，只把「与画面边缘连通的浅色区域」抠成透明。
 *
 * 为什么不用简单的亮度阈值：角色身上（熊猫的白肚子、白脸）也是白色，
 * 一刀切会把角色抠漏。泛洪只吃连通到边框的背景，角色内部的白被完整保留。
 * 早期版本用半透明阈值，结果在浅色卡片上仍显示为一个浅色方块 —— 截图评审抓到过。
 */
function floodFillBackground(data, width, height, channels) {
  const idx = (x, y) => (y * width + x) * channels
  const visited = new Uint8Array(width * height)
  const stack = []

  const isBackgroundish = (i) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const lum = (r * 299 + g * 587 + b * 114) / 1000
    // 纯色浅底也算背景：很多素材是"浅蓝/浅灰方底 + 角色"，
    // 不抠掉的话在奶油色卡片上就会显出一个方块（截图评审反复提到"交通图标是蓝底方块"）。
    // 判据：亮度够高，且整体接近中性（允许偏冷偏暖，但不允许高饱和色块）。
    const nearNeutral = maxC - minC <= 34
    return lum >= 202 && nearNeutral
  }

  for (let x = 0; x < width; x++) {
    if (isBackgroundish(idx(x, 0))) stack.push(x, 0)
    if (isBackgroundish(idx(x, height - 1))) stack.push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    if (isBackgroundish(idx(0, y))) stack.push(0, y)
    if (isBackgroundish(idx(width - 1, y))) stack.push(width - 1, y)
  }

  let removed = 0
  while (stack.length) {
    const y = stack.pop()
    const x = stack.pop()
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const p = y * width + x
    if (visited[p]) continue
    const i = idx(x, y)
    if (!isBackgroundish(i)) continue
    visited[p] = 1
    data[i + 3] = 0
    removed++
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }

  // 边缘抗锯齿：把紧挨透明区的浅色像素做半透明羽化，避免锯齿硬边
  const alphaCopy = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p++) alphaCopy[p] = data[p * channels + 3]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (alphaCopy[p] === 0) continue
      const nb = alphaCopy[p - 1] + alphaCopy[p + 1] + alphaCopy[p - width] + alphaCopy[p + width]
      if (nb < 255 * 2) {
        data[p * channels + 3] = Math.min(data[p * channels + 3], 150)
      }
    }
  }

  return removed
}

async function processOne(file) {
  const raw = readFileSync(file)
  const base = parse(file).name.replace(/-\d+$/, '')
  const item = planByKey.get(base)
  const meta = await sharp(raw, { animated: false }).metadata()
  const ratio = await dominantColorRatio(raw)
  const uniform = await cornerUniformity(raw).catch(() => 255)

  if (ratio > SOLID_RATIO_LIMIT) {
    return { skip: `纯色占比 ${(ratio * 100).toFixed(1)}%，疑似 logo/占位图` }
  }
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
  const shortEdge = Math.min(meta.width ?? 0, meta.height ?? 0)
  if (longEdge < MIN_EDGE || shortEdge < MIN_EDGE * 0.5) {
    return { skip: `尺寸过小 ${meta.width}x${meta.height}` }
  }
  if (longEdge / Math.max(1, shortEdge) > 3.2) {
    return { skip: `比例过扁 ${meta.width}x${meta.height}` }
  }

  let pipe = sharp(raw, { animated: false }).rotate()
  // 四角统一色 → 尝试裁掉多余留白
  if (uniform < 24) {
    try {
      pipe = sharp(await pipe.trim({ threshold: 12 }).toBuffer())
    } catch {
      pipe = sharp(raw, { animated: false }).rotate()
    }
  }

  const trimmed = await pipe
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer()

  // 从边缘泛洪抠掉背景底色，让贴图融进任何卡片底色
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const removed = floodFillBackground(data, info.width, info.height, info.channels)
  const bgRatio = removed / (info.width * info.height)

  const outBuf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .webp({ quality: 88, alphaQuality: 92 })
    .toBuffer()

  return {
    buf: outBuf,
    width: (await sharp(outBuf).metadata()).width,
    height: (await sharp(outBuf).metadata()).height,
    key: base,
    label: item?.label ?? base,
    emoji: item?.emoji ?? '✨',
    sourceFile: parse(file).base,
    hash: createHash('sha1').update(outBuf).digest('hex').slice(0, 12),
    originalSize: raw.length,
    newSize: outBuf.length,
    bgRatio,
  }
}

/* ----------------------------- 2. 视觉逐张判定 ----------------------------- */

async function visionJudge(dataUrl, key, label) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return { error: 'NO_API_KEY' }
  const body = {
    model: process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash',
    temperature: 0,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是素材审核员。你只输出 JSON。你的判断必须基于你真实看到的画面，不要脑补。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `这是一张准备用作记账 App「${label}」分类图标/插画的候选素材。请如实回答：
{"can_see":true,
 "subject":"你实际看到的主体，一句话中文",
 "has_text_watermark":true|false,
 "is_collage":true|false,
 "is_screenshot":true|false,
 "is_cartoon":true|false,
 "bg_clean":true|false,
 "fits_label":true|false,
 "quality":0-10,
 "reason":"一句话中文理由"}`,
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  }
  try {
    const res = await fetch(`${(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })
    const text = await res.text()
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 120)}` }
    const content = JSON.parse(text).choices?.[0]?.message?.content ?? ''
    const s = content.indexOf('{')
    const e = content.lastIndexOf('}')
    return JSON.parse(content.slice(s, e + 1))
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 用已保存的视觉判定结果重算 usable 标记（不重新调模型）。
 * 门槛调整后用它快速刷新 manifest，避免重复烧 token。
 */
function applyExistingJudgements() {
  const p = join(OUT_DIR, 'manifest.json')
  if (!existsSync(p)) return null
  const m = JSON.parse(readFileSync(p, 'utf8'))
  for (const a of m.assets) {
    const v = a.vision
    a.usable = !v || v.error
      ? true
      : Boolean(
          v.can_see &&
            v.is_cartoon &&
            v.bg_clean &&
            !v.has_text_watermark &&
            !v.is_collage &&
            !v.is_screenshot &&
            (v.quality ?? 0) >= 6
        )
  }
  const perKey = {}
  for (const a of m.assets) {
    perKey[a.key] ??= { label: a.label, emoji: a.emoji, total: 0, usable: 0, files: [] }
    perKey[a.key].total++
    if (a.usable) perKey[a.key].usable++
    perKey[a.key].files.push(a.file)
  }
  // 顺手把视觉质量分写到顶层，前端据此优先挑最好的那张
  for (const a of m.assets) a.quality = a.vision?.quality ?? null
  m.perKey = perKey
  m.reviewedAt = new Date().toISOString()
  writeFileSync(p, JSON.stringify(m, null, 2), 'utf8')
  return m
}

/* -------------------------------- 主流程 -------------------------------- */

if (process.argv.includes('--reprocess')) {
  // 重新跑像素处理，复用已下载的原始文件，不重新调视觉模型。
  // 典型用途：云端构建时重建贴图（GitHub 仓库不含版权素材，需要现场生成）。
  const p = join(OUT_DIR, 'manifest.json')
  const rawFiles = existsSync(RAW_DIR) ? readdirSync(RAW_DIR).filter((f) => !f.endsWith('.json')) : []
  if (!rawFiles.length) {
    console.error(`没有找到原始素材（${RAW_DIR}），请先运行：node scripts/fetch-assets.mjs`)
    process.exit(1)
  }

  // manifest 可能不存在（全新克隆）：那就从原始文件重建，视觉判定留空，
  // 交给 --vision 或预览墙人工判断，避免"一张图都没有"。
  let m
  if (existsSync(p)) {
    m = JSON.parse(readFileSync(p, 'utf8'))
    console.log(`沿用已有 manifest 的视觉判定记录（${m.assets.filter((a) => a.vision && !a.vision.error).length} 条）`)
  } else {
    m = { generatedAt: new Date().toISOString(), note: '由原始素材重建（未经视觉筛选）', visionReviewed: false, total: 0, perKey: {}, assets: [] }
    console.log('未找到 manifest.json，从原始素材重建（视觉判定留空）')
  }

  const bySource = new Map(m.assets.map((a) => [a.source, a]))
  const counters = new Map()
  for (const a of m.assets) {
    const n = (counters.get(a.key) ?? 0) + 1
    counters.set(a.key, n)
  }

  let reused = 0
  let created = 0
  let skipped = 0
  for (const f of rawFiles) {
    try {
      const r = await processOne(join(RAW_DIR, f))
      if (r.skip) {
        skipped++
        continue
      }
      const prev = bySource.get(f)
      if (prev) {
        writeFileSync(join(OUT_DIR, prev.file), r.buf)
        prev.width = r.width
        prev.height = r.height
        prev.hash = r.hash
        prev.quality = prev.vision?.quality ?? prev.quality ?? null
        prev.usable = isUsable(prev.vision)
        reused++
      } else {
        const n = (counters.get(r.key) ?? 0) + 1
        counters.set(r.key, n)
        const outName = `${r.key}-${String(n).padStart(2, '0')}.webp`
        writeFileSync(join(OUT_DIR, outName), r.buf)
        m.assets.push({
          file: outName,
          path: `/bubu/${outName}`,
          key: r.key,
          label: r.label,
          emoji: r.emoji,
          width: r.width,
          height: r.height,
          usable: true, // 未经视觉筛选，先保留，可用 --vision 复核
          quality: null,
          source: r.sourceFile,
          hash: r.hash,
          vision: null,
        })
        created++
      }
    } catch (e) {
      console.log(`  × ${f} ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }

  // 重算每个分类
  const perKey = {}
  for (const a of m.assets) {
    perKey[a.key] ??= { label: a.label, emoji: a.emoji, total: 0, usable: 0, files: [] }
    perKey[a.key].total++
    if (a.usable) perKey[a.key].usable++
    perKey[a.key].files.push(a.file)
  }
  m.perKey = perKey
  m.total = m.assets.length
  m.reviewedAt = new Date().toISOString()
  writeFileSync(p, JSON.stringify(m, null, 2), 'utf8')

  console.log(`贴图重建完成：复用 ${reused} 张，新建 ${created} 张，跳过 ${skipped} 张，共 ${m.total} 张`)
  console.log(`可用 ${m.assets.filter((a) => a.usable).length} 张，覆盖 ${Object.keys(perKey).length} 个分类`)
  console.log('提示：想按视觉质量筛选，运行 node scripts/review-assets.mjs --vision')
  process.exit(0)
}

if (process.argv.includes('--recompute')) {
  const m = applyExistingJudgements()
  if (!m) {
    console.error('没有找到 manifest.json，无法重算')
    process.exit(1)
  }
  const usable = m.assets.filter((a) => a.usable).length
  console.log(`已按新门槛重算：可用 ${usable}/${m.total}`)
  for (const [k, v] of Object.entries(m.perKey)) {
    console.log(`  ${v.emoji} ${v.label.padEnd(7)} ${k.padEnd(11)} 可用 ${v.usable}/${v.total}`)
  }
  process.exit(0)
}

const files = existsSync(RAW_DIR) ? readdirSync(RAW_DIR).filter((f) => !f.endsWith('.json')) : []
log(`原始候选：${files.length} 个文件`)
log(`视觉判定：${USE_VISION ? '开启' : '关闭（加 --vision 开启）'}`)

const entries = []
let skipped = 0

for (const f of files) {
  const full = join(RAW_DIR, f)
  try {
    const r = await processOne(full)
    if (r.skip) {
      log(`  × ${f}  ${r.skip}`)
      skipped++
      continue
    }
    entries.push(r)
  } catch (e) {
    log(`  × ${f}  处理失败：${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    skipped++
  }
}

// 按 key 分组编号导出
const counters = new Map()
const finalEntries = []
for (const e of entries) {
  const n = (counters.get(e.key) ?? 0) + 1
  counters.set(e.key, n)
  const outName = `${e.key}-${String(n).padStart(2, '0')}.webp`
  writeFileSync(join(OUT_DIR, outName), e.buf)
  finalEntries.push({ ...e, outName, outPath: `/bubu/${outName}` })
  delete finalEntries[finalEntries.length - 1].buf
}

log(`\n清洗完成：通过 ${finalEntries.length} 张，剔除 ${skipped} 张`)

/* 视觉判定（并发 4，避免打爆上游限流） */
if (USE_VISION && finalEntries.length) {
  log(`\n开始视觉逐张判定（${finalEntries.length} 张，并发 4）...`)
  let done = 0
  const queue = finalEntries.slice()
  const worker = async () => {
    for (;;) {
      const e = queue.shift()
      if (!e) return
      const buf = readFileSync(join(OUT_DIR, e.outName))
      const v = await visionJudge(`data:image/webp;base64,${buf.toString('base64')}`, e.key, e.label)
      e.vision = v
      proxy(e)
      done++
      const mark = e.usable ? '✓' : '×'
      log(
        `  ${mark} [${done}/${finalEntries.length}] ${e.outName} q=${v.quality ?? '-'} ${
          v.error ? 'ERR:' + v.error : String(v.subject ?? '').slice(0, 44)
        }`
      )
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

/**
 * 判定一张图是否可用（统一门槛，多处复用）。
 * 门槛收紧的依据：截图评审反馈"居家水电/娱乐/人情像实拍照片、带白底方块、疑似水印"，
 * 根因是 quality>=5 放行了太多平庸素材。这里提到 6，并要求背景干净。
 * 没评过或调用失败时保守保留，交给预览墙人工判断。
 */
function isUsable(v) {
  if (!v || v.error || v.can_see === undefined) return true
  return Boolean(
    v.can_see &&
      v.is_cartoon &&
      v.bg_clean &&
      !v.has_text_watermark &&
      !v.is_collage &&
      !v.is_screenshot &&
      (v.quality ?? 0) >= 6
  )
}

function proxy(e) {
  e.usable = isUsable(e.vision)
}

/* 统计每个 key 的可用数量 */
const perKey = {}
for (const e of finalEntries) {
  perKey[e.key] ??= { label: e.label, emoji: e.emoji, total: 0, usable: 0, files: [] }
  perKey[e.key].total++
  if (e.usable !== false) perKey[e.key].usable++
  perKey[e.key].files.push(e.outName)
}

const manifest = {
  generatedAt: new Date().toISOString(),
  note: '图片来自互联网搜集，版权归原作者所有；仅供个人学习使用，不商用、不再分发。',
  visionReviewed: USE_VISION,
  total: finalEntries.length,
  perKey,
  assets: finalEntries.map((e) => ({
    file: e.outName,
    path: e.outPath,
    key: e.key,
    label: e.label,
    emoji: e.emoji,
    width: e.width,
    height: e.height,
    usable: e.usable !== false,
    quality: e.vision?.quality ?? null,
    source: e.sourceFile,
    hash: e.hash,
    vision: e.vision ?? null,
  })),
}
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

/* 预览墙 */
const cards = manifest.assets
  .map(
    (a) => `  <figure class="${a.usable ? '' : 'bad'}">
    <img src="../public/bubu/${a.file}" loading="lazy" alt="${a.key}">
    <figcaption><b>${a.emoji} ${a.label}</b><br><span>${a.file}</span><br><em>${a.vision?.subject ?? a.source}</em>${a.vision?.quality !== undefined ? `<br><i>q=${a.vision.quality}</i>` : ''}</figcaption>
  </figure>`
  )
  .join('\n')

const byKeyRows = Object.entries(perKey)
  .map(([k, v]) => `<tr><td>${v.emoji} ${v.label}</td><td>${k}</td><td>${v.usable}/${v.total}</td></tr>`)
  .join('\n')

writeFileSync(
  PREVIEW_FILE,
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>布布贴图预览墙</title>
<style>
 body{font-family:"LXGW WenKai","Microsoft YaHei",sans-serif;background:#FFF9F2;color:#5B4A42;margin:0;padding:24px}
 h1{font-size:22px} .meta{color:#8C776C;font-size:13px;margin-bottom:16px}
 table{border-collapse:collapse;font-size:13px;margin-bottom:24px}
 td{border:1px solid #EFE6DF;padding:4px 10px;background:#fff}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
 figure{margin:0;background:#fff;border-radius:18px;padding:10px;box-shadow:0 6px 0 rgba(91,74,66,.08);text-align:center}
 figure.bad{opacity:.45;filter:grayscale(.7)}
 img{width:100%;height:130px;object-fit:contain;background:#FFF3E6;border-radius:12px}
 figcaption{font-size:11px;line-height:1.5;margin-top:6px;color:#8C776C}
 figcaption b{color:#5B4A42;font-size:12px}
 figcaption em{font-style:normal;display:block;color:#B7A69C}
 figcaption i{font-style:normal;color:#FF8E7A}
</style></head><body>
<h1>🐼 布布贴图预览墙</h1>
<div class="meta">生成于 ${manifest.generatedAt} ｜ 共 ${manifest.total} 张 ｜ 视觉判定：${USE_VISION ? '已开启' : '未开启'} ｜ 灰掉的是视觉判定不合格的（仍保留备用）</div>
<table><tr><td><b>分类</b></td><td><b>key</b></td><td><b>可用/总数</b></td></tr>
${byKeyRows}
</table>
<div class="grid">
${cards}
</div>
</body></html>`,
  'utf8'
)

log(`\n=== 每个分类可用素材 ===`)
for (const [k, v] of Object.entries(perKey)) {
  const emoji = v.usable >= 2 ? '✓' : '!'
  log(`  ${emoji} ${v.emoji} ${v.label.padEnd(6)} ${k.padEnd(10)} 可用 ${v.usable}/${v.total}`)
}
log(`\n预览墙: ${PREVIEW_FILE}`)
log(`manifest: ${join(OUT_DIR, 'manifest.json')}`)
writeFileSync(join(LOG_DIR, 'review-assets.log'), logLines.join('\n') + '\n', 'utf8')
