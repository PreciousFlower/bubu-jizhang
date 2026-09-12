# 识别精度迭代记录 · hard-cases

- 时间：2026-09-12T07:33:34.574Z
- 夹具：fixtures/bills（14 张：账单 12、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 0/11 = 0.0% | 11/11 = 100.0% | 11/11 = 100.0% |
| 分类正确率 | 0/11 = 0.0% | 10/11 = 90.9% | 11/11 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 1/1 | 1/1 | 1/1 |
| 需人工确认占比 | 100.0% | 71.4% | 64.3% |
| 平均耗时 | 1998ms | 1708ms | 1584ms |
| 最慢耗时 | 4066ms | 2573ms | 2454ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 1717ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | null | other | other | 0.1 | 是 | 1289ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | other | other | 0.5 | 是 | 2269ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 4066ms | ❌ |
| receipt-large-amount | bill | ¥2998 | null | other | other | 0.1 | 是 | 1424ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 2150ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 1627ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 1753ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 1377ms | ❌ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | other | other | 0.5 | 是 | 1439ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | other | other | 0.5 | 是 | 3212ms | ❌ |
| pay-multi-amount-coupon | bill | ¥149 | null | other | other | 0.1 | 是 | 2322ms | ❌ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 1213ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 2115ms | ✅ |

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | shopping | 0.95 | 否 | 1779ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1234ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1397ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1362ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1743ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1653ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.98 | 是 | 1243ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.97 | 是 | 2573ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.97 | 是 | 1400ms | ✅ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | paper_receipt | food | 0.95 | 是 | 1683ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.2 | 是 | 2451ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.95 | 是 | 1770ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1413ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 2217ms | ✅ |

### 模型给出的 warnings

- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，未计入合计」
- **pay-wechat-drink**：「截图为支付成功页，无商品明细，未列出 items」
- **pay-alipay-taxi**：「截图仅显示支付总额，无具体消费明细条目」
- **pay-bank-rent**：「商户名为转账备注“房租转账·张房东”，非标准商户名称」；「截图未显示具体月份房租或租期信息」
- **pay-online-shopping**：「商户名仅显示为「某旗舰店」，未给出完整店铺名称」；「订单页未展示商品明细，items 为空」
- **receipt-blurry-total**：「票据未标注各条目数量，qty 按 1 条记录」；「日期年份显示为 2026，以图片为准」
- **receipt-no-total-line**：「合计一栏为空白，未打印总金额」；「总金额无法确认，未自行累加」；「商品数量未标注，按1份记录」；「图中未读到合计金额，已按明细求和取 10.00 元」
- **pay-multi-amount-coupon**：「商户一栏显示的是原价与优惠金额，未提供商户名称」；「消费内容未知，品类按美团常见外卖/餐饮推测，仅供参考」
- **nonbill-cartoon**：「图片为卡通插画，不含任何消费凭证信息」
- **nonbill-landscape**：「图片是简笔风景插画（太阳、山、地面），不是消费凭证，无法识别任何金额或商户信息」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.9 | 是 | 2454ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 953ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1410ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1446ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 是 | 1840ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.97 | 否 | 951ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 1241ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 是 | 2239ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1026ms | ✅ |
| receipt-blurry-total | bill/边界 | （边界） | ¥33.5 | paper_receipt | food | 0.95 | 否 | 1624ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.68 | 是 | 2230ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.95 | 是 | 2188ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1393ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1179ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计 86.40 与实付 76.40 相差 10.00（会员满减优惠），已按实付金额取数」；「纯牛奶行标注 250ml*2，但金额 31.00 视为该行小计」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，未在合计中扣除，未计入 total」
- **receipt-large-amount**：「延保服务 299.00 计入实付金额，若只想记家电本身可只取 2699.00」
- **pay-bank-rent**：「这是银行转账成功页而非消费订单页，商户名取自「房租转账·张房东」，按房租归入居家水电」
- **pay-online-shopping**：「商户名仅显示为「某旗舰店」，无法确认具体店铺名称」
- **receipt-no-total-line**：「「合计」一行没有打印金额，total 由三项商品金额（3.50+4.00+2.50）加总得出，可能与实际合计略有差异」
- **pay-multi-amount-coupon**：「图中有原价 ¥199.00、优惠 ¥50.00、实付 ¥149.00 三个金额，已取实付值 149，放弃原价与优惠额」；「商户栏未显示具体商户名，仅按页面顶部品牌记为「美团」」
- **nonbill-cartoon**：「画面为两个圆形卡通笑脸插画，没有任何金额信息，无法识别为消费凭证」
- **nonbill-landscape**：「画面为风景插画（天空、太阳、山丘），没有任何金额或消费信息，无法识别为消费凭证」

