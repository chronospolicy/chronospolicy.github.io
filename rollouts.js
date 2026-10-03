(() => {
  "use strict";
  const data = window.CHRONOS_DATA;
  const grids = data.rolloutGrids;
  const overviews = window.CHRONOS_OVERVIEWS || { streams: {}, cohorts: {} };
  if (!grids?.groups.length) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const asset = (clip, key) => clip.version ? `${clip[key]}?v=${clip.version}` : clip[key];
  const narrow = matchMedia("(max-width: 600px)");
  const mobile = matchMedia("(max-width: 600px), (max-width: 1024px) and (pointer: coarse)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let dense = !mobile.matches, densityChosen = false;
  const sceneColumns = () => narrow.matches ? 2 : 5;
  let overviewTileColumns = 25;
  let paused = reduced.matches || mobile.matches, visible = false, version = 0, seekVersion = 0, loadingVersion = -1, selectedSeed = null;
  let players = [], clips = [], boards = [], sources = [];
  let position = 0, duration = 0, animation = 0, lastUpdate = 0;
  let visibleBoards = new Set();
  let boardObserver, inView = new Set(), replayPending = false;
  let lifetime = new AbortController();
  const detailViewer = window.createRolloutDetail({ ready, onOpen: stop, onClose: () => play() });
  const options = (id, values, allLabel) => {
    $(id).innerHTML = (allLabel ? `<option value="all">${esc(allLabel)}</option>` : "") +
      Object.entries(values).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
  };
  const sets = () => grids.groups.filter(g => g.task === $("grid-task").value && g.condition === $("grid-condition").value);
  const batchKeys = () => [...new Set(sets().map(g => g.batch || "original"))];
  const seedSets = () => sets().filter(g => $("grid-training-seed").value === "all" || (g.trainingSeed || 0) === Number($("grid-training-seed").value));
  const selectedSets = () => seedSets().filter(g => $("grid-batch").value === "all" || (g.batch || "original") === $("grid-batch").value);
  const group = () => selectedSets()[0];
  const hasPreviewRollouts = () => clips.some(clip => clip.encodingVersion === 1);
  const activePlayers = () => players.filter(video => inView.has(video));
  const shouldPlay = () => !paused && visible && !document.hidden && !detailViewer.isOpen;
  const clipTime = (video, time = position) => Math.min(time, Number(video.dataset.duration) - .02);
  const descriptions = {
    nominal: "Original sensor timing; no added inference delay.",
    sensor_id: "Small changes in sensor rates and delivery delays.",
    sensor_ood: "Larger changes in sensor rates and delivery delays.",
    inference_0_100ms: "Added inference delay between 0 and 100 ms.",
    inference_0_200ms: "Added inference delay between 0 and 200 ms.",
    combined_sensor_ood_inference_0_200ms: "Changing sensor rates and delivery delays, plus 0–200 ms added inference delay.",
  };
  function conditions() {
    const previous = $("grid-condition").value;
    const available = Object.fromEntries(Object.entries(data.simConditions).filter(([condition]) =>
      grids.groups.some(g => g.task === $("grid-task").value && g.condition === condition)));
    options("grid-condition", available);
    if (available[previous]) $("grid-condition").value = previous;
    rolloutSets();
  }
  function rolloutSets() {
    const previous = $("grid-training-seed").value;
    const available = sets();
    const seeds = [...new Set(available.map(g => g.trainingSeed || 0))].sort((a, b) => a - b);
    options("grid-training-seed", Object.fromEntries(seeds.map(seed => [seed, `Seed ${seed}`])), "All training seeds");
    if (previous === "all" || (previous !== "" && seeds.includes(Number(previous)))) $("grid-training-seed").value = previous;
    evaluationBatches();
  }
  function evaluationBatches() {
    const previous = $("grid-batch").value;
    const available = [...new Set(seedSets().map(g => g.batch || "original"))];
    options("grid-batch", Object.fromEntries(available.map(batch =>
      [batch, `Seed batch ${batchKeys().indexOf(batch)}`])), "All seed batches");
    if (previous === "all" || available.includes(previous)) $("grid-batch").value = previous;
    policies();
  }
  function policies() {
    const previous = $("grid-policy").value;
    const current = group();
    options("grid-policy", Object.fromEntries(["dp", "randomized", "no_randomization", "addtime"]
      .filter(method => current.cohorts[method])
      .map(method => [method, grids.cohorts[current.cohorts[method]].method])));
    if (current.cohorts[previous]) $("grid-policy").value = previous;
    render();
  }
  function state(episode, time) {
    return time < episode.outcomeAt ? "Running" : episode.success ? "Success" : "Failure";
  }
  function describeSelection() {
    if (selectedSeed === null) {
      $("grid-scene-description").textContent = "";
      return;
    }
    $("grid-scene-description").textContent = `Evaluation seed ${selectedSeed} · ` + clips.flatMap(clip => {
      const episode = clip.episodes.find(e => e.seed === selectedSeed);
      return episode ? [`Training seed ${clip.trainingSeed || 0}, ${clip.method}: ${state(episode, position)}`] : [];
    }).join(" · ");
  }
  function updateTime() {
    $("grid-time").value = position;
    $("grid-time-output").textContent = `${position.toFixed(1)} / ${duration.toFixed(1)} s`;
    clips.forEach((clip, index) => {
      boards[index].cells.forEach((button, i) => {
        const status = state(clip.episodes[i], position);
        if (button.dataset.outcome === status.toLowerCase()) return;
        button.dataset.outcome = status.toLowerCase();
        button.setAttribute("aria-label", `${clip.method}, training seed ${clip.trainingSeed || 0}, evaluation seed ${clip.episodes[i].seed}: ${status}. Open matched comparison.`);
        button.title = `Training seed ${clip.trainingSeed || 0} · Evaluation seed ${clip.episodes[i].seed}: ${status} · Open comparison`;
      });
    });
    describeSelection();
  }
  function tick(now) {
    if (!shouldPlay()) { animation = 0; return; }
    const active = activePlayers();
    const clock = active.find(video => Number(video.dataset.duration) >= duration - .04) || active[0];
    if (clock && !clock.seeking && clock.readyState >= 2) position = clock.currentTime;
    if (position >= duration - .025) { seekTo(0); return; }
    active.forEach(video => {
      if (video.readyState < 2 || video.seeking) return;
      video.renderFrame?.();
      const time = clipTime(video);
      if (position >= Number(video.dataset.duration) - .02) { video.pause(); return; }
      if (video === clock) return;
      if (clock.readyState < 3) { video.pause(); return; }
      const drift = time - video.currentTime;
      // Small rate corrections avoid repeatedly flushing the decoder with seeks.
      video.playbackRate = drift > .05 ? 1.03 : drift < -.05 ? .97 : 1;
      if (Math.abs(drift) > .6 && now - (video.lastResync || 0) > 1500) {
        video.currentTime = time;
        video.lastResync = now;
      }
      if (video.paused) video.play().catch(() => { paused = true; stop(); });
    });
    if (now - lastUpdate > 100) { updateTime(); lastUpdate = now; }
    animation = requestAnimationFrame(tick);
  }
  function ready(video, signal) {
    if (signal.aborted) return Promise.reject(new DOMException("Selection changed", "AbortError"));
    if (video.readyState >= 2 && !video.seeking) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        for (const event of ["loadeddata", "canplay", "seeked"]) video.removeEventListener(event, done);
        video.removeEventListener("error", failed);
        signal.removeEventListener("abort", aborted);
      };
      const done = () => { if (video.readyState >= 2 && !video.seeking) { cleanup(); resolve(); } };
      const failed = () => { cleanup(); reject(new Error("Video unavailable")); };
      const aborted = () => { cleanup(); reject(new DOMException("Selection changed", "AbortError")); };
      const timer = setTimeout(failed, 20000);
      for (const event of ["loadeddata", "canplay", "seeked"]) video.addEventListener(event, done);
      video.addEventListener("error", failed);
      signal.addEventListener("abort", aborted, { once: true });
      video.preload = "auto";
      if (video.networkState === 0 || video.error) video.load();
    });
  }
  async function play() {
    const generation = version, currentPlayers = activePlayers(), signal = lifetime.signal;
    if (!shouldPlay() || !currentPlayers.length) return;
    if (loadingVersion === generation) { replayPending = true; return; }
    loadingVersion = generation;
    let retryAfterAbort = false;
    try {
      await Promise.all(currentPlayers.map(video => ready(video, signal)));
      if (generation !== version || !shouldPlay()) return;
      await Promise.all(currentPlayers.filter(video => inView.has(video)).map(video => {
        video.playbackRate = 1;
        const time = clipTime(video);
        if (Math.abs(video.currentTime - time) > .01) video.currentTime = time;
        return position < Number(video.dataset.duration) - .02 ? video.play() : undefined;
      }));
      if (generation === version && shouldPlay()) {
        $("grid-motion").textContent = "Pause";
        if (!animation) animation = requestAnimationFrame(tick);
      }
      currentPlayers.filter(video => !shouldPlay() || !inView.has(video)).forEach(video => video.pause());
    } catch (error) {
      if (generation === version) {
        if (error.name === "AbortError") { retryAfterAbort = true; return; }
        paused = true;
        stop();
        $("grid-motion").textContent = "Retry playback";
      }
    } finally {
      if (generation === version) {
        loadingVersion = -1;
        $("grid-motion").disabled = false;
        if ((retryAfterAbort || replayPending) && shouldPlay()) {
          replayPending = false;
          requestAnimationFrame(play);
        }
      }
    }
  }
  function stop() {
    cancelAnimationFrame(animation);
    animation = 0;
    players.forEach(video => video.pause());
    $("grid-motion").textContent = paused ? "Play" : "Pause";
  }
  function sizeCanvases() {
    boards.forEach(board => {
      const columns = dense ? overviewTileColumns : sceneColumns(), rows = 50 / columns;
      const source = sources[board.source];
      const scale = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.ceil(Math.min(columns * source.tileWidth, board.canvas.clientWidth * scale)));
      const height = Math.max(1, Math.round(width * rows * source.tileHeight / (columns * source.tileWidth)));
      if (board.canvas.width !== width || board.canvas.height !== height) {
        board.canvas.width = width; board.canvas.height = height;
      }
    });
  }
  function drawBoard(board, image) {
    const { canvas } = board, context = canvas.getContext("2d");
    const source = sources[board.source], tw = source.tileWidth, th = source.tileHeight;
    const columns = dense ? overviewTileColumns : sceneColumns();
    const offset = board.overviewIndex * 2 * th;
    if (columns === source.columns) {
      context.drawImage(image, 0, offset, columns * tw, 50 / columns * th, 0, 0, canvas.width, canvas.height);
      return;
    }
    // Copy the longest strip that fits both source and destination rows.
    for (let i = 0; i < 50;) {
      const count = Math.min(source.columns - i % source.columns, columns - i % columns, 50 - i);
      context.drawImage(image, (i % source.columns) * tw, offset + Math.floor(i / source.columns) * th, count * tw, th,
        (i % columns) * canvas.width / columns, Math.floor(i / columns) * canvas.height / (50 / columns),
        count * canvas.width / columns, canvas.height / (50 / columns));
      i += count;
    }
  }
  function previewTile(board, episode) {
    const video = players[board.source], source = sources[board.source];
    const image = video.readyState >= 2 ? video : video.posterImage;
    if (!image || (image instanceof HTMLImageElement && !image.naturalWidth)) return null;
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 120;
    canvas.getContext("2d").drawImage(image, (episode % source.columns) * source.tileWidth,
      board.overviewIndex * 2 * source.tileHeight + Math.floor(episode / source.columns) * source.tileHeight,
      source.tileWidth, source.tileHeight, 0, 0, 160, 120);
    return canvas;
  }
  function describeView() {
    const shown = selectedSets(), available = sets();
    const total = available.reduce((count, item) => count + grids.cohorts[item.cohorts.chronos].trials, 0);
    const count = clips.filter(clip => clip.methodKey === "chronos").reduce((sum, clip) => sum + clip.trials, 0);
    const coverage = hasPreviewRollouts()
      ? `Showing ${count} preview reruns per policy (2×) · Benchmark: 150 evaluations per policy`
      : `${shown.length === available.length ? `Showing all ${total}` : `Showing ${count} of ${total}`} rollouts per policy (2×)`;
    $("grid-set-summary").textContent = `${coverage}${dense ? " · All visible" : " · Scroll inside to explore"}`;
    $("rollout-pair").setAttribute("aria-label", dense
      ? `Matched rollout videos. All ${count} rollouts per policy visible.`
      : "Matched rollout videos. Scroll to explore all selected seeds.");
    $("grid-density").textContent = dense ? "Larger tiles" : mobile.matches ? "Overview" : "Show all at once";
    $("grid-density").setAttribute("aria-pressed", String(!dense));
  }
  function sizeWindow() {
    const panel = $("rollout-pair");
    const screen = panel.querySelector(".rollout-screen");
    if (!screen) return;
    if (dense) {
      panel.style.removeProperty("--rollout-window-height");
      $("rollout-headings").style.paddingRight = "0px";
      return;
    }
    const rowsPerClip = 50 / sceneColumns();
    const rowHeight = screen.getBoundingClientRect().height / rowsPerClip;
    const visibleRows = Math.min(9.25, clips.length / 2 * rowsPerClip);
    const style = getComputedStyle(panel);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const height = `${Math.ceil(rowHeight * visibleRows + padding)}px`;
    if (panel.style.getPropertyValue("--rollout-window-height") !== height)
      panel.style.setProperty("--rollout-window-height", height);
    $("rollout-headings").style.paddingRight = `${panel.offsetWidth - panel.clientWidth}px`;
  }
  function render() {
    detailViewer.close({ immediate: true, resume: false, focus: false });
    const generation = ++version;
    stop();
    boardObserver?.disconnect();
    inView = new Set();
    visibleBoards = new Set();
    position = 0;
    replayPending = false;
    lifetime.abort();
    lifetime = new AbortController();
    players.forEach(video => {
      video.pause();
      if (video.frameCallback) video.cancelVideoFrameCallback(video.frameCallback);
      if (video.posterImage) {
        video.posterImage.onload = null;
        video.posterImage.removeAttribute("src");
      }
      video.removeAttribute("src"); video.load();
    });
    const current = group();
    const shown = selectedSets();
    clips = shown.flatMap(item => [grids.cohorts[item.cohorts[$("grid-policy").value]], grids.cohorts[item.cohorts.chronos]]);
    sources = [];
    boards = clips.map((clip, index) => {
      const ref = overviews.cohorts[clip.id];
      const key = ref?.stream || clip.id;
      let source = sources.findIndex(item => item.key === key);
      if (source < 0) {
        source = sources.length;
        sources.push({ key, media: ref ? overviews.streams[key] : clip, first: index,
          tileWidth: ref ? overviews.streams[key].tileWidth : 160,
          tileHeight: ref ? overviews.streams[key].tileHeight : 120, columns: ref ? 25 : 10, duration: clip.duration });
      }
      sources[source].duration = Math.max(sources[source].duration, clip.duration);
      return { clip, index, source, overviewIndex: ref?.index || 0 };
    });
    const available = sets();
    const totals = clips.slice(0, 2).map(clip => available.reduce((total, item) => {
      const member = grids.cohorts[item.cohorts[clip.methodKey]];
      return { successes: total.successes + member.successes, trials: total.trials + member.trials };
    }, { successes: 0, trials: 0 }));
    const selectedTotals = clips.slice(0, 2).map(clip => shown.reduce((total, item) => {
      const member = grids.cohorts[item.cohorts[clip.methodKey]];
      return { successes: total.successes + member.successes, trials: total.trials + member.trials };
    }, { successes: 0, trials: 0 }));
    $("rollout-headings").innerHTML = clips.slice(0, 2).map((clip, index) => {
      const selected = selectedTotals[index], total = totals[index];
      const benchmark = hasPreviewRollouts() && data.simResults.find(row =>
        row.task === clip.task && row.condition === clip.condition && row.method === clip.method);
      const reference = benchmark
        ? `<span class="rollout-total">Benchmark: ${benchmark.mean.toFixed(1)} ± ${benchmark.sd.toFixed(1)}% · 150 trials</span>`
        : selected.trials !== total.trials ? `<span class="rollout-total">${total.successes}/${total.trials} overall · ${(100 * total.successes / total.trials).toFixed(1)}%</span>` : "";
      return `<div class="rollout-heading ${index ? "chronos" : ""}"><div><span class="rollout-policy-role">${index ? "Ours" : "Baseline"}</span><h4>${esc(clip.method)}</h4></div><p>${benchmark ? "Preview: " : ""}<strong>${selected.successes}/${selected.trials}</strong> · ${(100 * selected.successes / selected.trials).toFixed(1)}%${reference}</p></div>`;
    }).join("");
    describeView();
    const seeds = [...new Set(shown.flatMap(item => item.seeds))].sort((a, b) => a - b);
    if (!seeds.includes(selectedSeed)) selectedSeed = null;
    $("grid-evaluation-seed").innerHTML = '<option value="all">All scenes</option>' +
      seeds.map(seed => `<option value="${seed}">Seed ${seed}</option>`).join("");
    $("grid-evaluation-seed").value = selectedSeed === null ? "all" : String(selectedSeed);
    duration = Math.max(...clips.map(clip => clip.duration));
    $("grid-time").max = duration;
    const sourceLabel = current.task === "conveyor" ? "Recorded trajectories."
      : current.task === "flipup" ? "Replayed trajectories."
      : hasPreviewRollouts() ? "Preview reruns; benchmark scores use the original 150 evaluations. Whiskers show sample SD across 3 training seeds."
      : "Checkpoint reruns.";
    const timing = grids.version === 2 && current.task === "flipup" && current.condition === "sensor_id"
      ? "Small changes in sensor rates; no added sensor delivery delay."
      : descriptions[current.condition];
    $("grid-timing-description").textContent = `${timing} ${sourceLabel}`;
    const overviewColumns = shown.length >= 6 ? 1 : shown.length;
    overviewTileColumns = shown.length >= 6 ? 25 : shown.length > 1 ? 5 : 10;
    $("rollout-pair").style.setProperty("--overview-columns", overviewColumns);
    $("rollout-pair").style.setProperty("--overview-tile-columns", overviewTileColumns);
    $("rollout-pair").style.setProperty("--overview-tile-rows", 50 / overviewTileColumns);
    $("rollout-pair").style.setProperty("--overview-aspect", `${overviewTileColumns * 4} / ${50 / overviewTileColumns * 3}`);
    $("rollout-pair").dataset.baseline = clips[0].method;
    $("rollout-pair").innerHTML = clips.map((clip, index) =>
      `<article class="rollout-board ${index % 2 ? "chronos" : ""} ${index % 2 === 0 && Math.floor(index / 2) % overviewColumns === overviewColumns - 1 ? "baseline-edge" : ""}" data-board="${index}" data-cohort="${clip.id}" style="--overview-column:${Math.floor(index / 2) % overviewColumns + (index % 2) * (overviewColumns + 1) + 1};--overview-row:${Math.floor(index / 2 / overviewColumns) + 1}" aria-label="${esc(clip.method)}, training seed ${clip.trainingSeed || 0}, seed batch ${batchKeys().indexOf(clip.batch || "original")}"><div class="rollout-screen">${sources[boards[index].source].first === index ? `<video muted playsinline preload="none" data-duration="${sources[boards[index].source].duration}" data-source="${boards[index].source}" src="${esc(asset(sources[boards[index].source].media, "video"))}" poster="${esc(asset(sources[boards[index].source].media, "poster"))}" aria-label="${esc(clip.method)}, ${esc(data.simTasks[clip.task])}, synchronized rollout overview"></video>` : ""}<canvas width="1600" height="600" aria-hidden="true"></canvas><div class="rollout-cells">${clip.episodes.map((episode, i) => {
        const row = Math.floor(i / 10), col = i % 10;
        return `<button type="button" class="rollout-cell" data-seed="${episode.seed}" data-episode="${i}" aria-pressed="${episode.seed === selectedSeed}" aria-haspopup="dialog" aria-controls="rollout-detail" aria-expanded="false" style="--mobile-row:${row * 2 + (col < 5 ? 1 : 2)};--mobile-col:${col % 5 + 1}"></button>`;
      }).join("")}</div></div></article>`).join("");
    players = [...$("rollout-pair").querySelectorAll("video")];
    $("rollout-pair").scrollTop = 0;
    boards.forEach(board => {
      const element = $("rollout-pair").querySelector(`[data-board="${board.index}"]`);
      board.cells = element.querySelectorAll(".rollout-cell");
      board.canvas = element.querySelector("canvas");
    });
    sizeCanvases();
    players.forEach((video, index) => {
      const members = boards.filter(board => board.source === index);
      const poster = new Image();
      video.posterImage = poster;
      poster.onload = () => {
        if (generation === version && video.readyState < 2) members.forEach(board => drawBoard(board, poster));
      };
      poster.src = asset(sources[index].media, "poster");
      let lastDraw = -Infinity;
      const videoFrames = typeof video.requestVideoFrameCallback === "function";
      const draw = (now = performance.now(), force = false, mediaTime = video.currentTime) => {
        if (generation !== version || video.readyState < 2 || video.seeking) return;
        if (!force && (sources[index].media.fps > 30 || !videoFrames) && mediaTime >= lastDraw && mediaTime - lastDraw < 1 / 30 - .001) return;
        members.filter(board => visibleBoards.has(board.index)).forEach(board => drawBoard(board, video));
        lastDraw = mediaTime;
      };
      const nextFrame = (now, metadata) => {
        if (generation !== version) return;
        draw(now, false, metadata.mediaTime);
        video.frameCallback = video.requestVideoFrameCallback(nextFrame);
      };
      if (videoFrames) video.frameCallback = video.requestVideoFrameCallback(nextFrame);
      else { video.renderFrame = () => draw(); video.addEventListener("timeupdate", () => draw()); }
      video.addEventListener("loadeddata", () => draw(performance.now(), true));
      video.addEventListener("seeked", () => draw(performance.now(), true));
    });
    boardObserver = new IntersectionObserver(entries => {
      if (generation !== version) return;
      entries.forEach(entry => {
        const index = Number(entry.target.dataset.board);
        if (entry.isIntersecting) visibleBoards.add(index); else visibleBoards.delete(index);
      });
      inView = new Set([...visibleBoards].map(index => players[boards[index].source]));
      players.forEach(video => {
        video.dataset.visible = String(inView.has(video));
        if (!inView.has(video)) video.pause();
        else if (paused && position > 0) {
          if (video.readyState >= 1) video.currentTime = clipTime(video);
          ready(video, lifetime.signal).then(() => {
            if (generation === version && inView.has(video) && paused) video.currentTime = clipTime(video);
          }).catch(() => {});
        }
      });
      play();
    }, { root: $("rollout-pair"), threshold: 0 });
    $("rollout-pair").querySelectorAll(".rollout-board").forEach(board => boardObserver.observe(board));
    sizeWindow();
    updateTime();
    $("grid-motion").textContent = paused ? "Play" : "Pause";
    $("grid-motion").disabled = false;
    // Keep the benchmark's default selection aligned with the video view.
    $("sim-task").value = current.task;
    $("sim-condition").value = current.condition;
    $("sim-condition").dispatchEvent(new Event("change"));
    if (["conveyor", "flipup"].includes(current.task)) {
      $("ablation-task").value = current.task;
      $("ablation-condition").value = current.condition;
      $("ablation-condition").dispatchEvent(new Event("change"));
    }
    play();
  }
  $("rollout-viewer").hidden = false;
  $("rollout-pair").classList.toggle("compact", dense);
  $("grid-filters").open = !mobile.matches;
  $("grid-fullscreen").hidden = !document.fullscreenEnabled || !$("rollout-pair").requestFullscreen;
  options("grid-task", Object.fromEntries(Object.entries(data.simTasks)
    .filter(([task]) => grids.groups.some(g => g.task === task))));
  $("grid-task").addEventListener("change", conditions);
  $("grid-condition").addEventListener("change", rolloutSets);
  $("grid-training-seed").addEventListener("change", evaluationBatches);
  $("grid-batch").addEventListener("change", policies);
  $("grid-policy").addEventListener("change", render);
  $("ablation-rollouts").addEventListener("click", () => {
    const task = $("ablation-task").value, condition = $("ablation-condition").value;
    $("grid-training-seed").value = "all";
    $("grid-batch").value = "all";
    $("grid-task").value = task;
    conditions();
    $("grid-condition").value = condition;
    rolloutSets();
  });
  $("grid-motion").addEventListener("click", () => {
    paused = !paused;
    if (paused) stop(); else play();
  });
  async function seekTo(time) {
    const request = ++seekVersion, generation = version;
    const current = activePlayers(), signal = lifetime.signal;
    stop();
    position = time;
    updateTime();
    try {
      // A new scrub target supersedes a seek already in progress.
      current.forEach(video => {
        if (video.readyState >= 1) video.currentTime = clipTime(video, time);
      });
      await Promise.all(current.map(video => ready(video, signal)));
      if (request !== seekVersion || generation !== version) return;
      current.filter(video => inView.has(video)).forEach(video => { video.currentTime = clipTime(video, time); });
      updateTime();
      play();
    } catch { if (generation === version) $("grid-motion").textContent = "Retry playback"; }
  }
  $("grid-time").addEventListener("input", () => seekTo(Number($("grid-time").value)));
  function selectScene(seed, scroll = false) {
    selectedSeed = seed;
    $("grid-evaluation-seed").value = seed === null ? "all" : String(seed);
    $("rollout-pair").querySelectorAll(".rollout-cell").forEach(cell =>
      cell.setAttribute("aria-pressed", String(Number(cell.dataset.seed) === selectedSeed)));
    describeSelection();
    if (seed !== null && scroll) {
      const cell = $("rollout-pair").querySelector('.rollout-cell[aria-pressed="true"]');
      const panel = $("rollout-pair");
      if (cell) panel.scrollTop += cell.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
    }
  }
  $("grid-evaluation-seed").addEventListener("change", event => {
    selectScene(event.target.value === "all" ? null : Number(event.target.value), true);
  });
  function openScene(button, playback = { position, paused: mobile.matches ? false : paused }, navigate = false) {
    const boardIndex = Number(button.closest(".rollout-board").dataset.board);
    const first = boardIndex - boardIndex % 2;
    const pair = clips.slice(first, first + 2);
    const seed = Number(button.dataset.seed);
    const indices = pair.map(clip => clip.episodes.findIndex(episode => episode.seed === seed));
    if (indices.some(index => index < 0)) return;
    const ordinal = first / 2 * 50 + indices[0];
    if (navigate && !dense) {
      const panel = $("rollout-pair"), cell = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      if (cell.top < bounds.top || cell.bottom > bounds.bottom) panel.scrollTop += cell.top - bounds.top - 8;
    }
    detailViewer.open({ clips: pair, originals: pair.map((_, side) => players[boards[first + side].source]), indices,
      previews: indices.map((index, side) => previewTile(boards[first + side], index)),
      cells: indices.map((index, side) => boards[first + side].cells[index]), trigger: button,
      position: playback.position, paused: playback.paused, asset, animate: !navigate,
      navigation: { index: ordinal, total: clips.length / 2 * 50, select: (index, state) => {
        const next = boards[Math.floor(index / 50) * 2].cells[index % 50];
        openScene(next, state, true);
      } }, title: `${data.simTasks[pair[0].task]} · Scene ${seed}`,
      subtitle: `${data.simConditions[pair[0].condition]} · Training seed ${pair[0].trainingSeed || 0} · Seed batch ${batchKeys().indexOf(pair[0].batch || "original")} · 2×` });
  }
  $("rollout-pair").addEventListener("click", event => {
    const button = event.target.closest(".rollout-cell");
    if (button) openScene(button);
  });
  $("grid-watch").addEventListener("click", () => {
    const board = boards.find(item => item.index % 2 === 0 && item.clip.episodes.some(e => e.seed === selectedSeed)) || boards[0];
    const index = Math.max(0, board.clip.episodes.findIndex(e => e.seed === selectedSeed));
    openScene(board.cells[index], { position: 0, paused: false }, true);
  });
  $("grid-fullscreen").addEventListener("click", () => $("rollout-pair").requestFullscreen?.().catch(() => {}));
  const redraw = () => {
    sizeCanvases();
    boards.forEach(board => {
      const video = players[board.source];
      if (video.readyState >= 2) drawBoard(board, video);
      else if (video.posterImage?.complete && video.posterImage.naturalWidth) drawBoard(board, video.posterImage);
    });
  };
  $("grid-density").addEventListener("click", () => {
    densityChosen = true;
    dense = !dense;
    $("rollout-pair").classList.toggle("compact", dense);
    $("rollout-pair").scrollTop = 0;
    describeView();
    sizeWindow();
    redraw();
  });
  mobile.addEventListener("change", () => {
    if (!densityChosen) dense = !mobile.matches;
    $("rollout-pair").classList.toggle("compact", dense);
    $("grid-filters").open = !mobile.matches;
    describeView(); sizeWindow(); redraw();
  });
  new ResizeObserver(() => { sizeWindow(); redraw(); }).observe($("rollout-pair"));
  reduced.addEventListener("change", event => { if (event.matches) { paused = true; stop(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else play(); });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) play(); else stop();
  }, { threshold: 0 }).observe($("rollout-pair"));
  conditions();
})();
