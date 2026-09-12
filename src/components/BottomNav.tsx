import { useApp } from './AppShell'
import { Sticker } from '../lib/assets'

export type TabKey = 'home' | 'scan' | 'stats' | 'settings'

const TABS: { key: TabKey; label: string; icon: string; assetKey: string }[] = [
  { key: 'home', label: '小账本', icon: '🏠', assetKey: 'happy' },
  { key: 'scan', label: '拍照记账', icon: '📷', assetKey: 'shopping' },
  { key: 'stats', label: '看看花销', icon: '📊', assetKey: 'money' },
  { key: 'settings', label: '设置', icon: '⚙️', assetKey: 'hello' },
]

/** 底部导航：中间一个凸起的可爱「+」按钮 */
export function BottomNav({
  active,
  onChange,
  onCenter,
}: {
  active: TabKey
  onChange: (t: TabKey) => void
  onCenter: () => void
}) {
  const { manifest } = useApp()
  const left = TABS.slice(0, 2)
  const right = TABS.slice(2)

  const renderTab = (t: (typeof TABS)[number]) => {
    const on = active === t.key
    return (
      <button
        key={t.key}
        onClick={() => onChange(t.key)}
        className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-[20px] px-1 py-2 transition ${
          on ? 'bg-cream-200' : 'hover:bg-cream-100'
        }`}
        aria-current={on ? 'page' : undefined}
      >
        <Sticker
          manifest={manifest}
          assetKey={t.assetKey}
          seed={t.key}
          emoji={t.icon}
          className={`h-8 w-8 transition-transform ${on ? 'scale-110' : 'opacity-70 group-hover:scale-105'}`}
          imgClassName="h-8 w-8"
        />
        <span className={`text-[10px] font-bold ${on ? 'text-peach-600' : 'text-ink-500'}`}>{t.label}</span>
        {on && <span className="absolute -top-1 h-1.5 w-1.5 rounded-full bg-peach-400" />}
      </button>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[520px] px-3 pb-2 safe-bottom">
      <div className="relative flex items-end gap-1 rounded-[28px] bg-white/95 p-1.5 shadow-sticker backdrop-blur">
        {left.map(renderTab)}

        <button
          onClick={onCenter}
          aria-label="记一笔"
          className="-mt-6 grid h-16 w-16 shrink-0 place-items-center rounded-full bg-peach-500 text-white shadow-pop transition-transform active:scale-90"
        >
          <span className="text-3xl leading-none">＋</span>
        </button>

        {right.map(renderTab)}
      </div>
    </nav>
  )
}
