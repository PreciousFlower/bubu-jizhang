# 界面与端到端验证记录

- 时间：2026-09-12T12:43:03.300Z
- 目标：http://127.0.0.1:5273
- 浏览器：C:\Program Files\Google\Chrome\Application\chrome.exe
- 视口：430×932（移动端）deviceScaleFactor=2

## 逐页结果

| 环节 | 结果 | 截图 |
|---|---|---|
| 01-home | ✅ 通过 | `logs/shots/01-home.png` |
| 02-add | ✅ 通过 | `logs/shots/02-add.png` |
| 03-scan | ✅ 通过 | `logs/shots/03-scan.png` |
| 04-stats | ✅ 通过 | `logs/shots/04-stats.png` |
| 05-settings | ✅ 通过 | `logs/shots/05-settings.png` |
| 06-contact-sheet | ✅ 通过 | `logs/shots/06-contact-sheet.png` |
| 07-scan-picked | ✅ 通过 | `logs/shots/07-scan-picked.png` |

## 首页检查

- 出现「本月结余」：是
- 出现「预算」：是
- 页面上 img 总数：49，其中 /bubu/ 贴图：49
- **破图数量：0**

## 设置页检查

- 识别服务显示已配置：是
- 版权声明可见：是

## 贴图预览墙

- 图片数：211，成功加载：12，加载失败：0

## 端到端（上传小票 → 识别 → 入账）

- 结果：✅ 通过
- 识别后金额输入框的值：`28.00`
- 结果页展示了「AI 读到的」还原按钮：是
- 结果页展示了把握度：是
- 已真实落库：`¥28.00` / 商户「兰州牛肉面（人民路店）」/ 分类 food / 来源 photo
- 该笔在首页列表可见：是
- 截图：`logs/shots/08-scan-result.png`（识别结果页）、`logs/shots/09-after-save.png`（入账后）

## console 报错

无 ✅

## 未捕获异常

无 ✅

## 失败请求

无 ✅
