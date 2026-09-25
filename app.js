const storageKey = "zfl16-movable-type-workshop";
const MAX_PER_SLOT = 3;

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 2, wear: "微磨", location: { cabinet: 1, layer: 1, cell: 1 }, needsReview: false },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕", location: { cabinet: 1, layer: 1, cell: 2 }, needsReview: false },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨", location: { cabinet: 1, layer: 2, cell: 1 }, needsReview: false },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 1, wear: "新", location: { cabinet: 1, layer: 2, cell: 1 }, needsReview: false },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕", location: { cabinet: 2, layer: 1, cell: 1 }, needsReview: false },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 2, wear: "新", location: null, needsReview: false }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();
let activeTab = "pick";
let editingLocationId = null;
let noticeTimer = null;

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  cabinetInput: document.querySelector("#cabinetInput"),
  layerInput: document.querySelector("#layerInput"),
  cellInput: document.querySelector("#cellInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  locationFilter: document.querySelector("#locationFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  selectedHint: document.querySelector("#selectedHint"),
  actionNotice: document.querySelector("#actionNotice"),
  shortageBadge: document.querySelector("#shortageBadge"),
  pickSummary: document.querySelector("#pickSummary"),
  pickList: document.querySelector("#pickList"),
  ledgerList: document.querySelector("#ledgerList"),
  draftList: document.querySelector("#draftList"),
  draftCount: document.querySelector("#draftCount"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
    merged.inventory = (merged.inventory || []).map(normalizeItem);
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeItem(item) {
  return {
    ...item,
    location: normalizeLocation(item.location),
    needsReview: Boolean(item.needsReview)
  };
}

function normalizeLocation(loc) {
  if (!loc || typeof loc !== "object") return null;
  const cabinet = Number(loc.cabinet);
  const layer = Number(loc.layer);
  const cell = Number(loc.cell);
  if (![cabinet, layer, cell].every((num) => Number.isInteger(num) && num >= 1)) return null;
  return { cabinet, layer, cell };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function locationKey(loc) {
  return loc ? `${loc.cabinet}-${loc.layer}-${loc.cell}` : "";
}

function formatLocation(loc) {
  return loc ? `柜${loc.cabinet} 层${loc.layer} 格${loc.cell}` : "未登记";
}

function getSlotTotals() {
  const totals = new Map();
  state.inventory.forEach((item) => {
    if (!item.location) return;
    const key = locationKey(item.location);
    totals.set(key, (totals.get(key) || 0) + item.quantity);
  });
  return totals;
}

function getBlockReason(item, slotTotals = getSlotTotals()) {
  if (!item.location) {
    return {
      code: "pending",
      cardText: "留库待补录，补登库位后方可落字",
      noticeText: "未登记库位，留库待补录，当前格子不可落字"
    };
  }
  const total = slotTotals.get(locationKey(item.location)) || 0;
  if (total > MAX_PER_SLOT) {
    return {
      code: "over",
      cardText: `超容不可落字：同格合计${total}/${MAX_PER_SLOT}枚`,
      noticeText: `库位超容（${formatLocation(item.location)}，合计${total}/${MAX_PER_SLOT}枚），当前格子不可落字`
    };
  }
  return null;
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const locationFilter = els.locationFilter.value;
  const usage = getUsage();
  const slotTotals = getSlotTotals();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    const reason = getBlockReason(item, slotTotals);
    const matchesLocation =
      locationFilter === "all" ||
      (locationFilter === "pending" && reason?.code === "pending") ||
      (locationFilter === "over" && reason?.code === "over");
    return matchesKeyword && matchesStyle && matchesLocation;
  });

  const pendingCount = state.inventory.filter((item) => !item.location).length;
  els.inventoryCount.textContent = `${state.inventory.length}种字模${pendingCount ? ` · ${pendingCount}种待补录` : ""}`;
  els.typeList.innerHTML =
    items.map((item) => typeCardHtml(item, usage, slotTotals)).join("") ||
    `<p class="empty">没有符合条件的字模。</p>`;
}

function typeCardHtml(item, usage, slotTotals) {
  const used = usage[item.id] || 0;
  const selected = item.id === state.selectedTypeId ? "selected" : "";
  const reason = getBlockReason(item, slotTotals);
  const editing = editingLocationId === item.id;
  const locLine = item.location
    ? `<span class="loc-line ${reason ? "bad" : "ok"}">库位 ${formatLocation(item.location)} · 合计${slotTotals.get(locationKey(item.location)) || 0}/${MAX_PER_SLOT}枚</span>`
    : `<span class="loc-line bad">库位 未登记</span>`;
  const reasonLine = reason ? `<span class="block-reason">${reason.cardText}</span>` : "";
  const reviewTag = item.needsReview ? `<em class="tag">待复核</em>` : "";
  return `
    <article class="type-card ${selected} ${reason ? "blocked" : ""}" draggable="${editing ? "false" : "true"}" data-type-id="${item.id}">
      <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
      <div class="type-meta">
        <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}${reviewTag}</strong>
        <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
        ${locLine}
        ${reasonLine}
        ${editing ? locationEditorHtml(item) : ""}
      </div>
      <div class="card-actions">
        <button class="text-btn" type="button" data-edit-loc="${item.id}">调库位</button>
        <button class="mini-btn" type="button" title="删除字模" data-delete-type="${item.id}">×</button>
      </div>
    </article>
  `;
}

function locationEditorHtml(item) {
  const loc = item.location || {};
  return `
    <div class="loc-editor" data-loc-editor="${item.id}">
      <label>柜<input type="number" min="1" placeholder="柜号" value="${loc.cabinet ?? ""}" data-loc-cabinet /></label>
      <label>层<input type="number" min="1" placeholder="层号" value="${loc.layer ?? ""}" data-loc-layer /></label>
      <label>格<input type="number" min="1" placeholder="格号" value="${loc.cell ?? ""}" data-loc-cell /></label>
      <label>数量<input type="number" min="1" max="99" value="${item.quantity}" data-loc-qty /></label>
      <div class="loc-editor-actions">
        <button class="primary" type="button" data-loc-save="${item.id}">保存</button>
        <button type="button" data-loc-clear="${item.id}">清除库位</button>
        <button type="button" data-loc-cancel>取消</button>
      </div>
    </div>
  `;
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderStatus() {
  const usage = getUsage();
  const shortages = state.inventory.filter((item) => (usage[item.id] || 0) > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const selectedType = getSelectedType();
  if (!selectedType) {
    els.selectedTypeLabel.textContent = "未选择字模";
    els.selectedHint.textContent = "点击字模后，在版面格子中落字，也可拖拽字模到版面。";
    els.selectedHint.classList.remove("bad");
    return;
  }
  const reason = getBlockReason(selectedType);
  els.selectedTypeLabel.textContent = `当前：${selectedType.char} · ${selectedType.style}`;
  els.selectedHint.textContent = reason
    ? reason.noticeText
    : `库位 ${formatLocation(selectedType.location)}，点击或拖拽落字。`;
  els.selectedHint.classList.toggle("bad", Boolean(reason));
}

function renderPickList() {
  const usage = getUsage();
  const entries = state.inventory
    .filter((item) => usage[item.id])
    .map((item) => ({ item, used: usage[item.id] }));

  if (!entries.length) {
    els.pickSummary.textContent = "";
    els.pickList.innerHTML = `<p class="empty">版面还没有落字，落字后自动生成取字单。</p>`;
    return;
  }

  const located = entries.filter((entry) => entry.item.location);
  const unlocated = entries.filter((entry) => !entry.item.location);
  const groups = new Map();
  located.forEach((entry) => {
    const { cabinet, layer } = entry.item.location;
    const key = `${cabinet}-${layer}`;
    if (!groups.has(key)) groups.set(key, { cabinet, layer, entries: [] });
    groups.get(key).entries.push(entry);
  });
  const sortedGroups = [...groups.values()].sort((a, b) => a.cabinet - b.cabinet || a.layer - b.layer);
  sortedGroups.forEach((group) => {
    group.entries.sort(
      (a, b) => a.item.location.cell - b.item.location.cell || a.item.char.localeCompare(b.item.char, "zh-CN")
    );
  });

  const totalPieces = entries.reduce((sum, entry) => sum + entry.used, 0);
  const reviewCount = entries.filter((entry) => entry.item.needsReview).length;
  const summaryParts = [`共${totalPieces}枚`, `${sortedGroups.length}个柜层`];
  if (unlocated.length) summaryParts.push("含缺库位");
  if (reviewCount) summaryParts.push(`${reviewCount}项待复核`);
  els.pickSummary.textContent = summaryParts.join(" · ");

  const html = sortedGroups.map((group) => {
    const merged = group.entries.reduce((sum, entry) => sum + entry.used, 0);
    return `
      <section class="pick-group">
        <header><strong>柜${group.cabinet} · 层${group.layer}</strong><span>共${merged}枚</span></header>
        ${group.entries.map(pickRowHtml).join("")}
      </section>
    `;
  });
  if (unlocated.length) {
    const merged = unlocated.reduce((sum, entry) => sum + entry.used, 0);
    html.push(`
      <section class="pick-group unlocated">
        <header><strong>缺库位 · 待补录</strong><span>共${merged}枚</span></header>
        ${unlocated.map(pickRowHtml).join("")}
      </section>
    `);
  }
  els.pickList.innerHTML = html.join("");
}

function pickRowHtml({ item, used }) {
  const over = used > item.quantity;
  return `
    <div class="pick-row ${over ? "warn" : ""}">
      <span class="pick-char">${escapeHtml(item.char)}</span>
      <div class="pick-meta">
        <strong>${escapeHtml(item.style)}</strong>
        <span>${item.location ? `格${item.location.cell}` : "待补录"} · 取${used}枚 / 存${item.quantity}${over ? " · 超量" : ""}</span>
      </div>
      ${item.needsReview ? `<em class="tag">待复核</em><button class="review-btn" type="button" data-review="${item.id}">复核</button>` : ""}
    </div>
  `;
}

function renderLedger() {
  const slotTotals = getSlotTotals();
  const slots = new Map();
  state.inventory.forEach((item) => {
    if (!item.location) return;
    const key = locationKey(item.location);
    if (!slots.has(key)) slots.set(key, { ...item.location, items: [] });
    slots.get(key).items.push(item);
  });
  const sortedSlots = [...slots.values()].sort(
    (a, b) => a.cabinet - b.cabinet || a.layer - b.layer || a.cell - b.cell
  );
  const pending = state.inventory.filter((item) => !item.location);

  const slotsHtml = sortedSlots.map((slot) => {
    const total = slotTotals.get(locationKey(slot)) || 0;
    const over = total > MAX_PER_SLOT;
    const status = over ? " · 超容" : total === MAX_PER_SLOT ? " · 已满" : "";
    return `
      <section class="ledger-slot ${over ? "over" : ""}">
        <header><strong>柜${slot.cabinet} · 层${slot.layer} · 格${slot.cell}</strong><span>合计${total}/${MAX_PER_SLOT}枚${status}</span></header>
        ${slot.items
          .map(
            (item) => `
          <div class="ledger-item">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>×${item.quantity}</span>
          </div>`
          )
          .join("")}
      </section>
    `;
  });

  const pendingHtml = pending.length
    ? `
      <h3 class="ledger-sub">留库待补录（${pending.length}种）</h3>
      ${pending
        .map(
          (item) => `
        <div class="ledger-item pending">
          <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
          <span>×${item.quantity} · 未登记库位</span>
        </div>`
        )
        .join("")}`
    : "";

  els.ledgerList.innerHTML =
    slotsHtml.join("") + pendingHtml || `<p class="empty">台账为空，请先登记字模库位。</p>`;
}

function renderDrafts() {
  els.draftCount.textContent = state.drafts.length ? `（${state.drafts.length}）` : "";
  els.draftList.innerHTML =
    state.drafts
      .map((draft) => {
        const hasUnlocated = draft.placements.some((placement) => {
          const type = state.inventory.find((item) => item.id === placement.typeId);
          return type && !type.location;
        });
        return `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            ${hasUnlocated ? `<span class="draft-note">含缺库位字模，留库待补录</span>` : ""}
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderStatus();
  renderPickList();
  renderLedger();
  renderDrafts();
}

function showNotice(text) {
  els.actionNotice.textContent = text;
  els.actionNotice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    els.actionNotice.hidden = true;
  }, 4500);
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const type = state.inventory.find((item) => item.id === typeId);
  if (!type) return;
  const existingIndex = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (existingIndex >= 0 && state.placements[existingIndex].typeId === typeId) {
    state.placements.splice(existingIndex, 1);
    renderAll();
    return;
  }
  const reason = getBlockReason(type);
  if (reason) {
    showNotice(`「${type.char}」${reason.noticeText}`);
    return;
  }
  if (existingIndex >= 0) {
    state.placements[existingIndex].typeId = typeId;
  } else {
    state.placements.push({ row, col, typeId });
  }
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const location = readFormLocation();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value,
    location: location.valid ? location.value : null,
    needsReview: false
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
  if (location.attempted && !location.valid) {
    showNotice("库位未填齐或数值无效，新字模已留库待补录。");
  }
}

function readFormLocation() {
  const raw = [els.cabinetInput.value, els.layerInput.value, els.cellInput.value].map((value) => value.trim());
  if (raw.every((value) => value === "")) return { attempted: false, valid: false, value: null };
  const nums = raw.map(Number);
  const valid = nums.every((num) => Number.isInteger(num) && num >= 1);
  return {
    attempted: true,
    valid,
    value: valid ? { cabinet: nums[0], layer: nums[1], cell: nums[2] } : null
  };
}

function saveLocationEdit(typeId, editorEl) {
  const item = state.inventory.find((entry) => entry.id === typeId);
  if (!item) return;
  const cabinet = Number(editorEl.querySelector("[data-loc-cabinet]").value);
  const layer = Number(editorEl.querySelector("[data-loc-layer]").value);
  const cell = Number(editorEl.querySelector("[data-loc-cell]").value);
  const quantity = Number(editorEl.querySelector("[data-loc-qty]").value);
  if (![cabinet, layer, cell].every((num) => Number.isInteger(num) && num >= 1)) {
    showNotice("柜号、层号、格号需填齐（不小于1的整数），或点「清除库位」留库待补录。");
    return;
  }
  if (!(Number.isInteger(quantity) && quantity >= 1 && quantity <= 99)) {
    showNotice("数量需为1-99的整数。");
    return;
  }
  applyLocationEdit(item, { cabinet, layer, cell }, quantity);
}

function applyLocationEdit(item, newLocation, newQuantity) {
  const locationChanged = locationKey(item.location) !== locationKey(newLocation);
  const usedOnBoard = state.placements.some((placement) => placement.typeId === item.id);
  item.location = newLocation;
  if (Number.isInteger(newQuantity)) item.quantity = newQuantity;
  if (locationChanged && usedOnBoard) item.needsReview = true;
  editingLocationId = null;
  renderAll();
  const notes = [];
  if (locationChanged && usedOnBoard) notes.push("已落字不动，取字单标记待复核");
  const reason = getBlockReason(item);
  if (reason?.code === "over") notes.push(reason.noticeText);
  if (notes.length) showNotice(`「${item.char}」${notes.join("；")}`);
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
}

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.locationFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-loc]");
  if (editButton) {
    const typeId = editButton.dataset.editLoc;
    editingLocationId = editingLocationId === typeId ? null : typeId;
    renderInventory();
    return;
  }
  const saveButton = event.target.closest("[data-loc-save]");
  if (saveButton) {
    const editor = saveButton.closest("[data-loc-editor]");
    if (editor) saveLocationEdit(saveButton.dataset.locSave, editor);
    return;
  }
  const clearButton = event.target.closest("[data-loc-clear]");
  if (clearButton) {
    const item = state.inventory.find((entry) => entry.id === clearButton.dataset.locClear);
    if (item) applyLocationEdit(item, null);
    return;
  }
  if (event.target.closest("[data-loc-cancel]")) {
    editingLocationId = null;
    renderInventory();
    return;
  }
  if (event.target.closest("[data-loc-editor]")) return;
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    if (editingLocationId === typeId) editingLocationId = null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  placeType(Number(cell.dataset.row), Number(cell.dataset.col));
});

els.pickList.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-review]");
  if (!reviewButton) return;
  const item = state.inventory.find((entry) => entry.id === reviewButton.dataset.review);
  if (!item) return;
  item.needsReview = false;
  renderAll();
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((btn) => btn.classList.toggle("active", btn === button));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== `${activeTab}Panel`;
    });
  });
});

renderAll();
