import { useEffect, useState } from 'react'
import { useApp, useToast } from '../components/AppShell'
import { Sticker } from '../lib/assets'
import { api, ApiError, type Health } from '../lib/api'
import { fenToYuan, yuanToFen } from '../lib/format'

export function SettingsPage({ onChange }: { onChange: () => void }) {
  const { manifest, settings, refreshSettings, health } = useApp()
  const toast = useToast()
  const [budget, setBudget] = useState(settings ? fenToYuan(settings.monthlyBudget) : '3000')
  const [saving, setSaving] = useState(false)
  const [live, setLive] = useState<Health | null>(health)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.health().then(setLive).catch(() => {})
  }, [])

  const saveBudget = async () => {
    const fen = yuanToFen(budget)
    if (fen === null || fen < 0) {
      toast('预算填个正常的数字嘛', '🥺')
      return
    }
    setSaving(true)
    try {
      await api.saveSettings({ monthlyBudget: fen })
      await refreshSettings()
      toast('预算改好啦', '✅')
      onChange()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '保存失败', '😵')
    } finally {
      setSaving(false)
    }
  }

  const exportData = async () => {
    try {
      const [txns, stats, st] = await Promise.all([api.listTxns({ limit: 5000 }), api.stats(), api.settings()])
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), txns, stats, settings: st }, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bubu-jizhang-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast('导出好啦', '📦')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '导出失败', '😵')
    }
  }

  const clearAll = async () => {
    setBusy(true)
    try {
      const txns = await api.listTxns({ limit: 5000 })
      await Promise.all(txns.map((t) => api.deleteTxn(t.id)))
      toast(`清空了 ${txns.length} 笔记录`, '🧹')
      setConfirmClear(false)
      onChange()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '清空失败', '😵')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pt-5">
      <div className="mb-3 flex items-center gap-3">
        <Sticker
          manifest={manifest}
          assetKey="hello"
          seed="settings"
          emoji="👋"
          className="h-14 w-14 animate-floaty"
          imgClassName="h-14 w-14"
        />
        <div>
          <h1 className="text-xl font-bold">设置</h1>
          <p className="text-xs text-ink-500">布布和一二的小账本</p>
        </div>
      </div>

      {/* 预算 */}
      <div className="card">
        <h2 className="text-sm font-bold">每月预算</h2>
        <div className="mt-2 flex items-end gap-2">
          <span className="pb-2 text-xl font-bold text-peach-500">¥</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            className="w-full border-b-2 border-dashed border-ink-100 bg-transparent pb-1 text-2xl font-bold outline-none focus:border-peach-300"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1000, 2000, 3000, 5000, 8000].map((v) => (
            <button key={v} onClick={() => setBudget(String(v))} className="chip bg-cream-200 text-ink-500">
              ¥{v}
            </button>
          ))}
        </div>
        <button onClick={saveBudget} disabled={saving} className="btn-primary mt-3 w-full text-sm">
          {saving ? '保存中…' : '保存预算'}
        </button>
      </div>

      {/* 识别服务状态 */}
      <div className="card mt-3">
        <h2 className="text-sm font-bold">AI 识别服务</h2>
        <ul className="mt-2 space-y-1.5 text-xs">
          <li className="flex items-center justify-between">
            <span className="text-ink-500">密钥状态</span>
            <span className={`chip ${live?.visionReady ? 'bg-mint/60' : 'bg-peach-100 text-peach-600'}`}>
              {live?.visionReady ? '✅ 已配置' : '⚠️ 未配置'}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-500">识别模型</span>
            <span className="font-mono font-bold">{live?.visionModel ?? '-'}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-500">当前 prompt</span>
            <span className="chip bg-cream-200 font-mono">{live?.activePrompt ?? '-'}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-500">prompt 版本</span>
            <span className="font-mono">{live?.promptVersions.join(' / ') ?? '-'}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-500">存储驱动</span>
            <span className="chip bg-cream-200 font-mono">{live?.driver ?? '-'}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-500">已记账笔数</span>
            <span className="font-bold">{live?.txns ?? 0}</span>
          </li>
        </ul>
        {live?.driver === 'json' && live.fallbackReason && (
          <p className="mt-2 rounded-[16px] bg-apricot/50 p-2 text-[11px]">
            SQLite 不可用，已自动降级为 JSON 存储：{live.fallbackReason}
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-300">
          密钥只保存在服务端 <code className="font-mono">.env.local</code>，不会发送到浏览器。
        </p>
      </div>

      {/* 数据 */}
      <div className="card mt-3">
        <h2 className="text-sm font-bold">数据</h2>
        <button onClick={exportData} className="btn-soft mt-2 w-full text-sm">
          📦 导出全部数据（JSON）
        </button>
        {!confirmClear ? (
          <button onClick={() => setConfirmClear(true)} className="btn-ghost mt-2 w-full text-sm text-peach-600">
            🧹 清空所有记录
          </button>
        ) : (
          <div className="mt-2 rounded-[20px] bg-peach-100 p-3">
            <p className="text-xs font-bold text-peach-600">真的要清空吗？这个操作不能撤销哦</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setConfirmClear(false)} className="btn-ghost flex-1 py-2 text-sm">
                我再想想
              </button>
              <button onClick={clearAll} disabled={busy} className="btn-primary flex-1 py-2 text-sm">
                {busy ? '清空中…' : '确认清空'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 关于 */}
      <div className="card mt-3 text-xs leading-relaxed text-ink-500">
        <h2 className="text-sm font-bold text-ink-700">关于这个小账本</h2>
        <p className="mt-2">
          记账功能与界面为本项目原创实现。App 内使用的卡通贴图由网络搜集而来，
          <b className="text-ink-700">版权归原作者所有，仅供个人学习使用，不商用、不再分发</b>。
        </p>
        <p className="mt-2">
          素材清单与来源见 <code className="font-mono">public/bubu/manifest.json</code>，
          预览墙见 <code className="font-mono">public/bubu/_contact-sheet.html</code>。
        </p>
        <p className="mt-2 text-ink-300">数据目录：{live?.dataDir ?? '-'}</p>
      </div>
    </div>
  )
}
