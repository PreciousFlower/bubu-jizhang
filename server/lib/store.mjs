/**
 * 数据层：优先 SQLite（better-sqlite3），初始化失败自动降级为 JSON 文件存储。
 * 对外只暴露同一组函数，上层无感。
 * 金额一律以「分」为整数存储，杜绝浮点误差。
 *
 * @typedef {'expense'|'income'} TxnKind
 * @typedef {object} Txn
 * @property {string} id
 * @property {TxnKind} kind
 * @property {number} amount 分
 * @property {string} category
 * @property {string} note
 * @property {string} merchant
 * @property {string} occurredAt ISO
 * @property {string} account
 * @property {string} mood
 * @property {'manual'|'photo'} source
 * @property {string|null} imageRef
 * @property {number|null} confidence
 * @property {string} createdAt
 *
 * @typedef {object} Category
 * @property {string} key
 * @property {string} label
 * @property {string} emoji
 * @property {string} assetKey
 * @property {TxnKind} kind
 * @property {number} sort
 *
 * @typedef {object} Settings
 * @property {number} monthlyBudget 分
 * @property {string} currency
 * @property {Category[]} diyCategories
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '..', 'data')

/** @type {Category[]} */
export const DEFAULT_CATEGORIES = [
  { key: 'food', label: '吃饭', emoji: '🍚', assetKey: 'cook', kind: 'expense', sort: 10 },
  { key: 'drink', label: '奶茶咖啡', emoji: '🧋', assetKey: 'drink', kind: 'expense', sort: 20 },
  { key: 'transport', label: '交通', emoji: '🚌', assetKey: 'commute', kind: 'expense', sort: 30 },
  { key: 'shopping', label: '购物', emoji: '🛍️', assetKey: 'shopping', kind: 'expense', sort: 40 },
  { key: 'home', label: '居家水电', emoji: '🏠', assetKey: 'home', kind: 'expense', sort: 50 },
  { key: 'fun', label: '娱乐', emoji: '🎬', assetKey: 'movie', kind: 'expense', sort: 60 },
  { key: 'health', label: '医疗', emoji: '💊', assetKey: 'sick', kind: 'expense', sort: 70 },
  { key: 'study', label: '学习', emoji: '📚', assetKey: 'study', kind: 'expense', sort: 80 },
  { key: 'pet', label: '宠物', emoji: '🐾', assetKey: 'pet', kind: 'expense', sort: 90 },
  { key: 'trip', label: '旅行', emoji: '✈️', assetKey: 'travel', kind: 'expense', sort: 100 },
  { key: 'gift', label: '人情', emoji: '🎁', assetKey: 'gift', kind: 'expense', sort: 110 },
  { key: 'other', label: '其他', emoji: '✨', assetKey: 'hello', kind: 'expense', sort: 200 },
  { key: 'salary', label: '工资', emoji: '💰', assetKey: 'salary', kind: 'income', sort: 10 },
  { key: 'bonus', label: '红包', emoji: '🧧', assetKey: 'happy', kind: 'income', sort: 20 },
  { key: 'refund', label: '退款', emoji: '↩️', assetKey: 'money', kind: 'income', sort: 30 },
]

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  monthlyBudget: 300000, // 3000.00 元
  currency: 'CNY',
  diyCategories: [],
}

/**
 * @typedef {object} Driver
 * @property {'sqlite'|'json'} name
 * @property {(f: {from?: string, to?: string, limit?: number}) => Txn[]} listTxns
 * @property {(t: Txn) => void} insertTxn
 * @property {(id: string, patch: Partial<Txn>) => Txn|null} updateTxn
 * @property {(id: string) => boolean} deleteTxn
 * @property {(id: string) => Txn|null} getTxn
 * @property {() => number} countTxns
 * @property {() => Settings} getSettings
 * @property {(s: Settings) => void} saveSettings
 * @property {() => void} close
 */

function nowIso() {
  return new Date().toISOString()
}

export function newId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ------------------------------ SQLite 驱动 ------------------------------ */

/**
 * @param {string} file
 * @returns {Driver}
 */
