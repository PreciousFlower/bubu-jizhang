import { useEffect, useMemo, useState } from 'react'
import { useApp, useToast, burstConfetti } from '../components/AppShell'
import { Sticker } from '../lib/assets'
import { api, ApiError, type Stats, type Txn } from '../lib/api'
import { formatDateLabel, formatTime, fenToYuan, fenToYuanGrouped, groupByDay, monthLabel, currentMonth } from '../lib/format'

export function HomePage({
  onOpenAdd,
  onOpenScan,
  onEdit,
}: {
  onOpenAdd: () => void
  onOpenScan: () => void
  onEdit: (id: string) => void
}) {
  const { manifest, categoryOf, settings } = useApp()
  const toast = useToast()
  const [txns, setTxns] = useState<Txn[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuId, setMenuId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [t, s] = await Promise.all([api.listTxns({ limit: 100 }), api.stats(currentMonth())])
      setTxns(t)
      setStats(s)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '加载失败', '😵')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todayFen = useMemo(() => {
    const today = new Date().toDateString()
    return txns.filter((t) => new Date(t.occurredAt).toDateString() === today && t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  }, [txns])

  const grouped = useMemo(() => groupByDay(txns.slice(0, 40)), [txns])

  const remove = async (id: string) => {
    try {
      await api.deleteTxn(id)
      setTxns((list) => list.filter((t) => t.id !== id))
      setMenuId(null)
      toast('删掉啦', '🗑️')
      const s = await api.stats(currentMonth())
      setStats(s)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '删除失败', '😵')
    }
  }

  const budgetRatio = stats?.budgetUsedRatio ?? 0
  const budgetPct = Math.min(100, Math.round(budgetRatio * 100))
  const over = budgetRatio > 1

  return (
    <div className="px-4 pt-5">
      {/* 顶部问候 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sticker
            manifest={manifest}
            assetKey="hero"
            seed="hero-home"
            emoji="🐼"
            className="h-16 w-16 animate-floaty"
            imgClassName="h-16 w-16"
          />
          <div>
            <p className="text-xs text-ink-500">{monthLabel(currentMonth())}</p>
            <h1 className="text-lg font-bold">今天也要好好攒钱呀</h1>
          </div>
        </div>
        <button onClick={onOpenScan} className="chip bg-white px-3 py-2 text-ink-700 shadow-sticker">
          📷 拍照
        </button>
      </div>

      {/* 主卡片：本月余额 + 预算环 */}
      <div className="sticker-card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-6 -top-8 text-7xl opacity-10">💖</div>
        <p className="text-xs font-bold text-ink-500">本月结余</p>
        <p className="mt-1 text-[34px] font-bold leading-none tracking-tight">
          <span className="mr-1 text-xl text-peach-500">¥</span>
          {fenToYuanGrouped(stats?.balanceFen ?? 0)}
        </p>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-ink-500">
              <span>预算已用 {budgetPct}%</span>
              <span>
                ¥{fenToYuan(stats?.expenseFen ?? 0)} / ¥{fenToYuan(stats?.budgetFen ?? settings?.monthlyBudget ?? 0)}
              </span>
            </div>
            <div className="mt-1.5 h-3.5 w-full overflow-hidden rounded-pill bg-cream-300">
              <div
                className={`h-full min-w-[14px] rounded-pill transition-all duration-500 ${over ? 'bg-peach-600' : 'bg-peach-400'}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-bold text-ink-500">
              {over ? '😵 这个月超支啦，下个月省着点' : `还能花 ¥${fenToYuan(Math.max(0, (stats?.budgetFen ?? 0) - (stats?.expenseFen ?? 0)))}`}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t-2 border-dashed border-ink-100 pt-3 text-center">
          <div>
            <p className="text-[11px] text-ink-500">今日支出</p>
            <p className="font-bold text-peach-600">{fenToYuan(todayFen)}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-500">本月支出</p>
            <p className="font-bold">{fenToYuan(stats?.expenseFen ?? 0)}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-500">本月收入</p>
            <p className="font-bold text-ink-700">{fenToYuan(stats?.incomeFen ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* 快捷记账 */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { key: 'food', label: '吃饭' },
          { key: 'drink', label: '奶茶' },
          { key: 'transport', label: '交通' },
          { key: 'shopping', label: '购物' },
        ].map((q) => {
          const c = categoryOf(q.key)
          return (
            <button
              key={q.key}
              onClick={onOpenAdd}
              className="group flex flex-col items-center gap-1 rounded-[22px] bg-white/90 py-2 shadow-sticker transition active:scale-95"
            >
              <Sticker
                manifest={manifest}
                assetKey={c?.assetKey ?? q.key}
                seed={q.key}
                emoji={c?.emoji ?? '✨'}
                className="h-11 w-11"
                imgClassName="h-11 w-11 transition-transform group-hover:scale-110"
              />
              <span className="text-[11px] font-bold text-ink-700">{q.label}</span>
            </button>
          )
        })}
      </div>

      {/* 明细列表 */}
      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-700">最近的小账本</h2>
        <span className="text-xs text-ink-300">共 {txns.length} 笔</span>
      </div>

      {loading ? (
        <div className="card mt-2 animate-pulse text-center text-sm text-ink-300">加载中…</div>
      ) : txns.length === 0 ? (
        <div className="card mt-2 text-center">
          <Sticker
            manifest={manifest}
            assetKey="sad"
            seed="empty"
            emoji="🥺"
            className="mx-auto h-28 w-28 animate-floaty"
            imgClassName="h-28 w-28"
          />
          <p className="mt-2 font-bold">还没有记过账哦</p>
          <p className="mt-1 text-xs text-ink-500">点下面的 ＋ 记一笔，或者直接拍张小票给我看</p>
          <button onClick={onOpenScan} className="btn-soft mt-3 text-sm">
            📷 拍照记第一笔
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {grouped.map((g) => (
            <div key={g.day}>
              <div className="mb-1 flex items-center justify-between px-1 text-xs text-ink-500">
                <span className="font-bold">{formatDateLabel(g.items[0].occurredAt)}</span>
                <span>支出 ¥{fenToYuan(g.items.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.amount, 0))}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((t) => {
                  const c = categoryOf(t.category)
                  return (
                    <div key={t.id} className="relative">
                      <button
                        onClick={() => setMenuId(menuId === t.id ? null : t.id)}
                        className="flex w-full items-center gap-3 rounded-[22px] bg-white/95 p-3 text-left shadow-sticker transition active:scale-[0.99]"
                      >
                        <Sticker
                          manifest={manifest}
                          assetKey={c?.assetKey ?? 'other'}
                          seed={t.id}
                          emoji={c?.emoji ?? '✨'}
                          className="h-11 w-11 shrink-0 rounded-[14px] bg-cream-100 p-0.5"
                          imgClassName="h-10 w-10 rounded-[12px]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 truncate font-bold">
                            {t.merchant || c?.label || '未命名'}
                            {t.source === 'photo' && (
                              <span className="chip shrink-0 bg-cream-200 text-[10px] text-ink-500">📷 AI</span>
                            )}
                            {t.mood && <span>{t.mood}</span>}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            {c?.label}
                            {t.note ? ` · ${t.note}` : ''} · {formatTime(t.occurredAt)}
                          </p>
                        </div>
                        <span className={`shrink-0 font-bold ${t.kind === 'income' ? 'text-ink-700' : 'text-peach-600'}`}>
                          {t.kind === 'income' ? '+' : '-'}
                          {fenToYuan(t.amount)}
                        </span>
                      </button>

                      {menuId === t.id && (
                        <div className="mt-1 flex gap-2 rounded-[20px] bg-cream-200/90 p-2 text-xs font-bold">
                          <button
                            onClick={() => {
                              setMenuId(null)
                              onEdit(t.id)
                            }}
                            className="flex-1 rounded-pill bg-white py-2 text-ink-700"
                          >
                            ✏️ 改一改
                          </button>
                          <button onClick={() => remove(t.id)} className="flex-1 rounded-pill bg-white py-2 text-peach-600">
                            🗑️ 删掉
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            onClick={(e) => {
              burstConfetti(e.clientX, e.clientY)
              toast('布布给你比个心', '💗')
            }}
            className="w-full rounded-[22px] bg-white/60 py-3 text-xs font-bold text-ink-300"
          >
            —— 到底啦，戳我一下 ——
          </button>
        </div>
      )}
    </div>
  )
}
