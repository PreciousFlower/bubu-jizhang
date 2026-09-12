# 识别精度迭代记录 · 部署前复验

- 时间：2026-09-12T11:30:07.968Z
- 夹具：fixtures/bills（16 张：账单 14、非账单 2）
- 评测接口：http://127.0.0.1:8787/api/vision/recognize（真实链路，含图片归一化 + 金额对账）
- 金额判对容差：±0.01 元

## 指标对比

| 指标 | v3 |
|---|---|
| 金额完全正确率 | 6/14 = 42.9% |
| 分类正确率 | 6/14 = 100.0% |
| 非账单误判率（越低越好） | 0/2 = 0.0% |
| 边界样本通过 | 0/0 |
| 需人工确认占比 | 12.5% |
| 平均耗时 | 1446ms |
| 最慢耗时 | 1977ms |
| 调用失败数 | 10 |

## prompt v3 逐张明细

| 夹具 | 类型 | 期望金额 | 识别金额 | 文档类型 | 分类 | 置信度 | 需复核 | 耗时 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| receipt-supermarket-discount | bill | ¥76.4 | ¥76.4 | paper_receipt | food | 0.9 | 是 | 1563ms | ✅ |
| receipt-clear-noodle | bill | ¥28 | ¥28 | paper_receipt | food | 0.95 | 否 | 1114ms | ✅ |
| receipt-pharmacy | bill | ¥45.2 | ¥45.2 | paper_receipt | health | 0.95 | 否 | 1286ms | ✅ |
| receipt-cafe | bill | ¥66 | ¥66 | paper_receipt | drink | 0.95 | 是 | 1502ms | ✅ |
| receipt-large-amount | bill | ¥2998 | ¥2998 | paper_receipt | shopping | 0.95 | 否 | 1977ms | ✅ |
| pay-wechat-drink | bill | ¥18 | ¥18 | payment_screenshot | drink | 0.97 | 否 | 1231ms | ✅ |
| pay-alipay-taxi | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| pay-bank-rent | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| pay-online-shopping | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| receipt-total-unreadable | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| receipt-amount-confusion | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| receipt-supermarket-ambiguous-cat | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| receipt-no-total-line | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| pay-multi-amount-coupon | bill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| nonbill-cartoon | nonbill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |
| nonbill-landscape | nonbill | - | - | - | - | - | - | - | ❌ 识别太频繁啦，休息一下～ 每分钟最多 6 次 |

### 模型给出的 warnings

- **receipt-supermarket-discount**：「商品小计 86.40 与实付 76.40 相差 10.00，已按实付金额取数」；「明细合计 86.40 元与合计 76.40 元不一致，已以合计为准」
- **receipt-cafe**：「底部「自带杯可减 5 元」为提示语，非已生效优惠，未计入合计」

