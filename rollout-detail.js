/* Enlarge a matched scene pair while preserving its exact batch and training seed. */
"use strict";
window.createRolloutDetail = ({ ready, onOpen, onClose }) => {
  const $ = id => document.getElementById(id);
  const dialog = $("rollout-detail");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let session = null;
  const current = s => session === s && !s.closing;
  const timeFor = (s, video) => Math.max(0, Math.min(s.position, Number(video.dataset.duration) - .02));
  function crop(canvas, image, index) {
    if (!image) return;
    canvas.getContext("2d").drawImage(image, (index % 10) * 160, Math.floor(index / 10) * 120,
      160, 120, 0, 0, canvas.width, canvas.height);
  }
  function controls(s) {
    $("rollout-detail-time").value = s.position;
    $("rollout-detail-time-output").textContent = `${s.position.toFixed(1)} / ${s.duration.toFixed(1)} s`;
    $("rollout-detail-motion").textContent = s.failed ? "Retry playback" : s.paused ? "Play" : "Pause";
    s.panels.forEach((panel, i) => {
      const episode = s.clips[i].episodes[s.indices[i]];
      const outcome = s.position < episode.outcomeAt ? "Running" : episode.success ? "Success" : "Failure";
      const label = panel.querySelector(".rollout-detail-outcome");
      label.textContent = outcome;
      label.dataset.outcome = outcome.toLowerCase();
    });
  }
  function draw(s) {
    s.videos.forEach((video, i) => {
      if (video.readyState >= 2 && !video.seeking) crop(s.canvases[i], video, s.indices[i]);
    });
    controls(s);
  }
  function stop(s) {
    cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.videos.forEach(video => video.pause());
  }
  function tick(s, now) {
    if (!current(s) || s.paused || document.hidden) { stop(s); return; }
    s.position += Math.min((now - s.lastTick) / 1000, .2);
    s.lastTick = now;
    if (s.position >= s.duration) { seek(s, 0); return; }
    s.videos.forEach(video => {
      if (video.seeking || video.readyState < 2) return;
      const time = timeFor(s, video);
      if (Math.abs(video.currentTime - time) > .15) video.currentTime = time;
      if (s.position >= Number(video.dataset.duration) - .02) video.pause();
    });
    draw(s);
    s.raf = requestAnimationFrame(now => tick(s, now));
  }
  async function start(s) {
    if (!current(s) || s.opening || !s.loaded || s.paused || document.hidden || s.starting) return;
    s.starting = true;
    const request = s.request;
    try {
      await Promise.all(s.videos.map(video => s.position < Number(video.dataset.duration) - .02 ? video.play() : undefined));
      if (request !== s.request) return;
      if (!current(s) || s.paused || document.hidden) { stop(s); return; }
      if (!s.raf) { s.lastTick = performance.now(); s.raf = requestAnimationFrame(now => tick(s, now)); }
    } catch {
      if (current(s)) { s.paused = true; stop(s); controls(s); }
    } finally {
      s.starting = false;
      if (current(s) && request !== s.request && s.loaded && !s.paused) start(s);
    }
  }
  async function seek(s, time) {
    const request = ++s.request;
    stop(s);
    s.position = Math.max(0, Math.min(time, s.duration));
    s.loaded = false;
    s.failed = false;
    controls(s);
    $("rollout-detail-motion").disabled = true;
    $("rollout-detail-status").textContent = "Loading matched videos…";
    try {
      await Promise.all(s.videos.map(video => ready(video, s.controller.signal)));
      if (!current(s) || request !== s.request) return;
      s.videos.forEach(video => { video.currentTime = timeFor(s, video); });
      await Promise.all(s.videos.map(video => ready(video, s.controller.signal)));
      if (!current(s) || request !== s.request) return;
      s.loaded = true;
      $("rollout-detail-status").textContent = "";
      if (!s.opening) draw(s);
      start(s);
    } catch (error) {
      if (!current(s) || request !== s.request || error.name === "AbortError") return;
      s.failed = true;
      s.paused = true;
      $("rollout-detail-status").textContent = "The videos could not load. Try playback again.";
    } finally {
      if (current(s) && request === s.request) { $("rollout-detail-motion").disabled = false; controls(s); }
    }
  }
  function transform(rect, target) {
    return `translate(${rect.left - target.left}px, ${rect.top - target.top}px) scale(${rect.width / target.width}, ${rect.height / target.height})`;
  }
  function animate(s, opening, starts) {
    if (reduced.matches || s.animate === false) return Promise.resolve();
    s.animations = s.frames.map((frame, i) => {
      const target = frame.getBoundingClientRect();
      const origin = s.cells[i].getBoundingClientRect();
      const from = transform(starts[i], target);
      const to = opening ? "none" : transform(origin, target);
      return frame.animate([{ transform: from, offset: 0 }, { transform: from, offset: .14 }, { transform: to, offset: 1 }],
        { duration: opening ? 680 : 420, easing: "cubic-bezier(.22,.75,.2,1)", fill: "both" });
    });
    return Promise.all(s.animations.map(animation => animation.finished.catch(() => {})));
  }
  function finish(s, { resume = true, focus = true } = {}) {
    if (session !== s) return;
    stop(s);
    s.controller.abort();
    s.animations.forEach(animation => animation.cancel());
    s.cells.forEach(cell => { cell.classList.remove("rollout-origin"); cell.setAttribute("aria-expanded", "false"); });
    $("rollout-pair").classList.remove("detail-active");
    s.videos.forEach(video => { video.removeAttribute("src"); video.load(); });
    dialog.close();
    $("rollout-detail-pair").replaceChildren();
    document.documentElement.classList.remove("rollout-detail-open");
    session = null;
    if (focus && s.trigger.isConnected) {
      const rect = s.trigger.getBoundingClientRect();
      if (matchMedia("(pointer: coarse)").matches || rect.top < 0 || rect.bottom > innerHeight)
        s.trigger.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      s.trigger.focus({ preventScroll: true });
    }
    if (resume) onClose();
  }
  function close({ immediate = false, resume = true, focus = true } = {}) {
    const s = session;
    if (!s || (s.closing && !immediate)) return;
    s.closing = true;
    stop(s);
    s.controller.abort();
    const starts = s.frames.map(frame => frame.getBoundingClientRect());
    s.animations.forEach(animation => animation.cancel());
    if (immediate) { finish(s, { resume, focus }); return; }
    dialog.classList.add("is-expanding");
    animate(s, false, starts).then(() => finish(s, { resume, focus }));
  }
  function open({ clips, originals, previews, cells, indices, trigger, position, paused, title, subtitle, asset, navigation, animate: animateOpen = true }) {
    if (session) close({ immediate: true, resume: false, focus: false });
    const s = { clips, cells, indices, trigger, position, paused, duration: Math.max(...clips.map(clip => clip.duration)),
      controller: new AbortController(), opening: true, loaded: false, closing: false, request: 0, raf: 0, animations: [], navigation, animate: animateOpen };
    session = s;
    onOpen();
    cells.forEach(cell => { cell.classList.add("rollout-origin"); cell.setAttribute("aria-expanded", "true"); });
    $("rollout-pair").classList.add("detail-active");
    $("rollout-detail-title").textContent = title;
    $("rollout-detail-subtitle").textContent = subtitle;
    $("rollout-detail-time").max = s.duration;
    $("rollout-detail-previous").disabled = !navigation || navigation.index === 0;
    $("rollout-detail-next").disabled = !navigation || navigation.index === navigation.total - 1;
    $("rollout-detail-count").textContent = navigation ? `${navigation.index + 1} of ${navigation.total}` : "";
    $("rollout-detail-pair").innerHTML = clips.map((clip, i) => `<section class="rollout-detail-panel ${i ? "chronos" : "baseline"}" data-cohort="${esc(clip.id)}" data-episode-index="${indices[i]}">
      <header class="rollout-detail-label rollout-detail-chrome"><span>${i ? "Ours" : "Baseline"}</span><h4>${esc(clip.method)}</h4><span class="rollout-detail-outcome"></span></header>
      <div class="rollout-detail-frame"><canvas width="160" height="120" role="img" aria-label="${esc(clip.method)}, evaluation seed ${clip.episodes[indices[i]].seed}"></canvas></div>
      <video muted playsinline preload="auto" aria-hidden="true" tabindex="-1" data-duration="${clip.duration}" src="${esc(asset(clip, "video"))}"></video></section>`).join("");
    s.panels = [...$("rollout-detail-pair").children];
    s.videos = s.panels.map(panel => panel.querySelector("video"));
    s.frames = s.panels.map(panel => panel.querySelector(".rollout-detail-frame"));
    s.canvases = s.panels.map(panel => panel.querySelector("canvas"));
    originals.forEach((video, i) => {
      if (previews?.[i]) {
        s.canvases[i].getContext("2d").drawImage(previews[i], 0, 0, s.canvases[i].width, s.canvases[i].height);
        return;
      }
      const image = video.readyState >= 2 ? video : video.posterImage?.complete && video.posterImage.naturalWidth ? video.posterImage : null;
      crop(s.canvases[i], image, indices[i]);
    });
    controls(s);
    dialog.classList.add("is-expanding");
    document.documentElement.classList.add("rollout-detail-open");
    dialog.showModal();
    const starts = cells.map(cell => cell.getBoundingClientRect());
    const opening = animate(s, true, starts);
    requestAnimationFrame(() => { if (current(s)) dialog.classList.remove("is-expanding"); });
    opening.then(() => {
      if (!current(s)) return;
      s.animations.forEach(animation => animation.cancel());
      s.opening = false;
      if (s.loaded) { draw(s); start(s); }
    });
    seek(s, position >= s.duration - .1 ? 0 : position);
  }
  $("rollout-detail-close").addEventListener("click", () => close());
  for (const [id, delta] of [["rollout-detail-previous", -1], ["rollout-detail-next", 1]]) {
    $(id).addEventListener("click", () => {
      const s = session, next = s?.navigation && s.navigation.index + delta;
      if (!s?.navigation || s.closing || next < 0 || next >= s.navigation.total) return;
      s.navigation.select(next, { position: 0, paused: s.paused });
      if (!$(id).disabled) $(id).focus({ preventScroll: true });
    });
  }
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  $("rollout-detail-motion").addEventListener("click", () => {
    const s = session;
    if (!s || s.closing) return;
    s.paused = !s.paused;
    if (s.failed) { s.paused = false; seek(s, s.position); }
    else if (s.paused) stop(s); else start(s);
    controls(s);
  });
  $("rollout-detail-replay").addEventListener("click", () => {
    if (session && !session.closing) { session.paused = false; seek(session, 0); }
  });
  $("rollout-detail-time").addEventListener("input", event => {
    if (session && !session.closing) seek(session, Number(event.target.value));
  });
  document.addEventListener("visibilitychange", () => {
    if (session) { if (document.hidden) stop(session); else start(session); }
  });
  reduced.addEventListener("change", event => {
    if (event.matches && session) {
      session.animations.forEach(animation => animation.cancel());
      session.paused = true; stop(session); controls(session);
    }
  });
  return { open, close, get isOpen() { return session !== null; } };
};
