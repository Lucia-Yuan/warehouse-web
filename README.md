# 仓库资产管理系统

公开的 GitHub Pages 页面 + Microsoft 365 Lists 数据 + 同组织共享的 OneDrive for Business 文件夹存储照片。

- 仓库代码：https://github.com/Lucia-Yuan/warehouse-web
- 页面：https://lucia-yuan.github.io/warehouse-web/

页面不保存库存数据、照片、密码或应用密钥。每位使用者通过自己的 Microsoft 365 工作账号登录。

## 资产台账字段

| 页面字段 | Microsoft List 内部名称 | 类型 |
| --- | --- | --- |
| 资产名称 | Title | 单行文本（Lists 默认字段） |
| 状态 | Status | 单行文本 |
| 入库日期 | InboundDate | 日期 |
| 管理部门 | Department | 单行文本 |
| 单价 | UnitPrice | 数字，保留两位小数 |
| 价值 | 不单独存储 | 单价 × 当前库存，页面自动计算 |
| 资产类型 | AssetType | 单行文本 |
| 存放地点 | Location | 单行文本 |
| 管理人 | Manager | 单行文本 |
| 价值类型 | ValueType | 单行文本 |
| 照片 Drive ID | PhotoDriveId | 单行文本（内部字段） |
| 照片文件 ID | PhotoItemId | 单行文本（内部字段） |

资产台账内不单独保存库存数量。新建资产时可登记初始入库数量，之后由出入库记录汇总当前库存。

## 出入库记录 List

| 内部名称 | 类型 | 用途 |
| --- | --- | --- |
| Title | 单行文本 | 记录标题 |
| ItemId | 单行文本 | 资产 List Item ID |
| Type | 单行文本 | `IN` 或 `OUT` |
| Quantity | 数字 | 正数数量 |
| OccurredAt | 日期和时间 | 操作时间 |
| Operator | 单行文本 | 操作人 |
| Note | 多行文本 | 备注 |

## Microsoft 365 接入

1. 在 Microsoft Entra 注册本组织使用的单页应用（SPA）。登记本地重定向 URI `http://localhost:5173/` 和线上地址 `https://lucia-yuan.github.io/warehouse-web/`。前端只用 Client ID 和 Tenant ID，不使用 client secret。
2. 为应用添加 Microsoft Graph 委托权限：`User.Read`、`Sites.ReadWrite.All`、`Files.ReadWrite.All`。如组织策略要求，由管理员批准。
3. 在一个 SharePoint 站点建立资产台账和出入库记录两个 Microsoft Lists，内部名称按上表设置。
4. 在工作 OneDrive 创建照片文件夹，并给系统使用者编辑权限。页面设置需要该文件夹的 Drive ID 与 Item ID。
5. 在页面“连接设置”中填写 Tenant ID、Client ID、Site ID、两个 List ID、Drive ID 和照片文件夹 Item ID。这些资源标识只保存在当前浏览器，不是密钥。

## 本地运行

安装 Node.js 后：

```bash
pnpm install
pnpm run dev
```

## 发布

推送到 `main` 分支后，GitHub Actions 构建并发布 `dist` 到 GitHub Pages。

## 使用边界

真实 Microsoft 365 租户尚需完成授权和联调。多人同时出库时，浏览器端检查无法保证原子性；正式启用并发出库前，需要增加统一的服务端或自动化流程校验。照片文件夹由 OneDrive 所有者维护，所有者账号停用会影响照片访问。
