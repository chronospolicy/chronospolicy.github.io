(() => {
  "use strict";
  const data = window.CHRONOS_DATA;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = value => Number(value).toFixed(1).replace(/\.0$/, "");
  const methodClass = method => method === "tap_async" || method.includes("Chronos") ? "chronos" : method === "dt_rtc" ? "rtc" : "dp";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactTimeline = window.matchMedia("(max-width: 600px)");
  let heroPaused = reducedMotion.matches;
  let montageReloading = false;
  let montageReload = 0;
  let montageResumeTime = 0;
  let realTask = "dynamic-cup";
  let realCondition = "combined";
  let contextCategory = "variation";
  const media = id => data.media[data.aliases[id] || id];
  const visiblePreviews = new Set();

  function videoMarkup(clip) {
    const label = `${data.methods[clip.method] || clip.method || "Chronos Policy"}, ${data.tasks[clip.task]?.name || data.simTasks[clip.task] || clip.task}, ${clip.outcome || "qualitative rollout"}, ${clip.speed || 2} times speed`;
    return `<div class="video-shell"><video muted playsinline preload="none" poster="${esc(clip.poster)}" src="${esc(clip.video)}" aria-label="${esc(label)}"></video><button class="video-play" type="button" aria-label="Play ${esc(label)} video"><span>Play</span></button><span class="video-badge">(${clip.speed || 2}x)</span></div>`;
  }

  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const video = entry.target;
      if (!entry.isIntersecting || entry.intersectionRatio < .15) {
        visiblePreviews.delete(video);
        video.pause();
      }
      else if (video.dataset.preview) {
        visiblePreviews.add(video);
        if (!heroPaused && !document.hidden && !(montageReloading && video.id === "hero-montage-video")) video.play().catch(() => {});
      }
    }
  }, { threshold: 0.15 });
  function observeVideos(root) {
    root.querySelectorAll("video").forEach(video => {
      visibility.observe(video);
      const playButton = video.parentElement.querySelector(".video-play");
      if (!playButton) return;
      playButton.addEventListener("click", () => {
        video.controls = true;
        video.play().then(() => { if (video.isConnected) video.focus(); }).catch(() => {});
      });
      video.addEventListener("play", () => {
        playButton.hidden = true;
        video.controls = true;
      });
      video.addEventListener("ended", () => {
        video.controls = false;
        playButton.querySelector("span").textContent = "Replay";
        playButton.setAttribute("aria-label", playButton.getAttribute("aria-label").replace(/^Play/, "Replay"));
        playButton.hidden = false;
      });
    });
  }
  function clearVideos(root) {
    root.querySelectorAll("video").forEach(video => {
      visibility.unobserve(video); visiblePreviews.delete(video);
      video.pause(); video.removeAttribute("src"); video.load();
    });
  }

  const montage = data.heroMontage;
  const montageLayout = window.matchMedia("(max-width: 600px)");
  if (montage) {
    const montageAsset = (variant, key) => variant.version ? `${variant[key]}?v=${encodeURIComponent(variant.version)}` : variant[key];
    const variant = montageLayout.matches ? montage.mobile : montage.wide;
    $("hero-reel").classList.add("hero-montage");
    const headings = montage.groups.some(group => group.randomization)
      ? `<div class="montage-headings">${montage.groups.map(group => `<span>${esc(group.randomization || "")}</span>`).join("")}</div>` : "";
    $("hero-reel").innerHTML = `${headings}<div class="video-shell"><video id="hero-montage-video" data-preview="true" loop muted playsinline preload="${reducedMotion.matches ? "metadata" : "auto"}" poster="${esc(montageAsset(variant, "poster"))}" src="${esc(montageAsset(variant, "video"))}" style="--montage-ratio:${variant.width}/${variant.height}" aria-label="${montage.trialCount} selected Chronos Policy trials with varied positions, orientations, objects, and initial poses across Dynamic Cup, Peg Insertion, and Pivoting; 2 times speed"></video></div>`;
    $("hero-task-links").innerHTML = montage.groups.map(group =>
      `<a class="hero-task-link" href="#real-world" data-show-task="${esc(group.task)}">${esc(group.name)}</a>`).join("");
    $("hero-fullscreen").hidden = false;
    montageLayout.addEventListener("change", () => {
      const video = $("hero-montage-video");
      const selected = montageLayout.matches ? montage.mobile : montage.wide;
      const time = montageReloading ? montageResumeTime : video.currentTime;
      montageResumeTime = time;
      const reload = ++montageReload;
      montageReloading = true;
      video.poster = montageAsset(selected, "poster");
      video.style.setProperty("--montage-ratio", `${selected.width}/${selected.height}`);
      video.src = montageAsset(selected, "video");
      const events = ["loadeddata", "canplay", "canplaythrough", "progress"];
      const cleanup = () => events.forEach(event => video.removeEventListener(event, restore));
      const finish = () => {
        if (reload !== montageReload) return;
        montageReloading = false;
        if (!heroPaused && !document.hidden && visiblePreviews.has(video)) video.play().catch(() => {});
      };
      const restore = () => {
        if (reload !== montageReload) { cleanup(); return; }
        if (video.readyState < 2) return;
        const target = Math.min(time, video.duration - .02);
        // The local preview server may not support byte-range requests.
        // Wait for the target time to be buffered before seeking.
        const available = ranges => Array.from({ length: ranges.length }, (_, i) =>
          target >= ranges.start(i) && target <= ranges.end(i)).some(Boolean);
        if (target > .01 && !available(video.seekable) && !available(video.buffered)) return;
        cleanup();
        if (target > .01) {
          video.addEventListener("seeked", finish, { once: true });
          video.currentTime = target;
        } else finish();
      };
      events.forEach(event => video.addEventListener(event, restore));
      video.load();
    });
    $("hero-fullscreen").addEventListener("click", () => {
      const video = $("hero-montage-video");
      video.controls = true;
      if (video.requestFullscreen) video.requestFullscreen().catch(() => { video.controls = false; });
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      $("hero-montage-video").controls = document.fullscreenElement === $("hero-montage-video");
    });
    $("hero-montage-video").addEventListener("webkitendfullscreen", () => {
      $("hero-montage-video").controls = false;
    });
  }
  $("top").addEventListener("click", event => {
    const link = event.target.closest("[data-show-task]");
    if (!link) return;
    realTask = link.dataset.showTask;
    realCondition = "nominal";
    $("real-task-tabs").querySelectorAll("button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.value === realTask)));
    $("real-condition-tabs").querySelectorAll("button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.value === realCondition)));
    realResults();
  });
  observeVideos($("hero-reel"));
  const updateHeroButton = () => { $("hero-motion").textContent = `${heroPaused ? "Play" : "Pause"} ${montage ? "video" : "videos"}`; };
  if (montage) {
    for (const event of ["play", "pause"]) $("hero-montage-video").addEventListener(event, () => {
      const video = $("hero-montage-video");
      if ((!montageReloading || event === "play") && (document.fullscreenElement === video || video.webkitDisplayingFullscreen)) {
        heroPaused = video.paused;
        updateHeroButton();
      }
    });
  }
  updateHeroButton();
  $("hero-motion").addEventListener("click", () => {
    heroPaused = !heroPaused;
    $("hero-reel").querySelectorAll("video").forEach(video => {
      if (heroPaused) video.pause();
      else if (visiblePreviews.has(video) && !(montageReloading && video.id === "hero-montage-video")) video.play().catch(() => {});
    });
    updateHeroButton();
  });
  reducedMotion.addEventListener("change", e => {
    if (e.matches) {
      heroPaused = true;
      $("hero-reel").querySelectorAll("video").forEach(v => v.pause());
      updateHeroButton();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) document.querySelectorAll("video").forEach(v => v.pause());
    else if (!heroPaused) {
      visiblePreviews.forEach(video => {
        if (!(montageReloading && video.id === "hero-montage-video")) video.play().catch(() => {});
      });
    }
  });

  const clockStreams = [
    { id: "camera", name: "Camera", rateMin: 10, rate: 20, delay: 50, y: 83, color: "#497eaa" },
    { id: "pose", name: "Pose / gripper", rateMin: 25, rate: 50, delay: 20, y: 148, color: "#6394b7" },
    { id: "force", name: "Force / torque", rateMin: 50, rate: 100, delay: 10, y: 213, color: "#779bab" },
    { id: "action", name: "Actions", rate: 20, delay: 150, y: 344, color: "#ce713f", future: true },
  ];
  const clockDraws = Object.fromEntries(clockStreams.map(stream => [stream.id, 1]));
  let clockFocus = { id: "camera", field: "delay" };
  // Repeatable illustrative draws, independent across sensors and requests.
  // This is a timing illustration, not a replay of an evaluation RNG trace.
  function clockUniform(id, index, draw) {
    let hash = 2166136261;
    for (const c of `${id}:${index}:${draw}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
    hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
    return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
  }
  function clocks() {
    const compact = compactTimeline.matches;
    const axisLeft = compact ? 78 : 130, axisRight = compact ? 350 : 730;
    $("clock-timeline").setAttribute("viewBox", `0 0 ${compact ? 360 : 760} 390`);
    const left = -1000, right = 700;
    const x = t => axisLeft + (t - left) / (right - left) * (axisRight - axisLeft);
    const zero = x(0);
    const rows = clockStreams.map(stream => {
      const rate = Number($(`${stream.id}-rate`).value);
      const delay = Number($(`${stream.id}-delay`).value);
      $(`${stream.id}-rate-output`).textContent = `${fmt(rate)} Hz`;
      $(`${stream.id}-delay-output`).textContent = `${delay} ms`;
      $(`${stream.id}-rate`).setAttribute("aria-valuetext", `${fmt(rate)} hertz${stream.future ? "" : " maximum observation rate"}`);
      $(`${stream.id}-delay`).setAttribute("aria-valuetext", stream.future
        ? `Random inference delay from zero to ${delay} milliseconds per policy request, in 50 millisecond steps`
        : `Maximum delivery delay ${delay} milliseconds; each observation samples a delay between zero and this maximum`);
      const step = 1000 / rate;
      if (stream.future) return { ...stream, rate, delay, step };
      // Section 3.3 randomizes observation rate and delivery delay separately.
      // Control edits draw a NEW example for this sensor. Within an example,
      // capture timestamps remain independent of sampled delivery latency.
      const rateMin = Number($(`${stream.id}-rate-min`).value);
      $(`${stream.id}-rate-min-output`).textContent = `${fmt(rateMin)} Hz`;
      $(`${stream.id}-rate-min`).setAttribute("aria-valuetext", `${fmt(rateMin)} hertz minimum observation rate`);
      const events = [];
      const draw = clockDraws[stream.id];
      const phaseRate = rateMin + (rate - rateMin) * clockUniform(`${stream.id}-phase-rate`, 0, draw);
      let capture = -clockUniform(`${stream.id}-phase`, 0, draw) * 1000 / phaseRate;
      for (let i = 0; capture >= left - 2 * (1000 / rateMin + 200); i++) {
        const latency = delay * clockUniform(stream.id, i, draw);
        events.push({ index: i, capture, latency, arrival: capture + latency });
        const frequency = rateMin + (rate - rateMin) * clockUniform(`${stream.id}-rate`, i, draw);
        capture -= 1000 / frequency;
      }
      events.reverse();
      // Match sensor_buffer_v2: select by capture order among delivered
      // packets. Late arrivals can skip frames inside the observation history.
      const selected = events.filter(event => event.arrival <= 0).slice(-2);
      events.forEach(event => { event.selected = selected.includes(event); });
      return { ...stream, rateMin, rate, delay, step, events, selected };
    });
    const action = rows.find(row => row.future);
    // Show only the current request from an ongoing rollout, not the special
    // zero-latency startup call. Action-control edits sample a new request;
    // its first action always keeps the sampled inference-latency offset.
    const currentDelay = 50 * Math.floor(clockUniform("inference", 2, clockDraws.action) * (action.delay / 50 + 1));
    const actionTimes = Array.from({ length: 3 }, (_, i) => currentDelay + i * action.step);
    const text = (xx, yy, value, color = "#817970", anchor = "middle", size = 11) =>
      `<text x="${xx}" y="${yy}" fill="${color}" text-anchor="${anchor}" font-size="${size}">${esc(value)}</text>`;
    const line = (x1, y1, x2, y2, color, width = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
    const timingArrow = (start, end, y, color) => {
      const head = Math.min(4, (end - start) / 2);
      return line(start, y - 3, start, y + 3, color) +
        line(start, y, end, y, color, 1.3) +
        (head > 0 ? `<path d="M${end - head} ${y - head}L${end} ${y}L${end - head} ${y + head}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` : "");
    };
    const description = rows.filter(row => !row.future).map(row => `${row.name}: observation rate sampled from ${fmt(row.rateMin)} to ${fmt(row.rate)} hertz independently of delivery delays from zero to ${row.delay} milliseconds; two latest delivered samples selected, with the newest captured ${fmt(-row.selected.at(-1).capture)} milliseconds before the query`).join("; ");
    let content = `<title id="timeline-title">Observation timing relative to the policy query</title><desc id="timeline-description">${esc(description)}. Dots mark capture times of available observations, not arrival times. Each blue arrow runs from the latest selected capture to the query at time zero, measuring how old that input is at the query. Each sensor retains one bracket between its two selected captures. The orange arrow shows only the current request's ${currentDelay} millisecond inference latency, from time zero to the first requested action. Action spacing is ${fmt(action.step)} milliseconds. This is an illustrative mid-rollout schedule.</desc>`;
    content += `<defs><linearGradient id="clock-future-wash"><stop stop-color="#f9eee4" stop-opacity=".65"/><stop offset="1" stop-color="#fffefc" stop-opacity="0"/></linearGradient></defs>`;
    content += `<rect x="${zero}" y="42" width="${axisRight - zero}" height="319" fill="url(#clock-future-wash)"/>`;
    content += line(axisLeft, 365, axisRight, 365, "#e7e1da");
    const tickStep = compact ? 500 : 250;
    for (let tick = left; tick <= right; tick += tickStep) {
      if (!tick) continue;
      content += line(x(tick), 365, x(tick), 369, "#d8d0c8");
      content += text(x(tick), 383, `${tick > 0 ? "+" : "−"}${Math.abs(tick)}`, "#817970", tick === left ? "start" : "middle");
    }
    content += `<line x1="${zero}" y1="35" x2="${zero}" y2="369" stroke="#b8a998" stroke-dasharray="3 5"/>`;
    content += text(zero, 23, "Policy query", "#5c5045", "middle", compact ? 11 : 12) + text(zero, 383, "0 ms", "#5c5045");
    for (const row of rows.filter(row => !row.future)) {
      content += `<g data-clock="${row.id}" data-rate-min="${row.rateMin}" data-rate="${row.rate}" data-delay-max="${row.delay}" data-selected-count="${row.selected.length}">`;
      content += text(axisLeft - (compact ? 10 : 25), row.y, row.name, "#4c4945", "end", compact ? 11 : 13);
      content += text(axisLeft - (compact ? 10 : 25), row.y + 20, `${row.rateMin === row.rate ? fmt(row.rate) : `${fmt(row.rateMin)}–${fmt(row.rate)}`} Hz`, "#817970", "end", 11);
      content += line(axisLeft, row.y, zero, row.y, "#e4e8e8");
      const visible = row.events.filter(event => event.capture >= left && event.arrival <= 0);
      for (const event of visible) {
        const radius = event.selected ? (compact ? 3.5 : 5) : Math.min(2, Math.max(.65, (x(row.step) - x(0)) * .2));
        content += `<g data-capture-ms="${event.capture.toFixed(3)}" data-arrival-ms="${event.arrival.toFixed(3)}" data-latency-ms="${event.latency.toFixed(3)}" data-selected="${event.selected}"><title>Captured ${fmt(event.capture)} ms; arrived ${fmt(event.arrival)} ms (${fmt(event.latency)} ms delay). ${event.selected ? "Selected for the current request." : "Earlier available observation."}</title>`;
        content += `<circle cx="${x(event.capture)}" cy="${row.y}" r="${radius}" fill="${row.color}" opacity="${event.selected ? 1 : .45}"/></g>`;
      }
      const [previous, latest] = row.selected;
      const start = x(previous.capture), end = x(latest.capture), gap = latest.capture - previous.capture;
      const intervalY = row.y - 12;
      content += `<g data-observation-gap-ms="${gap.toFixed(3)}" data-gap-start-ms="${previous.capture.toFixed(3)}" data-gap-end-ms="${latest.capture.toFixed(3)}" data-timing-label="${row.id}-interval"><title>Time between the two selected observations: ${fmt(gap)} milliseconds</title>`;
      content += `<path d="M${start} ${intervalY - 3}v6m0 -3H${end}m0 -3v6" fill="none" stroke="${row.color}"/>`;
      content += text(Math.max(axisLeft + 23, Math.min(zero - 23, (start + end) / 2)), row.y - 20, `${fmt(gap)} ms`, "#536f7d", "middle", 11) + "</g>";
      const age = -latest.capture, ageY = row.y + 18;
      content += `<g data-observation-age-ms="${age.toFixed(3)}" data-latest-capture-ms="${latest.capture.toFixed(3)}" data-query-ms="0"><title>${esc(row.name)}: the latest available observation was captured ${fmt(age)} milliseconds before the policy query. This is elapsed time since capture, including sampling and delivery timing.</title>`;
      content += line(end, row.y + 6, end, ageY - 3, "#d6e0e4");
      content += timingArrow(end, zero, ageY, row.color);
      content += text(zero + 10, ageY + 4, `${fmt(age)} ms to query`, "#536f7d", "start", compact ? 10 : 11) + "</g>";
      content += "</g>";
    }
    content += `<g data-clock="inference" data-delay-max="${action.delay}">`;
    content += text(axisLeft - (compact ? 10 : 25), 282, "Inference", "#4c4945", "end", compact ? 11 : 13);
    content += line(zero, 279, axisRight, 279, "#ece5de");
    content += `<g data-request-ms="0" data-latency-ms="${currentDelay}"><title>Current policy request at 0 ms; first action requested at ${currentDelay} ms. The previous plan continues during this inference latency.</title>`;
    content += timingArrow(zero, x(currentDelay), 279, action.color);
    content += text(Math.max(zero + 19, (zero + x(currentDelay)) / 2), 301, `${currentDelay} ms`, "#a76540", "middle", 11) + "</g>";
    content += "</g>";
    content += `<g data-clock="action" data-rate="${action.rate}" data-delay-max="${action.delay}" data-current-delay="${currentDelay}">`;
    content += text(axisLeft - (compact ? 10 : 25), action.y, action.name, "#4c4945", "end", compact ? 11 : 13);
    content += text(axisLeft - (compact ? 10 : 25), action.y + 20, `${action.rate} Hz`, "#817970", "end", 11);
    content += line(axisLeft, action.y, axisRight, action.y, "#ece5de");
    content += `<line data-previous-plan="true" x1="${axisLeft}" y1="${action.y}" x2="${x(currentDelay)}" y2="${action.y}" stroke="${action.color}" stroke-width="3" opacity=".35"/>`;
    content += text(axisLeft + 4, action.y - 16, "Previous plan", "#9a7159", "start", 11);
    for (const time of actionTimes) content += `<circle cx="${x(time)}" cy="${action.y}" r="${compact ? 3.5 : 5}" fill="${action.color}" data-time-ms="${time.toFixed(3)}"><title>Action requested for execution at ${fmt(time)} ms relative to the current policy request.</title></circle>`;
    const firstAction = x(actionTimes[0]), secondAction = x(actionTimes[1]);
    content += `<g data-timing-label="action-rate"><path d="M${firstAction} ${action.y - 13}v6m0 -3H${secondAction}m0 -3v6" fill="none" stroke="${action.color}"/>`;
    content += text(Math.max(zero + 18, (firstAction + secondAction) / 2), action.y - 18, `${fmt(action.step)} ms`, "#a76540", "middle", 11) + "</g></g>";
    $("clock-timeline").innerHTML = content;
    const focused = rows.find(row => row.id === clockFocus.id);
    if (focused.future) {
      $("clock-range-note").textContent = clockFocus.field === "delay"
        ? focused.delay
          ? `Inference latency is sampled from 0–${focused.delay} ms in 50 ms steps. Sampled for this request: ${currentDelay} ms.`
          : "Inference latency is 0 ms. The first action is requested at the policy request time."
        : `Action interval: ${fmt(focused.step)} ms at ${fmt(focused.rate)} Hz. The first action is requested ${currentDelay} ms after the policy request.`;
    } else {
      $("clock-range-note").textContent = clockFocus.field === "delay"
        ? focused.delay
          ? `${focused.name}: ${focused.delay} ms is the maximum delivery delay. Each observation gets a separate value from 0–${focused.delay} ms.`
          : `${focused.name}: delivery delay is 0 ms. Observations are available immediately after capture.`
        : focused.rateMin === focused.rate
          ? `${focused.name}: observation rate is fixed at ${fmt(focused.rate)} Hz (${fmt(focused.step)} ms between captures).`
          : `${focused.name}: observation rates are sampled from ${fmt(focused.rateMin)}–${fmt(focused.rate)} Hz, giving capture intervals of ${fmt(1000 / focused.rate)}–${fmt(1000 / focused.rateMin)} ms.`;
    }
    $("clock-explanation").innerHTML = `<p>Latest input → first requested action</p><div class="clock-gaps">${rows.filter(row => !row.future).map(row => `<span>${esc(row.name)} <strong data-gap="${row.id}">${fmt(currentDelay - row.selected.at(-1).capture)} ms</strong></span>`).join("")}</div>`;
  }
  clockStreams.forEach(stream => {
    for (const field of stream.future ? ["rate", "delay"] : ["rate-min", "rate", "delay"]) {
      $(`${stream.id}-${field}`).addEventListener("input", () => {
        // Crossing a range boundary collapses it to a fixed rate.
        if (!stream.future && field !== "delay") {
          const lower = $(`${stream.id}-rate-min`), upper = $(`${stream.id}-rate`);
          if (Number(lower.value) > Number(upper.value)) {
            if (field === "rate-min") upper.value = lower.value;
            else lower.value = upper.value;
          }
        }
        clockDraws[stream.id] += 1;
        clockFocus = { id: stream.id, field };
        clocks();
      });
    }
  });
  compactTimeline.addEventListener("change", clocks);
  $("resample-clocks").addEventListener("click", () => {
    clockStreams.forEach(stream => { clockDraws[stream.id] += 1; });
    clocks();
  });
  clocks();

  function tabs(id, entries, getter, setter) {
    $(id).innerHTML = Object.entries(entries).map(([key, value]) =>
      `<button type="button" data-value="${esc(key)}" aria-pressed="${getter() === key}">${esc(value.name || value)}</button>`).join("");
    $(id).addEventListener("click", event => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      setter(button.dataset.value);
      $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === getter())));
    });
  }
  const ticks = '<div class="chart-ticks" aria-hidden="true"><span>0</span><span>50</span><span>100%</span></div>';
  const bar = (detail, content) => `<button type="button" class="bar-track" aria-pressed="false" aria-label="${esc(detail)}" data-detail="${esc(detail)}">${content}</button>`;
  function interactiveChart(id) {
    const root = $(id);
    root.classList.remove("has-bar-selection");
    root.insertAdjacentHTML("beforeend", '<p class="chart-readout" aria-live="polite"></p>');
    if (root.dataset.interactive) return;
    root.dataset.interactive = "true";
    const show = button => {
      const readout = root.querySelector(".chart-readout");
      if (readout) readout.textContent = button?.dataset.detail || "";
    };
    for (const event of ["pointerover", "focusin"]) root.addEventListener(event, e => {
      const button = e.target.closest(".bar-track");
      if (button) show(button);
    });
    root.addEventListener("pointerleave", () => show(root.querySelector('.bar-track[aria-pressed="true"]')));
    root.addEventListener("focusout", e => {
      if (!root.contains(e.relatedTarget)) show(root.querySelector('.bar-track[aria-pressed="true"]'));
    });
    root.addEventListener("click", e => {
      const button = e.target.closest(".bar-track");
      if (!button) return;
      const selected = button.getAttribute("aria-pressed") !== "true";
      root.classList.toggle("has-bar-selection", selected);
      root.querySelectorAll(".bar-track").forEach(item => item.setAttribute("aria-pressed", String(selected && item === button)));
      root.querySelectorAll(".chart-row").forEach(row => row.classList.toggle("is-selected", selected && row.contains(button)));
      show(selected ? button : null);
    });
    root.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      root.querySelectorAll(".bar-track").forEach(button => button.setAttribute("aria-pressed", "false"));
      root.classList.remove("has-bar-selection");
      root.querySelectorAll(".chart-row").forEach(row => row.classList.remove("is-selected"));
      show(null);
    });
  }
  function realResults() {
    const task = data.tasks[realTask];
    $("real-task-name").textContent = task.name;
    $("real-task-description").textContent = task.description;
    $("real-condition-description").textContent = data.conditions[realCondition].description;
    clearVideos($("real-comparison"));
    $("real-comparison").innerHTML = Object.entries(data.methods).map(([method, name]) => {
      const clip = media(data.cells[`${realTask}/${realCondition}/${method}`]);
      return `<article class="comparison-card ${methodClass(method)}"><div class="comparison-heading"><h4>${esc(name)}</h4></div>${videoMarkup(clip)}<div class="clip-caption"><span class="outcome ${clip.score === 0 ? "failure" : clip.score === .5 ? "partial" : ""}">${clip.outcome}</span><span>Trial ${clip.trial}</span></div></article>`;
    }).join("");
    observeVideos($("real-comparison"));
    $("play-comparison").textContent = "Play all";
    $("real-comparison").querySelectorAll("video").forEach(v => {
      for (const event of ["play", "pause", "ended"]) v.addEventListener(event, updateComparisonButton);
    });
    const rows = data.realResults.filter(r => r.task === realTask && r.condition === realCondition);
    $("real-chart").innerHTML = rows.map(row =>
      `<div class="chart-row ${methodClass(row.method)}"><span class="chart-label">${esc(data.methods[row.method])}</span>${bar(`${data.methods[row.method]} · ${task.name} · ${data.conditions[realCondition].name}: ${fmt(row.score)}% score; ${row.success} full, ${row.partial} partial, ${row.failure} failed out of ${row.n}.`, `<span class="full" style="width:${100 * row.success / row.n}%"></span><span class="partial" style="width:${50 * row.partial / row.n}%"></span>`)}<span class="chart-value">${fmt(row.score)}%</span></div>`).join("") + ticks;
    interactiveChart("real-chart");
    $("real-counts").innerHTML = `<table><caption>${task.name} · ${data.conditions[realCondition].name}</caption><thead><tr><th>Method</th><th>Full</th><th>Partial</th><th>Failed</th><th>Score</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(data.methods[r.method])}</td><td>${r.success}</td><td>${r.partial}</td><td>${r.failure}</td><td>${fmt(r.score)}%</td></tr>`).join("")}</tbody></table>`;
  }
  function updateComparisonButton() {
    const playing = [...$("real-comparison").querySelectorAll("video")].some(v => !v.paused && !v.ended);
    $("play-comparison").textContent = playing ? "Pause all" : "Play all";
  }
  $("play-comparison").addEventListener("click", async () => {
    const videos = [...$("real-comparison").querySelectorAll("video")];
    if (videos.some(v => !v.paused && !v.ended)) videos.forEach(v => v.pause());
    else {
      videos.forEach(v => { v.currentTime = 0; });
      await Promise.allSettled(videos.map(v => v.play()));
    }
    updateComparisonButton();
  });
  tabs("real-task-tabs", data.tasks, () => realTask, value => { realTask = value; realResults(); });
  tabs("real-condition-tabs", data.conditions, () => realCondition, value => { realCondition = value; realResults(); });
  realResults();

  const contextItems = {
    variation: [
      ["cup_counterclockwise", "Counterclockwise cup placement"],
      ["peg_backward", "Backward peg insertion"],
      ["flip_small", "Small eraser"],
      ["flip_box", "Box"],
      ["flip_side", "Sideways start"],
    ],
    partial: [
      ["cup_partial_retry", "Cup placement after a retry"],
      ["peg_partial_slow", "Peg insertion after 30 seconds"],
      ["flip_partial_fall", "Upright, then falls"],
    ],
    failure: [
      ["cup_failure", "Cup placement"],
      ["peg_failure", "Peg insertion"],
      ["flip_failure", "Pivoting"],
    ],
  };
  function context() {
    clearVideos($("context-grid"));
    $("context-grid").innerHTML = contextItems[contextCategory].map(([id, title]) => {
      const clip = media(id);
      return `<article class="context-card">${videoMarkup(clip)}<h3>${esc(title)}</h3><p class="clip-source">${esc(data.methods[clip.method])} · ${esc(data.conditions[clip.condition].name)}<br>${esc(clip.outcome)} · Trial ${clip.trial}</p></article>`;
    }).join("");
    observeVideos($("context-grid"));
  }
  tabs("context-tabs", { variation: "Task variations", partial: "Partial outcomes", failure: "Failure cases" }, () => contextCategory, value => { contextCategory = value; context(); });
  context();

  function options(id, values) {
    $(id).innerHTML = Object.entries(values).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  }
  options("sim-task", data.simTasks); options("sim-condition", data.simConditions);
  options("ablation-condition", data.simConditions);
  $("sim-condition").value = "inference_0_200ms";
  $("ablation-condition").value = "combined_sensor_ood_inference_0_200ms";
  function simulationResults() {
    const task = $("sim-task").value, condition = $("sim-condition").value;
    const rows = data.simResults.filter(r => r.task === task && r.condition === condition);
    const domain = Math.max(100, Math.ceil(Math.max(...rows.map(r => r.mean + r.sd)) / 10) * 10);
    $("simulation-chart").innerHTML = rows.map(r => {
      const lo = Math.max(0, r.mean - r.sd), hi = r.mean + r.sd;
      return `<div class="chart-row ${methodClass(r.method)}"><span class="chart-label">${esc(r.method)}</span>${bar(`${r.method} · ${data.simTasks[task]} · ${data.simConditions[condition]}: ${r.mean.toFixed(1)}% success, ± ${r.sd.toFixed(1)} percentage points sample SD across 3 training seeds.`, `<span class="full" style="width:${100 * r.mean / domain}%"></span><span class="sd-line" style="left:${100 * lo / domain}%;width:${100 * (hi - lo) / domain}%"></span>`)}<span class="chart-value">${r.mean.toFixed(1)} ± ${r.sd.toFixed(1)}%</span></div>`;
    }).join("") + `<p class="fine-print">Bar scale: 0–${domain}%. Whiskers show sample standard deviation.</p>`;
    interactiveChart("simulation-chart");
    const names = Object.entries(data.simConditions);
    $("simulation-table").innerHTML = `<table><caption>${esc(data.simTasks[task])}: success rate (%)</caption><thead><tr><th>Condition</th><th>Diffusion Policy</th><th>Chronos Policy</th></tr></thead><tbody>${names.map(([key, name]) => {
      const cell = method => data.simResults.find(r => r.task === task && r.condition === key && r.method === method);
      const values = ["Diffusion Policy", "Chronos Policy"].map(method => { const r = cell(method); return `<td>${r.mean.toFixed(1)} ± ${r.sd.toFixed(1)}</td>`; });
      return `<tr><td>${esc(name)}</td>${values.join("")}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function ablation() {
    const task = $("ablation-task").value;
    const condition = Object.keys(data.simConditions).indexOf($("ablation-condition").value);
    const colors = ["#9b9691", "#c4bbb2", "#bd9b7c", "#d6ac80", "#c16a43"];
    $("ablation-chart").innerHTML = Object.entries(data.ablation[task]).map(([name, values], i) => {
      const mean = values[condition], sd = data.ablationStd[task][name][condition];
      const lo = Math.max(0, mean - sd), hi = Math.min(100, mean + sd);
      return `<div class="chart-row"><span class="chart-label">${esc(name)}</span>${bar(`${name} · ${data.simTasks[task]} · ${data.simConditions[$("ablation-condition").value]}: ${mean.toFixed(1)}% success, ± ${sd.toFixed(1)} percentage points sample SD across 3 training seeds.`, `<span class="full" style="width:${mean}%;background:${colors[i]}"></span><span class="sd-line" style="left:${lo}%;width:${hi - lo}%"></span>`)}<span class="chart-value">${mean.toFixed(1)} ± ${sd.toFixed(1)}%</span></div>`;
    }).join("");
    interactiveChart("ablation-chart");
  }
  ["sim-task", "sim-condition"].forEach(id => $(id).addEventListener("change", simulationResults));
  ["ablation-task", "ablation-condition"].forEach(id => $(id).addEventListener("change", ablation));
  simulationResults(); ablation();

})();
