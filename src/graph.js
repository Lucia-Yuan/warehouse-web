import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

const KEY = "warehouse-web-config-v1";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["User.Read", "Sites.ReadWrite.All", "Files.ReadWrite.All"];
let app = null;
let activeConfig = null;

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { return {}; }
}
export function saveConfig(config) {
  localStorage.setItem(KEY, JSON.stringify(config));
  app = null;
  activeConfig = null;
}
export function isConfigured(config = getConfig()) {
  return ["tenantId", "clientId", "siteId", "itemsListId", "movementsListId", "driveId", "photoFolderId"]
    .every((key) => Boolean(config[key]?.trim()));
}
function clean(value) { return String(value || "").trim(); }
function listBase(listId) {
  return `/sites/${encodeURIComponent(activeConfig.siteId)}/lists/${encodeURIComponent(listId)}/items`;
}
export function assetCode(item) {
  const id = String(item?.id || "");
  const created = new Date(item?.createdDateTime || item?.fields?.Created || "");
  if (!/^\d+$/.test(id) || Number.isNaN(created.getTime())) {
    throw new Error("无法从资产创建时间和清单 ID 生成编号。");
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(created).map(({ type, value }) => [type, value]));
  return `${parts.year}${parts.month}${parts.day}${id.padStart(8, "0")}`;
}
async function authClient() {
  const config = getConfig();
  if (!isConfigured(config)) throw new Error("请先填写完整的连接设置。");
  if (!app || JSON.stringify(config) !== JSON.stringify(activeConfig)) {
    activeConfig = config;
    app = new PublicClientApplication({
      auth: {
        clientId: clean(config.clientId),
        authority: `https://login.microsoftonline.com/${clean(config.tenantId)}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await app.initialize();
    await app.handleRedirectPromise();
  }
  return app;
}
export async function signIn() {
  const client = await authClient();
  let account = client.getAllAccounts()[0];
  if (!account) {
    const result = await client.loginPopup({ scopes: SCOPES, prompt: "select_account" });
    account = result.account;
  }
  client.setActiveAccount(account);
  return account;
}
export async function signOut() {
  const client = await authClient();
  const account = client.getActiveAccount() || client.getAllAccounts()[0];
  if (account) await client.logoutPopup({ account });
}
async function token() {
  const client = await authClient();
  let account = client.getActiveAccount() || client.getAllAccounts()[0];
  if (!account) account = await signIn();
  try {
    return (await client.acquireTokenSilent({ account, scopes: SCOPES })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    return (await client.acquireTokenPopup({ account, scopes: SCOPES })).accessToken;
  }
}
export async function graph(path, options = {}) {
  const accessToken = await token();
  const url = path.startsWith("https://") ? path : GRAPH + path;
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof Blob) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.error?.message || "";
    } catch {}
    throw new Error(`Microsoft Graph ${response.status}：${detail || response.statusText}`);
  }
  if (response.status === 204) return null;
  if (options.asBlob) return response.blob();
  return response.json();
}
async function allPages(path) {
  const rows = [];
  let next = path;
  while (next) {
    const page = await graph(next);
    rows.push(...(page.value || []));
    next = page["@odata.nextLink"] || null;
  }
  return rows;
}
export async function loadData() {
  const config = getConfig();
  activeConfig = config;
  const [items, movements, me] = await Promise.all([
    allPages(listBase(config.itemsListId) + "?$expand=fields&$top=200"),
    allPages(listBase(config.movementsListId) + "?$expand=fields&$top=200"),
    graph("/me?$select=displayName,userPrincipalName"),
  ]);
  return { items, movements, me };
}
export async function createItem(fields) {
  const config = getConfig(); activeConfig = config;
  const item = await graph(listBase(config.itemsListId), {
    method: "POST", body: JSON.stringify({ fields }),
  });
  try {
    const code = assetCode(item);
    await updateItem(item.id, { AssetCode: code });
    return { ...item, assetCode: code };
  } catch (error) {
    return { ...item, assetCodeError: error.message };
  }
}
export async function updateItem(id, fields) {
  const config = getConfig(); activeConfig = config;
  return graph(listBase(config.itemsListId) + `/${encodeURIComponent(id)}/fields`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
}
export async function createMovement(fields) {
  const config = getConfig(); activeConfig = config;
  return graph(listBase(config.movementsListId), {
    method: "POST", body: JSON.stringify({ fields }),
  });
}
export async function uploadPhoto(file, itemId) {
  const config = getConfig(); activeConfig = config;
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20 MB。");
  const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `item-${itemId}-${crypto.randomUUID()}.${ext}`;
  const path = `/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(config.photoFolderId)}:/${encodeURIComponent(filename)}:/content`;
  const result = await graph(path, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  await updateItem(itemId, { PhotoDriveId: config.driveId, PhotoItemId: result.id });
  return result;
}
export async function getPhotoBlob(driveId, itemId) {
  return graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, { asBlob: true });
}
export function stockByItem(items, movements) {
  const stock = new Map(items.map((item) => [String(item.id), 0]));
  for (const movement of movements) {
    const f = movement.fields || {};
    const id = String(f.ItemId || "");
    const quantity = Number(f.Quantity || 0);
    if (!stock.has(id) || !Number.isFinite(quantity)) continue;
    stock.set(id, stock.get(id) + (f.Type === "IN" ? quantity : f.Type === "OUT" ? -quantity : 0));
  }
  return stock;
}
