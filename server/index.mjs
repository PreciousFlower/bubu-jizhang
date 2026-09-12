/**
 * 布布记账 API 服务
 * 职责：托管密钥（永不下发前端）、图片识别代理、记账数据 CRUD、统计聚合、上传图片静态托管。
 */
import express from 'express'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// .env.local 优先于 .env
loadEnv({ path: join(ROOT, '.env.local'), override: true, quiet: true })

const { initStore, store, storeInfo, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, newId, dataDir } = await import(
  './lib/store.mjs'
)
const { recognize, VisionError, normalizeImage, cacheStats } = await import('./lib/vision.mjs')
const { LATEST, PROMPTS } = await import('./lib/prompts.mjs')
const { checkAndConsume, recordUsage, guardStatus, startGuardSweeper, guardConfig, GuardError } = await import(
  './lib/guard.mjs'
)

// 监听端口优先级：托管平台注入的 PORT > 本地 .env.local 的 API_PORT > 默认 8787
// （踩坑记录：把 API_PORT 当监听端口会被 .env.local 的 override 覆盖，导致换端口无效）
const PORT = Number(process.env.PORT || process.env.API_PORT || 8787)
// 上传目录跟着数据目录走（DATA_DIR 可覆盖，见 store.mjs），避免两边路径不一致
const UPLOAD_DIR = join(dataDir(), 'uploads')
const DIST_DIR = join(ROOT, 'dist')
mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()
// 部署在反向代理后面（Render / Railway / Nginx）时要信任 X-Forwarded-For，否则限流会把所有访客算成同一个 IP
if (guardConfig.trustProxy) app.set('trust proxy', 1)
app.use(express.json({ limit: '48mb' }))
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))

app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) console.log(`[api] ${req.method} ${req.path}`)
  next()
})

const ok = (res, data) => res.json({ ok: true, ...data })
const fail = (res, status, code, message, detail = null) =>
  res.status(status).json({ ok: false, error: { code, message, detail } })

/* --------------------------------- 健康检查 --------------------------------- */

app.get('/api/health', (_req, res) => {
  const info = storeInfo()
  const g = guardStatus()
  ok(res, {
    ...info,
    visionModel: process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash',
    visionReady: Boolean(process.env.DEEPSEEK_API_KEY) && g.enabled,
    aiEnabled: g.enabled,
    quota: {
      callsToday: g.used.callsToday,
      globalPerDay: g.limits.globalPerDay,
      perIpPerDay: g.limits.perIpPerDay,
      resetsAt: g.resetsAt,
    },
    promptVersions: PROMPTS.map((p) => p.version),
    activePrompt: LATEST.version,
    cache: cacheStats(),
  })
})

app.get('/api/guard', (_req, res) => ok(res, { guard: guardStatus() }))

/* ---------------------------------- 分类 ---------------------------------- */

app.get('/api/categories', (_req, res) => {
  const s = store().getSettings()
  ok(res, { categories: [...DEFAULT_CATEGORIES, ...(s.diyCategories ?? [])] })
})

/* --------------------------------- 记账 CRUD -------------------------------- */

