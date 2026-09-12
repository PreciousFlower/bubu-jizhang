# 识别精度迭代记录 · 部署前最终复验

- 时间：2026-09-12T11:33:52.549Z
- 夹具：fixtures/bills（16 张：账单 14、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v1 | v2 | v3 |
|---|---|---|---|
| 金额完全正确率 | 0/14 = 0.0% | 14/14 = 100.0% | 14/14 = 100.0% |
| 分类正确率 | 0/14 = 0.0% | 13/14 = 92.9% | 14/14 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% | 0/2 = 0.0% | 0/2 = 0.0% |
| 边界样本通过 | 0/0 | 0/0 | 0/0 |
| 需人工确认占比 | 100.0% | 75.0% | 62.5% |
| 平均耗时 | 1985ms | 1719ms | 1757ms |
| 最慢耗时 | 4515ms | 2772ms | 4140ms |
| 调用失败数 | 0 | 0 | 0 |

## prompt v1 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | null | other | other | 0.1 | 是 | 985ms | ❌ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | other | other | 0.5 | 是 | 976ms | ❌ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | other | other | 0.5 | 是 | 999ms | ❌ |
| receipt-cafe | bill | ¥66 | ¥66 | other | other | 0.5 | 是 | 2147ms | ❌ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | other | other | 0.5 | 是 | 853ms | ❌ |
| pay-wechat-drink | bill | ¥18 | null | other | other | 0.1 | 是 | 1566ms | ❌ |
| pay-alipay-taxi | bill | ¥34.5 | null | other | other | 0.1 | 是 | 1238ms | ❌ |
| pay-bank-rent | bill | ¥1500 | null | other | other | 0.1 | 是 | 1678ms | ❌ |
| pay-online-shopping | bill | ¥199 | null | other | other | 0.1 | 是 | 2363ms | ❌ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | null | other | other | 0.1 | 是 | 3034ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | null | other | other | 0.1 | 是 | 3397ms | ❌ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | other | other | 0.5 | 是 | 1396ms | ❌ |
| receipt-no-total-line | bill | ¥10 | ¥10 | other | other | 0.5 | 是 | 4515ms | ❌ |
| pay-multi-amount-coupon | bill | ¥149 | null | other | other | 0.1 | 是 | 3236ms | ❌ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.1 | 是 | 1972ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.1 | 是 | 1400ms | ✅ |

### 模型给出的 warnings

- **receipt-pharmacy**：「明细合计 0.00 元与合计 45.20 元不一致，已以合计为准」