function createSqliteDriver(file) {
  const require = createRequire(import.meta.url)
  const Database = require('better-sqlite3')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS txns (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      merchant TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      account TEXT NOT NULL DEFAULT '默认',
      mood TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      image_ref TEXT,
      confidence REAL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_txns_occurred ON txns(occurred_at);
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `)

  /** @param {Record<string, unknown>} r @returns {Txn} */
  const toTxn = (r) => ({
    id: String(r.id),
    kind: /** @type {TxnKind} */ (r.kind),
    amount: Number(r.amount),
    category: String(r.category),
    note: String(r.note ?? ''),
    merchant: String(r.merchant ?? ''),
    occurredAt: String(r.occurred_at),
    account: String(r.account ?? '默认'),
    mood: String(r.mood ?? ''),
    source: r.source === 'photo' ? 'photo' : 'manual',
    imageRef: r.image_ref === null || r.image_ref === undefined ? null : String(r.image_ref),
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    createdAt: String(r.created_at),
  })

  return {
    name: 'sqlite',
    listTxns({ from, to, limit }) {
      const where = []
      const params = []
      if (from) {
        where.push('occurred_at >= ?')
        params.push(from)
      }
      if (to) {
        where.push('occurred_at <= ?')
        params.push(to)
      }
      const sql =
        'SELECT * FROM txns' +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY occurred_at DESC, created_at DESC LIMIT ?'
      params.push(limit && limit > 0 ? limit : 2000)
      return db.prepare(sql).all(...params).map(toTxn)
    },
    insertTxn(t) {
      db.prepare(
        `INSERT INTO txns (id,kind,amount,category,note,merchant,occurred_at,account,mood,source,image_ref,confidence,created_at)
         VALUES (@id,@kind,@amount,@category,@note,@merchant,@occurred_at,@account,@mood,@source,@image_ref,@confidence,@created_at)`
      ).run({
        id: t.id,
        kind: t.kind,
        amount: t.amount,
        category: t.category,
        note: t.note,
        merchant: t.merchant,
        occurred_at: t.occurredAt,
        account: t.account,
        mood: t.mood,
        source: t.source,
        image_ref: t.imageRef,
        confidence: t.confidence,
        created_at: t.createdAt,
      })
    },
    getTxn(id) {
      const r = db.prepare('SELECT * FROM txns WHERE id = ?').get(id)
      return r ? toTxn(r) : null
    },
    updateTxn(id, patch) {
      const cur = this.getTxn(id)
      if (!cur) return null
      const next = { ...cur, ...patch }
      db.prepare(
        `UPDATE txns SET kind=@kind, amount=@amount, category=@category, note=@note, merchant=@merchant,
         occurred_at=@occurred_at, account=@account, mood=@mood, image_ref=@image_ref, confidence=@confidence WHERE id=@id`
      ).run({
        id,
        kind: next.kind,
        amount: next.amount,
        category: next.category,
        note: next.note,
        merchant: next.merchant,
        occurred_at: next.occurredAt,
        account: next.account,
        mood: next.mood,
        image_ref: next.imageRef,
        confidence: next.confidence,
      })
      return next
    },
    deleteTxn(id) {
      return db.prepare('DELETE FROM txns WHERE id = ?').run(id).changes > 0
    },
    countTxns() {
      return Number(db.prepare('SELECT COUNT(*) AS c FROM txns').get().c)
    },
    getSettings() {
      const r = db.prepare('SELECT v FROM kv WHERE k = ?').get('settings')
      if (!r) return { ...DEFAULT_SETTINGS }
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(String(r.v)) }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    saveSettings(s) {
      db.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(
        'settings',
        JSON.stringify(s)
      )
    },
    close() {
      db.close()
    },
  }
}

/* ------------------------------- JSON 驱动 ------------------------------- */

/**
 * @param {string} file
 * @returns {Driver}
 */
function createJsonDriver(file) {
  const load = () => {
    if (!existsSync(file)) return { txns: [], settings: { ...DEFAULT_SETTINGS } }
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      return { txns: raw.txns ?? [], settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } }
    } catch {
      return { txns: [], settings: { ...DEFAULT_SETTINGS } }
    }
  }
  let state = load()
  const flush = () => writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')

  return {
    name: 'json',
    listTxns({ from, to, limit }) {
      let rows = state.txns.slice()
      if (from) rows = rows.filter((t) => t.occurredAt >= from)
      if (to) rows = rows.filter((t) => t.occurredAt <= to)
      rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
      return rows.slice(0, limit && limit > 0 ? limit : 2000)
    },
    insertTxn(t) {
      state.txns.push(t)
      flush()
    },
    getTxn(id) {
      return state.txns.find((t) => t.id === id) ?? null
    },
    updateTxn(id, patch) {
      const i = state.txns.findIndex((t) => t.id === id)
      if (i < 0) return null
      state.txns[i] = { ...state.txns[i], ...patch }
      flush()
      return state.txns[i]
    },
    deleteTxn(id) {
      const n = state.txns.length
      state.txns = state.txns.filter((t) => t.id !== id)
      if (state.txns.length !== n) {
        flush()
        return true
      }
      return false
    },
    countTxns() {
      return state.txns.length
    },
    getSettings() {
      return { ...DEFAULT_SETTINGS, ...state.settings }
    },
    saveSettings(s) {
      state.settings = s
      flush()
    },
    close() {
      flush()
    },
  }
}

/* -------------------------------- 初始化 -------------------------------- */

/** @type {Driver|undefined} */
let driver
/** @type {string|null} */
let driverError = null

export function initStore() {
  if (driver) return driver
  mkdirSync(DATA_DIR, { recursive: true })
  try {
    driver = createSqliteDriver(join(DATA_DIR, 'bubu.db'))
    // 真正跑一次查询，确保原生模块可用而不是假成功
    driver.countTxns()
  } catch (e) {
    driverError = e instanceof Error ? e.message.split('\n')[0] : String(e)
    driver = createJsonDriver(join(DATA_DIR, 'db.json'))
  }
  return driver
}

export function store() {
  return driver ?? initStore()
}

export function storeInfo() {
  initStore()
  return {
    driver: driver.name,
    fallbackReason: driverError,
    dataDir: DATA_DIR,
    txns: driver.countTxns(),
    now: nowIso(),
  }
}
