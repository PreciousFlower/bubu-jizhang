# 识别精度迭代记录 · 初版三轮对照

- 时间：2026-09-12T07:31:49.329Z
- 夹具：fixtures/bills（12 张：账单 10、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 0/9 = 0.0% | 9/9 = 100.0% | 9/9 = 100.0% |
| 分类正确率 | 0/9 = 0.0% | 9/9 = 100.0% | 9/9 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 1/1 | 1/1 | 1/1 |
| 需人工确认占比 | 100.0% | 75.0% | 41.7% |
| 平均耗时 | 2190ms | 1755ms | 1703ms |
| 最慢耗时 | 4448ms | 2130ms | 2376ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 1300ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | other | other | 0.5 | 是 | 2297ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | null | other | other | 0.1 | 是 | 1438ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 2346ms | ❌ |
| receipt-large-amount | bill | ¥2998 | null | other | other | 0.1 | 是 | 1284ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 2269ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 1490ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 2043ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 1202ms | ❌ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | other | other | 0.5 | 是 | 4448ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 3937ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2224ms | ✅ |

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.95 | 是 | 2067ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 2019ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 2105ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 2130ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1472ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1948ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.98 | 是 | 1677ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.98 | 是 | 1653ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.98 | 是 | 1679ms | ✅ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | paper_receipt | food | 0.95 | 是 | 1925ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1422ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 958ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「纯牛奶单价未单列，31.00 为两盒小计」；「小计 86.40 与三条明细相加一致，会员满减 -10.00 已扣减」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「小票底部「自带杯可减 5 元」为提示语，未计入实付合计」
- **pay-wechat-drink**：「支付截图未显示消费明细，items 为空」
- **pay-alipay-taxi**：「无消费明细条目，仅有支付总额」；「交易时间秒数已省略」
- **pay-bank-rent**：「这是银行转账成功截图，非消费购物小票，分类按房租归入居家」
- **pay-online-shopping**：「商户名仅显示「某旗舰店」，未给出具体店铺全称」；「图片为支付成功截图，无商品明细条目」
- **receipt-blurry-total**：「小票未标注各条目数量，均按1份记录」；「支付方式为现金支付」
- **nonbill-cartoon**：「图片是卡通插画，不是消费凭证」；「没有任何金额、商户或时间信息」
- **nonbill-landscape**：「图片是风景插画，不是消费凭证，没有任何金额或商户信息」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.9 | 是 | 1926ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1174ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 2236ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1609ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1800ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.97 | 否 | 1400ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 1572ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 否 | 2376ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1697ms | ✅ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | paper_receipt | food | 0.95 | 否 | 1118ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 2024ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1499ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计 86.40 与实付 76.40 相差 10.00（会员满减优惠 -10.00），已按实付金额取数」；「纯牛奶行标注 250ml*2 共 31.00，已折为单价 15.50 × 2」；「明细合计 70.90 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「小票底部“自带杯可减5元”为提示语，未实际抵扣，合计仍按66.00计入」
- **pay-online-shopping**：「商户名显示为「某旗舰店」，疑似占位文本，未包含具体店铺名」；「订单号 2026030712345 未被当作日期或金额使用」
- **nonbill-cartoon**：「画面为卡通插画（两个圆脸小人），没有任何金额信息，无法识别为消费凭证」
- **nonbill-landscape**：「画面为山峰与太阳的简单插画，没有任何金额信息，无法识别为消费凭证」

