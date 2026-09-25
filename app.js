const storageKey = "zfl16-movable-type-workshop";
const MAX_PER_CELL = 3;

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 2, wear: "微磨", location: { cabinet: 1, layer: 2, cellNo: 4 } },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 1, wear: "旧痕", location: { cabinet: 1, layer: 2, cellNo: 4 } },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨", location: { cabinet: 2, layer: 1, cellNo: 7 } },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新", location: { cabinet: 2, layer: 1, cellNo: 8 } },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕", location: { cabinet: 3, layer: 3, cellNo: 2 } },
  // 换柜架后尚未补录库位的旧字模：留库待补录，暂不落字
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新", location: null }
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
let editingLocationId = null;

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
  cabinetInput: document.querySelector("#cabinetInput"),
  layerInput: document.querySelector("#layerInput"),
  cellInput: document.querySelector("#cellInput"),
  wearInput: document.querySelector("#wearInput"),
  formNotice: document.querySelector("#formNotice"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  placeNotice: document.querySelector("#placeNotice"),
  pickList: document.querySelector("#pickList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn")
};

function normalizeLocation(location) {
  if (!location) return null;
  const cabinet = Number(location.cabinet);
  const layer = Number(location.layer);
  const cellNo = Number(location.cellNo);
  if (!Number.isInteger(cabinet) || !Number.isInteger(layer) || !Number.isInteger(cellNo)) return null;
  if (cabinet < 1 || layer < 1 || cellNo < 1) return null;
  return { cabinet, layer, cellNo };
}

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
    // 旧数据没有库位：缺库位的旧字模留库待补录，不强行迁入
    if (Array.isArray(merged.inventory)) {
      merged.inventory.forEach((item) => {
        item.location = normalizeLocation(item.location);
      });
    }
    if (Array.isArray(merged.placements)) {
      merged.placements.forEach((placement) => {
        placement.location = normalizeLocation(placement.location);
      });
    }
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
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

// 同一位置（同柜同层同格）合计枚数；excludeId 为正在改库位的字模自身
function cellOccupancy(cabinet, layer, cellNo, excludeId = null) {
  return state.inventory.reduce((total, item) => {
    if (item.id === excludeId || !item.location) return total;
    if (
      item.location.cabinet === cabinet &&
      item.location.layer === layer &&
      item.location.cellNo === cellNo
    ) {
      return total + item.quantity;
    }
    return total;
  }, 0);
}

// 返回字模不能落字的原因；null 表示可以落字
function blockReason(item) {
  if (!item || !item.location) return "缺库位：换柜架后尚未补录，留库待补";
  const occupancy = cellOccupancy(item.location.cabinet, item.location.layer, item.location.cellNo);
  if (occupancy > MAX_PER_CELL) {
    return `库位超容：${item.location.cabinet}柜${item.location.layer}层${item.location.cellNo}格共${occupancy}枚，限${MAX_PER_CELL}枚`;
  }
  return null;
}

function locationLabel(location) {
  return location ? `${location.cabinet}-${location.layer}-${location.cellNo}` : "缺库位";
}

function locationsEqual(a, b) {
  if (!a || !b) return false;
  return a.cabinet === b.cabinet && a.layer === b.layer && a.cellNo === b.cellNo;
}

function showPlaceNotice(text) {
  els.placeNotice.textContent = text;
  els.placeNotice.hidden = false;
}

