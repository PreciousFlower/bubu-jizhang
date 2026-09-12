/**
 * 验证 AI 护栏真的会拦人。
 * 连打 N 次识别接口，检查是否在第 N+1 次返回 429（限流生效）。
 *
 * 用法：node scripts/test-guard.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const API = process.argv[2] || process.env.GUARD_API || 'http://127.0.0.1:8787'

const img = readFileSync(join(ROOT, 'fixtures', 'bills', 'receipt-clear-noodle.jpg')).toString('base64')

const before = await (await fetch(`${API}/api/guard`)).json()
const perMin = before.guard?.limits?.perIpPerMinute ?? '?'
console.log(`接口 ${API}`)
console.log(`单 IP 每分钟上限：${perMin}`)
console.log(`发送前已用次数：${before.guard?.used?.callsToday}\n`)

const tries = Number(perMin) + 2
let blockedAt = null
for (let i = 1; i <= tries; i++) {
  const res = await fetch(`${API}/api/vision/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: ['data:image/jpeg;base64,' + img] }),
  })
  const body = await res.json().catch(() => ({}))
  const code = body?.error?.code ?? (body?.result ? `ok/¥${body.result.total}` : 'unknown')
  const retry = res.headers.get('retry-after')
  console.log(
    `  第 ${String(i).padStart(2)} 次 → HTTP ${res.status}  ${code}${retry ? `  Retry-After=${retry}s` : ''}`
  )
  if (res.status === 429 && !blockedAt) blockedAt = i
}

const after = await (await fetch(`${API}/api/guard`)).json()

console.log(`\n════ 结论 ════`)
if (blockedAt) {
  console.log(`✅ 护栏生效：第 ${blockedAt} 次开始被限流（上限 ${perMin}/分钟）`)
} else {
  console.log(`❌ 护栏未生效：连打 ${tries} 次都没被拦，需要检查 checkAndConsume 是否被调用`)
}
console.log(`全站今日调用计数：${before.guard?.used?.callsToday} → ${after.guard?.used?.callsToday}`)
console.log(`全站今日 token：${before.guard?.used?.tokensToday} → ${after.guard?.used?.tokensToday}`)
process.exit(blockedAt ? 0 : 1)
