(() => {
  "use strict";
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function mount(root, figure) {
    if (!root) return;
    let entries = figure.items;
    const asset = state => `assets/figures/${state.asset}${state.version ? `?v=${state.version}` : ""}`;
    const source = asset(figure);
    const hotspots = () => entries.map(item => `<g class="diagram-hotspot ${item.kind}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(item.title)}" data-item="${item.id}"><rect x="${item.box[0]}" y="${item.box[1]}" width="${item.box[2]}" height="${item.box[3]}" rx="2"/></g>`).join("");
    const copy = root.querySelector(".diagram-copy");
    const focusId = `${root.id}-focus`;
    root.style.setProperty("--diagram-min-width", `${figure.minWidth}px`);
    root.innerHTML = `<div class="diagram-scroll" role="region" aria-label="Scrollable interactive figure" tabindex="0"><div class="diagram-stage"><img src="${source}" alt="${esc(figure.label)}. Click an element to read its description." width="${figure.width}" height="${figure.height}"><svg viewBox="0 0 ${figure.width} ${figure.height}" role="group" aria-label="${esc(figure.label)} elements"><defs><mask id="${focusId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${figure.width}" height="${figure.height}"></mask></defs><image class="diagram-color-focus" href="${source}" width="${figure.width}" height="${figure.height}" mask="url(#${focusId})" pointer-events="none"/><g class="diagram-hotspots">${hotspots()}</g></svg></div></div><div class="diagram-explanation" aria-live="polite" hidden><h4></h4><p></p></div>`;
    if (copy) {
      root.prepend(copy);
    }
    const show = id => {
      const item = entries.find(value => value.id === id);
      if (!item) return;
      root.dataset.selection = id;
      root.classList.add("has-selection");
      root.querySelector(".diagram-explanation").hidden = false;
      // RoPE links the two representations of the same content. Timestamps
      // remain separate selections, including clocks overlapping a token.
      const highlighted = figure.linkedTokens && item.kind === "token"
        ? entries.filter(value => value.group === item.group && value.kind === "token")
        : [item];
      const excludedTimes = item.kind === "time" ? [] :
        entries.filter(value => value.group === item.group && value.kind === "time");
      root.querySelector("mask").innerHTML = [...highlighted, ...excludedTimes]
        .map((value, index) => `<rect x="${value.box[0]}" y="${value.box[1]}" width="${value.box[2]}" height="${value.box[3]}" fill="${index < highlighted.length ? "white" : "black"}"/>`).join("");
      root.querySelector(".diagram-explanation h4").textContent = item.title;
      root.querySelector(".diagram-explanation p").textContent = item.description;
      root.querySelectorAll("[data-item]").forEach(target => {
        const data = entries.find(value => value.id === target.dataset.item);
        target.classList.toggle("is-selected", highlighted.includes(data));
        target.setAttribute("aria-pressed", String(highlighted.includes(data)));
      });
    };
    const clear = () => {
      delete root.dataset.selection;
      root.classList.remove("has-selection");
      root.querySelector(".diagram-explanation").hidden = true;
      root.querySelector("mask").innerHTML = "";
      root.querySelectorAll("[data-item]").forEach(target => {
        target.classList.remove("is-selected");
        target.setAttribute("aria-pressed", "false");
      });
    };
    root.addEventListener("diagramvariantchange", event => {
      const mode = event.detail;
      const state = mode === "positions" ? figure : figure.variants?.[mode];
      if (!state) return;
      entries = state.items;
      root.querySelector(".diagram-stage > img").src = asset(state);
      root.querySelector(".diagram-stage > img").alt = `${state.label}. Click an element to read its description.`;
      root.querySelector(".diagram-stage > svg").setAttribute("aria-label", `${state.label} elements`);
      root.querySelector(".diagram-color-focus").setAttribute("href", asset(state));
      root.querySelector(".diagram-hotspots").innerHTML = hotspots();
      root.dataset.mode = mode;
      clear();
      const scroll = root.querySelector(".diagram-scroll");
      const scale = root.querySelector(".diagram-stage").clientWidth / figure.width;
      const focusX = mode === "rope" ? 425 : mode === "embedding" ? 330 : 270;
      scroll.scrollLeft = Math.max(0, focusX * scale - scroll.clientWidth / 2);
    });
    root.addEventListener("click", event => {
      const target = event.target.closest("[data-item]");
      if (target) show(target.dataset.item);
      else if (event.target.closest(".diagram-stage")) clear();
    });
    root.addEventListener("focusin", event => {
      const target = event.target.closest("[data-item]");
      if (target) show(target.dataset.item);
    });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { clear(); return; }
      const target = event.target.closest("[data-item]");
      if (target && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        show(target.dataset.item);
      }
    });
    return show;
  }
  for (const [id, figure] of Object.entries(window.CHRONOS_DIAGRAMS)) {
    mount(document.getElementById(id), figure);
  }
})();
