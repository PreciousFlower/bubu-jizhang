import { useEffect, useState } from 'react'
import { useApp, useToast, burstConfetti } from '../components/AppShell'
import { Sticker } from '../lib/assets'
import { api, ApiError, type Txn } from '../lib/api'
import { MOODS, fenToYuan, groupByDay, toDatetimeLocal, yuanToFen } from '../lib/format'

/** 记一笔：底部弹出的可爱弹层，支持新增与编辑 */
export function AddPage({
  txnId,
  onClose,
  onSaved,
}: {
  txnId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { manifest, categories } = useApp()
  const toast = useToast()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal())
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState<Txn[]>([])

  // 编辑模式：把原记录读进来
  useEffect(() => {
    if (!txnId) return
    ;(async () => {
      try {
        const list = await api.listTxns({ limit: 500 })
        const t = list.find((x) => x.id === txnId)
        if (!t) return
        setKind(t.kind)
        setAmount(fenToYuan(t.amount))
        setCategory(t.category)
        setMerchant(t.merchant)
        setNote(t.note)
        setMood(t.mood)
        setOccurredAt(toDatetimeLocal(t.occurredAt))
      } catch {
        /* ignore */
      }
    })()
  }, [txnId])

  // 常用金额（从最近记录里取出现过的金额，最多 4 个）
  useEffect(() => {
    if (txnId) return
    api
      .listTxns({ limit: 40 })
      .then((list) => {
        const seen = new Set<number>()
        const picks: Txn[] = []
        for (const t of list) {
          if (t.kind !== 'expense' || seen.has(t.amount)) continue
          seen.add(t.amount)
          picks.push(t)
          if (picks.length >= 4) break
        }
        setRecent(picks)
      })
      .catch(() => {})
  }, [txnId])

  const catList = categories.filter((c) => c.kind === kind)
  const fen = yuanToFen(amount)
  const canSave = fen !== null && fen > 0

  const save = async (ev: React.MouseEvent) => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        kind,
        amount: fen!,
        category,
        merchant,
        note,
        mood,
        occurredAt: new Date(occurredAt).toISOString(),
      }
      if (txnId) {
        await api.updateTxn(txnId, payload)
        toast('改好啦', '✏️')
      } else {
        await api.createTxn({ ...payload, source: 'manual' })
        burstConfetti(ev.clientX, ev.clientY)
        toast(`记好啦，${fenToYuan(fen!)} 元`, '💖')
      }
      onSaved()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '保存失败', '😵')
    } finally {
      setSaving(false)
    }
  }

  // 键盘：Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const recentGroups = groupByDay(recent).slice(0, 1)

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/25 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-slideUp safe-bottom max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-t-[32px] bg-cream-100 p-4 pb-10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-pill bg-ink-200" />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sticker
              manifest={manifest}
              assetKey={kind === 'expense' ? 'cook' : 'salary'}
              seed={`add-${kind}`}
              emoji={kind === 'expense' ? '🍚' : '💰'}
              className="h-12 w-12"
              imgClassName="h-12 w-12"
            />
            <h2 className="text-lg font-bold">{txnId ? '改一改这笔' : '记一笔'}</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink-500 shadow-sticker">
            ✕
          </button>
        </div>

        {/* 收支切换 */}
        <div className="mb-3 flex rounded-pill bg-white p-1 shadow-sticker">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k)
                setCategory(k === 'expense' ? 'food' : 'salary')
              }}
              className={`flex-1 rounded-pill py-2 text-sm font-bold transition ${
                kind === k ? 'bg-peach-400 text-white shadow-pop' : 'text-ink-500'
              }`}
            >
              {k === 'expense' ? '💸 花出去' : '🤑 收进来'}
            </button>
          ))}
        </div>

        {/* 金额 */}
        <div className="card">
          <div className="flex items-end gap-2">
            <span className="pb-2 text-2xl font-bold text-peach-500">¥</span>
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) save(e as unknown as React.MouseEvent)
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full border-b-2 border-dashed border-ink-100 bg-transparent pb-1 text-4xl font-bold outline-none focus:border-peach-300"
            />
          </div>
          {recentGroups[0] && !txnId && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-[11px] text-ink-300">最近用过：</span>
              {recent.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAmount(fenToYuan(t.amount))}
                  className="chip bg-cream-200 text-ink-500"
                >
                  ¥{fenToYuan(t.amount)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分类 */}
        <p className="mb-2 mt-4 text-xs font-bold text-ink-500">选个分类</p>
        <div className="grid grid-cols-4 gap-2">
          {catList.map((c) => {
            const on = category === c.key
            return (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`flex flex-col items-center gap-1 rounded-[20px] py-2 transition active:scale-95 ${
                  on ? 'bg-peach-400 text-white shadow-pop' : 'bg-white text-ink-700 shadow-sticker'
                }`}
              >
                <Sticker
                  manifest={manifest}
                  assetKey={c.assetKey}
                  seed={c.key}
                  emoji={c.emoji}
                  className={`h-10 w-10 rounded-[12px] ${on ? 'bg-white/25' : 'bg-cream-100'}`}
                  imgClassName="h-9 w-9 rounded-[10px]"
                />
                <span className="text-[11px] font-bold">{c.label}</span>
              </button>
            )
          })}
        </div>

        {/* 心情 */}
        <p className="mb-2 mt-4 text-xs font-bold text-ink-500">这笔的心情</p>
        <div className="flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              onClick={() => setMood(mood === m ? '' : m)}
              className={`grid h-11 flex-1 place-items-center rounded-[18px] text-xl transition active:scale-95 ${
                mood === m ? 'bg-peach-200 shadow-pop' : 'bg-white shadow-sticker'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* 其他字段 */}
        <div className="card mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-ink-500">商户 / 对象</label>
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="比如：楼下便利店" className="field mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-ink-500">备注</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="买了点啥" className="field mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-ink-500">时间</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="field mt-1 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            先不记
          </button>
          <button onClick={save} disabled={!canSave || saving} className="btn-primary flex-[2]">
            {saving ? '正在记…' : txnId ? '保存修改' : `记下来 ${canSave ? `¥${fenToYuan(fen!)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
