# 仓库管理系统

GitHub Pages 前端 + Microsoft 365 Lists 数据 + 同组织共享的 OneDrive for Business 文件夹存储照片。

## 本地运行

安装 Node.js 后，在本目录运行：

```bash
npm install
npm run dev
```

## Microsoft 365 准备

1. 在 Microsoft Entra 管理中心注册“单页应用（SPA）”，账号类型选择本组织。登记本地重定向 URI `http://localhost:5173/`；发布后补充 GitHub Pages 的完整网址。前端只使用 Application (client) ID 和 Directory (tenant) ID，不使用 client secret。
2. 为应用添加 Microsoft Graph **委托权限**：`User.Read`、`Sites.ReadWrite.All`、`Files.ReadWrite.All`。管理员需按组织政策授予同意。
3. 在同一个 SharePoint 站点创建两个 Microsoft Lists，字段内部名称按下表建立。Lists 默认的 `Title` 字段保留。
4. 在一个工作账号的 OneDrive for Business 创建照片文件夹，并向系统使用者授予编辑权限。将该文件夹的 Drive ID 和 Item ID 填进应用设置。每位用户都用自己的组织账号登录。
5. 在应用“连接设置”填写 Tenant ID、Client ID、Site ID、两个 List ID、Drive ID、照片文件夹 Item ID。设置只保存在当前浏览器，**不包含密钥**。

### 物品台账 List

| 内部名称 | 类型 | 用途 |
| --- | --- | --- |
| Title | 单行文本 | 物品名称 |
| SKU | 单行文本 | 物品编号，建议唯一 |
| Category | 单行文本 | 类别 |
| Unit | 单行文本 | 单位 |
| Location | 单行文本 | 存放位置 |
| MinStock | 数字 | 库存下限 |
| PhotoDriveId | 单行文本 | 照片所在 Drive ID |
| PhotoItemId | 单行文本 | 照片文件 Item ID |
| Note | 多行文本 | 备注 |

### 出入库记录 List

| 内部名称 | 类型 | 用途 |
| --- | --- | --- |
| Title | 单行文本 | 记录标题 |
| ItemId | 单行文本 | 物品 List Item ID |
| Type | 单行文本 | `IN` 或 `OUT` |
| Quantity | 数字 | 正数数量 |
| OccurredAt | 日期和时间 | 操作时间 |
| Operator | 单行文本 | 操作人 |
| Note | 多行文本 | 备注 |

库存由记录汇总计算，不单独维护可被手工改写的库存数字。初始库存请录入一笔“入库”。

## 发布到 GitHub Pages

建立 GitHub 仓库后，提交本目录文件。在 GitHub Actions 中执行 `npm ci`、`npm run build`，将 `dist` 发布到 Pages。发布后的完整页面 URL 必须加入 Entra 应用的 SPA 重定向 URI。GitHub Pages 只发布前端文件，物品数据和照片不会写入仓库。

## 当前边界

这是可连接的首版，尚未经过真实 Microsoft 365 租户联调。多人同时出库时，纯浏览器加 Lists 无法保证原子性；上线前应增加服务端或自动化流程统一校验库存，或明确采用人工复核。个人工作 OneDrive 文件夹由所有者维护，若所有者账号停用，照片访问会受影响。
