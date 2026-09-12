/**
 * 识别接口的三层护栏。
 *
 * 背景：这个 App 部署在公网、且用的是站点所有者的 API Key。若不设限，
 * 任何人（含扫描器）都能拿它刷额度。所以：
 *   1. 单 IP 限流  —— 防止单个访客高频调用
 *   2. 全站每日额度熔断 —— 即使被分布式刷，总花费也有上限
 *   3. 一键开关 —— 出问题时改个环境变量即可关掉 AI，不影响记账功能
 *
 * 所有阈值都可用环境变量覆盖，默认值偏保守。
 */

const DAY_MS = 24 * 60 * 60 * 1000

/* ------------------------------ 配置 ------------------------------ */

export const guardConfig = {
  /** 关掉后识别接口直接返回 503，记账功能不受影响 */
  enabled: process.env.AI_ENABLED !== 'false',
  /**
   * 跳过限流（只跳过次数限制，仍然统计用量）。
   * 用途：本地跑识别精度评测要连打几十次，被自己的限流拦住没有意义。
   * 默认关闭 —— 公网部署绝对不要打开，否则护栏形同虚设。
   */
  bypassLimits: process.env.AI_BYPASS_LIMITS === 'true',
  /** 单个 IP 每分钟最多几次识别 */
  perIpPerMinute: Number(process.env.AI_RATE_PER_MIN || 6),
  /** 单个 IP 每天最多几次识别 */
  perIpPerDay: Number(process.env.AI_RATE_PER_DAY || 40),
  /** 全站每天最多几次识别（熔断阈值） */
  globalPerDay: Number(process.env.AI_GLOBAL_PER_DAY || 300),
  /** 全站每天最多消耗多少 token（按上游 usage 累加） */
  globalTokensPerDay: Number(process.env.AI_GLOBAL_TOKENS_PER_DAY || 1_200_000),
  /** 是否信任反向代理的 X-Forwarded-For（部署在 Render/Vercel 等后面必须开） */
  trustProxy: process.env.TRUST_PROXY !== 'false',
}

/* --------------------------- 计数器（内存） --------------------------- */

/**
 * 说明：用进程内存计数，多实例部署时每个实例各算一份。
 * 对本场景（单实例免费托管 + 三层兜底 + DeepSeek 侧还能设消费上限）够用；
 * 若要严格全局限额，把这里换成 Redis 即可。
 */
const ipBuckets = new Map() // ip -> { minute: {count, resetAt}, day: {count, resetAt} }
let globalDay = { count: 0, tokens: 0, resetAt: nextMidnight() }

function nextMidnight() {
  const d = new Date()
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

function rollDay() {
  if (Date.now() >= globalDay.resetAt) {
    globalDay = { count: 0, tokens: 0, resetAt: nextMidnight() }
  }
}

function bucketFor(ip) {
  const now = Date.now()
  let b = ipBuckets.get(ip)
  if (!b) {
    b = { minute: { count: 0, resetAt: now + 60_000 }, day: { count: 0, resetAt: nextMidnight() } }
    ipBuckets.set(ip, b)
  }
  if (now >= b.minute.resetAt) b.minute = { count: 0, resetAt: now + 60_000 }
  if (now >= b.day.resetAt) b.day = { count: 0, resetAt: nextMidnight() }
  return b
}

/** 定期清理过期桶，避免内存无限增长 */
export function startGuardSweeper() {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [ip, b] of ipBuckets) {
      if (now >= b.day.resetAt) ipBuckets.delete(ip)
    }
  }, 10 * 60 * 1000)
  timer.unref?.()
  return timer
}

/* ------------------------------ 判定 ------------------------------ */

export class GuardError extends Error {
  constructor(message, code, status, retryAfterSec = null) {
    super(message)
    this.code = code
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * 调用识别接口前先过闸。通过则占用一次配额。
 * @param {string} ip
 */
export function checkAndConsume(ip) {
  if (!guardConfig.enabled) {
    throw new GuardError('站点管理员已临时关闭 AI 识别功能，你仍然可以手动记账', 'AI_DISABLED', 503)
  }
  rollDay()

  const b = bucketFor(ip || 'unknown')

  // 豁免模式：仍然计数（便于观察用量），但不拦截。
  // 只有本地跑评测才会开，公网部署必须保持关闭。
  if (guardConfig.bypassLimits) {
    b.minute.count++
    b.day.count++
    globalDay.count++
    return
  }

  if (b.minute.count >= guardConfig.perIpPerMinute) {
    throw new GuardError(
      `识别太频繁啦，休息一下～ 每分钟最多 ${guardConfig.perIpPerMinute} 次`,
      'RATE_MINUTE',
      429,
      60
    )
  }
  if (b.day.count >= guardConfig.perIpPerDay) {
    throw new GuardError(
      `你今天已经识别 ${guardConfig.perIpPerDay} 次了，明天再来吧～`,
      'RATE_DAY',
      429,
      3600
    )
  }
  if (globalDay.count >= guardConfig.globalPerDay) {
    throw new GuardError(
      '今天全站的免费识别额度已经用完了，明天恢复～ 你仍然可以手动记账',
      'QUOTA_CALLS',
      429,
      3600
    )
  }
  if (globalDay.tokens >= guardConfig.globalTokensPerDay) {
    throw new GuardError(
      '今天全站的识别额度已经用完了，明天恢复～ 你仍然可以手动记账',
      'QUOTA_TOKENS',
      429,
      3600
    )
  }

  b.minute.count++
  b.day.count++
  globalDay.count++
}

/** 调用结束后回填真实 token 消耗，用于额度熔断 */
export function recordUsage(usage) {
  rollDay()
  const used = Number(usage?.total_tokens ?? 0)
  if (Number.isFinite(used) && used > 0) globalDay.tokens += used
}

/* ------------------------------ 状态 ------------------------------ */

export function guardStatus() {
  rollDay()
  return {
    enabled: guardConfig.enabled,
    bypassLimits: guardConfig.bypassLimits,
    limits: {
      perIpPerMinute: guardConfig.perIpPerMinute,
      perIpPerDay: guardConfig.perIpPerDay,
      globalPerDay: guardConfig.globalPerDay,
      globalTokensPerDay: guardConfig.globalTokensPerDay,
    },
    used: { callsToday: globalDay.count, tokensToday: globalDay.tokens },
    resetsAt: new Date(globalDay.resetAt).toISOString(),
    trackedIps: ipBuckets.size,
  }
}
