/**
 * 生成识别评测夹具（fixtures）。
 *
 * 设计取舍：这里**不用文生图**，而是用 sharp 在本地把票据像素级"画"出来。
 * 理由：
 *   1. 金额精确可控（¥76.40 就是 ¥76.40），标准答案天然可信，不需要事后自证
 *   2. 不依赖外部生图服务（实测会被 429 限流），随时可重跑、可复现
 *   3. 能精确控制"清晰 / 模糊 / 遮挡 / 非账单"这些挑战维度
 * 每个夹具都附 expected.json，写明它考的是什么。
 *
 * 用法：node scripts/make-fixtures.mjs [--force]
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const FIX_DIR = join(ROOT, 'fixtures', 'bills')
mkdirSync(FIX_DIR, { recursive: true })
const force = process.argv.includes('--force')

const W = 760
const H = 1040

/** 画一张小票：等宽字体排版，模拟热敏纸 */
function receiptSvg({ title, lines, totalLabel = '合计', total, footer, date, paperColor = '#FDFCF7' }) {
  const rowY = (i) => 300 + i * 46
  const items = lines
    .map(
      (l, i) => `
      <text x="70" y="${rowY(i)}" font-family="Consolas,monospace" font-size="26" fill="#2b2b2b">${l.name}</text>
      <text x="690" y="${rowY(i)}" text-anchor="end" font-family="Consolas,monospace" font-size="26" fill="#2b2b2b">${l.price.toFixed(2)}</text>`
    )
    .join('')

  const afterItems = rowY(lines.length) + 30

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#8a7f74"/>
  <rect x="60" y="100" width="${W - 120}" height="${H - 200}" fill="${paperColor}"/>
  <text x="${W / 2}" y="170" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="32" font-weight="bold" fill="#1f1f1f">${title}</text>
  <text x="${W / 2}" y="212" text-anchor="middle" font-family="Consolas,monospace" font-size="20" fill="#5b5b5b">${date}</text>
  <line x1="70" y1="238" x2="690" y2="238" stroke="#bbb" stroke-width="2" stroke-dasharray="8 6"/>
  <text x="70" y="278" font-family="Consolas,monospace" font-size="22" fill="#666">品名</text>
  <text x="690" y="278" text-anchor="end" font-family="Consolas,monospace" font-size="22" fill="#666">金额</text>
  ${items}
  <line x1="70" y1="${afterItems}" x2="690" y2="${afterItems}" stroke="#bbb" stroke-width="2" stroke-dasharray="8 6"/>
  <text x="70" y="${afterItems + 56}" font-family="'Microsoft YaHei',sans-serif" font-size="30" font-weight="bold" fill="#111">${totalLabel}</text>
  <text x="690" y="${afterItems + 58}" text-anchor="end" font-family="Consolas,monospace" font-size="40" font-weight="bold" fill="#111">${total.toFixed(2)}</text>
  <text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="22" fill="#777">${footer}</text>
</svg>`
}

/** 画一张手机支付成功页 */
function paySvg({ app, merchant, amount, time, method = '零钱', title = '支付成功' }) {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f2f2f6"/>
  <rect x="0" y="0" width="${W}" height="150" fill="#ffffff"/>
  <text x="${W / 2}" y="92" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="34" font-weight="bold" fill="#111">${app}</text>
  <circle cx="${W / 2}" cy="270" r="56" fill="#28c76f"/>
  <path d="M${W / 2 - 26} 270 l18 20 l36 -42" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${W / 2}" y="380" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="30" fill="#333">${title}</text>
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="Consolas,monospace" font-size="76" font-weight="bold" fill="#111">¥${amount.toFixed(2)}</text>
  <g font-family="'Microsoft YaHei',sans-serif" font-size="26" fill="#333">
    <text x="90" y="620">商户</text><text x="670" y="620" text-anchor="end">${merchant}</text>
    <text x="90" y="686">付款方式</text><text x="670" y="686" text-anchor="end">${method}</text>
    <text x="90" y="752">交易时间</text><text x="670" y="752" text-anchor="end">${time}</text>
  </g>
  <line x1="90" y1="580" x2="670" y2="580" stroke="#ddd" stroke-width="2"/>
  <line x1="90" y1="650" x2="670" y2="650" stroke="#ddd" stroke-width="2"/>
  <line x1="90" y1="716" x2="670" y2="716" stroke="#ddd" stroke-width="2"/>
</svg>`
}