function parseAmountToFen(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

app.get('/api/txns', (req, res) => {
  const { from, to, limit } = req.query
  const rows = store().listTxns({
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    limit: limit ? Number(limit) : 500,
  })
  ok(res, { txns: rows, count: rows.length })
})

app.post('/api/txns', (req, res) => {
  const b = req.body ?? {}
  const amountFen = parseAmountToFen(b.amount)
  if (amountFen === null || amountFen <= 0) return fail(res, 400, 'BAD_AMOUNT', '金额必须是大于 0 的数字（单位：分）')
  if (!b.category) return fail(res, 400, 'BAD_CATEGORY', '缺少分类')
  const t = {
    id: newId(),
    kind: b.kind === 'income' ? 'income' : 'expense',
    amount: amountFen,
    category: String(b.category),
    note: String(b.note ?? ''),
    merchant: String(b.merchant ?? ''),
    occurredAt: b.occurredAt ? new Date(b.occurredAt).toISOString() : new Date().toISOString(),
    account: String(b.account ?? '默认'),
    mood: String(b.mood ?? ''),
    source: b.source === 'photo' ? 'photo' : 'manual',
    imageRef: b.imageRef ? String(b.imageRef) : null,
    confidence: b.confidence === null || b.confidence === undefined ? null : Number(b.confidence),
    createdAt: new Date().toISOString(),
  }
  store().insertTxn(t)
  ok(res, { txn: t })
})

app.patch('/api/txns/:id', (req, res) => {
  const b = req.body ?? {}
  const patch = {}
  if (b.amount !== undefined) {
    const fen = parseAmountToFen(b.amount)
    if (fen === null || fen <= 0) return fail(res, 400, 'BAD_AMOUNT', '金额必须是大于 0 的数字（单位：分）')
    patch.amount = fen
  }
  for (const k of ['category', 'note', 'merchant', 'account', 'mood', 'kind', 'imageRef']) {
    if (b[k] !== undefined) patch[k] = b[k]
  }
  if (b.occurredAt !== undefined) patch.occurredAt = new Date(b.occurredAt).toISOString()
  if (b.confidence !== undefined) patch.confidence = b.confidence === null ? null : Number(b.confidence)
  const updated = store().updateTxn(String(req.params.id), patch)
  if (!updated) return fail(res, 404, 'NOT_FOUND', '这笔记录不存在')
  ok(res, { txn: updated })
})

app.delete('/api/txns/:id', (req, res) => {
  const done = store().deleteTxn(String(req.params.id))
  if (!done) return fail(res, 404, 'NOT_FOUND', '这笔记录不存在')
  ok(res, { deleted: String(req.params.id) })
})

/* ---------------------------------- 统计 ---------------------------------- */

app.get('/api/stats', (req, res) => {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7)) // YYYY-MM
  const from = `${month}-01T00:00:00.000Z`
  const to = `${month}-31T23:59:59.999Z`
  const rows = store().listTxns({ from, to, limit: 5000 })

  const expenseFen = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0)
  const incomeFen = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0)

  const byCategory = new Map()
  for (const r of rows) {
    if (r.kind !== 'expense') continue
    const cur = byCategory.get(r.category) ?? { category: r.category, fen: 0, count: 0 }
    cur.fen += r.amount
    cur.count += 1
    byCategory.set(r.category, cur)
  }

  const byDay = new Map()
  for (const r of rows) {
    if (r.kind !== 'expense') continue
    const d = r.occurredAt.slice(0, 10)
    byDay.set(d, (byDay.get(d) ?? 0) + r.amount)
  }

  const settings = store().getSettings()
  ok(res, {
    month,
    expenseFen,
    incomeFen,
    balanceFen: incomeFen - expenseFen,
    budgetFen: settings.monthlyBudget,
    budgetUsedRatio: settings.monthlyBudget > 0 ? Math.min(2, expenseFen / settings.monthlyBudget) : 0,
    categories: [...byCategory.values()].sort((a, b) => b.fen - a.fen),
    days: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, fen]) => ({ date, fen })),
    txnCount: rows.length,
  })
})

/* ---------------------------------- 设置 ---------------------------------- */

app.get('/api/settings', (_req, res) => ok(res, { settings: store().getSettings() }))

app.put('/api/settings', (req, res) => {
  const cur = store().getSettings()
  const b = req.body ?? {}
  const next = { ...cur }
  if (b.monthlyBudget !== undefined) {
    const n = Number(b.monthlyBudget)
    if (!Number.isFinite(n) || n < 0) return fail(res, 400, 'BAD_BUDGET', '预算必须是不小于 0 的数字（单位：分）')
    next.monthlyBudget = Math.round(n)
  }
  if (b.currency !== undefined) next.currency = String(b.currency)
  store().saveSettings(next)
  ok(res, { settings: next })
})

/* -------------------------------- 图片上传 -------------------------------- */

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' }

app.post('/api/uploads', async (req, res, next) => {
  try {
    const dataUrl = req.body?.dataUrl
    if (!dataUrl) return fail(res, 400, 'NO_IMAGE', '缺少 dataUrl')
    const norm = await normalizeImage(dataUrl)
    const mime = String(req.body?.mime ?? 'image/jpeg')
    const name = `${Date.now().toString(36)}-${norm.phash.slice(0, 8)}${MIME_EXT[mime] ?? '.jpg'}`
    writeFileSync(join(UPLOAD_DIR, name), norm.buf)
    ok(res, { imageRef: `/uploads/${name}`, width: norm.width, height: norm.height, bytes: norm.bytes })
  } catch (e) {
    next(e)
  }
})

