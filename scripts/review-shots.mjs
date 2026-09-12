/**
 * 让视觉模型审阅界面截图，检查"可爱风"实际渲染效果、贴图是否正确显示、有没有明显破版。
 * 这是无人眼可用时的替代验收手段。
 *
 * 用法：node scripts/review-shots.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
loadEnv({ path: join(ROOT, '.env.local'), override: true, quiet: true })

const require = createRequire(import.meta.url)
const sharp = require('sharp')

/**
 * 截图是 deviceScaleFactor=2 的整页 PNG，单张可达 500KB。
 * 直接把 base64 塞进请求体会超过上游限制导致 body 被截断（报 missing field `role`），
 * 所以先压到长边 640 的 JPEG。
 */
async function toCompactJpeg(path) {
  return sharp(readFileSync(path))
    .resize({ width: 640, height: 1400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer()
}

const SHOT_DIR = join(ROOT, 'logs', 'shots')
const API_KEY = process.env.DEEPSEEK_API_KEY
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
const MODEL = process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash'

const SHOTS = [
  ['01-home.png', '首页（小账本）'],
  ['02-add.png', '记一笔弹层'],
  ['03-scan.png', '拍照记账页'],
  ['04-stats.png', '统计页'],
  ['05-settings.png', '设置页'],
  ['08-scan-result.png', 'AI 识别结果确认页'],
  ['09-after-save.png', '记账成功后回到首页'],
]

const QUESTION = `这是一张手机记账 App 的界面截图。请如实、挑剔地评审，只输出 json：
{
  "what_i_see": "你实际看到的界面内容，两三句中文，要具体到能看出你确实看了图",
  "has_cartoon_illustration": true|false,  // 有没有看到卡通插画/贴图（而不是只有 emoji 或色块）
  "illustration_quality": 0-10,            // 插画是否清晰、无白底方块、无文字水印、边缘干净
  "cute_style_score": 0-10,                // 整体可爱风达成度：奶油色系、圆角、软萌感
  "layout_issues": ["明显的排版问题，比如元素重叠、文字溢出、大片空白、错位；没有就空数组"],
  "readability": 0-10,                     // 文字可读性与层级
  "broken_visuals": ["任何看起来像加载失败、破图、缺图的地方；没有就空数组"],
  "top_suggestion": "最值得改的一点，一句话"
}`

const results = []

for (const [file, label] of SHOTS) {
  const path = join(SHOT_DIR, file)
  if (!existsSync(path)) {
    console.log(`  - 跳过（不存在） ${file}`)
    continue
  }
  const buf = await toCompactJpeg(path)
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是严格的 UI 评审员，只输出简洁的 json，不要长篇大论，每个字符串字段控制在 60 字以内。' },
          {
            role: 'user',
            content: [
              { type: 'text', text: QUESTION },
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + buf.toString('base64') } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(150_000),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 150)}`)
    const payload = JSON.parse(text)
    const choice = payload.choices?.[0]
    const content = choice?.message?.content ?? ''
    const s = content.indexOf('{')
    const e = content.lastIndexOf('}')
    if (s < 0 || e <= s) {
      throw new Error(
        `返回内容里没有 JSON（finish_reason=${choice?.finish_reason}，content 长度=${content.length}）：${content.slice(0, 120)}`
      )
    }
    const v = JSON.parse(content.slice(s, e + 1))
    results.push({ file, label, v })
    console.log(`\n═══ ${label}（${file}）═══`)
    console.log(`  看到：${v.what_i_see}`)
    console.log(`  有卡通贴图：${v.has_cartoon_illustration ? '是' : '否'}   贴图质量：${v.illustration_quality}/10`)
    console.log(`  可爱风：${v.cute_style_score}/10   可读性：${v.readability}/10`)
    console.log(`  排版问题：${v.layout_issues?.length ? v.layout_issues.join(' / ') : '无'}`)
    console.log(`  疑似破图：${v.broken_visuals?.length ? v.broken_visuals.join(' / ') : '无'}`)
    console.log(`  建议：${v.top_suggestion}`)
  } catch (err) {
    console.log(`  ✗ ${file} 评审失败：${err.message}`)
    results.push({ file, label, error: err.message })
  }
}

mkdirSync(SHOT_DIR, { recursive: true })
let md = `# 界面截图视觉评审\n\n- 时间：${new Date().toISOString()}\n- 评审模型：${MODEL}\n- 说明：由视觉模型对真实浏览器截图做评审，作为无人眼可用时的替代验收\n\n`
for (const r of results) {
  md += `## ${r.label}（\`${r.file}\`）\n\n`
  if (r.error) {
    md += `评审失败：${r.error}\n\n`
    continue
  }
  const v = r.v
  md += `- **看到**：${v.what_i_see}\n`
  md += `- 有卡通贴图：${v.has_cartoon_illustration ? '是' : '否'}｜贴图质量：${v.illustration_quality}/10\n`
  md += `- 可爱风达成度：${v.cute_style_score}/10｜可读性：${v.readability}/10\n`
  md += `- 排版问题：${v.layout_issues?.length ? v.layout_issues.join('；') : '无'}\n`
  md += `- 疑似破图：${v.broken_visuals?.length ? v.broken_visuals.join('；') : '无'}\n`
  md += `- 最值得改的一点：${v.top_suggestion}\n\n`
}
writeFileSync(join(ROOT, 'logs', 'ui-visual-review.md'), md, 'utf8')

const ok = results.filter((r) => !r.error)
const avg = (f) => (ok.length ? (ok.reduce((s, r) => s + (f(r.v) || 0), 0) / ok.length).toFixed(1) : '-')
console.log(`\n════ 汇总（${ok.length} 张）════`)
console.log(`平均贴图质量：${avg((v) => v.illustration_quality)}/10`)
console.log(`平均可爱风：${avg((v) => v.cute_style_score)}/10`)
console.log(`平均可读性：${avg((v) => v.readability)}/10`)
console.log(`报告：logs/ui-visual-review.md`)
