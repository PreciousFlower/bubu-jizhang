#!/usr/bin/env node
/**
 * 容器启动自检：确认两个原生模块真的能加载。
 *
 * 为什么需要它：sharp 与 better-sqlite3 都是原生模块，若在目标平台（Linux 容器）
 * 装不上预编译二进制，问题会以很难排查的方式暴露 —— 比如识别时图片处理报错、
 * 或者存储静默降级成 JSON 导致重启后数据丢失。
 * 与其到线上才发现，不如在启动阶段就明确报出来。
 *
 * 用法：node scripts/check-runtime.mjs
 * 退出码 0 = 一切正常；1 = 关键依赖不可用
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * 读某个依赖的版本号。
 * 注意：不能写 require('sharp/package.json') —— sharp 的 exports 字段不允许访问 package.json，
 * 会抛 ERR_PACKAGE_PATH_NOT_EXPORTED，看起来像"模块坏了"其实只是读法不对。
 */
function pkgVersion(name) {
  try {
    const entry = require.resolve(name)
    let dir = dirname(entry)
    for (let i = 0; i < 4; i++) {
      try {
        return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
      } catch {
        dir = dirname(dir)
      }
    }
  } catch {
    /* ignore */
  }
  return '未知版本'
}

const problems = []
const ok = []

/* ---------------------------- sharp（图片处理） ---------------------------- */

try {
  const sharp = require('sharp')
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#FFB3A7' },
  })
    .jpeg()
    .toBuffer()
  if (buf.length < 50) throw new Error('输出的 JPEG 过小，疑似异常')
  ok.push(`sharp ${pkgVersion('sharp')}（图片处理可用）`)
} catch (e) {
  problems.push(`sharp 不可用：${e.message.split('\n')[0]}`)
}

/* ---------------------- better-sqlite3（数据持久化） ---------------------- */

try {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.exec('create table t(a integer)')
  db.prepare('insert into t values (?)').run(1)
  const n = db.prepare('select count(*) c from t').get().c
  db.close()
  if (n !== 1) throw new Error('读写校验失败')
  ok.push(`better-sqlite3 ${pkgVersion('better-sqlite3')}（SQLite 可用）`)
} catch (e) {
  problems.push(`better-sqlite3 不可用：${e.message.split('\n')[0]}`)
}

/* --------------------------------- 输出 --------------------------------- */

console.log('════ 运行时自检 ════')
console.log(`Node ${process.version}  ${process.platform}/${process.arch}`)
for (const o of ok) console.log(`  ✅ ${o}`)
for (const p of problems) console.log(`  ❌ ${p}`)

if (problems.length) {
  console.log('')
  console.log('存在不可用的关键依赖。影响：')
  if (problems.some((p) => p.startsWith('sharp'))) {
    console.log('  · sharp 不可用 → 图片无法归一化，AI 识别会失败')
  }
  if (problems.some((p) => p.startsWith('better-sqlite3'))) {
    console.log('  · better-sqlite3 不可用 → 存储会降级为 JSON 文件，重启后数据可能丢失')
  }
  console.log('')
  console.log('排查方向：构建阶段是否用了 --ignore-scripts（它会让原生模块的安装脚本不执行）')
  process.exit(1)
}

console.log('关键依赖全部就绪 ✅')
