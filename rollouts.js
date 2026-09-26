(() => {
  "use strict";
  const data = window.CHRONOS_DATA;
  const grids = data.rolloutGrids;
  if (!grids?.groups.length) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mobile = matchMedia("(max-width: 600px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let dense = false;
  let paused = reduced.matches, visible = false, version = 0, seekVersion = 0, loadingVersion = -1, selectedSeed = null;
  let players = [], clips = [];
  let lifetime = new AbortController();
  const options = (id, values) => {
    $(id).innerHTML = Object.entries(values).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
  };
  const group = () => grids.groups.find(g => g.task === $("grid-task").value && g.condition === $("grid-condition").value);
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
    $("grid-scene-description").textContent = `Scene ${selectedSeed} · ` + clips.map((clip, i) => {
      const episode = clip.episodes.find(e => e.seed === selectedSeed);
      return `${clip.method}: ${state(episode, players[i]?.currentTime || 0)}`;
    }).join(" · ");
  }
  function updateTime() {
    const time = players[0]?.currentTime || 0;
    $("grid-time").value = time;
    $("grid-time-output").textContent = `${time.toFixed(1)} / ${(clips[0]?.duration || 0).toFixed(1)} s`;
    clips.forEach((clip, index) => {
      const current = players[index]?.currentTime || 0;
      $("rollout-pair").querySelectorAll(`[data-board="${index}"] .rollout-cell`).forEach((button, i) => {
        const status = state(clip.episodes[i], current);
        button.dataset.outcome = status.toLowerCase();
        button.setAttribute("aria-label", `${clip.method}, scene ${clip.episodes[i].seed}: ${status}`);
        button.title = `Scene ${clip.episodes[i].seed}: ${status}`;
      });
    });
    describeSelection();
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
    const generation = version, currentPlayers = players, signal = lifetime.signal;
    if (paused || !visible || document.hidden) return;
    if (loadingVersion === generation) return;
    loadingVersion = generation;
    let retryAfterAbort = false;
    $("grid-motion").disabled = true;
    try {
      await Promise.all(currentPlayers.map(video => ready(video, signal)));
      if (generation !== version || paused || !visible || document.hidden) return;
      const time = currentPlayers[0].ended ? 0 : currentPlayers[0].currentTime;
      currentPlayers.forEach(video => {
        if (video.ended || Math.abs(video.currentTime - time) > .01) video.currentTime = time;
      });
      await Promise.all(currentPlayers.map(video => video.play()));
      if (generation === version) $("grid-motion").textContent = "Pause";
    } catch (error) {
      if (generation === version) {
        if (error.name === "AbortError") { retryAfterAbort = true; return; }
        currentPlayers.forEach(video => video.pause());
        paused = true;
        $("grid-motion").textContent = "Retry playback";
      }
    } finally {
      if (generation === version) {
        loadingVersion = -1;
        $("grid-motion").disabled = false;
        if (retryAfterAbort && !paused && visible && !document.hidden) requestAnimationFrame(play);
      }
    }
  }
  function stop() {
    players.forEach(video => video.pause());
    $("grid-motion").textContent = paused ? "Play" : "Pause";
  }
  function drawMosaic(canvas, image) {
    if (dense && !mobile.matches) return;
    const context = canvas.getContext("2d");
    // Five columns preserve detail; scene order stays ascending in either layout.
    for (let row = 0; row < 5; row++) {
      context.drawImage(image, 0, row * 120, 800, 120, 0, row * 240, 800, 120);
      context.drawImage(image, 800, row * 120, 800, 120, 0, row * 240 + 120, 800, 120);
    }
  }
  function render() {
    const generation = ++version;
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
    clips = [grids.cohorts[current.cohorts[$("grid-policy").value]], grids.cohorts[current.cohorts.chronos]];
    if (!current.seeds.includes(selectedSeed)) selectedSeed = null;
    $("grid-time").max = clips[0].duration;
    const sourceLabel = current.task === "conveyor" ? "Recorded trajectories."
      : current.task === "flipup" ? "Replayed trajectories." : "Checkpoint reruns.";
    $("grid-timing-description").textContent = `${descriptions[current.condition]} ${sourceLabel}`;
    $("grid-render-description").textContent = current.task === "conveyor"
      ? "These clips render the simulator states saved for all 50 scenes of training seed 0."
      : current.task === "flipup"
        ? "All 50 saved action traces from training seed 0 are replayed, with matching outcomes and terminal poses within 1 mm and 0.1°. The arm visualizes the evaluated gripper motion through inverse kinematics."
        : "These are complete reruns of the saved training-seed-0 checkpoints, using identical scene seeds and timing settings for both policies. Counts use the shown reruns; the benchmark charts below retain the paper results.";
    $("rollout-pair").innerHTML = clips.map((clip, index) =>
      `<article class="rollout-board ${index ? "chronos" : ""}" data-board="${index}"><div class="rollout-heading"><h4>${esc(clip.method)}</h4><p><strong>${clip.successes}/50</strong> successes</p></div><div class="rollout-screen"><video muted playsinline preload="metadata" src="${esc(clip.video)}" poster="${esc(clip.poster)}" aria-label="${esc(clip.method)}, ${esc(data.simTasks[clip.task])}, all 50 matched scenes, 2 times speed"></video><canvas width="800" height="1200" aria-hidden="true"></canvas><div class="rollout-cells">${clip.episodes.map((episode, i) => {
        const row = Math.floor(i / 10), col = i % 10;
        return `<button type="button" class="rollout-cell" data-seed="${episode.seed}" aria-pressed="${episode.seed === selectedSeed}" style="--mobile-row:${row * 2 + (col < 5 ? 1 : 2)};--mobile-col:${col % 5 + 1}"></button>`;
      }).join("")}</div></div></article>`).join("");
    players = [...$("rollout-pair").querySelectorAll("video")];
    players.forEach((video, index) => {
      const canvas = video.parentElement.querySelector("canvas");
      const poster = new Image();
      video.posterImage = poster;
      poster.onload = () => {
        if (generation === version && video.readyState < 2) drawMosaic(canvas, poster);
      };
      poster.src = clips[index].poster;
      const draw = () => {
        if (generation !== version) return;
        if (video.readyState >= 2) drawMosaic(canvas, video);
      };
      const nextFrame = () => {
        if (generation !== version) return;
        draw();
        video.frameCallback = video.requestVideoFrameCallback(nextFrame);
      };
      if (video.requestVideoFrameCallback) video.frameCallback = video.requestVideoFrameCallback(nextFrame);
      else video.addEventListener("timeupdate", draw);
      video.addEventListener("loadeddata", draw);
      if (index === 0) {
        video.addEventListener("timeupdate", () => {
          if (generation !== version) return;
          updateTime();
          if (!video.paused && players[1]?.readyState >= 3 && Math.abs(video.currentTime - players[1].currentTime) > .12)
            players[1].currentTime = video.currentTime;
        });
        video.addEventListener("ended", () => {
          if (generation !== version || paused || !visible) return;
          players.forEach(player => { player.currentTime = 0; });
          play();
        });
      }
    });
    updateTime();
    $("grid-motion").textContent = paused ? "Play" : "Pause";
    $("grid-motion").disabled = false;
    // Keep the benchmark's default selection aligned with the video view.
    $("sim-task").value = current.task;
    $("sim-condition").value = current.condition;
    $("sim-condition").dispatchEvent(new Event("change"));
    play();
  }
  $("rollout-viewer").hidden = false;
  options("grid-task", Object.fromEntries(Object.entries(data.simTasks)
    .filter(([task]) => grids.groups.some(g => g.task === task))));
  $("grid-task").addEventListener("change", conditions);
  $("grid-condition").addEventListener("change", policies);
  $("grid-policy").addEventListener("change", render);
  $("grid-motion").addEventListener("click", () => {
    paused = !paused;
    if (paused) stop(); else play();
  });
  $("grid-time").addEventListener("input", async () => {
    const request = ++seekVersion, generation = version, time = Number($("grid-time").value);
    const current = players, signal = lifetime.signal;
    current.forEach(video => video.pause());
    try {
      await Promise.all(current.map(video => ready(video, signal)));
      if (request !== seekVersion || generation !== version) return;
      current.forEach(video => { video.currentTime = time; });
      updateTime();
      play();
    } catch { if (generation === version) $("grid-motion").textContent = "Retry playback"; }
  });
  $("rollout-pair").addEventListener("click", event => {
    const button = event.target.closest(".rollout-cell");
    if (!button) return;
    const seed = Number(button.dataset.seed);
    selectedSeed = selectedSeed === seed ? null : seed;
    $("rollout-pair").querySelectorAll(".rollout-cell").forEach(cell =>
      cell.setAttribute("aria-pressed", String(Number(cell.dataset.seed) === selectedSeed)));
    describeSelection();
  });
  $("grid-fullscreen").addEventListener("click", () => $("rollout-pair").requestFullscreen?.().catch(() => {}));
  const redraw = () => players.forEach(video => {
    if (video.readyState >= 2) drawMosaic(video.parentElement.querySelector("canvas"), video);
    else if (video.posterImage?.complete && video.posterImage.naturalWidth) drawMosaic(video.parentElement.querySelector("canvas"), video.posterImage);
  });
  $("grid-density").addEventListener("click", () => {
    dense = !dense;
    $("rollout-pair").classList.toggle("compact", dense);
    $("grid-density").textContent = dense ? "Large tiles" : "Compact grid";
    redraw();
  });
  mobile.addEventListener("change", redraw);
  reduced.addEventListener("change", event => { if (event.matches) { paused = true; stop(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else play(); });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) play(); else stop();
  }, { threshold: 0 }).observe($("rollout-pair"));
  conditions();
})();
