/**
 * 生成演示数据，方便直观看到统计页的环形图/柱状图/排行榜效果。
 *
 * 用法：
 *   node scripts/seed-demo.mjs          # 写入演示数据
 *   node scripts/seed-demo.mjs --clear  # 只清空演示数据（按 note 前缀识别）
 */
const API = process.env.SEED_API || 'http://127.0.0.1:8787'
const MARK = '演示数据'

const today = new Date()
const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

/** [日, 类型, 金额(元), 分类, 商户, 备注] */
const ROWS = [
  [1, 'expense', 45.0, 'food', '沙县小吃', '早饭+午饭'],
  [1, 'expense', 12.0, 'transport', '地铁', '通勤'],
  [2, 'expense', 28.0, 'food', '兰州牛肉面', '牛肉拉面'],
  [2, 'expense', 18.0, 'drink', '瑞幸咖啡', '生椰拿铁'],
  [3, 'expense', 156.8, 'shopping', '优衣库', 'T恤两件'],
  [3, 'expense', 32.0, 'food', '杨国福麻辣烫', ''],
  [4, 'expense', 9.9, 'drink', '蜜雪冰城', '柠檬水'],
  [4, 'expense', 260.0, 'home', '国家电网', '电费'],
  [5, 'expense', 68.0, 'fun', '万达影城', '电影票两张'],
  [5, 'expense', 42.5, 'food', '海底捞', '和朋友'],
  [6, 'expense', 15.0, 'transport', '滴滴', '打车回家'],
  [7, 'expense', 128.0, 'food', '盒马鲜生', '一周食材'],
  [8, 'expense', 86.0, 'health', '老百姓大药房', '感冒药'],
  [9, 'expense', 22.0, 'drink', '茶颜悦色', '幽兰拿铁'],
  [10, 'expense', 320.0, 'study', '得到 App', '买课'],
  [11, 'expense', 58.0, 'food', '老乡鸡', '午饭'],
  [12, 'expense', 210.0, 'pet', '宠物医院', '猫咪疫苗'],
  [13, 'expense', 39.0, 'food', '麦当劳', ''],
  [14, 'expense', 15.8, 'transport', '共享单车月卡', ''],
  [15, 'expense', 680.0, 'trip', '携程', '高铁票'],
  [15, 'expense', 45.0, 'food', '高铁餐车', ''],
  [16, 'expense', 99.0, 'shopping', '无印良品', '收纳盒'],
  [17, 'expense', 26.0, 'drink', 'Manner', '燕麦拿铁'],
  [18, 'income', 12000.0, 'salary', '公司', '月薪'],
  [19, 'expense', 380.0, 'home', '物业费', ''],
  [20, 'expense', 88.0, 'gift', '花店', '朋友生日'],
  [21, 'expense', 52.0, 'food', '西贝莜面村', ''],
  [22, 'expense', 19.9, 'drink', '书亦烧仙草', ''],
  [23, 'expense', 149.0, 'shopping', '淘宝', '日用品'],
  [24, 'expense', 200.0, 'fun', '剧本杀', '团建'],
  [25, 'expense', 36.5, 'food', '真功夫', ''],
  [26, 'expense', 24.0, 'transport', '地铁充值', ''],
  [27, 'expense', 458.0, 'trip', '民宿', '周末出行'],
  [28, 'expense', 66.0, 'food', '烧烤摊', '夜宵'],
  [28, 'income', 200.0, 'bonus', '微信红包', ''],
]

async function main() {
  const clear = process.argv.includes('--clear')
  const list = (await (await fetch(`${API}/api/txns?limit=500`)).json()).txns
  const demo = list.filter((t) => t.note?.startsWith(MARK))

  if (clear) {
    for (const t of demo) await fetch(`${API}/api/txns/${t.id}`, { method: 'DELETE' })
    console.log(`已清空演示数据 ${demo.length} 笔`)
    return
  }
  if (demo.length) {
    console.log(`已存在 ${demo.length} 笔演示数据，先清空再写入`)
    for (const t of demo) await fetch(`${API}/api/txns/${t.id}`, { method: 'DELETE' })
  }

  let n = 0
  for (const [day, kind, yuan, category, merchant, note] of ROWS) {
    const occurredAt = new Date(`${ym}-${String(day).padStart(2, '0')}T12:${String(20 + (n % 39)).padStart(2, '0')}:00`)
    const res = await fetch(`${API}/api/txns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        amount: Math.round(yuan * 100),
        category,
        merchant,
        note: note ? `${MARK}·${note}` : MARK,
        occurredAt: occurredAt.toISOString(),
        source: 'manual',
      }),
    })
    if (!res.ok) {
      console.error(`  写入失败 day=${day} ${merchant}: ${(await res.text()).slice(0, 120)}`)
      continue
    }
    n++
  }
  console.log(`已写入演示数据 ${n} 笔（${ym}）`)
  console.log('清空命令：node scripts/seed-demo.mjs --clear')
}

await main()
