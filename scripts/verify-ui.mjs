/**
 * 用真实浏览器逐页截图并采集 console 报错，用于人工验收界面。
 *
 * 用法：node scripts/verify-ui.mjs
 * 依赖：playwright-core（复用本机已安装的 Chrome，不额外下载浏览器）
 *
 * 产物：logs/shots/*.png 与 logs/ui-verify.md
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SHOT_DIR = join(ROOT, 'logs', 'shots')
const LOG_DIR = join(ROOT, 'logs')
mkdirSync(SHOT_DIR, { recursive: true })

const BASE = process.env.VERIFY_URL || 'http://127.0.0.1:5273'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!executablePath) {
  console.error('找不到 Chrome/Edge，无法截图')
  process.exit(1)
}

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
})
const page = await context.newPage()

const consoleErrors = []
const pageErrors = []
const failedRequests = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)))
page.on('requestfailed', (r) => {
  const u = r.url()
  failedRequests.push(`${u} :: ${r.failure()?.errorText}`)
})

const results = []

/**
 * 每张截图都新建一个页面。
 * 教训：hash 路由的跳转不会重新加载页面，React 状态会保留 ——
 * 之前用同一个 page 连拍，`#/home?add=1` 打开的弹层一直盖在后面的
 * 统计页/设置页截图上，导致视觉评审把弹层当成了那些页面。
 */
async function shot(name, fn, waitMs = 900) {
  const p = await context.newPage()
  const localErrors = []
  p.on('console', (m) => {
    if (m.type() === 'error') localErrors.push(m.text())
  })
  p.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)))
  try {
    await fn(p)
    await p.waitForTimeout(waitMs)
    await p.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false })
    await p.screenshot({ path: join(SHOT_DIR, `${name}-full.png`), fullPage: true })
    results.push({ name, ok: true, file: join(SHOT_DIR, `${name}.png`) })
    consoleErrors.push(...localErrors)
    console.log(`  ✓ ${name}`)
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message ?? e) })
    console.log(`  ✗ ${name} :: ${e.message}`)
  } finally {
    await p.close()
  }
}

console.log(`验证目标：${BASE}\n`)

// 1. 首页
let homeStats = { hasBudget: false, hasBalance: false, imgCount: 0, brokenImgs: [], stickerImgs: 0 }
await shot('01-home', async (p) => {
  await p.goto(`${BASE}/#/home`, { waitUntil: 'networkidle', timeout: 30000 })
  await p.waitForSelector('text=小账本', { timeout: 15000 })
  homeStats = await p.evaluate(() => {
    const txt = document.body.innerText
    const imgs = [...document.querySelectorAll('img')]
    return {
      hasBudget: txt.includes('预算'),
      hasBalance: txt.includes('本月结余'),
      imgCount: imgs.length,
      brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      stickerImgs: imgs.filter((i) => (i.getAttribute('src') || '').includes('/bubu/')).length,
    }
  })
})

// 2. 记一笔弹层（用 ?add=1 深链，独立页面，不会污染后面的截图）
await shot('02-add', async (p) => {
  await p.goto(`${BASE}/#/home?add=1`, { waitUntil: 'networkidle' })
  await p.waitForSelector('text=记一笔', { timeout: 10000 })
})

// 3. 拍照记账
await shot('03-scan', async (p) => {
  await p.goto(`${BASE}/#/scan`, { waitUntil: 'networkidle' })
  await p.waitForSelector('text=拍照记账', { timeout: 10000 })
})

// 4. 统计
await shot('04-stats', async (p) => {
  await p.goto(`${BASE}/#/stats`, { waitUntil: 'networkidle' })
  await p.waitForSelector('text=看看花销', { timeout: 10000 })
})

// 5. 设置
let settingsInfo = { visionReady: false, mentionsCopyright: false }
await shot('05-settings', async (p) => {
  await p.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
  await p.waitForSelector('text=设置', { timeout: 10000 })
  settingsInfo = await p.evaluate(() => {
    const txt = document.body.innerText
    return { visionReady: txt.includes('已配置'), mentionsCopyright: txt.includes('不商用') }
  })
})

// 6. 贴图预览墙（file:// 直接打开，确认素材真的能加载）
let sheetInfo = { total: 0, loaded: 0, broken: 0 }
await shot('06-contact-sheet', async (p) => {
  await p.goto('file:///' + join(ROOT, 'assets-src', '_contact-sheet.html').replace(/\\/g, '/'), {
    waitUntil: 'domcontentloaded',
  })
  await p.waitForTimeout(5000)
  sheetInfo = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')]
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    }
  })
})

