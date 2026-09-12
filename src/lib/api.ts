/** 前端 API 客户端：所有请求经 Vite 代理打到 /api，密钥永远留在服务端 */

export interface Txn {
  id: string
  kind: 'expense' | 'income'
  amount: number // 分
  category: string
  note: string
  merchant: string
  occurredAt: string
  account: string
  mood: string
  source: 'manual' | 'photo'
  imageRef: string | null
  confidence: number | null
  createdAt: string
}

export interface Category {
  key: string
  label: string
  emoji: string
  assetKey: string
  kind: 'expense' | 'income'
  sort: number
}

export interface Settings {
  monthlyBudget: number
  currency: string
  diyCategories: Category[]
}

export interface Stats {
  month: string
  expenseFen: number
  incomeFen: number
  balanceFen: number
  budgetFen: number
  budgetUsedRatio: number
  categories: { category: string; fen: number; count: number }[]
  days: { date: string; fen: number }[]
  txnCount: number
}

export interface VisionItem {
  name: string
  price: number
  qty: number
}

export interface VisionResult {
  ok: boolean
  promptVersion: string
  is_bill: boolean
  doc_type: string
  merchant: string
  total: number | null
  totalFen: number | null
  currency: string
  date: string | null
  time: string | null
  items: VisionItem[]
  suggested_category: string
  confidence: number
  warnings: string[]
  needs_review: boolean
  meta: {
    imageCount: number
    imageBytes: number[]
    sourceBytes: number[]
    latencyMs: number
    upstreamLatencyMs: number
    attempts: number
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
    raw: string | null
  }
  cached: boolean
}

export interface Health {
  ok: boolean
  driver: 'sqlite' | 'json'
  fallbackReason: string | null
  dataDir: string
  /** 数据目录是否可写。false 表示账本可能在重启后丢失，必须显式告知用户 */
  dataDirWritable?: boolean
  dataDirProblem?: string | null
  txns: number
  visionModel: string
  visionReady: boolean
  aiEnabled?: boolean
  /** 护栏额度（公网部署时前端会展示剩余次数） */
  quota?: {
    callsToday: number
    globalPerDay: number
    perIpPerDay: number
    resetsAt: string
  }
  promptVersions: string[]
  activePrompt: string
}

export class ApiError extends Error {
  code: string
  status: number
  detail: unknown
  constructor(message: string, code: string, status: number, detail: unknown = null) {
    super(message)
    this.code = code
    this.status = status
    this.detail = detail
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('连不上后端服务，请确认 npm run dev 里的 api 进程还活着', 'NETWORK', 0)
  }
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError('服务端返回了非 JSON 内容', 'BAD_RESPONSE', res.status, text.slice(0, 200))
  }
  if (!res.ok || body?.ok === false) {
    const e = body?.error ?? {}
    throw new ApiError(e.message ?? `请求失败（${res.status}）`, e.code ?? 'HTTP_' + res.status, res.status, e.detail)
  }
  return body as T
}

export const api = {
  health: () => req<Health>('/api/health'),

  categories: () => req<{ categories: Category[] }>('/api/categories').then((r) => r.categories),

  listTxns: (params: { from?: string; to?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    if (params.limit) q.set('limit', String(params.limit))
    return req<{ txns: Txn[] }>(`/api/txns?${q}`).then((r) => r.txns)
  },

  createTxn: (payload: Partial<Txn> & { amount: number; category: string }) =>
    req<{ txn: Txn }>('/api/txns', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.txn),

  updateTxn: (id: string, patch: Partial<Txn>) =>
    req<{ txn: Txn }>(`/api/txns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.txn),

  deleteTxn: (id: string) => req<{ deleted: string }>(`/api/txns/${id}`, { method: 'DELETE' }),

  stats: (month?: string) => req<Stats>(`/api/stats${month ? `?month=${month}` : ''}`),

  settings: () => req<{ settings: Settings }>('/api/settings').then((r) => r.settings),

  saveSettings: (patch: Partial<Settings>) =>
    req<{ settings: Settings }>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }).then((r) => r.settings),

  recognize: (images: string[], opts: { hint?: string; promptVersion?: string } = {}) =>
    req<{ result: VisionResult }>('/api/vision/recognize', {
      method: 'POST',
      body: JSON.stringify({ images, ...opts }),
    }).then((r) => r.result),

  upload: (dataUrl: string) =>
    req<{ imageRef: string }>('/api/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) }),
}

/* ------------------------------ 客户端图片处理 ------------------------------ */

/** 把 File 读成 dataUrl，并在浏览器侧先压缩，减少上传体积 */
export async function fileToCompressedDataUrl(file: File, maxEdge = 1600, quality = 0.85): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('图片读取失败'))
    fr.readAsDataURL(file)
  })
  if (!/^data:image\//.test(raw)) throw new Error('请上传图片文件')

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('图片解码失败'))
    el.src = raw
  })

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  if (scale >= 1 && raw.length < 900_000) return raw

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return raw
  ctx.fillStyle = '#FFF9F2'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
