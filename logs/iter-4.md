# 识别精度迭代记录 · 最终轮-含真拒答样本

- 时间：2026-09-12T07:37:06.368Z
- 夹具：fixtures/bills（16 张：账单 14、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 0/14 = 0.0% | 13/14 = 92.9% | 13/14 = 92.9% |
| 分类正确率 | 0/14 = 0.0% | 13/14 = 92.9% | 14/14 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 0/0 | 0/0 | 0/0 |
| 需人工确认占比 | 100.0% | 75.0% | 50.0% |
| 平均耗时 | 1832ms | 1741ms | 1508ms |
| 最慢耗时 | 3972ms | 3131ms | 2834ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 1752ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | other | other | 0.5 | 是 | 1217ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | other | other | 0.5 | 是 | 2641ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 2217ms | ❌ |
| receipt-large-amount | bill | ¥2998 | null | other | other | 0.1 | 是 | 1203ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 1265ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 1096ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 1999ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 1132ms | ❌ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | null | other | other | 0.1 | 是 | 3972ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | null | other | other | 0.1 | 是 | 1427ms | ❌ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | null | other | other | 0.1 | 是 | 1230ms | ❌ |
| receipt-no-total-line | bill | ¥10 | ¥10 | other | other | 0.5 | 是 | 1968ms | ❌ |
| pay-multi-amount-coupon | bill | ¥149 | null | other | other | 0.1 | 是 | 1618ms | ❌ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 1602ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2978ms | ✅ |

### 模型给出的 warnings

- **receipt-clear-noodle**：「明细合计 0.00 元与合计 28.00 元不一致，已以合计为准」

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | shopping | 0.95 | 是 | 1921ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1408ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 2150ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1842ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | home | 0.95 | 否 | 1143ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1664ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.98 | 是 | 1522ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 是 | 1500ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.97 | 是 | 1952ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.95 | 否 | 1306ms | ❌ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.96 | 是 | 1664ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 是 | 2258ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.2 | 是 | 3131ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.98 | 是 | 1930ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1093ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 1371ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「小计86.40未被计入items，仅列明细与优惠」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，未计入合计」
- **pay-wechat-drink**：「截图为支付成功页，未列出具体消费条目」
- **pay-alipay-taxi**：「为支付成功截图，无具体消费条目明细」
- **pay-bank-rent**：「收款方为「房租转账·张房东」，按房租归入居家类别；如为转租/代付请自行调整」
- **pay-online-shopping**：「未显示商品明细，无法拆分条目」；「商户名为脱敏名称「某旗舰店」」
- **receipt-amount-confusion**：「小票未列明具体商品名称，仅有原价与优惠金额，故 items 为空」；「限时折扣与会员券为优惠项，未计入 items」
- **receipt-supermarket-ambiguous-cat**：「小票未标注实付/支付方式，合计即总计」；「“品名”“金额”表头与第一行商品文字略有重叠」
- **receipt-no-total-line**：「「合计」后没有任何金额，总计数字缺失，无法确认实付金额」；「条目数量均为1是推测，小票未标注数量」；「图中未读到合计金额，已按明细求和取 10.00 元」
- **pay-multi-amount-coupon**：「商户行只显示原价与优惠信息，未显示具体商户名称」；「无消费明细条目，无法拆分单品」
- **nonbill-cartoon**：「图片是卡通插画，不是消费凭证」；「未发现任何金额、商户或时间信息」
- **nonbill-landscape**：「图片是风景插画（太阳和山），不是消费凭证，无法识别任何金额或商户信息」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.82 | 是 | 2519ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1407ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1298ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1568ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1699ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.97 | 否 | 1044ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 1368ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 否 | 1033ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1385ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.95 | 否 | 1340ms | ❌ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.93 | 是 | 1267ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 否 | 1485ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.6 | 是 | 2834ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.94 | 是 | 1655ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1292ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 927ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计合计 86.40 与实付 76.40 相差 10.00（会员满减优惠），已按实付值取数」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部“自带杯可减 5 元”为未生效的优惠提示，合计 66.00 未扣减，故按 66.00 取数」
- **pay-online-shopping**：「商户名显示为「某旗舰店」，未包含具体店铺名称」
- **receipt-amount-confusion**：「图中有原价 249.00 与优惠（限时折扣 -60.00、会员券 -20.00），已取折后实付 169.00，未采用原价 249.00」；「未列出具体商品明细，故 items 为空」
- **receipt-no-total-line**：「小票「合计」一行没有显示金额，total 由三项商品明细相加得出（3.50+4.00+2.50=10.00）」
- **pay-multi-amount-coupon**：「金额区有原价 199.00 / 优惠 50.00 / 实付 149.00，已按实付值 149.00 取数，放弃原价与优惠额」；「商户栏未显示具体商户名，仅识别到平台名「美团」」
- **nonbill-cartoon**：「画面为卡通插画，没有任何金额信息，无法识别为消费凭证」
- **nonbill-landscape**：「画面是一张风景插画（太阳、山、天空），没有任何金额信息，无法识别为消费凭证」

