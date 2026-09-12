/**
 * 识别精度评测：把 fixtures/bills 里的夹具逐张跑过 v1/v2/v3 三个 prompt 版本，输出指标。
 *
 * 用法：
 *   node scripts/eval-vision.mjs                 # 跑全部版本，写 logs/iter-N.md
 *   node scripts/eval-vision.mjs --versions v3   # 只跑指定版本
 *   node scripts/eval-vision.mjs --label v3-tune # 自定义本轮标签
 *
 * 走本地 API（/api/vision/recognize）而不是直连上游，这样评的就是线上真实链路，
 * 包括图片归一化、金额对账、置信度压制等所有后处理。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FIX_DIR = join(ROOT, 'fixtures', 'bills')
const LOG_DIR = join(ROOT, 'logs')
mkdirSync(LOG_DIR, { recursive: true })

const API = process.env.EVAL_API || 'http://127.0.0.1:8787'
const args = process.argv.slice(2)
const onlyVersions = (() => {
  const i = args.indexOf('--versions')
  return i >= 0 ? args[i + 1].split(',') : null
})()
const label = (() => {
  const i = args.indexOf('--label')
  return i >= 0 ? args[i + 1] : null
})()

const gtPath = join(FIX_DIR, 'ground-truth.json')
if (!existsSync(gtPath)) {
  console.error('找不到 fixtures/bills/ground-truth.json，请先跑 node scripts/make-fixtures.mjs')
  process.exit(1)
}
const fixtures = JSON.parse(readFileSync(gtPath, 'utf8'))
if (!fixtures.length) {
  console.error('夹具为空')
  process.exit(1)
}

/**
 * 一致性守卫：ground-truth 与实际文件必须一一对应。
 *
 * 为什么需要它：曾经出现过"后台残留的旧生成任务把 ground-truth 覆盖回旧版本"，
 * 结果评测跑的是过期的标准答案，指标完全不可信却看不出问题。
 * 这类不一致必须当场炸掉，而不是静默跑完。
 */
const onDisk = readdirSync(FIX_DIR).filter((f) => f.endsWith('.jpg'))
const gtFiles = new Set(fixtures.map((f) => f.file))
const missingFiles = [...gtFiles].filter((f) => !onDisk.includes(f))
const deadFiles = onDisk.filter((f) => !gtFiles.has(f))
if (missingFiles.length || deadFiles.length) {
  console.error('❌ fixtures 与 ground-truth.json 不一致，评测结果不可信：')
  if (missingFiles.length) console.error(`   标准答案引用了不存在的文件：${missingFiles.join(', ')}`)
  if (deadFiles.length) console.error(`   存在未被标准答案引用的文件：${deadFiles.join(', ')}`)
  console.error('\n先运行：node scripts/make-fixtures.mjs')
  process.exit(1)
}
console.log(`✅ 一致性检查通过：${fixtures.length} 条标准答案 ↔ ${onDisk.length} 个夹具文件\n`)

const TOLERANCE_YUAN = 0.01

