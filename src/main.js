import "./style.css";
import {
  getConfig, saveConfig, isConfigured, signIn, signOut,
  loadData, createItem, updateItem, createMovement,
  uploadPhoto, getPhotoBlob, stockByItem, assetCode,
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
    ["dashboard", "总览"], ["items", "资产台账"],
    ["movements", "出入库记录"], ["settings", "连接设置"],
  ];
  return links.map(([id, label]) => `<button class="nav-link ${state.page === id ? "active" : ""}" data-page="${id}">${label}</button>`).join("")
    + '<a class="nav-link" href="./key-in.html" style="display:block;text-decoration:none">Key In 快速录入</a>';
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
  const zero = items.filter((x) => Number(state.stock.get(String(x.id)) || 0) <= 0);
  const totalValue = items.reduce((sum, x) => sum + Number(x.fields?.UnitPrice || 0) * Number(state.stock.get(String(x.id)) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayMovements = state.movements.filter((x) => String(x.fields?.OccurredAt || "").startsWith(today));
  const recent = [...state.movements].sort((a,b) => new Date(b.fields?.OccurredAt || 0) - new Date(a.fields?.OccurredAt || 0)).slice(0, 6);
  return `<section class="page">
    ${heading("仓库总览", "查看资产台账和最近的出入库操作。", '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" data-open="item">新增资产</button><button class="primary" data-open="movement">登记出入库</button></div>')}
    <div class="stat-grid">
      <article class="stat"><span>资产种类</span><strong>${items.length}</strong><small>台账记录</small></article>
      <article class="stat"><span>当前库存价值</span><strong>¥${fmt(totalValue)}</strong><small>单价 × 当前库存</small></article>
      <article class="stat"><span>今日出入库</span><strong>${todayMovements.length}</strong><small>笔记录</small></article>
    </div>
    <div class="two-col">
      <section class="panel"><div class="panel-title"><h2>暂无库存的资产</h2><button class="text-btn" data-page="items">查看台账</button></div>
      ${zero.length ? `<div class="simple-list">${zero.slice(0,8).map((item) => `<div><span>${escapeHtml(item.fields?.Title)}</span><strong>0 个</strong></div>`).join("")}</div>` : '<div class="empty">所有资产均有库存</div>'}</section>
      <section class="panel"><div class="panel-title"><h2>最近操作</h2><button class="text-btn" data-page="movements">全部记录</button></div>
      ${recent.length ? `<div class="simple-list">${recent.map((movement) => { const f = movement.fields || {}; const item = items.find(x => String(x.id) === String(f.ItemId)); return `<div><span><em class="${f.Type === "IN" ? "in" : "out"}">${f.Type === "IN" ? "入库" : "出库"}</em> ${escapeHtml(item?.fields?.Title || "未知资产")}</span><strong>${fmt(f.Quantity)} 个</strong></div>`; }).join("")}</div>` : '<div class="empty">还没有出入库记录</div>'}</section>
    </div>
  </section>`;
}
function itemRows() {
  const q = state.query.trim().toLowerCase();
  const rows = state.items.filter((item) => {
    const f = item.fields || {};
    return [f.AssetCode, f.Title, f.Status, f.Department, f.AssetType, f.Location, f.Manager, f.ValueType, f.Remark]
      .some((v) => String(v || "").toLowerCase().includes(q));
  });
  if (!rows.length) return '<tr><td colspan="14" class="empty">暂无匹配的资产</td></tr>';
  return rows.map((item) => {
    const f = item.fields || {};
    const stock = Number(state.stock.get(String(item.id)) || 0);
    const value = Number(f.UnitPrice || 0) * stock;
    const inbound = f.InboundDate ? new Date(f.InboundDate).toLocaleDateString("zh-CN") : "—";
    return `<tr>
      <td>${escapeHtml(f.AssetCode || "待生成")}</td>
      <td><div class="item-name"><span class="thumb" data-photo="${escapeHtml(item.id)}">▧</span><span><strong>${escapeHtml(f.Title)}</strong></span></div></td>
      <td>${fmt(stock)} 个</td>
      <td>${escapeHtml(f.Status || "—")}</td>
      <td>${escapeHtml(inbound)}</td>
      <td>${escapeHtml(f.Department || "—")}</td>
      <td>¥${fmt(f.UnitPrice)}</td>
      <td>¥${fmt(value)}</td>
      <td>${escapeHtml(f.AssetType || "—")}</td>
      <td>${escapeHtml(f.Location || "—")}</td>
      <td>${escapeHtml(f.Manager || "—")}</td>
      <td>${escapeHtml(f.ValueType || "—")}</td>
      <td>${escapeHtml(f.Remark || "—")}</td>
      <td><div class="row-actions"><button class="text-btn" data-move-item="${escapeHtml(item.id)}">出入库</button><button class="text-btn" data-edit-item="${escapeHtml(item.id)}">编辑</button></div></td>
    </tr>`;
  }).join("");
}
function itemsPage() {
  return `<section class="page">
    ${heading("资产台账", "按资产编号、名称、状态、部门、类型、地点、管理人和备注查询。价值按单价与当前库存自动计算。", '<button class="primary" data-open="item">新增资产</button>')}
    <section class="panel table-panel"><div class="toolbar"><input id="searchInput" type="search" placeholder="搜索编号、名称、状态、部门、类型、地点、管理人或备注" value="${escapeHtml(state.query)}" /><span>${state.items.length} 种资产</span></div>
    <div class="table-wrap"><table><thead><tr><th>资产编号</th><th>资产名称</th><th>当前数量</th><th>状态</th><th>入库日期</th><th>管理部门</th><th>单价</th><th>价值</th><th>资产类型</th><th>存放地点</th><th>管理人</th><th>价值类型</th><th>备注</th><th>操作</th></tr></thead><tbody id="itemBody">${itemRows()}</tbody></table></div></section>
  </section>`;
}
function movementsPage() {
  const sorted = [...state.movements].sort((a,b) => new Date(b.fields?.OccurredAt || 0) - new Date(a.fields?.OccurredAt || 0));
  return `<section class="page">
    ${heading("出入库记录", "每笔操作都保留时间、资产、数量和操作人。", '<button class="primary" data-open="movement">登记出入库</button>')}
    <section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>资产</th><th>数量</th><th>操作人</th><th>备注</th></tr></thead><tbody>
      ${sorted.length ? sorted.map((entry) => { const f=entry.fields||{}; const item=state.items.find(x=>String(x.id)===String(f.ItemId)); return `<tr><td>${escapeHtml(dateText(f.OccurredAt))}</td><td><span class="pill ${f.Type==="IN"?"pill-in":"pill-out"}">${f.Type==="IN"?"入库":"出库"}</span></td><td>${escapeHtml(item?.fields?.Title || "未知资产")}</td><td>${fmt(f.Quantity)} ${"个"}</td><td>${escapeHtml(f.Operator || "—")}</td><td>${escapeHtml(f.Note || "—")}</td></tr>`; }).join("") : '<tr><td colspan="6" class="empty">还没有出入库记录</td></tr>'}
    </tbody></table></div></section>
  </section>`;
}
function settingsPage() {
  const c = getConfig();
  const fields = [
    ["tenantId", "租户 ID"], ["clientId", "应用 Client ID"],
    ["siteId", "SharePoint Site ID"], ["itemsListId", "资产台账 List ID"],
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
  const inbound = f.InboundDate ? String(f.InboundDate).slice(0,10) : new Date().toISOString().slice(0,10);
  modal(item ? "编辑资产" : "新增资产", `<form id="itemForm" data-id="${escapeHtml(item?.id || "")}">
    <div class="form-grid two">
      <label>资产编号<input value="${escapeHtml(f.AssetCode || (item ? "待生成" : "保存后自动生成"))}" disabled /></label>
      <label>资产名称 *<input name="Title" value="${escapeHtml(f.Title || "")}" required maxlength="100" /></label>
      <label>数量（个）*<input name="StockQuantity" type="number" min="0" step="1" required value="${item ? escapeHtml(state.stock.get(String(item.id)) ?? 0) : "0"}" /></label>
      <label>状态<input name="Status" value="${escapeHtml(f.Status || "在库")}" placeholder="如：在库、借出、维修" /></label>
      <label>入库日期<input name="InboundDate" type="date" value="${escapeHtml(inbound)}" /></label>
      <label>管理部门<input name="Department" value="${escapeHtml(f.Department || "")}" /></label>
      <label>单价<input name="UnitPrice" type="number" min="0" step="0.01" value="${escapeHtml(f.UnitPrice ?? 0)}" /></label>
      <label>价值<input value="按单价 × 当前库存自动计算" disabled /></label>
      <label>资产类型<input name="AssetType" value="${escapeHtml(f.AssetType || "")}" /></label>
      <label>存放地点<input name="Location" value="${escapeHtml(f.Location || "")}" /></label>
      <label>管理人<input name="Manager" value="${escapeHtml(f.Manager || "")}" /></label>
      <label>价值类型<input name="ValueType" value="${escapeHtml(f.ValueType || "")}" /></label>
      <label class="wide">备注<textarea name="Remark" rows="3">${escapeHtml(f.Remark || "")}</textarea></label>
      <label class="wide">照片（可选，20 MB 以内）<input name="photo" type="file" accept="image/*" /></label>
    </div>${item ? '<p class="form-hint">修改数量后，系统会自动登记对应的入库或出库记录。</p>' : ''}<div class="form-actions"><button class="ghost" type="button" data-close>取消</button><button class="primary" type="submit">保存资产</button></div>
  </form>`);
}
function movementForm(itemId = "") {
  modal("登记出入库", `<form id="movementForm"><div class="form-grid two">
    <label>资产 *<select name="ItemId" required><option value="">请选择资产</option>${state.items.map((x)=>`<option value="${escapeHtml(x.id)}" ${String(x.id)===String(itemId)?"selected":""}>${escapeHtml(x.fields?.Title)}（现有 ${fmt(state.stock.get(String(x.id))) } ${"个"}）</option>`).join("")}</select></label>
    <label>类型 *<select name="Type"><option value="IN">入库</option><option value="OUT">出库</option></select></label>
    <label>数量 *<input name="Quantity" type="number" min="1" step="1" required /></label>
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
      const fields = Object.fromEntries(["Title","Status","Department","AssetType","Location","Manager","ValueType","Remark"]
        .map(k=>[k,String(data.get(k)||"").trim()]));
      fields.InboundDate = String(data.get("InboundDate") || "").trim() || null;
      fields.UnitPrice = Number(data.get("UnitPrice") || 0);
      if (!fields.Title) throw new Error("请填写资产名称。");
      if (!Number.isFinite(fields.UnitPrice) || fields.UnitPrice < 0) throw new Error("单价必须为非负数。");
      const id = form.dataset.id;
      if (id) {
        const existing = state.items.find((item) => String(item.id) === id);
        if (existing && !existing.fields?.AssetCode) fields.AssetCode = assetCode(existing);
      }
      const targetQuantity = Number(data.get("StockQuantity"));
      if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) throw new Error("数量应为非负整数。");
      fields.Quantity = targetQuantity;
      const currentQuantity = id ? Number(state.stock.get(id) || 0) : 0;
      const difference = targetQuantity - currentQuantity;
      const saved = id ? (await updateItem(id,fields), {id}) : await createItem(fields);
      let movementError = null;
      if (difference !== 0) {
        try {
          await createMovement({
            Title: `${difference > 0 ? "入库" : "出库"}-${saved.id}-${Date.now()}`,
            ItemId: String(saved.id), Type: difference > 0 ? "IN" : "OUT", Quantity: Math.abs(difference),
            OccurredAt: new Date().toISOString(),
            Operator: state.me?.displayName || state.me?.userPrincipalName || "",
            Note: id ? "编辑资产时调整数量" : "新增资产时登记的初始库存",
          });
        } catch (error) { movementError = error.message; }
      }
      const photo = data.get("photo");
      let photoError = null;
      if (photo instanceof File && photo.size) {
        try { await uploadPhoto(photo,saved.id); }
        catch(e) { photoError = e.message; }
      }
      document.querySelector("#modalHost").innerHTML = "";
      await refresh();
      const warnings = [saved.assetCodeError && `资产编号写入失败：${saved.assetCodeError}`, movementError && `出入库记录写入失败：${movementError}`, photoError && `照片上传失败：${photoError}`].filter(Boolean);
      notify(warnings.length ? `资产已保存，但${warnings.join("；")}` : "资产已保存", warnings.length ? "error" : "success");
    } else {
      const itemId = String(data.get("ItemId")||"");
      const item = state.items.find(x=>String(x.id)===itemId);
      const type = String(data.get("Type")||"");
      const quantity = Number(data.get("Quantity"));
      if (!item || !["IN","OUT"].includes(type) || !Number.isInteger(quantity) || quantity<=0) throw new Error("请检查资产、类型和数量；数量应为正整数。");
      const currentQuantity = Number(state.stock.get(itemId) || 0);
      if (type==="OUT" && quantity>currentQuantity) throw new Error("出库数量超过当前库存。请先刷新库存。");
      const occurredAt = new Date(String(data.get("OccurredAt"))).toISOString();
      await updateItem(itemId, { Quantity: currentQuantity + (type === "IN" ? quantity : -quantity) });
      let movementError = null;
      try {
        await createMovement({
          Title: `${type==="IN"?"入库":"出库"}-${itemId}-${Date.now()}`,
          ItemId: itemId, Type: type, Quantity: quantity,
          OccurredAt: occurredAt,
          Operator: state.me?.displayName || state.me?.userPrincipalName || "",
          Note: String(data.get("Note")||"").trim(),
        });
      } catch (error) { movementError = error.message; }
      document.querySelector("#modalHost").innerHTML = "";
      await refresh();
      notify(movementError ? `数量已更新，但出入库记录写入失败：${movementError}` : "出入库记录已保存", movementError ? "error" : "success");
    }
  } catch (error) { notify(error.message, "error"); }
  finally { setBusy(false); }
});
state.page = isConfigured() ? "dashboard" : "settings";
render();
if (isConfigured()) refresh();
