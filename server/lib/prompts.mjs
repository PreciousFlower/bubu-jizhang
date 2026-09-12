/**
 * 识别 prompt 版本库。
 * 每次迭代新增一个版本，绝不原地改历史版本 —— 评测脚本要能复现每一轮的分数。
 * 导出：PROMPTS = [{ version, label, system, buildUserText, temperature, fewShot }]
 */

const CATEGORIES = [
  'food 吃饭',
  'drink 奶茶咖啡',
  'transport 交通',
  'shopping 购物',
  'home 居家水电',
  'fun 娱乐',
  'health 医疗',
  'study 学习',
  'pet 宠物',
  'trip 旅行',
  'gift 人情',
  'salary 工资',
  'bonus 红包',
  'refund 退款',
  'other 其他',
]

const OUTPUT_SHAPE = `{
  "is_bill": true|false,
  "doc_type": "paper_receipt"|"payment_screenshot"|"order_page"|"menu"|"price_tag"|"other",
  "merchant": "商户名，没有就空字符串",
  "total": 数字或null,
  "currency": "CNY",
  "date": "YYYY-MM-DD"或null,
  "time": "HH:mm"或null,
  "items": [{"name":"","price":数字,"qty":数字}],
  "suggested_category": "上面的英文 key 之一",
  "confidence": 0到1的小数,
  "warnings": ["看不清或不确定的地方，中文短句"]
}`

/* ------------------------------- v1 裸 prompt ------------------------------- */

const v1 = {
  version: 'v1',
  label: '裸 prompt：只说要 JSON',
  temperature: 0.2,
  system: '你是一个记账助手，能从图片里读出花了多少钱。',
  buildUserText: () => `看看这张图，告诉我花了多少钱，用 JSON 回答。`,
}

/* ---------------------------- v2 强 schema 约束 ---------------------------- */

const v2 = {
  version: 'v2',
  label: '强 schema：字段定义 + 金额口径 + 分类枚举',
  temperature: 0.1,
  system: '你是一个严谨的记账识别引擎。你只输出 json，不输出任何解释文字。看不清的内容绝不编造。',
  buildUserText: (ctx = {}) => `请识别这张消费凭证图片，严格按下面的 json 结构输出，不要输出 markdown 代码块，不要输出多余文字。

输出结构：
${OUTPUT_SHAPE}

字段要求：
- doc_type：纸质小票=paper_receipt；微信/支付宝/银行卡支付成功截图=payment_screenshot；外卖或电商订单页截图=order_page；菜单=menu；价签=price_tag；其他=other。
- total：只取「实付金额 / 合计 / 总计」。有折扣或优惠券时取折后实付值。单位是元，保留两位小数。看不清填 null，并在 warnings 里说明。
- items：把能看清的条目都列出来，price 是该项小计金额（元）。看不清的条目不要猜，直接省略。
- date/time：以图片上显示的时间为准；没有就填 null，不要用今天日期顶替。
- suggested_category：只能从这些 key 里选 ${CATEGORIES.join(' | ')}。
- confidence：你对 total 这个数字的把握程度，0.9 以上表示数字清晰可读。
- warnings：任何不确定的地方都要写，例如「合计被手指遮挡」。${ctx.hint ? `\n\n用户补充说明：${ctx.hint}` : ''}`,
}

/* ------------------- v3 few-shot + 金额对账 + 拒答兜底 ------------------- */

const v3 = {
  version: 'v3',
  label: 'few-shot + 金额对账 + 拒答兜底',
  temperature: 0,
  system: '你是一个严谨的记账识别引擎，服务于个人记账 App。你只输出 json，不输出任何解释文字。你的第一原则是「宁可说看不清，也绝不编造数字」。',
  buildUserText: (ctx = {}) => `请识别这张消费凭证图片，严格按下面的 json 结构输出。只输出一个 json 对象，不要 markdown 代码块，不要前后缀文字。

输出结构：
${OUTPUT_SHAPE}

【判断顺序，必须按此执行】
1) 先判断这是不是一张能看出金额的消费凭证。如果画面里根本没有金额（例如风景照、聊天记录、人物照、空白纸、界面截图里没有金额），立刻返回 is_bill=false、total=null、confidence<=0.3，并在 warnings 写明原因，items 留空数组。
2) 再判断 doc_type，然后在图中定位金额。优先级：实付金额 > 合计/总计 > 应收金额 > 单个商品价 × 数量。
3) 有折扣、满减、优惠券时，total 必须是折后实付值，不是原价，也不是优惠金额。
4) 如果图里有多个金额容易混淆（例如「原价 199 / 优惠 50 / 实付 149」），选实付值，并在 warnings 里写清你选了哪个、放弃了哪个。
5) 数字被遮挡、反光、模糊到无法确认时：total 填 null，confidence <= 0.35，warnings 写明「合计区域不清晰」。

【硬性规则】
- date/time 只能用图片上真实出现的时间。没有就填 null。禁止用今天日期顶替。
- 不要输出图片里不存在的商户名或商品名。看不清就留空字符串或省略该条目。
- items 里各项 price 之和与实际 total 不一致时，以 total 为准（total 是权威值），并在 warnings 写明差值。
- currency 默认 CNY；出现 $ 或 $ 符号时按上下文判断，不确定则 CNY 并写 warning。
- suggested_category 只能从这些 key 里选 ${CATEGORIES.join(' | ')}。按商户和商品语义选，例如咖啡店=drink，超市买食材=food，打车=transport。
- confidence 只反映「total 是否正确」这一件事的把握，与图片是否好看无关。

【示例 1｜支付成功截图】
图：微信支付成功页，商户「茶颜悦色」，金额 ¥18.00，时间 2026-03-08 15:22。
输出：{"is_bill":true,"doc_type":"payment_screenshot","merchant":"茶颜悦色","total":18,"currency":"CNY","date":"2026-03-08","time":"15:22","items":[],"suggested_category":"drink","confidence":0.96,"warnings":[]}

【示例 2｜有折扣的纸质小票】
图：超市小票，商品共 4 项合计 86.40，优惠 -10.00，实付 76.40，日期 2026-02-11。
输出：{"is_bill":true,"doc_type":"paper_receipt","merchant":"永辉超市","total":76.4,"currency":"CNY","date":"2026-02-11","time":null,"items":[{"name":"蔬菜","price":23.4,"qty":1},{"name":"牛奶","price":31,"qty":2},{"name":"零食","price":32,"qty":1}],"suggested_category":"food","confidence":0.82,"warnings":["商品小计合计 86.40 与实付 76.40 相差 10.00，已按实付值取数"]}

【示例 3｜不是账单】
图：一张两只小熊的卡通插画，没有任何金额。
输出：{"is_bill":false,"doc_type":"other","merchant":"","total":null,"currency":"CNY","date":null,"time":null,"items":[],"suggested_category":"other","confidence":0.05,"warnings":["画面中没有任何金额信息，无法识别为消费凭证"]}${ctx.hint ? `\n\n【用户补充说明】${ctx.hint}` : ''}`,
}

export const PROMPTS = [v1, v2, v3]

export const LATEST = v3

export function getPrompt(version) {
  return PROMPTS.find((p) => p.version === version) ?? LATEST
}
