/**
 * 视觉识别服务：图片归一化 → 调 deepseek-flash（base64 内联）→ 解析校验 → 金额对账。
 * 设计要点：
 *  - 绝不传外链 URL（实测上游拒绝外链下载），一律 base64 内联
 *  - 单张超时 + 指数退避重试，最终失败返回结构化错误而不是抛栈
 *  - 相同图片内容 + 相同 prompt 版本命中内存缓存，避免重复烧钱
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { LATEST, getPrompt } from './prompts.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

export const CATEGORY_KEYS = [
  'food', 'drink', 'transport', 'shopping', 'home', 'fun',
  'health', 'study', 'pet', 'trip', 'gift', 'salary', 'bonus', 'refund', 'other',
]

const MAX_EDGE = 1536
const JPEG_QUALITY = 82
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRY = 2
const CACHE_MAX = 60

/** @type {Map<string, object>} */
const cache = new Map()

export class VisionError extends Error {
  constructor(message, code = 'VISION_ERROR', status = 502, detail = null) {
    super(message)
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/** 把 dataUrl / 纯 base64 / Buffer 统一成 Buffer */
export function toBuffer(input) {  if (Buffer.isBuffer(input)) return input
  if (typeof input !== 'string' || !input.trim()) {
    throw new VisionError('图片数据为空', 'EMPTY_IMAGE', 400)
  }
  const s = input.trim()
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(s)
  const b64 = m ? m[2] : s
  try {
    return Buffer.from(b64, 'base64')
  } catch {
    throw new VisionError('图片 base64 解析失败', 'BAD_BASE64', 400)
  }
}

/** 压缩 + 转 JPEG，返回 { buf, mime, width, height, phash } */
export async function normalizeImage(input) {
  const raw = toBuffer(input)
  if (raw.length < 256) throw new VisionError('图片太小，可能不是有效图片', 'IMAGE_TOO_SMALL', 400)
  if (raw.length > 25 * 1024 * 1024) throw new VisionError('图片超过 25MB，请压缩后再传', 'IMAGE_TOO_LARGE', 413)
  try {
    const pipe = sharp(raw, { failOn: 'none' }).rotate()
    const meta = await pipe.metadata()
    const buf = await pipe
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer()
    const outMeta = await sharp(buf).metadata()
    const phash = createHash('sha1').update(buf).digest('hex').slice(0, 32)
    return {
      buf,
      mime: 'image/jpeg',
      width: outMeta.width ?? meta.width ?? 0,
      height: outMeta.height ?? meta.height ?? 0,
      sourceBytes: raw.length,
      bytes: buf.length,
      phash,
    }
  } catch (e) {
    if (e instanceof VisionError) throw e
    throw new VisionError('图片解码失败：' + (e instanceof Error ? e.message.split('\n')[0] : String(e)), 'DECODE_FAILED', 400)
  }
}

function extractJson(text) {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const candidate = s.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    // 容错：去掉尾随逗号再试一次
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
    }
  }
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 金额对账：items 求和与 total 比对，以 total 为权威值 */
export function reconcile(parsed) {
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === 'string' && w.trim()) : []
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((it) => ({
          name: String(it?.name ?? '').trim(),
          price: toNumberOrNull(it?.price) ?? 0,
          qty: toNumberOrNull(it?.qty) ?? 1,
        }))
        .filter((it) => it.name || it.price)
    : []

  let total = toNumberOrNull(parsed.total)
  const itemSum = items.reduce((s, it) => s + it.price, 0)

  if (total === null && itemSum > 0) {
    total = Number(itemSum.toFixed(2))
    warnings.push(`图中未读到合计金额，已按明细求和取 ${total.toFixed(2)} 元`)
  }
  if (total !== null && items.length > 0 && Math.abs(itemSum - total) > 0.01) {
    warnings.push(`明细合计 ${itemSum.toFixed(2)} 元与合计 ${total.toFixed(2)} 元不一致，已以合计为准`)
  }

  let cat = String(parsed.suggested_category ?? '').trim()
  if (!CATEGORY_KEYS.includes(cat)) {
    if (cat) warnings.push(`模型给出的分类「${cat}」不在分类表内，已归入其他`)
    cat = 'other'
  }

  let confidence = toNumberOrNull(parsed.confidence)
  if (confidence === null) confidence = total === null ? 0.1 : 0.5
  confidence = Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence))
  // 金额缺失时强制压低置信度，保证前端一定要求人工确认
  if (total === null) confidence = Math.min(confidence, 0.2)
  if (items.length > 1 && confidence > 0.95) confidence = 0.95

  const isBill = parsed.is_bill === true && total !== null && total > 0

  return {
    is_bill: isBill,
    doc_type: String(parsed.doc_type ?? 'other'),
    merchant: String(parsed.merchant ?? '').trim(),
    total,
    totalFen: total === null ? null : Math.round(total * 100),
    currency: String(parsed.currency ?? 'CNY').trim() || 'CNY',
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date ?? '')) ? String(parsed.date) : null,
    time: /^\d{2}:\d{2}$/.test(String(parsed.time ?? '')) ? String(parsed.time) : null,
    items,
    suggested_category: cat,
    confidence: Number(confidence.toFixed(2)),
    warnings,
    needs_review: !isBill || confidence < 0.6 || warnings.length > 0,
  }
}