/** 画非账单图（用于测误判） */
function nonBillSvg(kind) {
  if (kind === 'landscape') {
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#bde3f0"/>
      <circle cx="600" cy="180" r="70" fill="#ffe08a"/>
      <path d="M0 700 L200 480 L380 700 Z" fill="#8fbf9f"/>
      <path d="M260 700 L480 430 L700 700 Z" fill="#7bb08d"/>
      <rect y="700" width="${W}" height="${H - 700}" fill="#cfe8d8"/>
    </svg>`
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#FFF9F2"/>
    <ellipse cx="330" cy="380" rx="150" ry="135" fill="#FFFDFA" stroke="#5B4A42" stroke-width="6"/>
    <ellipse cx="330" cy="180" rx="62" ry="52" fill="#5B4A42"/>
    <circle cx="278" cy="368" r="20" fill="#5B4A42"/>
    <circle cx="382" cy="368" r="20" fill="#5B4A42"/>
    <ellipse cx="238" cy="428" rx="30" ry="20" fill="#FFB3A7"/>
    <ellipse cx="422" cy="428" rx="30" ry="20" fill="#FFB3A7"/>
    <path d="M312 440 q18 18 36 0" stroke="#5B4A42" stroke-width="8" fill="none" stroke-linecap="round"/>
    <ellipse cx="520" cy="470" rx="110" ry="100" fill="#FFFDFA" stroke="#5B4A42" stroke-width="6"/>
    <circle cx="490" cy="462" r="16" fill="#5B4A42"/>
    <circle cx="556" cy="462" r="16" fill="#5B4A42"/>
  </svg>`
}

/* ------------------------------ 夹具清单 ------------------------------ */

const CASES = [
  {
    id: 'receipt-supermarket-discount',
    build: () =>
      receiptSvg({
        title: '永辉超市',
        date: '2026-02-11  19:42',
        lines: [
          { name: '有机蔬菜', price: 23.4 },
          { name: '纯牛奶 250ml*2', price: 31.0 },
          { name: '薯片大包', price: 32.0 },
          { name: '小计', price: 86.4 },
          { name: '会员满减优惠', price: -10.0 },
        ],
        totalLabel: '实付金额',
        total: 76.4,
        footer: '谢谢惠顾 欢迎再来',
      }),
    truth: { is_bill: true, total: 76.4, doc_type: 'paper_receipt', category: 'food' },
    challenge: '有满减折扣：必须取折后实付 76.40，不能取小计 86.40，也不能取优惠额 -10.00',
  },
  {
    id: 'receipt-clear-noodle',
    build: () =>
      receiptSvg({
        title: '兰州牛肉面（人民路店）',
        date: '2026-03-02  12:18',
        lines: [{ name: '牛肉拉面', price: 28.0 }],
        totalLabel: '合计',
        total: 28.0,
        footer: '欢迎下次光临',
      }),
    truth: { is_bill: true, total: 28.0, doc_type: 'paper_receipt', category: 'food' },
    challenge: '最简单的清晰小票，基线样本',
  },
  {
    id: 'receipt-pharmacy',
    build: () =>
      receiptSvg({
        title: '老百姓大药房',
        date: '2026-01-19  10:05',
        lines: [
          { name: '布洛芬缓释胶囊', price: 26.8 },
          { name: '创可贴 20 片', price: 18.4 },
        ],
        totalLabel: '合计',
        total: 45.2,
        footer: '凭小票可开发票',
      }),
    truth: { is_bill: true, total: 45.2, doc_type: 'paper_receipt', category: 'health' },
    challenge: '医药类商户，考分类语义',
  },
  {
    id: 'receipt-cafe',
    build: () =>
      receiptSvg({
        title: 'Manner Coffee',
        date: '2026-03-08  15:22',
        lines: [
          { name: '燕麦拿铁', price: 26.0 },
          { name: '巴斯克蛋糕', price: 40.0 },
        ],
        totalLabel: '合计',
        total: 66.0,
        footer: '自带杯可减 5 元',
      }),
    truth: { is_bill: true, total: 66.0, doc_type: 'paper_receipt', category: 'drink' },
    challenge: '咖啡店，应归入 drink 而不是 food',
  },
  {
    id: 'receipt-large-amount',
    build: () =>
      receiptSvg({
        title: '国美电器',
        date: '2026-02-28  16:40',
        lines: [
          { name: '洗衣机 XQG100', price: 2699.0 },
          { name: '延保服务 3 年', price: 299.0 },
        ],
        totalLabel: '实付金额',
        total: 2998.0,
        footer: '大件商品 7 天无理由',
      }),
    truth: { is_bill: true, total: 2998.0, doc_type: 'paper_receipt', category: 'shopping' },
    categoryAny: ['shopping', 'home'],
    challenge: '大额千元级，考数字位数解析（家电类 shopping / home 都算合理）',
  },
  {
    id: 'pay-wechat-drink',
    build: () =>
      paySvg({
        app: '微信支付',
        merchant: '茶颜悦色（五一广场店）',
        amount: 18.0,
        time: '2026-03-08 15:22:07',
        method: '零钱',
      }),
    truth: { is_bill: true, total: 18.0, doc_type: 'payment_screenshot', category: 'drink' },
    challenge: '支付截图，无明细，只有总金额',
  },
  {
    id: 'pay-alipay-taxi',
    build: () =>
      paySvg({
        app: '支付宝',
        merchant: '滴滴出行',
        amount: 34.5,
        time: '2026-03-05 22:41:33',
        method: '花呗',
      }),
    truth: { is_bill: true, total: 34.5, doc_type: 'payment_screenshot', category: 'transport' },
    challenge: '交通类，且有小数（.50）',
  },
  {
    id: 'pay-bank-rent',
    build: () =>
      paySvg({
        app: '招商银行',
        merchant: '房租转账 · 张房东',
        amount: 1500.0,
        time: '2026-03-01 09:03:11',
        method: '储蓄卡',
        title: '转账成功',
      }),
    truth: { is_bill: true, total: 1500.0, doc_type: 'payment_screenshot', category: 'home' },
    challenge: '整数千元转账，考是否为整数时也能正确输出',
  },
  {
    id: 'pay-online-shopping',
    build: () =>
      paySvg({
        app: '淘宝',
        merchant: '某旗舰店 · 订单 2026030712345',
        amount: 199.0,
        time: '2026-03-07 20:15:49',
        method: '余额宝',
        title: '付款成功',
      }),
    truth: { is_bill: true, total: 199.0, doc_type: 'order_page', category: 'shopping' },
    challenge: '订单号里有长数字串，考不会被订单号干扰',
  },
  {
    id: 'receipt-total-unreadable',
    build: async () => {
      const svg = receiptSvg({
        title: '街边小吃店',
        date: '2026-03-06  18:30',
        lines: [
          { name: '烤冷面', price: 12.0 },
          { name: '炸串', price: 21.5 },
        ],
        totalLabel: '合计',
        total: 33.5,
        footer: '现金支付',
      })
      // 布局换算：2 个条目行在 y=300/346，分隔线 376，合计标签 432、金额 434。
      // 遮挡块必须从 y=420 起，才能真的把「合计」这一行盖住（之前设 500 盖到的是合计下方，等于没遮）
      const base = await sharp(Buffer.from(svg)).png().toBuffer()
      const cover = await sharp({
        create: { width: W, height: 480, channels: 4, background: { r: 206, g: 170, b: 142, alpha: 1 } },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${W}" height="480" xmlns="http://www.w3.org/2000/svg">
                 <rect width="${W}" height="480" fill="rgb(206,170,142)"/>
                 <ellipse cx="300" cy="150" rx="150" ry="110" fill="rgba(255,255,255,0.10)"/>
                 <ellipse cx="540" cy="330" rx="170" ry="130" fill="rgba(0,0,0,0.07)"/>
               </svg>`
            ),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer()
      return sharp(base).composite([{ input: cover, top: 420, left: 0 }]).png().toBuffer()
    },
    truth: { is_bill: true, total: 33.5, doc_type: 'paper_receipt', category: 'food' },
    assertNoFalseCertainty: true,
    challenge:
      '明细与合计全被遮住，真正的信息缺失：合格 = 承认读不到（total=null，或至少带 warning / 置信度 <0.6）。任何"自信报一个数"都算不合格',
  },
  {
    id: 'receipt-amount-confusion',
    build: () =>
      receiptSvg({
        title: '优衣库',
        date: '2026-03-10  14:20',
        lines: [
          { name: '原价 249.00', price: 249.0 },
          { name: '限时折扣 -60.00', price: -60.0 },
          { name: '会员券 -20.00', price: -20.0 },
        ],
        totalLabel: '实付',
        total: 169.0,
        footer: '退换货请保留小票',
        totalLabel2: '应收',
        total2: 169.0,
      }).replace('退换货请保留小票', '原价合计 249.00'),
    truth: { is_bill: true, total: 169.0, doc_type: 'paper_receipt', category: 'shopping' },
    challenge:
      '同一张票上 249.00 / -60.00 / -20.00 三个数字，必须取实付 169.00。取原价或取折扣额都算错 —— 这是最贴近真实翻车场景的样本',
  },
  {
    id: 'receipt-supermarket-ambiguous-cat',
    build: () =>
      receiptSvg({
        title: '罗森便利店',
        date: '2026-03-11  21:05',
        lines: [
          { name: '关东煮', price: 12.0 },
          { name: '气泡水', price: 5.5 },
          { name: '抽纸', price: 9.9 },
        ],
        totalLabel: '合计',
        total: 27.4,
        footer: '24 小时营业',
      }),
    truth: { is_bill: true, total: 27.4, doc_type: 'paper_receipt', category: 'food' },
    categoryAny: ['food', 'home', 'drink', 'shopping'],
    challenge: '便利店混合商品，food / drink / home / shopping 都算合理，只要不是 other 这类无效分类即可',
  },
  {
    id: 'receipt-no-total-line',
    build: () =>
      receiptSvg({
        title: '好邻居便利店',
        date: '2026-03-04  08:12',
        lines: [
          { name: '包子', price: 3.5 },
          { name: '豆浆', price: 4.0 },
          { name: '鸡蛋', price: 2.5 },
        ],
        totalLabel: '合计',
        total: 10.0,
        footer: '扫码支付',
      }).replace('10.00', '\u00A0'),
    truth: { is_bill: true, total: 10.0, doc_type: 'paper_receipt', category: 'food' },
    challenge: '合计行是空的（金额被抹掉），必须靠明细求和 3.5+4+2.5=10.00 得到结果，服务端对账逻辑必须生效',
  },
  {
    id: 'pay-multi-amount-coupon',
    build: () =>
      paySvg({
        app: '美团',
        merchant: '原价 199.00 / 优惠 50.00',
        amount: 149.0,
        time: '2026-03-09 12:33:20',
        method: '微信支付',
        title: '付款成功',
      }).replace(
        '原价 199.00 / 优惠 50.00',
        '原价 ¥199.00（优惠 ¥50.00）'
      ),
    truth: { is_bill: true, total: 149.0, doc_type: 'payment_screenshot', category: 'food' },
    challenge: '同一张图里同时出现 199.00 和 50.00，必须取实付 149.00 —— v1/v2 在这里最容易翻车',
  },
  {
    id: 'nonbill-cartoon',
    build: () => nonBillSvg('cartoon'),
    truth: { is_bill: false, total: null },
    challenge: '卡通插画，绝不能判成账单',
  },
  {
    id: 'nonbill-landscape',
    build: () => nonBillSvg('landscape'),
    truth: { is_bill: false, total: null },
    challenge: '风景照，绝不能判成账单',
  },
]

/* ------------------------------- 产出 ------------------------------- */

const manifest = []
for (const c of CASES) {
  const jpg = join(FIX_DIR, `${c.id}.jpg`)
  const meta = join(FIX_DIR, `${c.id}.expected.json`)
  if (existsSync(jpg) && !force) {
    console.log(`  跳过（已存在） ${c.id}`)
  } else {
    const out = await c.build()
    const buf = typeof out === 'object' && out.isBuffer ? out : await sharp(Buffer.from(out)).png().toBuffer()
    await sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toFile(jpg)
    writeFileSync(
      meta,
      JSON.stringify({ id: c.id, truth: c.truth, lenientAmount: !!c.lenientAmount, challenge: c.challenge }, null, 2),
      'utf8'
    )
    console.log(`  ✓ ${c.id}`)
  }
  manifest.push({
    id: c.id,
    file: `${c.id}.jpg`,
    kind: c.truth.is_bill === false ? 'nonbill' : 'bill',
    truth: c.truth,
    lenient: !!c.lenientAmount,
    assertNoFalseCertainty: !!c.assertNoFalseCertainty,
    categoryAny: c.categoryAny ?? null,
    challenge: c.challenge,
    note: c.challenge,
  })
}

// 清掉旧的 ground-truth（如果是文生图时代留下的）后重写
const gt = join(FIX_DIR, 'ground-truth.json')
if (existsSync(gt)) rmSync(gt)
writeFileSync(gt, JSON.stringify(manifest, null, 2), 'utf8')

console.log(`\n夹具 ${manifest.length} 张已生成 → ${FIX_DIR}`)
console.log(`标准答案 → ${gt}`)
