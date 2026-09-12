/**
 * 几何量测：直接量导航栏与页面最后一个元素的包围盒，判断是否真的被遮挡。
 * 用于替代"看图猜"，给底部留白问题一个确定答案。
 */
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASE = process.env.VERIFY_URL || 'http://127.0.0.1:5273'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const PAGES = [
  ['home', '#/home'],
  ['add', '#/home?add=1'],
  ['scan', '#/scan'],
  ['stats', '#/stats'],
  ['settings', '#/settings'],
]

const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' })

const report = []
for (const [name, hash] of PAGES) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // 关键：滚到最底部再量。在顶部时量到的"被覆盖元素"只是固定导航的正常表现，
  // 真正要回答的问题是"滚到底之后还有没有内容看不见"，做不到就说明留白确实不够。
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(900)

  const m = await page.evaluate(() => {
    const nav = document.querySelector('nav')
    const navBox = nav ? nav.getBoundingClientRect() : null
    const navTop = navBox ? navBox.top : window.innerHeight
    const offenders = []
    for (const el of [...document.querySelectorAll('main *')]) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const hasText = el.children.length === 0 && (el.textContent || '').trim().length > 0
      const isImg = el.tagName === 'IMG'
      if (!hasText && !isImg) continue
      // 只统计确实被导航栏压住、且仍在视口内的元素
      if (r.bottom > navTop && r.top < window.innerHeight) {
        offenders.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 24),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
        })
      }
    }
    const main = document.querySelector('main')
    const lastChild = main?.lastElementChild
    const lastBox = lastChild ? lastChild.getBoundingClientRect() : null
    return {
      viewportH: window.innerHeight,
      docH: document.documentElement.scrollHeight,
      scrollY: Math.round(window.scrollY),
      atBottom: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 4,
      navTop: navBox ? Math.round(navBox.top) : null,
      navHeight: navBox ? Math.round(navBox.height) : null,
      mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
      lastContentBottom: lastBox ? Math.round(lastBox.bottom) : null,
      clearOfNav: lastBox ? Math.round(navTop - lastBox.bottom) : null,
      offenders: offenders.slice(0, 8),
      offenderCount: offenders.length,
    }
  })

  report.push({ name, hash, ...m })
  console.log(`\n═══ ${name} (${hash}) ═══`)
  console.log(
    `  视口 ${m.viewportH}  文档 ${m.docH}  scrollY=${m.scrollY}  到底=${m.atBottom ? '是' : '否'}`
  )
  console.log(`  导航栏 top=${m.navTop} 高=${m.navHeight}  main padding-bottom=${m.mainPaddingBottom}`)
  console.log(
    `  滚到底后最后一个内容块 bottom=${m.lastContentBottom}  距导航栏顶部还有 ${m.clearOfNav}px ${m.clearOfNav >= 0 ? '✅ 未被遮挡' : '❌ 被遮挡'}`
  )
  console.log(`  滚到底后仍被覆盖的元素数：${m.offenderCount}`)
  for (const o of m.offenders) {
    console.log(`    - <${o.tag}> "${o.text}"  top=${o.top} bottom=${o.bottom}`)
  }
  await page.close()
}

await browser.close()

let md = `# 底部遮挡几何量测

- 时间：${new Date().toISOString()}
- 判定口径：**先滚到页面最底部**再量，检查最后一个内容块与固定导航栏顶部的关系。
  在页面顶部量到的"内容被导航栏压住"只是固定导航的正常表现，不构成缺陷。

`
for (const r of report) {
  md += `## ${r.name}\n\n`
  md += `- 文档高 ${r.docH}，滚到底=${r.atBottom ? '是' : '否'}｜导航栏 top=${r.navTop}，高=${r.navHeight}｜main padding-bottom=${r.mainPaddingBottom}\n`
  md += `- 最后一个内容块 bottom=${r.lastContentBottom}，距导航栏顶部 **${r.clearOfNav}px** ${r.clearOfNav >= 0 ? '✅ 未被遮挡' : '❌ 被遮挡'}\n`
  md += `- 滚到底后仍被覆盖的元素数：**${r.offenderCount}**\n`
  for (const o of r.offenders) md += `  - \`<${o.tag}>\` "${o.text}" top=${o.top} bottom=${o.bottom}\n`
  md += '\n'
}
writeFileSync(join(ROOT, 'logs', 'layout-metrics.md'), md, 'utf8')
console.log(`\n报告：logs/layout-metrics.md`)