function cacheKey(phashes, promptVersion, hint) {
  return createHash('sha1').update(phashes.join('|') + '#' + promptVersion + '#' + (hint ?? '')).digest('hex')
}

function getCfg() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new VisionError(
      '服务端未配置 DEEPSEEK_API_KEY，请在 .env.local 中填写后重启 API 服务',
      'NO_API_KEY',
      503
    )
  }
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash',
  }
}

async function callUpstream({ images, prompt, hint, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const cfg = getCfg()
  const userText = prompt.buildUserText({ hint })

  // 上游硬性要求：用 response_format=json_object 时，prompt 里必须出现 "json" 字样，
  // 否则直接 400。这里做一次自检，早点暴露问题而不是等到线上。
  const fullText = `${prompt.system}\n${userText}`
  if (!/json/i.test(fullText)) {
    throw new VisionError(
      `prompt ${prompt.version} 中缺少 "json" 字样，上游会拒绝 json_object 模式`,
      'PROMPT_MISSING_JSON_KEYWORD',
      500
    )
  }

  const content = [
    { type: 'text', text: userText },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.buf.toString('base64')}` },
    })),
  ]

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content },
    ],
    max_tokens: 1200,
    temperature: prompt.temperature ?? 0.1,
    response_format: { type: 'json_object' },
  }

  let lastErr = null
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const started = Date.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))

      const text = await res.text()
      if (!res.ok) {
        // 4xx 是我们自己的请求有问题，如实透传状态码，方便一眼看出原因
        const upstreamMsg = (() => {
          try {
            return JSON.parse(text)?.error?.message ?? text.slice(0, 200)
          } catch {
            return text.slice(0, 200)
          }
        })()
        const clientSide = res.status >= 400 && res.status < 500 && res.status !== 429
        lastErr = new VisionError(
          `上游返回 ${res.status}：${upstreamMsg}`,
          clientSide ? 'UPSTREAM_REJECTED' : 'UPSTREAM_HTTP',
          clientSide ? 502 : 503,
          text.slice(0, 400)
        )
        if (clientSide) break
      } else {
        let payload
        try {
          payload = JSON.parse(text)
        } catch {
          lastErr = new VisionError('上游返回非 JSON', 'UPSTREAM_BAD_JSON', 502, text.slice(0, 200))
          payload = null
        }
        if (payload) {
          const msg = payload.choices?.[0]?.message ?? {}
          const parsed = extractJson(msg.content)
          if (parsed) {
            return { parsed, raw: msg.content, usage: payload.usage ?? null, latencyMs: Date.now() - started, attempts: attempt + 1 }
          }
          lastErr = new VisionError('上游返回内容无法解析为 JSON', 'UNPARSEABLE', 502, String(msg.content ?? '').slice(0, 300))
        }
      }
    } catch (e) {
      const isAbort = e?.name === 'AbortError'
      lastErr = new VisionError(
        isAbort ? `识别超时（${timeoutMs}ms）` : '网络请求失败：' + (e instanceof Error ? e.message : String(e)),
        isAbort ? 'TIMEOUT' : 'NETWORK',
        504
      )
    }
    if (attempt < MAX_RETRY) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
  }
  throw lastErr ?? new VisionError('识别失败', 'UNKNOWN', 502)
}

/**
 * 主入口：识别 1~4 张图片（同一笔单据的多张补充图）。
 * @returns {Promise<object>}
 */
export async function recognize({ images, hint, promptVersion = LATEST.version, useCache = true }) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new VisionError('没有收到图片', 'NO_IMAGES', 400)
  }
  if (images.length > 4) {
    throw new VisionError('一次最多识别 4 张图片', 'TOO_MANY_IMAGES', 400)
  }
  const prompt = getPrompt(promptVersion)
  const normalized = []
  for (const img of images) {
    normalized.push(await normalizeImage(typeof img === 'string' ? img : img?.dataUrl ?? img?.base64 ?? img?.buffer))
  }

  const key = cacheKey(normalized.map((n) => n.phash), prompt.version, hint)
  if (useCache && cache.has(key)) {
    const hit = cache.get(key)
    return { ...hit, cached: true }
  }

  const started = Date.now()
  const { parsed, raw, usage, latencyMs, attempts } = await callUpstream({ images: normalized, prompt, hint })
  const result = {
    ok: true,
    promptVersion: prompt.version,
    ...reconcile(parsed),
    meta: {
      imageCount: normalized.length,
      imageBytes: normalized.map((n) => n.bytes),
      sourceBytes: normalized.map((n) => n.sourceBytes),
      latencyMs: Date.now() - started,
      upstreamLatencyMs: latencyMs,
      attempts,
      usage,
      raw: raw?.slice(0, 2000) ?? null,
    },
    cached: false,
  }

  if (useCache) {
    cache.set(key, result)
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  }
  return result
}

export function cacheStats() {
  return { size: cache.size, max: CACHE_MAX }
}
