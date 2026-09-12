import { useEffect, useState } from 'react'
import { AppProvider, ToastHost, useApp } from './components/AppShell'
import { BottomNav, type TabKey } from './components/BottomNav'
import { HomePage } from './pages/HomePage'
import { AddPage } from './pages/AddPage'
import { ScanPage } from './pages/ScanPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'

const TAB_KEYS: TabKey[] = ['home', 'scan', 'stats', 'settings']

function parseHash(): { tab: TabKey; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const tab = (TAB_KEYS.includes(path as TabKey) ? path : 'home') as TabKey
  return { tab, params: new URLSearchParams(query) }
}

function Shell() {
  const { ready, error, health } = useApp()
  const [route, setRoute] = useState(parseHash)
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 深链：#/home?add=1 直接打开记账弹层（方便分享/测试）
  useEffect(() => {
    if (route.params.get('add') === '1') {
      setAddOpen(true)
    }
    const edit = route.params.get('edit')
    if (edit) {
      setEditingId(edit)
      setAddOpen(true)
    }
  }, [route])

  const go = (tab: TabKey) => {
    window.location.hash = `#/${tab}`
    window.scrollTo({ top: 0 })
  }

  const closeAdd = () => {
    setAddOpen(false)
    setEditingId(null)
    if (route.params.get('add') || route.params.get('edit')) {
      window.location.hash = `#/${route.tab}`
    }
  }

  /**
   * 记账完成后的统一收尾。
   * 关键点：拍照记账是在 scan 页内完成的，保存后必须把用户带回首页，
   * 否则会停在识别结果页，让人以为没记上（这个 bug 被端到端测试抓到过）。
   */
  const onSaved = () => {
    setRefreshKey((k) => k + 1)
    closeAdd()
    if (route.tab !== 'home') {
      window.location.hash = '#/home'
      window.scrollTo({ top: 0 })
    }
  }

  if (!ready) {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="animate-floaty text-center">
          <div className="text-5xl">🐼</div>
          <p className="mt-3 text-sm font-bold text-ink-500">布布正在翻小本本…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-full place-items-center px-6">
        <div className="card max-w-sm text-center">
          <div className="text-4xl">🥺</div>
          <h2 className="mt-2 text-lg font-bold">连不上小账本了</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{error}</p>
          <p className="mt-2 rounded-[16px] bg-cream-200 p-3 text-left text-xs text-ink-500">
            请确认 API 进程在跑：<br />
            <code className="font-mono">npm run dev:api</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col">
      {health && !health.visionReady && (
        <div className="mx-4 mt-3 rounded-[18px] bg-apricot/50 px-4 py-2 text-center text-xs font-bold text-ink-700">
          ⚠️ 还没配置识别密钥，拍照记账暂时用不了（在 .env.local 写明 DEEPSEEK_API_KEY）
        </div>
      )}

      {/*
        pb-44 = 176px。实测：导航栏高 85px + 中间凸起按钮外溢 + 安全区，
        滚到页面最底部时最后一个内容块距离导航栏顶部还有约 95px 净余量。
        这个值由 scripts/measure-layout.mjs 量出来，不靠肉眼估。
      */}
      <main className="flex-1 pb-44">
        {route.tab === 'home' && (
          <HomePage
            key={`home-${refreshKey}`}
            onOpenAdd={() => setAddOpen(true)}
            onOpenScan={() => go('scan')}
            onEdit={(id) => {
              setEditingId(id)
              setAddOpen(true)
            }}
          />
        )}
        {route.tab === 'scan' && <ScanPage key={`scan-${refreshKey}`} onSaved={onSaved} />}
        {route.tab === 'stats' && <StatsPage key={`stats-${refreshKey}`} />}
        {route.tab === 'settings' && <SettingsPage key={`set-${refreshKey}`} onChange={() => setRefreshKey((k) => k + 1)} />}
      </main>

      <BottomNav active={route.tab} onChange={go} onCenter={() => setAddOpen(true)} />

      {addOpen && <AddPage txnId={editingId} onClose={closeAdd} onSaved={onSaved} />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <ToastHost>
        <Shell />
      </ToastHost>
    </AppProvider>
  )
}