async function recognizeOne(file, version) {
  const buf = readFileSync(join(FIX_DIR, file))
  const t0 = Date.now()
  const res = await fetch(`${API}/api/vision/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: ['data:image/jpeg;base64,' + buf.toString('base64')],
      promptVersion: version,
      useCache: false, // 评测必须走真实推理，不能吃缓存
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const body = await res.json()
  return { httpStatus: res.status, body, wallMs: Date.now() - t0 }
}

async function getVersions() {
  const r = await fetch(`${API}/api/vision/versions`)
  const j = await r.json()
  return j.versions.map((v) => v.version)
}

const versions = onlyVersions ?? (await getVersions())
const results = {}

console.log(`夹具 ${fixtures.length} 张 ｜ prompt 版本：${versions.join(', ')}\n`)

for (const version of versions) {
  const rows = []
  console.log(`───── prompt ${version} ─────`)
  for (const f of fixtures) {
    let r
    try {
      r = await recognizeOne(f.file, version)
    } catch (e) {
      rows.push({ id: f.id, kind: f.kind, ok: false, error: e.message, truth: f.truth })
      console.log(`  ${f.id.padEnd(26)} ERROR ${e.message}`)
      continue
    }
    const res = r.body?.result
    if (!res) {
      rows.push({ id: f.id, kind: f.kind, ok: false, error: r.body?.error?.message ?? 'no result', truth: f.truth })
      console.log(`  ${f.id.padEnd(26)} HTTP ${r.httpStatus} ${r.body?.error?.code ?? ''}`)
      continue
    }

    const truth = f.truth
    const predTotal = res.total
    let ok
    if (truth.is_bill === false) {
      ok = res.is_bill === false
    } else if (f.assertNoFalseCertainty) {
      // 金额不可读的样本：不合格的表现是"自信地报一个数"
      const confident = res.is_bill === true && res.confidence >= 0.6 && (res.warnings?.length ?? 0) === 0
      ok = !confident
    } else if (f.lenient) {
      // 边界夹具（菜单）：允许模型给任一单价，也允许判为非账单
      ok = res.is_bill === false || (typeof predTotal === 'number' && predTotal > 0)
    } else {
      ok = res.is_bill === true && typeof predTotal === 'number' && Math.abs(predTotal - truth.total) <= TOLERANCE_YUAN
    }

    const catOk =
      truth.is_bill === false || f.lenient
        ? true
        : Array.isArray(f.categoryAny)
          ? f.categoryAny.includes(res.suggested_category)
          : res.suggested_category === truth.category

    rows.push({
      id: f.id,
      kind: f.kind,
      ok,
      lenient: !!f.lenient,
      assertNoFalseCertainty: !!f.assertNoFalseCertainty,
      truth,
      pred: {
        is_bill: res.is_bill,
        total: predTotal,
        doc_type: res.doc_type,
        category: res.suggested_category,
        merchant: res.merchant,
        confidence: res.confidence,
        needs_review: res.needs_review,
        warnings: res.warnings,
      },
      catOk,
      latencyMs: res.meta?.latencyMs ?? r.wallMs,
      attempts: res.meta?.attempts ?? 1,
      usage: res.meta?.usage ?? null,
      error: null,
    })

    const money = truth.is_bill === false ? '非账单' : `¥${truth.total}`
    const got = predTotal === null ? 'null' : `¥${predTotal}`
    console.log(
      `  ${ok ? '✓' : '✗'} ${f.id.padEnd(26)} 期望 ${money.padEnd(9)} 得到 ${got.padEnd(9)} ` +
        `doc=${res.doc_type.padEnd(18)} cat=${res.suggested_category.padEnd(9)} conf=${res.confidence} ${res.meta?.latencyMs}ms`
    )
  }

  const bills = rows.filter((r) => r.kind === 'bill' && !r.lenient)
  const nonbills = rows.filter((r) => r.kind === 'nonbill')
  const edges = rows.filter((r) => r.lenient)
  const strict = bills.filter((r) => !r.error)
  const exact = strict.filter((r) => r.ok && Math.abs((r.pred.total ?? -999) - r.truth.total) <= TOLERANCE_YUAN)
  const catOk = strict.filter((r) => r.catOk)
  const falsePositive = nonbills.filter((r) => !r.error && r.pred?.is_bill === true)
  const reviewRate = rows.filter((r) => !r.error && r.pred?.needs_review).length
  const latencies = rows.filter((r) => !r.error).map((r) => r.latencyMs)
  const errors = rows.filter((r) => r.error)

  results[version] = {
    rows,
    metrics: {
      billTotal: bills.length,
      amountExact: exact.length,
      amountExactRate: bills.length ? exact.length / bills.length : 0,
      category: catOk.length,
      categoryRate: strict.length ? catOk.length / strict.length : 0,
      nonbillTotal: nonbills.length,
      falsePositives: falsePositive.length,
      falsePositiveRate: nonbills.length ? falsePositive.length / nonbills.length : 0,
      edgeTotal: edges.length,
      edgePass: edges.filter((r) => r.ok).length,
      needsReviewRate: rows.length ? reviewRate / rows.length : 0,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      maxLatencyMs: latencies.length ? Math.max(...latencies) : 0,
      errors: errors.length,
      errorDetail: errors.map((e) => `${e.id}: ${e.error}`),
    },
  }
}

/* ------------------------------- 汇总与留痕 ------------------------------- */

const pct = (x) => (x * 100).toFixed(1) + '%'
let md = `# 识别精度迭代记录${label ? ` · ${label}` : ''}\n\n`
md += `- 时间：${new Date().toISOString()}\n`
md += `- 夹具：fixtures/bills（${fixtures.length} 张：账单 ${fixtures.filter((f) => f.kind === 'bill').length}、非账单 ${fixtures.filter((f) => f.kind === 'nonbill').length}）\n`
md += `- 评测接口：${API}/api/vision/recognize（真实链路，含图片归一化 + 金额对账）\n`
md += `- 金额判对容差：±${TOLERANCE_YUAN} 元\n\n`

md += `## 指标对比\n\n`
md += `| 指标 | ${versions.join(' | ')} |\n`
md += `|---|${versions.map(() => '---').join('|')}|\n`
const metricRows = [
  ['金额完全正确率', (m) => `${m.amountExact}/${m.billTotal} = ${pct(m.amountExactRate)}`],
  ['分类正确率', (m) => `${m.category}/${m.billTotal} = ${pct(m.categoryRate)}`],
  ['非账单误判率（越低越好）', (m) => `${m.falsePositives}/${m.nonbillTotal} = ${pct(m.falsePositiveRate)}`],
  ['边界样本通过', (m) => `${m.edgePass}/${m.edgeTotal}`],
  ['需人工确认占比', (m) => pct(m.needsReviewRate)],
  ['平均耗时', (m) => `${m.avgLatencyMs}ms`],
  ['最慢耗时', (m) => `${m.maxLatencyMs}ms`],
  ['调用失败数', (m) => String(m.errors)],
]
for (const [name, fn] of metricRows) {
  md += `| ${name} | ${versions.map((v) => fn(results[v].metrics)).join(' | ')} |\n`
}
md += `\n`

for (const version of versions) {
  const r = results[version]
  md += `## prompt ${version} 逐张明细\n\n`
  md += `| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |\n`
  md += `|---|---|---|---|---|---|---|---|---|---|\n`
  for (const row of r.rows) {
    if (row.error) {
      md += `| ${row.id} | ${row.kind} | - | - | - | - | - | - | - | ❌ ${row.error} |\n`
      continue
    }
    const t = row.lenient ? '（边界）' : row.truth.is_bill === false ? '非账单' : `¥${row.truth.total}`
    md += `| ${row.id} | ${row.kind}${row.lenient ? '/边界' : ''}${row.assertNoFalseCertainty ? '/模糊' : ''} | ${t} | ${row.pred.total === null ? 'null' : '¥' + row.pred.total} | ${row.pred.doc_type} | ${row.pred.category} | ${row.pred.confidence} | ${row.pred.needs_review ? '是' : '否'} | ${row.latencyMs}ms | ${row.ok ? '✅' : '❌'} |\n`
  }
  md += `\n`
  const warns = r.rows.filter((x) => x.pred?.warnings?.length)
  if (warns.length) {
    md += `### 模型给出的 warnings\n\n`
    for (const w of warns) {
      md += `- **${w.id}**：${w.pred.warnings.map((x) => `「${x}」`).join('；')}\n`
    }
    md += `\n`
  }
}

// 迭代序号
let n = 1
while (existsSync(join(LOG_DIR, `iter-${n}.md`))) n++
const outFile = join(LOG_DIR, `iter-${n}.md`)
writeFileSync(outFile, md, 'utf8')

console.log(`\n══════ 汇总 ══════`)
for (const version of versions) {
  const m = results[version].metrics
  console.log(
    `${version}: 金额正确 ${m.amountExact}/${m.billTotal} (${pct(m.amountExactRate)})  分类 ${pct(m.categoryRate)}  ` +
      `误判 ${m.falsePositives}/${m.nonbillTotal}  平均 ${m.avgLatencyMs}ms  失败 ${m.errors}`
  )
}
console.log(`\n报告已写入：${outFile}`)
