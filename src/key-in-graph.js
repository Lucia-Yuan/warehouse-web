import {
  getConfig, saveConfig, isConfigured, signIn, signOut, graph,
  loadData, createItem, createMovement, stockByItem,
} from "./graph.js";

export const getKeyInConfig = getConfig;
export const saveKeyInConfig = saveConfig;
export const keyInConfigured = isConfigured;
export const keyInSignIn = signIn;
export const keyInSignOut = signOut;

export async function listKeyInEntries() {
  const { items, movements } = await loadData();
  const stock = stockByItem(items, movements);
  return items.map((item) => ({
    ...item,
    currentQuantity: Number(stock.get(String(item.id)) || 0),
  })).sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime));
}

export async function uploadKeyInPhoto(file) {
  const { driveId, photoFolderId } = getConfig();
  const suggested = file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1];
  const extension = (suggested === "jpeg" ? "jpg" : suggested || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `key-in-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const path = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoFolderId)}:/${encodeURIComponent(filename)}:/content`;
  return graph(path, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
}

function chinaDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function createKeyInEntry({ quantity, location, photo, operator }) {
  const config = getConfig();
  const item = await createItem({
    Title: "待命名",
    Status: "在库",
    InboundDate: chinaDate(),
    UnitPrice: 0,
    Quantity: quantity,
    Location: location,
    PhotoDriveId: config.driveId,
    PhotoItemId: photo.id,
    Remark: "由 Key In 快速录入，待补全资产信息",
  });
  let movementError = null;
  try {
    await createMovement({
      Title: `初始入库-${item.id}-${Date.now()}`,
      ItemId: String(item.id),
      Type: "IN",
      Quantity: quantity,
      OccurredAt: new Date().toISOString(),
      Operator: operator || "",
      Note: "Key In 快速录入的首次入库",
    });
  } catch (error) {
    movementError = error.message;
  }
  return { item, movementError };
}

export async function removeUnlinkedPhoto(photoId) {
  const { driveId } = getConfig();
  return graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoId)}`, { method: "DELETE" });
}

export async function getKeyInPhotoDetails(driveId, photoId) {
  const base = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(photoId)}`;
  const [item, thumbnail] = await Promise.all([
    graph(`${base}?$select=webUrl`),
    graph(`${base}/thumbnails/0/small`).catch(() => null),
  ]);
  return { webUrl: item.webUrl, thumbnailUrl: thumbnail?.url || "" };
}
