/**
 * 贴图资源库：读取 public/bubu/manifest.json，把分类 key 映射到实际搜集来的插画文件。
 * 素材来自互联网搜集（版权归原作者，仅供个人学习使用）。
 */
import { useEffect, useState } from 'react'

export interface AssetEntry {
  file: string
  path: string
  key: string
  label: string
  emoji: string
  width: number
  height: number
  usable: boolean
  /** 视觉模型给出的质量分（0-10），没评过为 null */
  quality?: number | null
  source: string
  vision: null | {
    subject?: string
    quality?: number
    is_cartoon?: boolean
    has_text_watermark?: boolean
  }
}

export interface Manifest {
  generatedAt: string
  note: string
  visionReviewed: boolean
  total: number
  perKey: Record<string, { label: string; emoji: string; total: number; usable: number; files: string[] }>
  assets: AssetEntry[]
}

let cached: Manifest | null = null
let inflight: Promise<Manifest | null> | null = null

/**
 * 是否禁用搜集来的贴图。
 * 用途：公开仓库/部署环境不含版权素材，用 `?stickers=off` 可预览那种状态。
 */
function stickersDisabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('stickers') === 'off') return true
    return window.localStorage.getItem('bubu:stickers') === 'off'
  } catch {
    return false
  }
}

export function loadManifest(): Promise<Manifest | null> {
  if (stickersDisabled()) return Promise.resolve(null)
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = fetch('/bubu/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      // manifest 存在但一张图都没有 → 视为无素材
      if (m && m.total > 0) cached = m
      return cached
    })
    .catch(() => null)
  return inflight
}

export function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(cached)
  useEffect(() => {
    let alive = true
    loadManifest().then((m) => {
      if (alive) setManifest(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return manifest
}

/**
 * 取某个分类 key 下可用的贴图路径列表，按视觉质量分从高到低排。
 * 排序很重要：图标位置固定展示少数几张，必须优先用评审分最高的，
 * 否则容易挑到"像实拍照片""带白底方块"的次品（截图评审反馈过这个问题）。
 */
export function filesForKey(manifest: Manifest | null, key: string): string[] {
  if (!manifest) return []
  const rank = (a: AssetEntry) => a.quality ?? a.vision?.quality ?? 0
  const usable = manifest.assets.filter((a) => a.key === key && a.usable).sort((a, b) => rank(b) - rank(a))
  if (usable.length) return usable.map((a) => a.path)
  // 兜底：该分类没有可用图时，退回同分类全部图（同样按质量排）
  return manifest.assets
    .filter((a) => a.key === key)
    .sort((a, b) => rank(b) - rank(a))
    .map((a) => a.path)
}

/** 稳定地按 seed 选一张，避免每次渲染换图 */
export function pickFile(paths: string[], seed: string): string | null {
  if (!paths.length) return null
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return paths[h % paths.length]
}

/** 全局通用素材 key：主插画、开心、委屈、打招呼 */
export const GLOBAL_KEYS = ['hero', 'happy', 'sad', 'hello', 'sleep', 'celebrate'] as const

/**
 * 贴图组件：只渲染从网上搜集来的真实贴图。
 * 没有素材时退回 emoji 占位（不做任何自绘插画），保证不出现破图。
 */
export function Sticker({
  manifest,
  assetKey,
  seed = 'x',
  emoji = '✨',
  className = '',
  imgClassName = '',
  alt,
}: {
  manifest: Manifest | null
  assetKey: string
  seed?: string
  emoji?: string
  className?: string
  imgClassName?: string
  alt?: string
}) {
  const paths = filesForKey(manifest, assetKey)
  const src = pickFile(paths, seed)
  if (!src) {
    return (
      <span className={`inline-grid place-items-center ${className}`} aria-label={alt ?? assetKey}>
        <span className={imgClassName ? `${imgClassName} grid place-items-center` : 'text-3xl'}>
          {emoji}
        </span>
      </span>
    )
  }
  return (
    <span className={`inline-grid place-items-center ${className}`}>
      <img
        src={src}
        alt={alt ?? `${assetKey} 贴图`}
        loading="lazy"
        draggable={false}
        className={`select-none object-contain ${imgClassName}`}
      />
    </span>
  )
}