function clearPlaceNotice() {
  els.placeNotice.hidden = true;
  els.placeNotice.textContent = "";
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

function renderTypeCard(item, used) {
  const selected = item.id === state.selectedTypeId ? "selected" : "";
  const blocked = blockReason(item);
  const occupancy = item.location
    ? cellOccupancy(item.location.cabinet, item.location.layer, item.location.cellNo, item.id) + item.quantity
    : null;
  const capClass = item.location && occupancy > MAX_PER_CELL ? "over" : "ok";
  let locationBlock = "";
  if (editingLocationId === item.id) {
    locationBlock = `
      <form class="loc-edit" data-loc-form="${item.id}">
        <input type="number" min="1" max="99" name="cabinet" value="${item.location ? item.location.cabinet : ""}" placeholder="柜" title="柜号" required />
        <input type="number" min="1" max="99" name="layer" value="${item.location ? item.location.layer : ""}" placeholder="层" title="层号" required />
        <input type="number" min="1" max="99" name="cellNo" value="${item.location ? item.location.cellNo : ""}" placeholder="格" title="格号" required />
        <button type="submit" class="mini-btn primary" title="保存库位">✓</button>
        <button type="button" class="mini-btn" data-loc-cancel="${item.id}" title="取消">×</button>
        <p class="card-error" data-loc-error hidden></p>
      </form>
    `;
  } else if (!item.location) {
    locationBlock = `<div class="loc-info missing">缺库位 · 留库待补录
      <button type="button" class="mini-btn" data-loc-edit="${item.id}" title="补录库位">补录</button>
    </div>`;
  } else {
    locationBlock = `
      <div class="loc-info ${capClass}">
        <span title="柜号-层号-格号 · 该格合计枚数">${item.location.cabinet}柜 ${item.location.layer}层 ${item.location.cellNo}格 · 本格${occupancy}/${MAX_PER_CELL}枚</span>
        <button type="button" class="mini-btn" data-loc-edit="${item.id}" title="调整库位">改</button>
      </div>
    `;
  }
  return `
    <article class="type-card ${selected} ${blocked ? "blocked" : ""}" draggable="true" data-type-id="${item.id}">
      <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
      <div class="type-meta">
        <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
        <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
        ${locationBlock}
      </div>
      <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
      ${blocked ? `<p class="hold-reason">${escapeHtml(blocked)}</p>` : ""}
    </article>
  `;
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  const missingCount = state.inventory.filter((item) => !item.location).length;
  const overCount = state.inventory.filter((item) => blockReason(item) && item.location).length;
  els.inventoryCount.textContent =
    `${state.inventory.length}枚字模` +
    (missingCount ? ` · ${missingCount}枚缺库位` : "") +
    (overCount ? ` · ${overCount}枚超容` : "");

  els.typeList.innerHTML = items.map((item) => renderTypeCard(item, usage[item.id] || 0)).join("");
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
      // 调整库位不动已落字；与现台账不符的格子只标记待复核
      const needsReview = placement ? !locationsEqual(placement.location, type ? type.location : null) : false;
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical} ${needsReview ? "review" : ""}"
          data-row="${row}" data-col="${col}" type="button"
          title="第${row + 1}行第${col + 1}列${needsReview ? " · 库位已变动，待复核" : ""}"
          aria-label="第${row + 1}行第${col + 1}列${needsReview ? "，待复核" : ""}">
          ${type ? escapeHtml(type.char) : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

// 取字单：按已用字生成，同柜层合并枚数，再按柜号、层号、格号排列
function buildPickGroups() {
  const usage = getUsage();
  const rows = state.inventory
    .filter((item) => usage[item.id])
    .map((item) => {
      const used = usage[item.id];
      const placements = state.placements.filter((p) => p.typeId === item.id);
      // 落字后库位被调整（或旧落字没有快照）→ 清单标记待复核，但不动已落字
      const changed = placements.some((p) => !locationsEqual(p.location, item.location));
      const reason = blockReason(item);
      const review = changed || Boolean(reason);
      return { item, used, changed, reason, review };
    });

  const groups = [];
  const byCabinetLayer = new Map();
  rows.forEach((row) => {
    const loc = row.item.location;
    let key;
    if (loc) {
      key = `l:${loc.cabinet}:${loc.layer}`;
    } else {
      key = "missing"; // 缺库位的旧字模：留库待补录，取字单列在末尾
    }
    if (!byCabinetLayer.has(key)) {
      const group = {
        cabinet: loc ? loc.cabinet : null,
        layer: loc ? loc.layer : null,
        missing: !loc,
        rows: []
      };
      byCabinetLayer.set(key, group);
      groups.push(group);
    }
    byCabinetLayer.get(key).rows.push(row);
  });

  groups.sort((a, b) => {
    if (a.missing !== b.missing) return a.missing ? 1 : -1;
    if (a.cabinet !== b.cabinet) return a.cabinet - b.cabinet;
    if (a.layer !== b.layer) return a.layer - b.layer;
    return 0;
  });

  groups.forEach((group) => {
    group.rows.sort((a, b) => {
      const la = a.item.location;
      const lb = b.item.location;
      if (!la || !lb) return a.item.char.localeCompare(b.item.char, "zh-CN");
      if (la.cellNo !== lb.cellNo) return la.cellNo - lb.cellNo;
      return a.item.char.localeCompare(b.item.char, "zh-CN");
    });
    group.total = group.rows.reduce((sum, row) => sum + row.used, 0);
    group.reviewCount = group.rows.filter((row) => row.review).length;
  });

  return groups;
}

function renderPickList() {
  els.placedCount.textContent = `${state.placements.length}个落字`;
  const groups = buildPickGroups();
  const reviewRows = groups.reduce((sum, group) => sum + group.reviewCount, 0);

  if (groups.length === 0) {
    els.shortageBadge.textContent = "版面还空着";
    els.shortageBadge.className = "badge ok";
    els.pickList.innerHTML = `<p class="empty">落字后在这里生成取字单。</p>`;
    return;
  }

  els.shortageBadge.textContent = reviewRows ? `${reviewRows}项待复核` : "取字单已就绪";
  els.shortageBadge.className = `badge ${reviewRows ? "warn" : "ok"}`;

  els.pickList.innerHTML = groups
    .map((group) => {
      const head = group.missing
        ? `<div class="pick-head missing"><strong>缺库位 · 留库待补录</strong><span>合计 ${group.total} 枚</span></div>`
        : `<div class="pick-head"><strong>${group.cabinet}柜 ${group.layer}层</strong><span>合计 ${group.total} 枚${group.reviewCount ? ` · ${group.reviewCount}项待复核` : ""}</span></div>`;
      const body = group.rows
        .map((row) => {
          const loc = row.item.location;
          const note = row.reason
            ? escapeHtml(row.reason)
            : row.changed
              ? "库位已调整，待复核后再取字"
              : "";
          return `
            <div class="pick-row ${row.review ? "review" : ""}">
              <span class="pick-glyph">${escapeHtml(row.item.char)}</span>
              <span class="pick-loc">${loc ? `${loc.cellNo}格` : "待补录"}</span>
              <span class="pick-qty">×${row.used}</span>
              ${row.review ? `<em class="review-tag" title="${note || "待复核"}">待复核</em>` : ""}
              ${note ? `<small class="pick-note">${note}</small>` : ""}
            </div>
          `;
        })
        .join("");
      return `<section class="pick-group ${group.missing ? "missing" : ""} ${group.reviewCount ? "has-review" : ""}">${head}${body}</section>`;
    })
    .join("");
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderPickList();
  renderDrafts();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const item = state.inventory.find((entry) => entry.id === typeId);
  const existingIndex = state.placements.findIndex((entry) => entry.row === row && entry.col === col);
  const existing = existingIndex >= 0 ? state.placements[existingIndex] : null;

  if (existing && existing.typeId === typeId) {
    // 再次点同一个字：擦除该格
    state.placements.splice(existingIndex, 1);
    clearPlaceNotice();
    renderAll();
    return;
  }

  // 没有库位或超出容量时，当前格子不许落字（已落的字也不被替换）
  const reason = blockReason(item);
  if (reason) {
    showPlaceNotice(`「${item.char} · ${item.style}」不能落字：${reason}。`);
    return;
  }

  if (existing) {
    existing.typeId = typeId;
    existing.location = structuredClone(item.location); // 记下取字时的库位快照
  } else {
    state.placements.push({ row, col, typeId, location: structuredClone(item.location) });
  }
  clearPlaceNotice();
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const location = {
    cabinet: Number(els.cabinetInput.value),
    layer: Number(els.layerInput.value),
    cellNo: Number(els.cellInput.value)
  };
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value,
    location
  };
  if (!item.char || !item.style) return;

  // 同一位置合计不能超过三枚；超出时该字模不能登记入位
  const occupancy = cellOccupancy(location.cabinet, location.layer, location.cellNo);
  if (occupancy + item.quantity > MAX_PER_CELL) {
    els.formNotice.textContent = `登记失败：${location.cabinet}柜${location.layer}层${location.cellNo}格已有${occupancy}枚，再加${item.quantity}枚将超过${MAX_PER_CELL}枚上限。`;
    els.formNotice.hidden = false;
    return;
  }
  els.formNotice.hidden = true;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
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
[els.cabinetInput, els.layerInput, els.cellInput].forEach((input) => {
  input.addEventListener("input", () => {
    els.formNotice.hidden = true;
  });
});
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  clearPlaceNotice();
  renderAll();
});

