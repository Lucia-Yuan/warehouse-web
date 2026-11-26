import "./key-in.css";
import { validLocation, validPhoto, validQuantity } from "./key-in-validation.js";
import {
  getKeyInConfig, saveKeyInConfig, keyInConfigured, keyInSignIn, keyInSignOut,
  listKeyInEntries, uploadKeyInPhoto, createKeyInEntry, removeUnlinkedPhoto,
  getKeyInPhotoDetails,
} from "./key-in-graph.js";

const root = document.querySelector("#app");
const state = { account: null, entries: [], photoDetails: new Map(), busy: false, preview: null };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const configFields = [
  ["tenantId", "租户 ID"], ["clientId", "应用 Client ID"],
  ["siteId", "SharePoint 站点 ID"], ["itemsListId", "资产台账清单 ID"],
  ["movementsListId", "出入库记录清单 ID"],
  ["driveId", "工作 OneDrive Drive ID"], ["photoFolderId", "照片文件夹 Item ID"],
];

function safePhotoLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".sharepoint.com") ? url.href : "";
  } catch { return ""; }
}

function entryRows() {
  if (!state.account) return '<p class="empty">登录后显示资产台账</p>';
  if (!state.entries.length) return '<p class="empty">还没有录入记录</p>';
  return `<div class="table-scroll"><table><thead><tr><th>照片</th><th>数量</th><th>位置</th></tr></thead><tbody>${state.entries.map((entry) => {
    const f = entry.fields || {};
    const details = state.photoDetails.get(`${f.PhotoDriveId}/${f.PhotoItemId}`);
    const link = safePhotoLink(details?.webUrl);
    const photo = link ? `<a class="photo-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${details.thumbnailUrl ? `<img src="${escapeHtml(details.thumbnailUrl)}" alt="资产照片" />` : '<span class="photo-placeholder">查看照片</span>'}</a>` : (f.PhotoItemId ? (details ? "照片不可用" : "加载照片…") : "—");
    return `<tr><td>${photo}</td><td>${escapeHtml(entry.currentQuantity)}</td><td>${escapeHtml(f.Location || "—")}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function render() {
  const config = getKeyInConfig();
  root.innerHTML = `<div class="key-shell">
    <header class="key-header"><div class="key-brand"><span class="brand-icon">仓</span><div><strong>仓库快速录入</strong><small>Key In</small></div></div>
      <div class="account-actions"><span>${escapeHtml(state.account?.name || "未登录")}</span>${state.account ? '<button type="button" id="logout" class="secondary">退出</button>' : '<button type="button" id="login" class="secondary">登录 Microsoft 365</button>'}</div>
    </header>
    <main>
      <section class="intro"><span class="eyebrow">直接进入资产台账</span><h1>拍一张，填两项，完成录入。</h1><p>照片保存到工作 OneDrive；数量写入原台账并登记首次入库。</p></section>
      <div class="content-grid">
        <section class="card entry-card"><div class="card-heading"><span class="step">01</span><div><h2>新建记录</h2><p>每次录入一张照片</p></div></div>
          <form id="entry-form" novalidate>
            <label class="field-label" for="photo">照片 <span>*</span></label>
            <label class="photo-picker" for="photo"><input id="photo" name="photo" type="file" accept="image/*" capture="environment" required /><span id="photo-empty" class="photo-empty"><b>＋</b><strong>拍照或选择照片</strong><small>支持图片，最大 20 MB</small></span><img id="photo-preview" alt="照片预览" hidden /></label>
            <div id="photo-file-name" class="file-name"></div>
            <div class="field-row"><div><label class="field-label" for="quantity">数量 <span>*</span></label><input id="quantity" name="quantity" type="number" inputmode="numeric" min="1" step="1" placeholder="例如 3" required /></div>
              <div><label class="field-label" for="location">位置 <span>*</span></label><input id="location" name="location" type="text" maxlength="100" placeholder="例如 A12 或 地下仓库一层" required /><small id="location-hint" class="field-hint">使用大写英文和数字的编码，或中文位置描述</small></div></div>
            <p id="form-error" class="form-error" role="alert" hidden></p>
            <button class="save-button" id="save" type="submit">保存到资产台账</button>
            <p id="save-status" class="save-status" role="status"></p>
          </form>
        </section>
        <section class="card list-card"><div class="list-top"><div class="card-heading"><span class="step">02</span><div><h2>原资产台账</h2><p>只显示照片、当前数量、位置</p></div></div><button type="button" id="refresh" class="secondary">刷新</button></div>
          <div id="entries">${entryRows()}</div>
        </section>
      </div>
      <details id="connection" class="connection"><summary>连接设置</summary><div class="connection-body"><p>首次使用请填写管理员提供的 Microsoft 365 连接信息。设置只保存在当前浏览器。</p>
        <form id="config-form"><div class="config-grid">${configFields.map(([key, label]) => `<label>${label}<input name="${key}" value="${escapeHtml(config[key] || "")}" autocomplete="off" required /></label>`).join("")}</div><button type="submit" class="secondary">保存连接设置</button></form>
      </div></details>
    </main>
  </div>`;
  bindEvents();
}

function message(text, error = false) {
  const node = document.querySelector("#save-status");
  node.textContent = text;
  node.classList.toggle("error", error);
}

function setBusy(busy) {
  state.busy = busy;
  document.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
}

async function refreshEntries() {
  if (!keyInConfigured()) {
    document.querySelector("#connection").open = true;
    throw new Error("请先完成连接设置。");
  }
  state.entries = await listKeyInEntries();
  state.photoDetails.clear();
  document.querySelector("#entries").innerHTML = entryRows();
  const photos = [...new Map(state.entries.map((entry) => {
    const f = entry.fields || {};
    return [`${f.PhotoDriveId}/${f.PhotoItemId}`, [f.PhotoDriveId, f.PhotoItemId]];
  }).filter(([, [driveId, itemId]]) => driveId && itemId)).values()];
  for (let index = 0; index < photos.length; index += 8) {
    await Promise.all(photos.slice(index, index + 8).map(async ([driveId, itemId]) => {
      const key = `${driveId}/${itemId}`;
      if (state.photoDetails.has(key)) return;
      try { state.photoDetails.set(key, await getKeyInPhotoDetails(driveId, itemId)); }
      catch { state.photoDetails.set(key, { webUrl: "", thumbnailUrl: "" }); }
    }));
    document.querySelector("#entries").innerHTML = entryRows();
  }
}

function bindEvents() {
  const photo = document.querySelector("#photo");
  const location = document.querySelector("#location");
  photo.addEventListener("change", () => {
    if (state.preview) URL.revokeObjectURL(state.preview);
    state.preview = null;
    const file = photo.files?.[0];
    const preview = document.querySelector("#photo-preview");
    preview.hidden = !file;
    document.querySelector("#photo-empty").hidden = Boolean(file);
    document.querySelector("#photo-file-name").textContent = file?.name || "";
    if (file) { state.preview = URL.createObjectURL(file); preview.src = state.preview; }
  });
  location.addEventListener("input", () => {
    const hint = document.querySelector("#location-hint");
    hint.classList.toggle("invalid", Boolean(location.value.trim()) && !validLocation(location.value));
    hint.textContent = hint.classList.contains("invalid") ? "位置只可填大写英文＋数字，或不含英文的中文描述" : "使用大写英文和数字的编码，或中文位置描述";
  });
  document.querySelector("#config-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    saveKeyInConfig(values);
    document.querySelector("#connection").open = false;
    message("连接设置已保存在当前浏览器。请登录 Microsoft 365。");
  });
  document.querySelector("#login")?.addEventListener("click", async () => {
    setBusy(true);
    try { state.account = await keyInSignIn(); render(); await refreshEntries(); }
    catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  document.querySelector("#logout")?.addEventListener("click", async () => {
    setBusy(true);
    try { await keyInSignOut(); state.account = null; state.entries = []; state.photoDetails.clear(); render(); }
    catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  document.querySelector("#refresh").addEventListener("click", async () => {
    setBusy(true);
    try { state.account = await keyInSignIn(); render(); await refreshEntries(); message("清单已刷新。"); }
    catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  document.querySelector("#entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = photo.files?.[0];
    const quantity = document.querySelector("#quantity").value.trim();
    const place = location.value.trim();
    const error = document.querySelector("#form-error");
    let problem = "";
    if (!validPhoto(file)) problem = "请选择不超过 20 MB 的图片。";
    else if (!validQuantity(quantity)) problem = "数量须为大于 0 的整数。";
    else if (!validLocation(place)) problem = "位置只可填大写英文和数字的编码，或不含英文的中文描述。";
    else if (!keyInConfigured()) { problem = "请先完成连接设置。"; document.querySelector("#connection").open = true; }
    error.textContent = problem;
    error.hidden = !problem;
    if (problem) return;
    setBusy(true);
    let uploaded;
    try {
      state.account = await keyInSignIn();
      message("正在上传照片…");
      uploaded = await uploadKeyInPhoto(file);
      if (!uploaded.id) throw new Error("OneDrive 未返回照片文件 ID，未创建台账记录。");
      message("照片已上传，正在保存资产和首次入库…");
      const result = await createKeyInEntry({ quantity: Number(quantity), location: place, photo: uploaded, operator: state.account?.name || state.account?.username || "" });
      uploaded = undefined;
      form.reset();
      if (state.preview) URL.revokeObjectURL(state.preview);
      state.preview = null;
      document.querySelector("#photo-preview").hidden = true;
      document.querySelector("#photo-empty").hidden = false;
      document.querySelector("#photo-file-name").textContent = "";
      render();
      const warnings = [result.item.assetCodeError && `资产编号写入失败：${result.item.assetCodeError}`, result.movementError && `出入库记录写入失败：${result.movementError}`].filter(Boolean);
      const identifier = result.item.assetCode || `记录 ID ${result.item.id}`;
      const savedMessage = warnings.length ? `资产已存入原台账（${identifier}），但${warnings.join("；")}。请勿重复提交，请联系管理员补录。` : "已存入原资产台账，数量已登记为首次入库。";
      message(savedMessage, warnings.length > 0);
      try { await refreshEntries(); }
      catch { message(`${savedMessage} 清单暂时无法刷新，点击刷新重试。`, true); }
    } catch (error) {
      if (uploaded?.id) {
        try { await removeUnlinkedPhoto(uploaded.id); }
        catch { message(`${error.message} 照片已上传，但清单未保存；请联系管理员处理未关联照片。`, true); setBusy(false); return; }
      }
      message(error.message, true);
    } finally { setBusy(false); }
  });
}

render();
