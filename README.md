# 仓库资产管理系统

公开的 GitHub Pages 页面 + Microsoft 365 Lists 数据 + 同组织共享的 OneDrive for Business 文件夹存储照片。

- 仓库代码：https://github.com/Lucia-Yuan/warehouse-web
- 页面：https://lucia-yuan.github.io/warehouse-web/
- 独立快速录入页面：https://lucia-yuan.github.io/warehouse-web/key-in.html

页面不保存库存数据、照片、密码或应用密钥。每位使用者通过自己的 Microsoft 365 工作账号登录。

## 快速录入 Key In

快速录入是独立清单，当前不写入资产台账，也不计算库存。录入页只要求一张照片、正整数数量和位置。位置可填仅含大写英文字母及数字的编码（如 `A12`），或不含英文字母的中文描述（如 `地下仓库一层`）。录入页会校验此规则；直接在 Microsoft Lists 中编辑时，需由管理员另行核对。

照片上传到工作 OneDrive 的共享文件夹；清单保存数量、位置、照片文件 ID 和照片地址。清单视图只显示照片、数量、位置。以后可增加 AI 根据照片生成贴切的中文物品名称，再经人工确认后转入正式台账；这两步当前未启用。

快速录入页面单独保存连接设置，使用与主台账相同的工作账号，但不依赖主台账的清单 ID。首次使用需填写 Tenant ID、SPA Client ID、站点 ID、快速录入清单 ID、OneDrive Drive ID、照片文件夹 Item ID。

## 资产台账字段

| 页面字段 | Microsoft List 内部名称 | 类型 |
| --- | --- | --- |
| 资产名称 | Title | 单行文本（Lists 默认字段） |
| 资产编号 | AssetCode | 唯一单行文本；创建后自动生成，不可手动修改 |
| 状态 | Status | 单行文本 |
| 入库日期 | InboundDate | 日期 |
| 管理部门 | Department | 单行文本 |
| 单价 | UnitPrice | 数字，保留两位小数 |
| 价值 | 不单独存储 | 单价 × 当前库存，页面自动计算 |
| 资产类型 | AssetType | 单行文本 |
| 存放地点 | Location | 单行文本 |
| 管理人 | Manager | 单行文本 |
| 价值类型 | ValueType | 单行文本 |
| 备注 | Remark | 多行文本 |
| 照片 Drive ID | PhotoDriveId | 单行文本（内部字段） |
| 照片文件 ID | PhotoItemId | 单行文本（内部字段） |

资产编号采用 `YYYYMMDD` + 最少 8 位的 Microsoft List 内置递增 ID，例如 `2026112500000001`。日期取资产创建时的中国时间，编号创建后保持不变；内置 ID 保证每条记录的编号不同。资产台账内不单独保存库存数量。新建资产时可登记初始入库数量，之后由出入库记录汇总当前库存。

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

1. 在 Microsoft Entra 注册本组织使用的单页应用（SPA）。登记本地重定向 URI `http://localhost:5173/`、`http://localhost:5173/key-in.html`，以及线上地址 `https://lucia-yuan.github.io/warehouse-web/`、`https://lucia-yuan.github.io/warehouse-web/key-in.html`。前端只用 Client ID 和 Tenant ID，不使用 client secret。
2. 为应用添加 Microsoft Graph 委托权限：`User.Read`、`Sites.ReadWrite.All`、`Files.ReadWrite.All`。如组织策略要求，由管理员批准。
3. 资产台账和出入库记录两个 Microsoft Lists 已在组织的 Operations 站点建立，字段按上表设置。
4. 工作 OneDrive 的照片文件夹已建立。取得使用者邮箱后，需给这些人编辑权限。页面设置需要该文件夹的 Drive ID 与 Item ID。
5. 在页面“连接设置”中填写 Tenant ID、Client ID、Site ID、两个 List ID、Drive ID 和照片文件夹 Item ID。这些资源标识只保存在当前浏览器，不是密钥；具体数值保存在本机的连接信息文件中，不提交到公开仓库。
6. 如只允许固定人员使用，管理员应在企业应用中启用“需要分配用户”，并分配这些用户；同时核对他们对两个 Lists 和照片文件夹的权限。

## 本地运行

安装 Node.js 后：

```bash
pnpm install
pnpm run dev
```

## 发布

推送到 `main` 分支后，GitHub Actions 构建并发布 `dist` 到 GitHub Pages。

## 使用边界

Microsoft 365 清单和照片文件夹已建立，登录应用注册、固定人员授权和浏览器端联调尚未完成。多人同时出库时，浏览器端检查无法保证原子性；正式启用并发出库前，需要增加统一的服务端或自动化流程校验。照片文件夹由 OneDrive 所有者维护，所有者账号停用会影响照片访问。
