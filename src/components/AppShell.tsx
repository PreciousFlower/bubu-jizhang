import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadManifest, type Manifest } from '../lib/assets'
import { api, type Category, type Health, type Settings } from '../lib/api'

/* ------------------------------- 全局 App 状态 ------------------------------- */

interface AppState {
  ready: boolean
  health: Health | null
  categories: Category[]
  settings: Settings | null
  manifest: Manifest | null
  error: string | null
  refreshSettings: () => Promise<void>
  categoryOf: (key: string) => Category | undefined
}

const AppCtx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const refreshSettings = useCallback(async () => {
    const s = await api.settings()
    setSettings(s)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [h, c, s] = await Promise.all([api.health(), api.categories(), api.settings()])
        if (!alive) return
        setHealth(h)
        setCategories(c)
        setSettings(s)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '初始化失败')
      } finally {
        if (alive) setReady(true)
      }
      const m = await loadManifest()
      if (alive) setManifest(m)
    })()
    return () => {
      alive = false
    }
  }, [])

  const catMap = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])
  const categoryOf = useCallback((key: string) => catMap.get(key) ?? catMap.get('other'), [catMap])

  const value = useMemo<AppState>(
    () => ({ ready, health, categories, settings, manifest, error, refreshSettings, categoryOf }),
    [ready, health, categories, settings, manifest, error, refreshSettings, categoryOf]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

/* --------------------------------- 轻提示 --------------------------------- */

interface Toast {
  id: number
  text: string
  emoji: string
}

const ToastCtx = createContext<(text: string, emoji?: string) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((text: string, emoji = '🐼') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, emoji }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-popIn mt-6 rounded-pill bg-white/95 px-4 py-2 text-sm font-bold text-ink shadow-sticker"
          >
            <span className="mr-1">{t.emoji}</span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ------------------------------- 撒花动效 ------------------------------- */

/** 记账成功时从点击位置掉落爱心/星星 */
export function burstConfetti(x: number, y: number) {
  const emojis = ['💖', '⭐', '🌸', '🐼', '✨', '🍡']
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div')
    el.textContent = emojis[i % emojis.length]
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:${14 + Math.random() * 14}px;pointer-events:none;z-index:9999;will-change:transform,opacity`
    document.body.appendChild(el)
    const dx = (Math.random() - 0.5) * 220
    const dy = 140 + Math.random() * 160
    const rot = (Math.random() - 0.5) * 720
    const anim = el.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(0.6)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(1.1)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(0.2,0.7,0.4,1)' }
    )
    anim.onfinish = () => el.remove()
  }
}
