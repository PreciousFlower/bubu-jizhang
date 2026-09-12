/** 金额、日期的展示与解析工具。内部一律用「分」计算，避免浮点误差。 */

export function fenToYuan(fen: number): string {
  const neg = fen < 0
  const abs = Math.abs(Math.round(fen))
  const s = (abs / 100).toFixed(2)
  return (neg ? '-' : '') + s
}

/** 带千分位，用于大额展示 */
export function fenToYuanGrouped(fen: number): string {
  const s = fenToYuan(fen)
  const [int, dec] = s.replace('-', '').split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (fen < 0 ? '-' : '') + grouped + (dec ? '.' + dec : '')
}

/** 用户输入的元字符串 → 分。非法返回 null */
export function yuanToFen(input: string): number | null {
  if (input === null || input === undefined) return null
  const cleaned = String(input).replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function toDatetimeLocal(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  const today = todayIso()
  const day = toDateStr(d)
  if (day === today) return '今天'
  const y = new Date(Date.now() - 86_400_000)
  if (day === toDateStr(y)) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function toDateStr(d: Date): string {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function currentMonth(): string {
  return todayIso().slice(0, 7)
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 把一组记录按日期分组，用于列表展示 */
export function groupByDay<T extends { occurredAt: string }>(rows: T[]): { day: string; items: T[]; fen: number }[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const day = toDateStr(new Date(r.occurredAt))
    const arr = map.get(day) ?? []
    arr.push(r)
    map.set(day, arr)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({
      day,
      items,
      fen: items.reduce((s, i) => s + ((i as unknown as { amount: number }).amount ?? 0), 0),
    }))
}

export const MOODS = ['🥰', '😌', '🫠', '😭', '🤩', '😐'] as const

export const DOC_TYPE_LABEL: Record<string, string> = {
  paper_receipt: '纸质小票',
  payment_screenshot: '支付截图',
  order_page: '订单页面',
  menu: '菜单',
  price_tag: '价签',
  other: '其他',
}
