# 识别精度迭代记录 · 最终-真拒答样本

- 时间：2026-09-12T07:39:22.349Z
- 夹具：fixtures/bills（16 张：账单 14、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 1/14 = 7.1% | 14/14 = 100.0% | 14/14 = 100.0% |
| 分类正确率 | 0/14 = 0.0% | 13/14 = 92.9% | 14/14 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 0/0 | 0/0 | 0/0 |
| 需人工确认占比 | 100.0% | 87.5% | 62.5% |
| 平均耗时 | 2092ms | 1616ms | 2090ms |
| 最慢耗时 | 5041ms | 2130ms | 9938ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 2166ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | other | other | 0.5 | 是 | 1201ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | other | other | 0.5 | 是 | 1458ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 2390ms | ❌ |
| receipt-large-amount | bill | ¥2998 | null | other | other | 0.1 | 是 | 2950ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 1922ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 1391ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 914ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 1176ms | ❌ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | other | other | 0.5 | 是 | 3141ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | null | other | other | 0.1 | 是 | 2760ms | ❌ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | other | other | 0.5 | 是 | 1087ms | ❌ |
| receipt-no-total-line | bill | ¥10 | null | other | other | 0.1 | 是 | 5041ms | ❌ |
| pay-multi-amount-coupon | bill | ¥149 | null | other | other | 0.1 | 是 | 1083ms | ❌ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2532ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2261ms | ✅ |

### 模型给出的 warnings

- **receipt-clear-noodle**：「明细合计 0.00 元与合计 28.00 元不一致，已以合计为准」
- **receipt-pharmacy**：「图中未读到合计金额，已按明细求和取 45.20 元」
- **receipt-total-unreadable**：「明细合计 0.00 元与合计 33.50 元不一致，已以合计为准」
- **receipt-supermarket-ambiguous-cat**：「明细合计 0.00 元与合计 27.40 元不一致，已以合计为准」

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | shopping | 0.95 | 是 | 1868ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 是 | 1438ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 是 | 1868ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1691ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 是 | 1650ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1525ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.98 | 否 | 735ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.98 | 是 | 1289ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1703ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.2 | 是 | 1934ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.95 | 是 | 1981ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 否 | 1583ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.2 | 是 | 2113ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.98 | 是 | 2130ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1093ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 1255ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「纯牛奶条目为合计金额31.00，单价未单独标注」；「会员满减优惠-10.00未计入items」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-clear-noodle**：「小票日期显示为2026-03-02，晚于当前常见日期，请核对是否印刷错误」
- **receipt-pharmacy**：「创可贴条目中的“20片”是规格，数量按1件计」；「小票未显示支付方式」
- **receipt-cafe**：「底部「自带杯可减5元」为提示语，未计入合计」
- **receipt-large-amount**：「日期年份显示为 2026，请确认是否与实际消费时间一致」；「「品名」字样与商品名略有重叠」
- **pay-wechat-drink**：「支付截图未列出商品明细，items 为空」
- **pay-bank-rent**：「此为银行转账成功截图，非消费小票，无商品明细」
- **pay-online-shopping**：「截图为淘宝付款成功页，无商品明细条目」；「商户名称为脱敏占位文字「某旗舰店」，无法确认真实店名」
- **receipt-total-unreadable**：「小票下半部分被遮挡，未见「合计/实付金额」栏，无法确认总价」；「条目数量未标注，默认按1份计」；「图中未读到合计金额，已按明细求和取 33.50 元」
- **receipt-amount-confusion**：「未显示具体商品名称，仅显示原价与优惠金额」
- **receipt-no-total-line**：「「合计」后金额为空白，未打印总计，无法确认实付金额」；「条目不显示数量，qty 按 1 处理」；「图中未读到合计金额，已按明细求和取 10.00 元」
- **pay-multi-amount-coupon**：「商户一栏显示的是「原价 ¥199.00（优惠 ¥50.00）」，未出现实际商户名」；「无消费明细，具体消费类型无法确认」；「付款方式为微信支付，交易时间含秒数 12:33:20」
- **nonbill-cartoon**：「图片是一张卡通插画，不是消费凭证，无法识别任何金额或商户信息」
- **nonbill-landscape**：「图片为风景插画（蓝天、太阳、山丘），不是消费凭证」；「未识别到任何商户、金额或时间信息」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.9 | 是 | 2418ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1085ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1095ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1590ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1329ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.96 | 否 | 934ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 1084ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 是 | 1735ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1642ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.55 | 是 | 9938ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.95 | 是 | 2196ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.93 | 否 | 1645ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.55 | 是 | 3148ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.92 | 是 | 1246ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1258ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1089ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计 86.40 与实付 76.40 相差 10.00（会员满减优惠），已按实付值取数」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，非已抵扣优惠，合计仍按 66.00 取数」
- **pay-bank-rent**：「商户栏显示「房租转账·张房东」，已提取收款人为商户名；该笔为转账，非消费订单，无商品明细」
- **pay-online-shopping**：「商户名仅显示为「某旗舰店」，可能已被脱敏」
- **receipt-total-unreadable**：「图中未见合计/实付金额行，小票下方可能被截断，total 为两项商品金额之和 33.50，仅供参考」
- **receipt-amount-confusion**：「小票仅列原价 249.00、限时折扣 -60.00、会员券 -20.00，未显示具体商品明细，items 留空」；「已取折后实付 169.00，放弃原价合计 249.00」
- **receipt-no-total-line**：「「合计」一行未打印出金额，只能由三项商品相加得出 10.00，可能与实际收款不一致」；「商品数量未标注，均按 1 件计」
- **pay-multi-amount-coupon**：「「商户」一栏未显示商户名称，只显示原价 ¥199.00（优惠 ¥50.00），已按实付 149.00 取数，放弃原价 199.00」
- **nonbill-cartoon**：「画面中只有两个卡通圆脸图案，没有任何金额、商户或时间信息，无法识别为消费凭证」
- **nonbill-landscape**：「画面为山与太阳的简单插画，没有任何金额或消费信息，无法识别为消费凭证」