// 7. 端到端：模拟真实上传一张夹具小票，走完整识别链路
let e2e = null
try {
  const fixture = join(ROOT, 'fixtures', 'bills', 'receipt-clear-noodle.jpg')
  await page.goto(`${BASE}/#/scan`, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', fixture)
  await page.waitForTimeout(1200)
  await shot('07-scan-picked', async () => {}, 300)

  await page.click('text=开始识别花了多少钱')
  await page.waitForSelector('text=看看对不对', { timeout: 90000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(SHOT_DIR, '08-scan-result.png'), fullPage: true })

  const reviewText = await page.evaluate(() => document.body.innerText)
  const amount = await page.inputValue('input[inputmode=decimal]')
  await page.click('text=确认记账')

  // 保存后会跳回首页并重新拉数据，必须等列表真正渲染出来再判定，
  // 同时用 API 核对这笔记录是否真的落库（比断言页面文字可靠）。
  await page.waitForSelector('text=最近的小账本', { timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: join(SHOT_DIR, '09-after-save.png'), fullPage: true })

  const afterText = await page.evaluate(() => document.body.innerText)

  const listed = await page.evaluate(async () => {
    const r = await fetch('/api/txns?limit=50')
    const j = await r.json()
    return j.txns.map((t) => ({ id: t.id, amount: t.amount, merchant: t.merchant, source: t.source, category: t.category }))
  })
  const saved = listed.find((t) => t.source === 'photo' && t.amount === 2800)

  e2e = {
    ok: Boolean(saved) && afterText.includes('最近的小账本'),
    amountField: amount,
    reviewMentionsAiAmount: reviewText.includes('AI 读到的'),
    reviewMentionsConfidence: reviewText.includes('把握度'),
    savedTxn: saved ?? null,
    visibleInList: saved ? afterText.includes(saved.merchant || '兰州') : false,
    shot: join(SHOT_DIR, '08-scan-result.png'),
  }
  console.log(
    `  ${e2e.ok ? '✓' : '✗'} 端到端：金额框=${amount}，落库=${saved ? `¥${(saved.amount / 100).toFixed(2)} / ${saved.merchant}` : '无'}，列表可见=${e2e.visibleInList}`
  )
} catch (e) {
  e2e = { ok: false, error: String(e.message ?? e) }
  console.log(`  ✗ 端到端识别失败：${e.message}`)
  try {
    await page.screenshot({ path: join(SHOT_DIR, '08-scan-error.png'), fullPage: true })
  } catch {
    /* ignore */
  }
}

await browser.close()

const md = `# 界面与端到端验证记录

- 时间：${new Date().toISOString()}
- 目标：${BASE}
- 浏览器：${executablePath}
- 视口：430×932（移动端）deviceScaleFactor=2

## 逐页结果

| 环节 | 结果 | 截图 |
|---|---|---|
${results.map((r) => `| ${r.name} | ${r.ok ? '✅ 通过' : '❌ ' + r.error} | ${r.ok ? '`logs/shots/' + r.name + '.png`' : '-'} |`).join('\n')}

## 首页检查

- 出现「本月结余」：${homeStats.hasBalance ? '是' : '否'}
- 出现「预算」：${homeStats.hasBudget ? '是' : '否'}
- 页面上 img 总数：${homeStats.imgCount}，其中 /bubu/ 贴图：${homeStats.stickerImgs}
- **破图数量：${homeStats.brokenImgs.length}**${homeStats.brokenImgs.length ? '（' + homeStats.brokenImgs.join(', ') + '）' : ''}

## 设置页检查

- 识别服务显示已配置：${settingsInfo.visionReady ? '是' : '否'}
- 版权声明可见：${settingsInfo.mentionsCopyright ? '是' : '否'}

## 贴图预览墙

- 图片数：${sheetInfo.total}，成功加载：${sheetInfo.loaded}，加载失败：${sheetInfo.broken}

## 端到端（上传小票 → 识别 → 入账）

${e2e?.ok
      ? `- 结果：✅ 通过
- 识别后金额输入框的值：\`${e2e.amountField}\`
- 结果页展示了「AI 读到的」还原按钮：${e2e.reviewMentionsAiAmount ? '是' : '否'}
- 结果页展示了把握度：${e2e.reviewMentionsConfidence ? '是' : '否'}
- 已真实落库：${e2e.savedTxn ? `\`¥${(e2e.savedTxn.amount / 100).toFixed(2)}\` / 商户「${e2e.savedTxn.merchant}」/ 分类 ${e2e.savedTxn.category} / 来源 ${e2e.savedTxn.source}` : '否'}
- 该笔在首页列表可见：${e2e.visibleInList ? '是' : '否'}
- 截图：\`logs/shots/08-scan-result.png\`（识别结果页）、\`logs/shots/09-after-save.png\`（入账后）`
      : `- 结果：❌ 失败
- 错误：${e2e?.error}`}

## console 报错

${consoleErrors.length === 0 ? '无 ✅' : consoleErrors.map((e) => '- ' + e).join('\n')}

## 未捕获异常

${pageErrors.length === 0 ? '无 ✅' : pageErrors.map((e) => '- ' + e).join('\n')}

## 失败请求

${failedRequests.length === 0 ? '无 ✅' : failedRequests.slice(0, 20).map((e) => '- ' + e).join('\n')}
`

writeFileSync(join(LOG_DIR, 'ui-verify.md'), md, 'utf8')

console.log(`\n════ 汇总 ════`)
console.log(`截图全部通过：${results.every((r) => r.ok) ? '是' : '否'}`)
console.log(`首页破图：${homeStats.brokenImgs.length}`)
console.log(`预览墙加载：${sheetInfo.loaded}/${sheetInfo.total}`)
console.log(`端到端：${e2e?.ok ? '✅ 通过，金额=' + e2e.amountField + '，落库=' + (e2e.savedTxn ? '是' : '否') + '，列表可见=' + e2e.visibleInList : '❌ ' + e2e?.error}`)
console.log(`console 报错：${consoleErrors.length}  未捕获异常：${pageErrors.length}  失败请求：${failedRequests.length}`)
console.log(`报告：${join(LOG_DIR, 'ui-verify.md')}`)
