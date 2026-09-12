# 识别精度迭代记录 · 第三轮-难样本

- 时间：2026-09-12T07:35:29.439Z
- 夹具：fixtures/bills（16 张：账单 14、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 1/14 = 7.1% | 14/14 = 100.0% | 13/14 = 92.9% |
| 分类正确率 | 0/14 = 0.0% | 13/14 = 92.9% | 13/14 = 92.9% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 0/0 | 0/0 | 0/0 |
| 需人工确认占比 | 100.0% | 81.3% | 62.5% |
| 平均耗时 | 2084ms | 1563ms | 1700ms |
| 最慢耗时 | 3209ms | 2008ms | 3305ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 1064ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | other | other | 0.5 | 是 | 1574ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | null | other | other | 0.1 | 是 | 1875ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 2846ms | ❌ |
| receipt-large-amount | bill | ¥2998 | null | other | other | 0.1 | 是 | 2094ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 1240ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 2496ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 2932ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 1687ms | ❌ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | other | other | 0.5 | 是 | 2481ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | null | other | other | 0.1 | 是 | 3209ms | ❌ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | other | other | 0.5 | 是 | 1681ms | ❌ |
| receipt-no-total-line | bill | ¥10 | null | other | other | 0.1 | 是 | 1409ms | ❌ |
| pay-multi-amount-coupon | bill | ¥149 | null | other | other | 0.1 | 是 | 2539ms | ❌ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2046ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2178ms | ✅ |

### 模型给出的 warnings

- **receipt-clear-noodle**：「明细合计 0.00 元与合计 28.00 元不一致，已以合计为准」

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | shopping | 0.95 | 是 | 1772ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.97 | 否 | 1147ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 是 | 1697ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1528ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1437ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1934ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 是 | 1001ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.98 | 是 | 1749ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1497ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.95 | 是 | 1488ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.97 | 是 | 1548ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 否 | 1586ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.2 | 是 | 1865ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.95 | 是 | 2008ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1782ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 969ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「纯牛奶单价未单独标注，31.00 为两盒合计小计」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-pharmacy**：「小票日期显示为2026-01-19，为图片原有内容，未做修改」；「创可贴条目未标明单价数量，数量按1记录」
- **receipt-cafe**：「小票日期显示为2026-03-08，疑似未来日期或年份有误」；「未显示支付方式与优惠政策，底部‘自带杯可减5元’未体现在合计中」
- **pay-wechat-drink**：「截图为支付成功页，无商品明细，items 为空」
- **pay-alipay-taxi**：「截图仅显示支付总额，无具体消费明细条目」
- **pay-bank-rent**：「收款方为个人房东，无具体商户名称」；「转账用途仅凭备注推断为房租」
- **pay-online-shopping**：「未显示具体商品明细，无法拆分条目」；「商户名为脱敏信息「某旗舰店」，仅有淘宝平台名与订单号」
- **receipt-total-unreadable**：「表头「品名」文字与上方内容略有重叠」；「条目未标注数量，默认按 1 份计」
- **receipt-amount-confusion**：「小票只显示原价、折扣和会员券金额，没有具体商品名称，故未列出条目」
- **receipt-no-total-line**：「「合计」一行没有打印金额，实付总额无法确认」；「三个条目相加为 10.00 元，但小票未显示合计值，未作为 total 输出」；「图中未读到合计金额，已按明细求和取 10.00 元」
- **pay-multi-amount-coupon**：「商户一栏显示的是原价与优惠金额，未显示具体商户名称」；「美团订单类型不明确，分类为餐饮仅作推测」；「无消费明细条目」
- **nonbill-cartoon**：「图片为卡通插画，不是消费凭证，无任何金额或商户信息」
- **nonbill-landscape**：「图片为风景插画，没有任何消费凭证信息」；「未检测到商户名、金额、日期等记账要素」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.9 | 是 | 1831ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1427ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1561ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 2012ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | home | 0.95 | 否 | 975ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.96 | 否 | 756ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 1369ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 是 | 1474ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1738ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.95 | 否 | 1386ms | ❌ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.95 | 是 | 1856ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.93 | 是 | 2240ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.68 | 是 | 3043ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.97 | 是 | 3305ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1129ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1093ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计 86.40 与实付 76.40 相差 10.00（会员满减优惠 -10.00），已按实付值 76.40 取数」；「明细合计 70.90 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，非已发生的优惠，未从合计中扣减」
- **pay-bank-rent**：「转账附言显示为「房租转账·张房东」，已按居家/房租归类，如有更合适类别可手动调整」
- **pay-online-shopping**：「商户名仅显示为「某旗舰店」，信息不完整」；「图中无商品明细，无法拆分条目」
- **receipt-amount-confusion**：「图中有原价 249.00、限时折扣 -60.00、会员券 -20.00、实付 169.00 多个金额，已按实付值 169.00 取数，未采用原价合计 249.00」；「单据未列出具体商品名称，items 留空」
- **receipt-supermarket-ambiguous-cat**：「小票未单独标注实付/找零行，已按「合计 27.40」作为 total，三项商品金额之和与合计一致」
- **receipt-no-total-line**：「「合计」一行未显示金额，total 由三项商品金额相加得出（3.50+4.00+2.50=10.00），非票面直接读取」
- **pay-multi-amount-coupon**：「商户栏只显示「原价 ¥199.00（优惠 ¥50.00）」，未出现具体商户名称，已按实付 ¥149.00 取数，放弃原价 199 与优惠 50」；「页面未列出具体商品明细，消费类型按美团平台常见场景推测为餐饮」
- **nonbill-cartoon**：「画面是卡通圆形笑脸插画，没有任何金额信息，无法识别为消费凭证」
- **nonbill-landscape**：「画面为风景插画（山、太阳、天空），没有任何金额信息，无法识别为消费凭证」

