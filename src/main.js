import "./style.css";
import {
  getConfig, saveConfig, isConfigured, signIn, signOut,
  loadData, createItem, updateItem, createMovement,
  uploadPhoto, getPhotoBlob, stockByItem,
} from "./graph.js";

const root = document.querySelector("#app");
const state = { items: [], movements: [], me: null, stock: new Map(), page: "dashboard", query: "", busy: false };
const photoUrls = new Map();
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const fmt = (value) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
function notify(message, type = "info") {
  const bar = document.querySelector("#notice");
  if (!bar) return;
  bar.textContent = message;
  bar.className = `notice ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { bar.className = "notice hidden"; }, 6500);
}
function setBusy(value) {
  state.busy = value;
  document.querySelectorAll("button").forEach((button) => { button.disabled = value; });
}
async function refresh() {
  if (!isConfigured()) { state.page = "settings"; render(); return; }
  setBusy(true);
  try {
    const data = await loadData();
    state.items = data.items;
    state.movements = data.movements;
    state.me = data.me;
    state.stock = stockByItem(state.items, state.movements);
    render();
  } catch (error) {
    notify(error.message, "error");
  } finally { setBusy(false); }
}
function nav() {
  const links = [
    ["dashboard", "总览"], ["items", "物品台账"],
    ["movements", "出入库记录"], ["settings", "连接设置"],
  ];
  return links.map(([id, label]) => `<button class="nav-link ${state.page === id ? "active" : ""}" data-page="${id}">${label}</button>`).join("");
}
function shell(content) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">仓</span><div><strong>仓库管理</strong><small>Inventory workspace</small></div></div>
        <nav>${nav()}</nav>
        <div class="side-note">数据保存在 Microsoft Lists<br>照片保存在共享 OneDrive</div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="mobile-brand">仓库管理</div>
          <div class="top-actions"><span class="account">${escapeHtml(state.me?.displayName || "尚未登录")}</span>
          <button class="ghost" id="refreshBtn">刷新</button>
          ${state.me ? '<button class="ghost" id="signOutBtn">退出</button>' : '<button class="primary" id="signInBtn">登录 Microsoft 365</button>'}
          </div>
        </header>
        <div id="notice" class="notice hidden"></div>
        ${content}
      </main>
    </div>
    <div id="modalHost"></div>`;
}
function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function dashboard() {
  const items = state.items;
  const low = items.filter((x) => Number(state.stock.get(String(x.id)) || 0) <= Number(x.fields?.MinStock || 0));
  const today = new Date().toISOString().slice(0, 10);
  const todayMovements = state.movements.filter((x) => String(x.fields?.OccurredAt || "").startsWith(today));
  const recent = [...state.movements].sort((a,b) => new Date(b.fields?.OccurredAt || 0) - new Date(a.fields?.OccurredAt || 0)).slice(0, 6);
  return `<section class="page">
    ${heading("仓库总览", "查看库存状态和最近的出入库操作。", '<button class="primary" data-open="movement">登记出入库</button>')}
    <div class="stat-grid">
      <article class="stat"><span>物品种类</span><strong>${items.length}</strong><small>台账记录</small></article>
      <article class="stat"><span>库存预警</span><strong>${low.length}</strong><small>达到或低于下限</small></article>
      <article class="stat"><span>今日出入库</span><strong>${todayMovements.length}</strong><small>笔记录</small></article>
    </div>
    <div class="two-col">
      <section class="panel"><div class="panel-title"><h2>库存预警</h2><button class="text-btn" data-page="items">查看台账</button></div>
      ${low.length ? `<div class="simple-list">${low.slice(0,8).map((item) => `<div><span>${escapeHtml(item.fields?.Title)}</span><strong>${fmt(state.stock.get(String(item.id)))} ${escapeHtml(item.fields?.Unit || "个")}</strong></div>`).join("")}</div>` : '<div class="empty">暂无库存预警</div>'}</section>
      <section class="panel"><div class="panel-title"><h2>最近操作</h2><button class="text-btn" data-page="movements">全部记录</button></div>
      ${recent.length ? `<div class="simple-list">${recent.map((movement) => { const f = movement.fields || {}; const item = items.find(x => String(x.id) === String(f.ItemId)); return `<div><span><em class="${f.Type === "IN" ? "in" : "out"}">${f.Type === "IN" ? "入库" : "出库"}</em> ${escapeHtml(item?.fields?.Title || "未知物品")}</span><strong>${fmt(f.Quantity)} ${escapeHtml(item?.fields?.Unit || "个")}</strong></div>`; }).join("")}</div>` : '<div class="empty">还没有出入库记录</div>'}</section>
    </div>
  </section>`;
}
function itemRows() {
  const q = state.query.trim().toLowerCase();
  const rows = state.items.filter((item) => {
    const f = item.fields || {};
    return [f.Title, f.SKU, f.Category, f.Location].some((v) => String(v || "").toLowerCase().includes(q));
  });
  if (!rows.length) return '<tr><td colspan="7" class="empty">暂无匹配的物品</td></tr>';
  return rows.map((item) => {
    const f = item.fields || {};
    const stock = Number(state.stock.get(String(item.id)) || 0);
    const low = stock <= Number(f.MinStock || 0);
    return `<tr>
      <td><div class="item-name"><span class="thumb" data-photo="${escapeHtml(item.id)}">▧</span><span><strong>${escapeHtml(f.Title)}</strong><small>${escapeHtml(f.SKU || "未设置编号")}</small></span></div></td>
      <td>${escapeHtml(f.Category || "—")}</td>
      <td><strong class="${low ? "warning" : ""}">${fmt(stock)}</strong> ${escapeHtml(f.Unit || "个")}</td>
      <td>${escapeHtml(f.Location || "—")}</td>
      <td>${fmt(f.MinStock)}</td>
      <td><span class="pill ${low ? "pill-warn" : "pill-ok"}">${low ? "需补货" : "正常"}</span></td>
      <td><div class="row-actions"><button class="text-btn" data-move-item="${escapeHtml(item.id)}">出入库</button><button class="text-btn" data-edit-item="${escapeHtml(item.id)}">编辑</button></div></td>
    </tr>`;
  }).join("");
}
function itemsPage() {
  return `<section class="page">
    ${heading("物品台账", "统一查看物品、存放位置和实时库存。", '<button class="primary" data-open="item">新增物品</button>')}
    <section class="panel table-panel"><div class="toolbar"><input id="searchInput" type="search" placeholder="搜索名称、编号、类别或位置" value="${escapeHtml(state.query)}" /><span>${state.items.length} 种物品</span></div>
    <div class="table-wrap"><table><thead><tr><th>物品</th><th>类别</th><th>库存</th><th>位置</th><th>下限</th><th>状态</th><th>操作</th></tr></thead><tbody id="itemBody">${itemRows()}</tbody></table></div></section>
  </section>`;
}
function movementsPage() {
  const sorted = [...state.movements].sort((a,b) => new Date(b.fields?.OccurredAt || 0) - new Date(a.fields?.OccurredAt || 0));
  return `<section class="page">
    ${heading("出入库记录", "每笔操作都保留时间、物品、数量和操作人。", '<button class="primary" data-open="movement">登记出入库</button>')}
    <section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>物品</th><th>数量</th><th>操作人</th><th>备注</th></tr></thead><tbody>
      ${sorted.length ? sorted.map((entry) => { const f=entry.fields||{}; const item=state.items.find(x=>String(x.id)===String(f.ItemId)); return `<tr><td>${escapeHtml(dateText(f.OccurredAt))}</td><td><span class="pill ${f.Type==="IN"?"pill-in":"pill-out"}">${f.Type==="IN"?"入库":"出库"}</span></td><td>${escapeHtml(item?.fields?.Title || "未知物品")}</td><td>${fmt(f.Quantity)} ${escapeHtml(item?.fields?.Unit || "个")}</td><td>${escapeHtml(f.Operator || "—")}</td><td>${escapeHtml(f.Note || "—")}</td></tr>`; }).join("") : '<tr><td colspan="6" class="empty">还没有出入库记录</td></tr>'}
    </tbody></table></div></section>
  </section>`;
}
function settingsPage() {
  const c = getConfig();
  const fields = [
    ["tenantId", "租户 ID"], ["clientId", "应用 Client ID"],
    ["siteId", "SharePoint Site ID"], ["itemsListId", "物品台账 List ID"],
    ["movementsListId", "出入库记录 List ID"], ["driveId", "共享 OneDrive Drive ID"],
    ["photoFolderId", "照片文件夹 Item ID"],
  ];
  return `<section class="page">
    ${heading("连接设置", "填写 Microsoft 365 中的资源标识；这些信息仅保存在当前浏览器。")}
    <section class="panel settings-panel"><div class="setup-intro"><strong>开始前</strong><p>需要在 Microsoft Entra 注册单页应用、建立两个 Lists，并将 OneDrive 照片文件夹共享给团队。详细字段见项目 README。</p></div>
    <form id="settingsForm" class="form-grid">${fields.map(([key,label]) => `<label>${label}<input name="${key}" value="${escapeHtml(c[key] || "")}" required autocomplete="off" /></label>`).join("")}
    <div class="form-actions"><button class="primary" type="submit">保存设置并连接</button></div></form></section>
  </section>`;
}
function render() {
  const content = state.page === "settings" ? settingsPage() :
    state.page === "items" ? itemsPage() :
    state.page === "movements" ? movementsPage() : dashboard();
  shell(content);
  loadThumbnails();
}
async function loadThumbnails() {
  for (const item of state.items) {
    const f = item.fields || {};
    if (!f.PhotoDriveId || !f.PhotoItemId) continue;
    const target = document.querySelector(`[data-photo="${CSS.escape(String(item.id))}"]`);
    if (!target) continue;
    const key = `${f.PhotoDriveId}/${f.PhotoItemId}`;
    try {
      if (!photoUrls.has(key)) photoUrls.set(key, URL.createObjectURL(await getPhotoBlob(f.PhotoDriveId, f.PhotoItemId)));
      target.innerHTML = `<img src="${photoUrls.get(key)}" alt="" />`;
    } catch { target.title = "照片暂时无法读取"; }
  }
}
function modal(title, inner) {
  document.querySelector("#modalHost").innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="关闭">×</button></div>${inner}</div></div>`;
}
function itemForm(item = null) {
  const f = item?.fields || {};
  modal(item ? "编辑物品" : "新增物品", `<form id="itemForm" data-id="${escapeHtml(item?.id || "")}">
    <div class="form-grid two">
      <label>物品名称 *<input name="Title" value="${escapeHtml(f.Title || "")}" required maxlength="100" /></label>
      <label>物品编号 *<input name="SKU" value="${escapeHtml(f.SKU || "")}" required maxlength="50" /></label>
      <label>类别<input name="Category" value="${escapeHtml(f.Category || "")}" /></label>
      <label>单位<input name="Unit" value="${escapeHtml(f.Unit || "个")}" /></label>
      <label>存放位置<input name="Location" value="${escapeHtml(f.Location || "")}" /></label>
      <label>库存下限<input name="MinStock" type="number" min="0" step="0.01" value="${escapeHtml(f.MinStock ?? 0)}" /></label>
      <label class="wide">照片（可选，20 MB 以内）<input name="photo" type="file" accept="image/*" /></label>
      <label class="wide">备注<textarea name="Note" rows="3">${escapeHtml(f.Note || "")}</textarea></label>
    </div><div class="form-actions"><button class="ghost" type="button" data-close>取消</button><button class="primary" type="submit">保存物品</button></div>
  </form>`);
}
function movementForm(itemId = "") {
  modal("登记出入库", `<form id="movementForm"><div class="form-grid two">
    <label>物品 *<select name="ItemId" required><option value="">请选择物品</option>${state.items.map((x)=>`<option value="${escapeHtml(x.id)}" ${String(x.id)===String(itemId)?"selected":""}>${escapeHtml(x.fields?.Title)}（现有 ${fmt(state.stock.get(String(x.id))) } ${escapeHtml(x.fields?.Unit||"个")}）</option>`).join("")}</select></label>
    <label>类型 *<select name="Type"><option value="IN">入库</option><option value="OUT">出库</option></select></label>
    <label>数量 *<input name="Quantity" type="number" min="0.01" step="0.01" required /></label>
    <label>操作时间<input name="OccurredAt" type="datetime-local" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}" required /></label>
    <label class="wide">备注<textarea name="Note" rows="3"></textarea></label>
  </div><p class="form-hint">出库时会检查当前页面读取的库存；多人同时操作仍需上线前增加统一校验。</p>
  <div class="form-actions"><button class="ghost" type="button" data-close>取消</button><button class="primary" type="submit">保存记录</button></div></form>`);
}
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || state.busy) return;
  if (button.dataset.page) { state.page = button.dataset.page; render(); return; }
  if (button.dataset.close !== undefined) { document.querySelector("#modalHost").innerHTML = ""; return; }
  if (button.dataset.open === "item") { itemForm(); return; }
  if (button.dataset.open === "movement") { movementForm(); return; }
  if (button.dataset.editItem) { itemForm(state.items.find(x => String(x.id) === button.dataset.editItem)); return; }
  if (button.dataset.moveItem) { movementForm(button.dataset.moveItem); return; }
  if (button.id === "refreshBtn") { await refresh(); return; }
  if (button.id === "signInBtn") { try { await signIn(); await refresh(); } catch(e) { notify(e.message,"error"); } return; }
  if (button.id === "signOutBtn") { try { await signOut(); state.me=null; state.items=[]; state.movements=[]; state.stock=new Map(); render(); } catch(e) { notify(e.message,"error"); } }
});
document.addEventListener("click", (event) => {
  if (event.target.classList?.contains("modal-backdrop")) document.querySelector("#modalHost").innerHTML = "";
  const button = event.target.closest("button[data-close]");
  if (button) document.querySelector("#modalHost").innerHTML = "";
});
document.addEventListener("input", (event) => {
  if (event.target.id === "searchInput") {
    state.query = event.target.value;
    document.querySelector("#itemBody").innerHTML = itemRows();
    loadThumbnails();
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["settingsForm","itemForm","movementForm"].includes(form.id)) return;
  event.preventDefault();
  if (state.busy) return;
  setBusy(true);
  try {
    const data = new FormData(form);
    if (form.id === "settingsForm") {
      const config = Object.fromEntries(["tenantId","clientId","siteId","itemsListId","movementsListId","driveId","photoFolderId"].map(k=>[k,String(data.get(k)||"").trim()]));
      saveConfig(config);
      await signIn();
      await refresh();
      notify("连接成功", "success");
    } else if (form.id === "itemForm") {
      const fields = Object.fromEntries(["Title","SKU","Category","Unit","Location","Note"].map(k=>[k,String(data.get(k)||"").trim()]));
      fields.MinStock = Number(data.get("MinStock") || 0);
      if (!fields.Title || !fields.SKU) throw new Error("请填写物品名称和编号。");
      const id = form.dataset.id;
      if (state.items.some(x=>String(x.id)!==id && String(x.fields?.SKU||"").toLowerCase()===fields.SKU.toLowerCase())) throw new Error("物品编号已存在。");
      const saved = id ? (await updateItem(id,fields), {id}) : await createItem(fields);
      const photo = data.get("photo");
      let photoError = null;
      if (photo instanceof File && photo.size) {
        try { await uploadPhoto(photo,saved.id); }
        catch(e) { photoError = e.message; }
      }
      document.querySelector("#modalHost").innerHTML = "";
      await refresh();
      notify(photoError ? `物品已保存，但照片上传失败：${photoError}` : "物品已保存", photoError ? "error" : "success");
    } else {
      const itemId = String(data.get("ItemId")||"");
      const item = state.items.find(x=>String(x.id)===itemId);
      const type = String(data.get("Type")||"");
      const quantity = Number(data.get("Quantity"));
      if (!item || !["IN","OUT"].includes(type) || !Number.isFinite(quantity) || quantity<=0) throw new Error("请检查物品、类型和数量。");
      if (type==="OUT" && quantity>Number(state.stock.get(itemId)||0)) throw new Error("出库数量超过当前库存。请先刷新库存。");
      const occurredAt = new Date(String(data.get("OccurredAt"))).toISOString();
      await createMovement({
        Title: `${type==="IN"?"入库":"出库"}-${item.fields?.SKU||itemId}-${Date.now()}`,
        ItemId: itemId, Type: type, Quantity: quantity,
        OccurredAt: occurredAt,
        Operator: state.me?.displayName || state.me?.userPrincipalName || "",
        Note: String(data.get("Note")||"").trim(),
      });
      document.querySelector("#modalHost").innerHTML = "";
      await refresh();
      notify("出入库记录已保存", "success");
    }
  } catch (error) { notify(error.message, "error"); }
  finally { setBusy(false); }
});
state.page = isConfigured() ? "dashboard" : "settings";
render();
if (isConfigured()) refresh();