/* -------------------------------- 视觉识别 -------------------------------- */

app.get('/api/vision/versions', (_req, res) =>
  ok(res, {
    versions: PROMPTS.map((p) => ({ version: p.version, label: p.label })),
    active: LATEST.version,
    cache: cacheStats(),
  })
)

app.post('/api/vision/recognize', async (req, res, next) => {
  try {
    const b = req.body ?? {}
    const images = b.images ?? (b.image ? [b.image] : null)
    if (!images) return fail(res, 400, 'NO_IMAGES', '请在 images 字段里传入图片（dataUrl 或 base64），最多 4 张')

    // 过闸：限流 + 每日额度熔断。未通过会抛 GuardError，不消耗上游调用。
    try {
      checkAndConsume(req.ip)
    } catch (g) {
      if (g instanceof GuardError) {
        if (g.retryAfterSec) res.set('Retry-After', String(g.retryAfterSec))
        return fail(res, g.status, g.code, g.message)
      }
      throw g
    }

    const started = Date.now()
    const result = await recognize({
      images,
      hint: b.hint ? String(b.hint) : undefined,
      promptVersion: b.promptVersion ? String(b.promptVersion) : LATEST.version,
      useCache: b.useCache !== false,
    })
    // 回填真实 token 消耗，用于全站额度熔断
    recordUsage(result.meta?.usage)
    console.log(
      `[vision] ${result.promptVersion} total=${result.total} conf=${result.confidence} review=${result.needs_review} ${Date.now() - started}ms`
    )
    ok(res, { result })
  } catch (e) {
    next(e)
  }
})

/* --------------------------- 生产环境：托管前端 --------------------------- */

// 部署到单进程托管时，由 API 服务直接把 dist/ 发出去，前后端同源，不需要再配跨域或代理。
// 注意必须放在所有 /api 路由之后，否则会把接口请求吃掉。
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1h', index: false }))
  app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'))
  })
  console.log('[api] 检测到 dist/，已启用前端静态托管')
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('html')
      .send('<h1>布布记账 API 已启动</h1><p>未找到 dist/，请先执行 <code>npm run build</code>，或使用 <code>npm run dev</code> 走 Vite 开发服务器。</p>')
  )
}

/* ------------------------------- 错误与启动 ------------------------------- */

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', '接口不存在'))

app.use((err, _req, res, _next) => {
  if (err instanceof VisionError) {
    console.error(`[vision-error] ${err.code} ${err.message}`)
    return fail(res, err.status, err.code, err.message, err.detail)
  }
  if (err instanceof GuardError) {
    return fail(res, err.status, err.code, err.message)
  }
  console.error('[error]', err)
  fail(res, 500, 'INTERNAL', err instanceof Error ? err.message : '服务器内部错误')
})

initStore()
startGuardSweeper()
const info = storeInfo()
const g = guardStatus()
// 托管平台会注入 PORT；本地默认只监听回环地址，避免无意中把本机服务暴露到局域网
const HOST = process.env.PORT || process.env.HOST ? '0.0.0.0' : '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`[api] 布布记账 API 已启动 http://${HOST}:${PORT}`)
  console.log(`[api] 存储驱动: ${info.driver}${info.fallbackReason ? ` (降级原因: ${info.fallbackReason})` : ''}`)
  console.log(`[api] 数据目录: ${info.dataDir}`)
  console.log(`[api] 识别模型: ${process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash'} / prompt ${LATEST.version} / Key ${process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置'}`)
  console.log(
    `[api] AI 护栏: ${g.enabled ? '开启' : '已关闭'}｜单IP ${g.limits.perIpPerMinute}/分、${g.limits.perIpPerDay}/天｜全站 ${g.limits.globalPerDay} 次/天、${g.limits.globalTokensPerDay} token/天`
  )
  if (!existsSync(join(ROOT, '.env.local')) && !process.env.DEEPSEEK_API_KEY) {
    console.warn('[api] 提示：未找到 .env.local，识别接口会返回 NO_API_KEY')
  }
})