els.typeList.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-loc-form]");
  if (!form) return;
  event.preventDefault();
  const typeId = form.dataset.locForm;
  const item = state.inventory.find((entry) => entry.id === typeId);
  if (!item) return;
  const next = {
    cabinet: Number(form.elements.cabinet.value),
    layer: Number(form.elements.layer.value),
    cellNo: Number(form.elements.cellNo.value)
  };
  const errorEl = form.querySelector("[data-loc-error]");
  // 调整库位同样受每格三枚限制（调整不动已落字，只影响后续落字与复核标记）
  const occupancy = cellOccupancy(next.cabinet, next.layer, next.cellNo, typeId);
  if (occupancy + item.quantity > MAX_PER_CELL) {
    errorEl.textContent = `该格已有${occupancy}枚，连本字模${item.quantity}枚共${occupancy + item.quantity}枚，超过${MAX_PER_CELL}枚，无法改入。`;
    errorEl.hidden = false;
    return;
  }
  item.location = next;
  editingLocationId = null;
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const locEdit = event.target.closest("[data-loc-edit]");
  if (locEdit) {
    editingLocationId = locEdit.dataset.locEdit;
    renderInventory();
    return;
  }
  const locCancel = event.target.closest("[data-loc-cancel]");
  if (locCancel) {
    editingLocationId = null;
    renderInventory();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    if (editingLocationId === typeId) editingLocationId = null;
    clearPlaceNotice();
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  const item = getSelectedType();
  const reason = blockReason(item);
  if (reason) {
    showPlaceNotice(`「${item.char} · ${item.style}」不能落字：${reason}。`);
  } else {
    clearPlaceNotice();
  }
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

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements).map((placement) => ({
      ...placement,
      location: normalizeLocation(placement.location)
    }));
    clearPlaceNotice();
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();