## prompt v2 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | shopping | 0.95 | 是 | 2772ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.97 | 否 | 1284ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 是 | 2019ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1676ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1738ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.98 | 是 | 1728ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.98 | 否 | 988ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.97 | 是 | 1507ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.97 | 是 | 1593ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.2 | 是 | 2129ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.95 | 是 | 1803ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 否 | 1681ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.15 | 是 | 2378ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.95 | 是 | 1736ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0 | 是 | 1414ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0 | 是 | 1056ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「纯牛奶标注 250ml*2，规格与数量按一项记录」；「会员满减优惠 -10.00 已计入实付金额，未作为单独条目列出」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-pharmacy**：「小票条目行缺少数量列，创可贴数量按名称中“20片”理解」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，未体现在合计中」；「未见优惠或折扣信息」
- **pay-wechat-drink**：「支付截图未列出具体消费条目，items 为空」
- **pay-bank-rent**：「无消费明细，仅一笔转账金额」；「商户名称为转账备注，实际收款方为个人「张房东」」
- **pay-online-shopping**：「凭证未显示具体商品明细，无法列出条目」；「商户名称为脱敏的「某旗舰店」，非完整商户全称」
- **receipt-total-unreadable**：「小票下半部分被遮挡，未见「合计/实付金额」行，总计无法确认」；「条目数量与单价明细未显示，qty 按 1 估算」；「图中未读到合计金额，已按明细求和取 33.50 元」
- **receipt-amount-confusion**：「品名栏为空，未显示具体商品名称」；「仅识别到金额行，原价合计249.00为折前总额」
- **receipt-no-total-line**：「合计金额栏为空白，未打印总计数字」；「条目小计相加为 10.00 元，但小票未显示合计，故 total 填 null」；「各条目数量未标注，默认按 1 计」；「图中未读到合计金额，已按明细求和取 10.00 元」
- **pay-multi-amount-coupon**：「「商户」一栏只显示原价与优惠信息，未显示商户名称」；「消费内容不明确，默认为美团餐饮，实际类别可能不同」
- **nonbill-cartoon**：「图片是卡通插画，不是消费凭证，没有金额、商户或时间信息」
- **nonbill-landscape**：「图片是风景插画（天空、太阳、山峰），不是消费凭证」；「无法识别到任何商户、金额或时间信息」

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.95 | 是 | 1523ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1187ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1290ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1218ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1345ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.97 | 否 | 986ms | ✅ |
| pay-alipay-taxi | bill | ¥34.5 | ¥34.5 | payment_screenshot | transport | 0.97 | 否 | 843ms | ✅ |
| pay-bank-rent | bill | ¥1500 | ¥1500 | payment_screenshot | home | 0.95 | 是 | 1662ms | ✅ |
| pay-online-shopping | bill | ¥199 | ¥199 | payment_screenshot | shopping | 0.95 | 是 | 1452ms | ✅ |
| receipt-total-unreadable | bill/模糊 | ¥33.5 | ¥33.5 | paper_receipt | food | 0.5 | 是 | 3436ms | ✅ |
| receipt-amount-confusion | bill | ¥169 | ¥169 | paper_receipt | shopping | 0.93 | 是 | 3044ms | ✅ |
| receipt-supermarket-ambiguous-cat | bill | ¥27.4 | ¥27.4 | paper_receipt | food | 0.95 | 否 | 1617ms | ✅ |
| receipt-no-total-line | bill | ¥10 | ¥10 | paper_receipt | food | 0.55 | 是 | 4140ms | ✅ |
| pay-multi-amount-coupon | bill | ¥149 | ¥149 | payment_screenshot | food | 0.95 | 是 | 2257ms | ✅ |
| nonbill-cartoon | nonbill | 非账单 | null | other | other | 0.05 | 是 | 1185ms | ✅ |
| nonbill-landscape | nonbill | 非账单 | null | other | other | 0.05 | 是 | 933ms | ✅ |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品为 23.40+31.00+32.00=86.40，与实付 76.40 相差 10.00（会员满减），已按实付值取数」；「明细合计 70.90 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示文案，未计入合计，实付以合计 66.00 为准」
- **pay-bank-rent**：「该凭证为银行转账成功页，商户显示为「房租转账·张房东」，归类为居家（房租）」
- **pay-online-shopping**：「商户名称为「某旗舰店」，未显示具体店铺名称，也无商品明细」
- **receipt-total-unreadable**：「小票下方被遮挡，未见合计/实付行，33.50 为可见两条商品金额之和，可能不完整」；「若实际存在未显示的合计行，请以小票合计为准」
- **receipt-amount-confusion**：「图中同时出现原价 249.00、限时折扣 -60.00、会员券 -20.00 与实付 169.00，已取折后实付 169.00，放弃原价及优惠金额」；「小票未列出具体商品明细，仅有一行原价合计，故 items 留空」
- **receipt-no-total-line**：「「合计」一行金额为空白，无法直接读取总计」；「总计系按商品明细求和得出（3.50+4.00+2.50=10.00），可能存在未显示的优惠或抹零」
- **pay-multi-amount-coupon**：「商户一行显示的是「原价 ¥199.00（优惠 ¥50.00）」，未出现真实商户名称，故 merchant 留空」；「图中有原价199、优惠50、实付149三个金额，已取实付值149，放弃原价与优惠额」；「优惠后可能含其他类目（美团通用），分类按外卖/餐饮猜测，仅供参考」
- **nonbill-cartoon**：「画面中没有任何金额信息，只是两个卡通圆脸的插画，无法识别为消费凭证」
- **nonbill-landscape**：「画面为天空、太阳和山丘的简单插画，没有任何金额或消费信息，无法识别为消费凭证」

