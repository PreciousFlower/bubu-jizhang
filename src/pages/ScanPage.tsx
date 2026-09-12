import { useCallback, useMemo, useRef, useState } from 'react'
import { useApp, useToast, burstConfetti } from '../components/AppShell'
import { Sticker } from '../lib/assets'
import { api, fileToCompressedDataUrl, ApiError, type VisionResult } from '../lib/api'
import { DOC_TYPE_LABEL, fenToYuan, toDatetimeLocal, yuanToFen } from '../lib/format'

type Stage = 'pick' | 'recognizing' | 'review'

interface Shot {
  id: string
  dataUrl: string
  name: string
  bytes: number
}

const MAX_SHOTS = 4

export function ScanPage({ onSaved }: { onSaved: () => void }) {
  const { manifest, categories } = useApp()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [stage, setStage] = useState<Stage>('pick')
  const [result, setResult] = useState<VisionResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState('')
  const [draft, setDraft] = useState({ amount: '', category: 'other', merchant: '', note: '', occurredAt: toDatetimeLocal() })
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).slice(0, MAX_SHOTS - shots.length)
      if (!arr.length) return
      setErr(null)
      const next: Shot[] = []
      for (const f of arr) {
        try {
          const dataUrl = await fileToCompressedDataUrl(f)
          next.push({
            id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            dataUrl,
            name: f.name || '粘贴的图片',
            bytes: Math.round((dataUrl.length * 3) / 4),
          })
        } catch (e) {
          setErr(e instanceof Error ? e.message : '图片读取失败')
        }
      }
      setShots((s) => [...s, ...next].slice(0, MAX_SHOTS))
    },
    [shots.length]
  )

  // 支持直接 Ctrl+V 粘贴截图
  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const files = items.filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as File[]
      if (files.length) {
        e.preventDefault()
        await addFiles(files)
        toast('截图收到啦', '📋')
      }
    },
    [addFiles, toast]
  )

  const totalBytes = useMemo(() => shots.reduce((s, x) => s + x.bytes, 0), [shots])

  const recognize = async () => {
    if (!shots.length) return
    setStage('recognizing')
    setErr(null)
    setProgress(8)
    const timer = setInterval(() => setProgress((p) => Math.min(92, p + Math.random() * 9)), 420)
    try {
      const r = await api.recognize(
        shots.map((s) => s.dataUrl),
        { hint: hint.trim() || undefined }
      )
      setResult(r)
      setDraft({
        amount: r.totalFen !== null ? fenToYuan(r.totalFen) : '',
        category: r.suggested_category,
        merchant: r.merchant,
        note: r.items.length ? r.items.map((i) => i.name).filter(Boolean).slice(0, 3).join('、') : '',
        occurredAt: r.date ? `${r.date}T${r.time ?? '12:00'}` : toDatetimeLocal(),
      })
      setProgress(100)
      setStage('review')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : '识别失败'
      setErr(msg)
      toast('识别没成功，再试一次吧', '🥺')
      setStage('pick')
    } finally {
      clearInterval(timer)
    }
  }

  const amountFen = yuanToFen(draft.amount)
  const canSave = amountFen !== null && amountFen > 0
  const confidence = result?.confidence ?? 0
  const needReview = result?.needs_review ?? true

  const save = async (ev: React.MouseEvent) => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      let imageRef: string | null = null
      if (shots[0]) {
        try {
          const up = await api.upload(shots[0].dataUrl)
          imageRef = up.imageRef
        } catch {
          /* 原图存不下不影响记账 */
        }
      }
      await api.createTxn({
        kind: 'expense',
        amount: amountFen!,
        category: draft.category,
        merchant: draft.merchant,
        note: draft.note,
        occurredAt: new Date(draft.occurredAt).toISOString(),
        source: 'photo',
        confidence,
        imageRef,
      })
      burstConfetti(ev.clientX, ev.clientY)
      toast(`记好啦，${fenToYuan(amountFen!)} 元`, '💖')
      onSaved()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '保存失败', '😵')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setShots([])
    setResult(null)
    setErr(null)
    setStage('pick')
    setProgress(0)
  }

  /* ------------------------------ 识别中 ------------------------------ */
  if (stage === 'recognizing') {
    return (
      <div className="px-4 pt-5">
        <div className="card text-center">
          <div className="relative mx-auto h-28 w-28">
            <Sticker
              manifest={manifest}
              assetKey="money"
              seed="scan"
              emoji="🔍"
              className="h-28 w-28 animate-floaty"
              imgClassName="h-28 w-28"
            />
          </div>
          <h2 className="mt-3 text-lg font-bold">布布在读小票…</h2>
          <p className="mt-1 text-xs text-ink-500">
            {shots.length} 张图片 · 正在让 AI 找出实际花了多少钱
          </p>

          <div className="mt-4 h-4 w-full overflow-hidden rounded-pill bg-cream-300">
            <div
              className="h-full rounded-pill bg-peach-400 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-300">通常 2~6 秒，别关页面哦</p>

          <div className="mt-4 flex justify-center gap-2">
            {shots.map((s) => (
              <img key={s.id} src={s.dataUrl} alt="正在识别" className="h-16 w-16 rounded-[14px] object-cover opacity-80" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------ 结果确认 ------------------------------ */
  if (stage === 'review' && result) {
    return (
      <div className="px-4 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">看看对不对～</h1>
          <button onClick={reset} className="chip bg-cream-300 text-ink-700">
            ↺ 重新上传
          </button>
        </div>

        {/* 置信度提示 */}
        <div
          className={`mb-3 rounded-[22px] p-3 text-sm font-bold ${
            needReview ? 'bg-apricot/60 text-ink-700' : 'bg-mint/50 text-ink-700'
          }`}
        >
          <div className="flex items-start gap-2">
            <Sticker
              manifest={manifest}
              assetKey={needReview ? 'sad' : 'happy'}
              seed="conf"
              emoji={needReview ? '🥺' : '🥰'}
              className="h-12 w-12 shrink-0"
              imgClassName="h-12 w-12"
            />
            <div className="flex-1">
              <p>
                {!result.is_bill
                  ? '这张图我没看出消费金额，帮我手动填一下嘛'
                  : needReview
                    ? '我不敢打包票，帮我核对一下金额哦'
                    : '看得很清楚，应该没跑～'}
              </p>
              <p className="mt-1 text-xs font-normal text-ink-500">
                识别方式：{DOC_TYPE_LABEL[result.doc_type] ?? result.doc_type} · 把握度{' '}
                {(confidence * 100).toFixed(0)}% · prompt {result.promptVersion} ·{' '}
                {result.cached ? '命中缓存' : `${result.meta.latencyMs}ms`}
              </p>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-[16px] bg-white/70 p-2 text-xs font-normal">
              {result.warnings.map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          )}
        </div>

        {/* 原图对照：点击可看大图（截图评审反馈"缩略图太小、看不清"） */}
        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {shots.map((s) => (
            <button
              key={s.id}
              onClick={() => setZoom(s.dataUrl)}
              className="relative shrink-0 overflow-hidden rounded-[16px] shadow-sticker transition active:scale-95"
              title="点击看大图"
            >
              <img src={s.dataUrl} alt={s.name} className="h-24 w-24 object-cover" />
              <span className="absolute bottom-0 right-0 rounded-tl-[10px] bg-ink/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
                放大 🔍
              </span>
            </button>
          ))}
        </div>

        {zoom && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm"
            onClick={() => setZoom(null)}
            role="presentation"
          >
            <img src={zoom} alt="原图" className="max-h-[80vh] max-w-full rounded-[20px] shadow-2xl" />
            <p className="mt-3 text-xs font-bold text-white">点任意处关闭</p>
          </div>
        )}

        {/* 金额输入 */}
        <div className={`card ${needReview ? 'ring-2 ring-apricot' : ''}`}>
          <label className="text-xs font-bold text-ink-500">实际花了多少（元）</label>
          <div className="mt-1 flex items-end gap-2">
            <span className="pb-2 text-2xl font-bold text-peach-500">¥</span>
            <input
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full border-b-2 border-dashed border-ink-100 bg-transparent pb-1 text-4xl font-bold tracking-tight outline-none focus:border-peach-300"
            />
          </div>
          {result.total !== null && (
            <button
              onClick={() => setDraft((d) => ({ ...d, amount: fenToYuan(result.totalFen!) }))}
              className="mt-2 chip bg-cream-200 text-ink-500"
            >
              AI 读到的：¥{result.total.toFixed(2)}（点一下还原）
            </button>
          )}
        </div>

        {/* 商户 / 分类 / 时间 / 备注 */}
        <div className="card mt-3 space-y-3">
          <div>
            <label className="text-xs font-bold text-ink-500">商户</label>
            <input
              value={draft.merchant}
              onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))}
              placeholder="比如：楼下便利店"
              className="field mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink-500">分类</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {categories
                .filter((c) => c.kind === 'expense')
                .map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setDraft((d) => ({ ...d, category: c.key }))}
                    className={`chip transition ${
                      draft.category === c.key ? 'bg-peach-400 text-white shadow-pop' : 'bg-cream-200 text-ink-700'
                    }`}
                  >
                    <span>{c.emoji}</span>
                    {c.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-ink-500">时间</label>
              <input
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(e) => setDraft((d) => ({ ...d, occurredAt: e.target.value }))}
                className="field mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-ink-500">备注</label>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="买了点啥"
              className="field mt-1"
            />
          </div>
        </div>

        {/* 识别出的明细 */}
        {result.items.length > 0 && (
          <div className="card mt-3">
            <p className="text-xs font-bold text-ink-500">识别到的明细（共 {result.items.length} 项）</p>
            <ul className="mt-2 space-y-1">
              {result.items.map((it, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="truncate pr-2 text-ink-700">
                    {it.name || '未命名'}
                    {it.qty > 1 ? ` ×${it.qty}` : ''}
                  </span>
                  <span className="shrink-0 font-bold">{it.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 不吸底：吸底会盖住备注卡片（截图评审发现的遮挡问题），
            改为正常文档流 + 预留底部导航高度 */}
        <div className="safe-bottom mt-4 flex gap-2">
          <button onClick={reset} className="btn-ghost flex-1">
            取消
          </button>
          <button onClick={save} disabled={!canSave || saving} className="btn-primary flex-1">
            {saving ? '正在记…' : `确认记账 ${canSave ? `¥${fenToYuan(amountFen!)}` : ''}`}
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------ 上传阶段 ------------------------------ */
  return (
    <div className="px-4 pt-5" onPaste={onPaste}>
      <div className="mb-3 flex items-center gap-3">
        <Sticker
          manifest={manifest}
          assetKey="shopping"
          seed="scan-hero"
          emoji="📷"
          className="h-14 w-14 animate-floaty"
          imgClassName="h-14 w-14"
        />
        <div>
          <h1 className="text-xl font-bold">拍照记账</h1>
          <p className="text-xs text-ink-500">上传小票/支付截图，AI 帮你算花了多少钱</p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files)
        }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-blob border-[3px] border-dashed p-6 text-center transition ${
          dragOver ? 'border-peach-400 bg-peach-100/60' : 'border-ink-200 bg-white/70'
        }`}
      >
        <div className="text-4xl">{dragOver ? '💖' : '🖼️'}</div>
        <p className="mt-2 font-bold">点这里选图片 / 拖进来 / 直接 Ctrl+V 粘贴</p>
        <p className="mt-1 text-xs text-ink-500">
          支持小票、微信支付宝截图、外卖订单页、菜单价签 · 最多 {MAX_SHOTS} 张
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            if (e.target.files?.length) await addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {err && (
        <div className="mt-3 rounded-[20px] bg-peach-100 p-3 text-sm font-bold text-peach-600">🥺 {err}</div>
      )}

      {shots.length > 0 && (
        <div className="card mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">
              已选 {shots.length} 张 <span className="text-xs font-normal text-ink-300">≈{(totalBytes / 1024).toFixed(0)}KB</span>
            </p>
            <button onClick={() => setShots([])} className="chip bg-cream-200 text-ink-500">
              全部清空
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {shots.map((s) => (
              <div key={s.id} className="relative">
                <img src={s.dataUrl} alt={s.name} className="h-24 w-24 rounded-[18px] object-cover shadow-sticker" />
                <button
                  onClick={() => setShots((list) => list.filter((x) => x.id !== s.id))}
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-peach-500 text-xs text-white shadow"
                  aria-label="移除这张"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-300">
            多张图会被当成同一笔单据一起识别（例如订单页 + 支付截图）
          </p>
        </div>
      )}

      <div className="card mt-3">
        <label className="text-xs font-bold text-ink-500">补充说明（可选，能提高准确率）</label>
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="例如：这是三个人的总账 / 金额在右下角"
          className="field mt-1 text-sm"
        />
      </div>

      <button onClick={recognize} disabled={!shots.length} className="btn-primary mt-4 w-full text-lg">
        开始识别花了多少钱
      </button>

      <div className="card mt-4 mb-2 text-xs leading-relaxed text-ink-500">
        <p className="mb-1 font-bold text-ink-700">布布的小提示</p>
        <p>· 识别结果一定会先给你确认，不会偷偷入账</p>
        <p>· 金额看不清时我会直接说「看不清」，不会编数字</p>
        <p>· 图片只在识别时上传，原图默认保存在本地 data/uploads</p>
      </div>

      {/* 三步说明：填掉这块空白，顺便把用法讲清楚（评审反馈"下半页空得像没做完"） */}
      <div className="card mt-3">
        <p className="text-sm font-bold">三步就记好一笔</p>
        <ol className="mt-2 space-y-2">
          {[
            { n: '1', key: 'shopping', emoji: '🖼️', title: '选好凭证', desc: '小票、支付截图、订单页都行，最多 4 张' },
            { n: '2', key: 'money', emoji: '🔍', title: '布布帮你算', desc: 'AI 读出实付金额、商户和时间，通常几秒' },
            { n: '3', key: 'happy', emoji: '💖', title: '核对后入账', desc: '觉得不对随时改，点确认才真正记下来' },
          ].map((s) => (
            <li key={s.n} className="flex items-center gap-3 rounded-[18px] bg-cream-200/70 p-2">
              <Sticker
                manifest={manifest}
                assetKey={s.key}
                seed={`step-${s.n}`}
                emoji={s.emoji}
                className="h-11 w-11 shrink-0"
                imgClassName="h-11 w-11"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">
                  <span className="mr-1 text-peach-500">{s.n}.</span>
                  {s.title}
                </p>
                <p className="text-[11px] text-ink-500">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
