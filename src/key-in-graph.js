import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

const STORAGE_KEY = "warehouse-key-in-config-v1";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["User.Read", "Sites.ReadWrite.All", "Files.ReadWrite.All"];
const CONFIG_FIELDS = ["tenantId", "clientId", "siteId", "intakeListId", "driveId", "photoFolderId"];
let app;
let activeKey;

export function getKeyInConfig() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

export function saveKeyInConfig(config) {
  const cleaned = Object.fromEntries(CONFIG_FIELDS.map((field) => [field, String(config[field] || "").trim()]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  app = undefined;
  activeKey = undefined;
}

export function keyInConfigured(config = getKeyInConfig()) {
  return CONFIG_FIELDS.every((field) => Boolean(String(config[field] || "").trim()));
}

async function client() {
  const config = getKeyInConfig();
  if (!keyInConfigured(config)) throw new Error("请先完成连接设置。");
  const key = `${config.tenantId}:${config.clientId}`;
  if (!app || activeKey !== key) {
    app = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    activeKey = key;
    await app.initialize();
    await app.handleRedirectPromise();
  }
  return app;
}

export async function keyInSignIn() {
  const auth = await client();
  let account = auth.getActiveAccount() || auth.getAllAccounts()[0];
  if (!account) account = (await auth.loginPopup({ scopes: SCOPES, prompt: "select_account" })).account;
  auth.setActiveAccount(account);
  return account;
}

export async function keyInSignOut() {
  const auth = await client();
  const account = auth.getActiveAccount() || auth.getAllAccounts()[0];
  if (account) await auth.logoutPopup({ account });
}

async function token() {
  const auth = await client();
  let account = auth.getActiveAccount() || auth.getAllAccounts()[0];
  if (!account) account = await keyInSignIn();
  try { return (await auth.acquireTokenSilent({ account, scopes: SCOPES })).accessToken; }
  catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    return (await auth.acquireTokenPopup({ account, scopes: SCOPES })).accessToken;
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${await token()}`);
  if (typeof options.body === "string") headers.set("Content-Type", "application/json");
  const url = new URL(path.startsWith("https://") ? path : GRAPH + path);
  if (url.origin !== new URL(GRAPH).origin || !url.pathname.startsWith("/v1.0/")) {
    throw new Error("Microsoft Graph 地址无效。");
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let detail = response.statusText;
    try { detail = (await response.json()).error?.message || detail; } catch {}
    throw new Error(`Microsoft 365 保存失败（${response.status}）：${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

function listPath() {
  const { siteId, intakeListId } = getKeyInConfig();
  return `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(intakeListId)}/items`;
}

export async function listKeyInEntries() {
  const entries = [];
  let next = `${listPath()}?$expand=fields&$top=100`;
  while (next) {
    const page = await request(next);
    entries.push(...(page.value || []));
    next = page["@odata.nextLink"] || null;
  }
  return entries.sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));
}

export async function uploadKeyInPhoto(file) {
  const { driveId, photoFolderId } = getKeyInConfig();
  const suggested = file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1];
  const extension = (suggested === "jpeg" ? "jpg" : suggested || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `key-in-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const path = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoFolderId)}:/${encodeURIComponent(filename)}:/content`;
  return request(path, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
}

export async function createKeyInEntry({ quantity, location, photo }) {
  return request(listPath(), {
    method: "POST",
    body: JSON.stringify({ fields: {
      Title: `录入-${Date.now()}`,
      Quantity: quantity,
      Location: location,
      PhotoItemId: photo.id,
      PhotoUrl: photo.webUrl,
    } }),
  });
}

export async function removeUnlinkedPhoto(photoId) {
  const { driveId } = getKeyInConfig();
  return request(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoId)}`, { method: "DELETE" });
}

export async function getKeyInThumbnail(photoId) {
  const { driveId } = getKeyInConfig();
  const data = await request(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoId)}/thumbnails/0/small`);
  return data.url;
}
