(() => {
  'use strict';
  const data = window.CHRONOS_DATA;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = (clip, key) => `${clip[key]}?v=${key === 'poster' ? clip.posterVersion : clip.version}`;
  const dex = window.CHRONOS_DEX;
  const rows = new Map([...data.sections.flatMap(s => s.tasks.flatMap(t => t.comparisons)), ...dex.comparisons].map(r => [r.id, r]));
  const combined = row => row.condition === 'combined' || row.condition.startsWith('combined_');
  const defaultComparison = task => task.comparisons.find(row => row.condition === 'nominal') || task.comparisons[0];
  const conditionName = row => combined(row) ? 'Observation latency + inference latency' : row.label;
  const conditionLabels = {nominal: 'Nominal', obs_change: 'Observation timing',
    sensor_id: 'Small observation change', sensor_ood: 'Large observation change',
    inference_0_100ms: 'Inference latency ≤100 ms', inference_0_200ms: 'Inference latency ≤200 ms',
    inference_latency: 'Inference latency', combined: 'Observation latency + inference latency',
    combined_sensor_ood_inference_0_200ms: 'Observation latency + inference latency'};
  const conditionOrder = Object.keys(conditionLabels);
  const timingControls = task => `<div class="timing-tabs" role="tablist" aria-label="${esc(task.title)} timing">${[...task.comparisons]
    .sort((a, b) => conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition))
    .map(row => `<button type="button" role="tab" id="${row.id}-tab" aria-controls="${row.id}-panel" aria-selected="${row === defaultComparison(task)}" tabindex="${row === defaultComparison(task) ? 0 : -1}">${esc(conditionLabels[row.condition] || row.label)}</button>`).join('')}</div>`;
  const options = entries => entries.map((entry, i) => {
    const variant = entry.trialLabel?.split(' · ').slice(1).join(' · ');
    const label = `Example ${String.fromCharCode(65 + i)}${variant ? ` · ${variant}` : ''}`;
    return `<option value="${i}">${esc(label)}</option>`;
  }).join('');
  const percent = value => Number(value).toFixed(1).replace(/\.0$/, '');
  const evaluationText = clip => {
    if (clip.successRate !== undefined)
      return `${clip.partialRate !== undefined ? 'Full success' : 'Success'} ${percent(clip.successRate)}%${clip.partialRate ? ` · partial ${percent(clip.partialRate)}%` : ''} · ${clip.trials} trials`;
    return `${clip.scoreLabel === 'task score' ? 'Task score' : 'Success'} ${percent(clip.score)}% · ${clip.trials} trials`;
  };
  const caption = clip => `<strong>${esc(clip.taskTitle || clip.method)}</strong><span class="trial-outcome" data-outcome="${esc(clip.outcome)}">Example: ${esc(clip.outcome)}</span><span class="evaluation-rate">${esc(evaluationText(clip))}</span>`;
  const trialControls = (row, clip) => {
    const entries = row.variants?.[clip.methodKey];
    return entries?.length > 1 ? `<div class="trial-controls"><button type="button" data-step="-1" aria-label="Previous ${esc(clip.method)} trial">‹</button><select aria-label="${esc(clip.method)} trial">${options(entries)}</select><button type="button" data-step="1" aria-label="Next ${esc(clip.method)} trial">›</button></div>` : '';
  };
  const comparison = (row, selected) => `<div class="comparison" data-comparison="${esc(row.id)}" data-condition="${esc(row.condition)}" id="${row.id}-panel" role="tabpanel" aria-labelledby="${row.id}-tab" tabindex="0"${selected ? '' : ' hidden'}>${row.gallery ? '' : `<h4 class="timing-label">${esc(combined(row) ? conditionName(row) : row.description || row.label)}</h4>`}${row.scenes ? `<div class="scene-controls"><label for="${row.id}-scene"${row.gallery ? ' class="sr-only"' : ''}>More examples</label><button type="button" data-step="-1" aria-label="Previous matched scene">‹</button><select id="${row.id}-scene">${options(row.scenes)}</select><button type="button" data-step="1" aria-label="Next matched scene">›</button></div>` : ''}<div class="pair ${row.clips.length > 2 ? 'multi' : ''}${row.gallery ? ' dex-grid' : ''}">${row.clips.map(clip => `<figure class="${clip.methodKey}" data-method="${clip.methodKey}"><figcaption>${caption(clip)}</figcaption><video controls muted playsinline preload="none" data-src="${esc(asset(clip, 'video'))}" poster="${esc(asset(clip, 'poster'))}" width="${clip.width}" height="${clip.height}" aria-label="${esc(clip.method)}, ${esc(conditionName(row))}, ${esc(clip.outcome)}, recorded playback at 2 times speed"></video>${trialControls(row, clip)}</figure>`).join('')}</div></div>`;
  const focusedSimulation = new Set(['simulation-conveyor', 'simulation-flipup']);
  const renderTask = task => `<article class="task" id="${esc(task.id)}"><h3>${esc(task.title)}</h3>${timingControls(task)}${task.comparisons.map(row => comparison(row, row === defaultComparison(task))).join('')}</article>`;
  for (const section of data.sections) {
    const groups = section.id === 'real'
      ? [['real-comparisons', section.tasks]]
      : [['simulation-comparisons', section.tasks.filter(task => focusedSimulation.has(task.id))]];
    for (const [id, tasks] of groups) document.getElementById(id).innerHTML = tasks.map(renderTask).join('');
  }
  document.getElementById('dex-timing').innerHTML = timingControls(dex);
  document.getElementById('dex-panels').innerHTML = dex.comparisons.map(row => comparison(row, row === defaultComparison(dex))).join('');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection?.saveData) ||
    ['slow-2g', '2g'].includes(navigator.connection?.effectiveType) ||
    matchMedia('(prefers-reduced-data: reduce)').matches;
  const states = new Map();
  const panelStates = new Map();
  const internalSeeks = new WeakSet();
  const pendingSeeks = new WeakMap();
  const icons = {
    play: '<path d="m8 5 11 7-11 7Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    replay: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
    expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  const clockText = seconds => {
    const whole = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };
  let expanded = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'comparison-dialog';
  dialog.setAttribute('aria-label', 'Expanded video comparison');
  document.body.append(dialog);
  function closeExpanded() {
    if (!expanded) return;
    const state = expanded;
    expanded = null;
    state.placeholder.replaceWith(state.player);
    state.player.classList.remove('is-expanded');
    state.expand.innerHTML = icon('expand');
    state.expand.setAttribute('aria-label', 'Expand comparison');
    state.expand.title = 'Expand comparison';
    state.expand.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('comparison-open');
    if (dialog.open) dialog.close();
    state.expand.focus({preventScroll: true});
    for (const other of states.values()) {
      updateVisibility(other);
      if (other.visible) start(other); else stop(other);
    }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeExpanded(); });
  dialog.addEventListener('close', () => { if (!dialog.open) closeExpanded(); });
  function expand(state) {
    if (expanded === state) { closeExpanded(); return; }
    if (expanded) closeExpanded();
    expanded = state;
    state.placeholder = document.createElement('div');
    state.placeholder.style.height = `${state.player.getBoundingClientRect().height}px`;
    state.player.replaceWith(state.placeholder);
    dialog.append(state.player);
    state.player.classList.add('is-expanded');
    state.expand.innerHTML = icon('close');
    state.expand.setAttribute('aria-label', 'Close expanded comparison');
    state.expand.title = 'Close expanded comparison';
    state.expand.setAttribute('aria-expanded', 'true');
    dialog.setAttribute('aria-label', `${state.task.querySelector('h3').textContent} video comparison`);
    document.documentElement.classList.add('comparison-open');
    dialog.showModal();
    dialog.scrollTop = 0;
    state.expand.focus({preventScroll: true});
    for (const other of states.values()) {
      updateVisibility(other);
      if (other !== state) stop(other);
    }
    if (state.visible) start(state);
  }
  const clipSpeed = (state, video) => state.clips.get(video).speed || 1;
  const duration = (state, video) => (Number.isFinite(video.duration) ? video.duration : state.clips.get(video).duration) * clipSpeed(state, video);
  const leader = state => state.videos.reduce((a, b) => duration(state, b) > duration(state, a) ? b : a);
  const totalTime = state => duration(state, leader(state));
  // WebKit may suspend an off-screen video's media clock even after play()
  // resolves. Keep one source-time clock for the group, independent of any tile.
  const currentTime = state => Math.min(totalTime(state), state.mediaTime +
    (state.desired && state.clockAt !== null ? (performance.now() - state.clockAt) / 1000 * state.speed : 0));
  function setTime(state, time) {
    state.mediaTime = time;
    state.clockAt = state.desired ? performance.now() : null;
  }
  function render(state) {
    const total = totalTime(state);
    const time = state.scrubbing ? Number(state.slider.value) : Math.min(currentTime(state), total);
    state.slider.max = total;
    if (!state.scrubbing) state.slider.value = time;
    state.slider.style.setProperty('--progress', `${total ? time / total * 100 : 0}%`);
    state.slider.setAttribute('aria-valuetext', `${clockText(time)} of ${clockText(total)}`);
    state.output.textContent = `${clockText(time)} / ${clockText(total)}`;
    const label = state.desired ? 'Pause comparison' : 'Play comparison';
    state.play.setAttribute('aria-label', label);
    state.play.title = label;
    state.play.querySelector('[data-icon="play"]').hidden = state.desired;
    state.play.querySelector('[data-icon="pause"]').hidden = !state.desired;
    for (const video of state.videos) video.setAttribute('aria-pressed', String(state.desired));
  }
  function updateVisibility(state) {
    const box = state.root.getBoundingClientRect();
    const width = Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0));
    const height = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
    state.visible = expanded ? expanded === state : !state.panel.hidden && box.width > 0 && box.height > 0 &&
      width * height / (box.width * box.height) >= .25;
  }
  function loadSource(video) {
    const source = video.dataset.src;
    if (source && video.getAttribute('src') !== source) video.src = source;
  }
  function seek(video, time) {
    if (video.readyState < 1) {
      pendingSeeks.set(video, time);
      if (time > 0) {
        video.preload = 'metadata';
        loadSource(video);
      }
      return;
    }
    pendingSeeks.delete(video);
    const target = Math.min(time, video.duration);
    if (Math.abs(video.currentTime - target) < .005) return;
    internalSeeks.add(video);
    video.currentTime = target;
  }
  function seekGroup(state, time) {
    setTime(state, time);
    state.videos.forEach(video => seek(video, time / clipSpeed(state, video)));
    render(state);
  }
  function setSpeed(state, speed) {
    state.speed = speed;
    for (const video of state.videos) {
      // Encodes already contain 2× footage; account for that baked-in speed.
      video.defaultPlaybackRate = video.playbackRate = speed / clipSpeed(state, video);
      const clip = state.clips.get(video);
      video.setAttribute('aria-label', `${clip.method}, ${conditionName(rows.get(state.panel.dataset.comparison))}, ${clip.outcome}. Play or pause comparison at ${speed} times recorded speed`);
    }
  }
  function stop(state, manual = false) {
    state.mediaTime = currentTime(state);
    state.clockAt = null;
    state.version += 1;
    state.desired = false;
    state.userPlayback = false;
    if (manual) state.manual = true;
    state.videos.forEach(video => video.pause());
    render(state);
  }
  async function start(state, user = false) {
    if (state.panel.hidden || (expanded && expanded !== state)) { stop(state); return; }
    if (user) state.manual = false;
    if (state.scrubbing || (!user && (reduced.matches || saveData || state.manual || !state.visible)) || document.hidden) return;
    state.desired = true;
    state.userPlayback ||= user;
    render(state);
    if (state.starting) return;
    state.starting = true;
    const request = ++state.version;
    try {
      if (currentTime(state) >= totalTime(state) - .08) seekGroup(state, 0);
      await Promise.all(state.videos.filter(v => !v.ended || pendingSeeks.has(v)).map(video => {
        loadSource(video);
        return video.play();
      }));
      if (!state.desired || document.hidden || state.panel.hidden) stop(state);
      else if (request === state.version && state.clockAt === null) state.clockAt = performance.now();
    } catch {
      // A newer condition/trial choice can supersede an interrupted play request.
      if (request === state.version) stop(state);
    } finally {
      state.starting = false;
      if (request !== state.version && state.desired && state.visible && !state.panel.hidden && !document.hidden)
        start(state, state.userPlayback);
    }
  }
  async function replay(state) {
    if (!state.desired || state.restarting || state.panel.hidden) return;
    state.restarting = true;
    if (state.cycling && state.advanceExample) {
      state.switching = true;
      const user = state.userPlayback;
      stop(state);
      state.advanceExample();
      seekGroup(state, 0);
      state.switching = false;
      await start(state, user);
      state.restarting = false;
      return;
    }
    seekGroup(state, 0);
    await Promise.allSettled(state.videos.map(video => video.play()));
    state.restarting = false;
    if (!state.desired || state.panel.hidden || document.hidden) stop(state);
  }
  document.querySelectorAll('.pair').forEach(root => {
    const comparisonRoot = root.closest('.comparison');
    const row = rows.get(comparisonRoot.dataset.comparison);
    const state = {root, panel: comparisonRoot, task: root.closest('.task'), version: 0, videos: [...root.querySelectorAll('video')], clips: new Map(), speed: 2, mediaTime: 0, clockAt: null, desired: false, userPlayback: false, visible: false, manual: false, starting: false, restarting: false, switching: false, scrubbing: false, cycling: Boolean(row.balance) && !saveData};
    states.set(root, state);
    panelStates.set(comparisonRoot, state);
    const player = state.player = document.createElement('div');
    player.className = 'comparison-player';
    const sceneControls = comparisonRoot.querySelector('.scene-controls');
    comparisonRoot.insertBefore(player, sceneControls || root);
    player.innerHTML = `<h4 class="player-title">${esc(state.task.querySelector('h3').textContent)} · ${esc(conditionName(row))}</h4><div class="player-controls" role="group" aria-label="Comparison playback">
      <button type="button" class="player-play" aria-label="Play comparison" title="Play comparison"><span data-icon="play">${icon('play')}</span><span data-icon="pause" hidden>${icon('pause')}</span></button>
      <button type="button" class="player-replay" aria-label="Replay comparison" title="Replay comparison">${icon('replay')}</button>
      <div class="player-timeline"><input type="range" min="0" max="1" value="0" step="0.01" aria-label="${esc(state.task.querySelector('h3').textContent)} comparison time"><output aria-hidden="true">0:00 / 0:00</output></div>
      <button type="button" class="player-expand" aria-label="Expand comparison" title="Expand comparison" aria-expanded="false">${icon('expand')}</button>
    </div>`;
    state.play = player.querySelector('.player-play');
    state.slider = player.querySelector('input');
    state.output = player.querySelector('output');
    state.expand = player.querySelector('.player-expand');
    if (row.balance) {
      const cycling = document.createElement('button');
      cycling.type = 'button';
      cycling.className = 'player-cycle';
      cycling.textContent = 'Cycle examples';
      cycling.setAttribute('aria-pressed', String(state.cycling));
      cycling.title = 'Advance to the next example when all videos finish';
      cycling.addEventListener('click', () => {
        state.cycling = !state.cycling;
        cycling.setAttribute('aria-pressed', String(state.cycling));
      });
      player.querySelector('.player-controls').append(cycling);
    }
    if (row.gallery) {
      const toolbar = document.createElement('div');
      toolbar.className = 'dex-toolbar';
      toolbar.innerHTML = `<div class="dex-methods" role="group" aria-label="DexMimicGen policy"><button type="button" data-policy="chronos" aria-pressed="true">Chronos Policy</button><button type="button" data-policy="dp" aria-pressed="false">Diffusion Policy</button></div>`;
      toolbar.append(sceneControls);
      player.append(toolbar, root, player.querySelector('.player-controls'));
      toolbar.querySelectorAll('.dex-methods button').forEach(button => {
        button.addEventListener('click', () => {
          state.task.dataset.policy = button.dataset.policy;
          document.querySelectorAll('.dex-methods button').forEach(other =>
            other.setAttribute('aria-pressed', String(other.dataset.policy === button.dataset.policy)));
          state.selectPolicy();
        });
      });
    } else {
      if (sceneControls) player.append(sceneControls);
      player.append(root);
    }
    const toggle = () => state.desired ? stop(state, true) : start(state, true);
    state.play.addEventListener('click', toggle);
    state.expand.addEventListener('click', () => expand(state));
    player.querySelector('.player-replay').addEventListener('click', () => {
      stop(state);
      seekGroup(state, 0);
      start(state, true);
    });
    function beginScrub() {
      if (state.scrubbing) return;
      state.resumeAfterScrub = state.desired;
      state.scrubbing = true;
      stop(state, true);
    }
    function finishScrub() {
      if (!state.scrubbing) return;
      state.scrubbing = false;
      if (state.resumeAfterScrub && Number(state.slider.value) < totalTime(state) - .08) start(state, true);
      render(state);
    }
    state.slider.addEventListener('pointerdown', beginScrub);
    state.slider.addEventListener('input', () => {
      beginScrub();
      seekGroup(state, Number(state.slider.value));
    });
    state.slider.addEventListener('change', finishScrub);
    state.slider.addEventListener('pointerup', finishScrub);
    state.slider.addEventListener('pointercancel', finishScrub);
    state.slider.addEventListener('blur', finishScrub);
    state.videos.forEach(video => {
      state.clips.set(video, row.clips.find(clip => clip.methodKey === video.closest('figure').dataset.method));
      video.muted = true;
      video.controls = false;
      video.tabIndex = 0;
      video.setAttribute('role', 'button');
      video.addEventListener('click', toggle);
      video.addEventListener('keydown', event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        toggle();
      });
      video.addEventListener('loadedmetadata', () => {
        if (pendingSeeks.has(video)) seek(video, pendingSeeks.get(video));
        render(state);
      });
      video.addEventListener('timeupdate', () => render(state));
      video.addEventListener('play', () => {
        // A viewport change can make WebKit resume a previously suspended tile.
        // Only the shared controls may change the group's requested playback.
        if (state.panel.hidden || !state.desired || document.hidden) video.pause();
      });
      video.addEventListener('pause', () => {
        if (video.paused && !video.ended && state.desired && !state.switching && !state.restarting && !state.starting && state.visible && !document.hidden) stop(state, true);
      });
      video.addEventListener('ended', () => {
        // Let longer trials finish; shorter trials hold their last frame.
        if (state.videos.every(v => v.ended || (v.readyState >= 1 && v.duration - v.currentTime < .08))) replay(state);
      });
      video.addEventListener('seeking', () => {
        if (state.restarting || state.switching || internalSeeks.has(video)) return;
        const time = video.currentTime * clipSpeed(state, video);
        setTime(state, time);
        for (const other of state.videos) {
          if (other !== video) seek(other, time / clipSpeed(state, other));
        }
        render(state);
      });
      video.addEventListener('seeked', () => internalSeeks.delete(video));
    });
    setSpeed(state, 2);
    render(state);
    function replaceClip(figure, clip) {
      const video = figure.querySelector('video');
      pendingSeeks.delete(video);
      internalSeeks.delete(video);
      state.clips.set(video, clip);
      video.dataset.src = asset(clip, 'video');
      video.removeAttribute('src');
      if (row.gallery) video.dataset.policy = clip.policyKey;
      video.poster = asset(clip, 'poster');
      video.width = clip.width; video.height = clip.height;
      video.setAttribute('aria-label', `${clip.method}, ${conditionName(row)}, ${clip.outcome}. Play or pause comparison at ${state.speed} times recorded speed`);
      video.defaultPlaybackRate = state.speed / clipSpeed(state, video);
      video.load();
      video.playbackRate = state.speed / clipSpeed(state, video);
      figure.querySelector('figcaption').innerHTML = caption(clip);
    }
    const exampleControls = [];
    comparisonRoot.querySelectorAll('.trial-controls, .scene-controls').forEach(controls => {
      const select = controls.querySelector('select');
      const buttons = [...controls.querySelectorAll('button')];
      const updateButtons = () => buttons.forEach(button => {
        button.disabled = Number(select.value) + Number(button.dataset.step) < 0 ||
          Number(select.value) + Number(button.dataset.step) >= select.options.length;
      });
      exampleControls.push({controls, select, updateButtons});
      buttons.forEach(button => button.addEventListener('click', () => {
        select.value = String(Number(select.value) + Number(button.dataset.step));
        select.dispatchEvent(new Event('change'));
      }));
      select.addEventListener('change', async () => {
        const resume = state.desired;
        state.switching = true;
        stop(state);
        if (controls.classList.contains('scene-controls')) {
          const scene = row.scenes[Number(select.value)];
          const clips = row.gallery ? scene.policies[state.task.dataset.policy] : scene.clips;
          clips.forEach(clip =>
            replaceClip(root.querySelector(`[data-method="${clip.methodKey}"]`), clip));
          if (row.gallery) state.policy = state.task.dataset.policy;
        } else {
          const figure = controls.closest('figure');
          replaceClip(figure, row.variants[figure.dataset.method][Number(select.value)]);
        }
        seekGroup(state, 0);
        updateButtons();
        state.switching = false;
        if (resume) await start(state, true);
      });
      updateButtons();
    });
    state.advanceExample = () => {
      if (row.scenes) {
        const control = exampleControls.find(c => c.controls.classList.contains('scene-controls'));
        control.select.value = String((Number(control.select.value) + 1) % row.scenes.length);
        const scene = row.scenes[Number(control.select.value)];
        const clips = row.gallery ? scene.policies[state.task.dataset.policy] : scene.clips;
        clips.forEach(clip => replaceClip(root.querySelector(`[data-method="${clip.methodKey}"]`), clip));
        control.updateButtons();
      } else {
        for (const control of exampleControls) {
          const figure = control.controls.closest('figure');
          const clips = row.variants[figure.dataset.method];
          control.select.value = String((Number(control.select.value) + 1) % clips.length);
          replaceClip(figure, clips[Number(control.select.value)]);
          control.updateButtons();
        }
      }
    };
    if (row.gallery) {
      state.policy = 'chronos';
      state.videos.forEach(video => { video.dataset.policy = 'chronos'; });
      state.selectPolicy = () => {
        if (state.policy !== state.task.dataset.policy)
          comparisonRoot.querySelector('.scene-controls select').dispatchEvent(new Event('change'));
      };
    }
  });
  document.querySelectorAll('.task').forEach(task => {
    const tabs = [...task.querySelectorAll('[role="tab"]')];
    const panels = [...task.querySelectorAll('[role="tabpanel"]')];
    function select(tab) {
      if (tab.getAttribute('aria-selected') === 'true') return;
      if (expanded?.task === task) closeExpanded();
      for (const button of tabs) {
        button.setAttribute('aria-selected', String(button === tab));
        button.tabIndex = button === tab ? 0 : -1;
      }
      for (const panel of panels) {
        const state = panelStates.get(panel);
        state.visible = false;
        stop(state);
        panel.hidden = panel.id !== tab.getAttribute('aria-controls');
        if (!panel.hidden) {
          state.selectPolicy?.();
          state.manual = false;
          seekGroup(state, 0);
        }
      }
      // Measure immediately, including rapid switches within one browser frame.
      const active = panelStates.get(task.querySelector('.comparison:not([hidden])'));
      updateVisibility(active);
      if (active.visible) start(active);
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        let target;
        if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
        if (event.key === 'Home') target = tabs[0];
        if (event.key === 'End') target = tabs.at(-1);
        if (!target) return;
        event.preventDefault();
        target.focus();
        select(target);
      });
    });
  });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target);
      updateVisibility(state);
      if (state.visible) start(state); else stop(state);
    }
  }, {threshold: [0, .25, .5]});
  for (const root of states.keys()) observer.observe(root);
  setInterval(() => {
    for (const state of states.values()) {
      if (!state.desired || state.starting || state.restarting || state.panel.hidden) continue;
      const time = currentTime(state);
      if (time >= totalTime(state)) { replay(state); continue; }
      for (const follower of state.videos) {
        if (follower.ended) continue;
        if (follower.readyState >= 2 && !follower.seeking &&
            Math.abs(time - follower.currentTime * clipSpeed(state, follower)) > .36)
          seek(follower, time / clipSpeed(state, follower));
      }
      render(state);
    }
  }, 200);
  const teaser = document.getElementById('story-teaser');
  teaser.loop = false;
  let teaserStarted = false;
  const teaserPlayer = teaser.closest('.teaser-player');
  const teaserControls = document.createElement('div');
  teaserControls.className = 'player-controls teaser-controls';
  teaserControls.setAttribute('role', 'group');
  teaserControls.setAttribute('aria-label', 'Film playback');
  teaserControls.innerHTML = `<button type="button" class="teaser-play" aria-label="Play film" title="Play film"><span data-icon="play">${icon('play')}</span><span data-icon="pause" hidden>${icon('pause')}</span></button>
    <button type="button" class="teaser-replay" aria-label="Replay film" title="Replay film">${icon('replay')}</button>
    <div class="player-timeline"><input type="range" min="0" max="${data.teaserDuration}" value="0" step="0.01" aria-label="Film timeline"><output aria-hidden="true"></output></div>
    <button type="button" class="teaser-expand" aria-label="Expand film" title="Expand film" aria-expanded="false">${icon('expand')}</button>`;
  teaserPlayer.append(teaserControls);
  teaser.controls = false;
  teaser.tabIndex = 0;
  teaser.setAttribute('role', 'button');
  const filmPlay = teaserControls.querySelector('.teaser-play');
  const filmRange = teaserControls.querySelector('input');
  const filmExpand = teaserControls.querySelector('.teaser-expand');
  const teaserDialog = document.createElement('dialog');
  teaserDialog.className = 'comparison-dialog teaser-dialog';
  teaserDialog.setAttribute('aria-label', 'Timing motivation film');
  document.body.append(teaserDialog);
  let filmPlaceholder = null, filmSeeking = false, resumeFilm = false, pendingFilmSeek = null;
  function updateFilm() {
    const duration = Number.isFinite(teaser.duration) ? teaser.duration : data.teaserDuration;
    filmRange.max = duration;
    if (!filmSeeking) filmRange.value = teaser.currentTime;
    filmRange.style.setProperty('--progress', `${Number(filmRange.value) / duration * 100}%`);
    const shownDuration = Math.ceil(duration);
    const shownTime = Number(filmRange.value) >= duration - .02 ? shownDuration : Number(filmRange.value);
    filmRange.setAttribute('aria-valuetext', `${clockText(shownTime)} of ${clockText(shownDuration)}`);
    teaserControls.querySelector('output').textContent = `${clockText(shownTime)} / ${clockText(shownDuration)}`;
    filmPlay.setAttribute('aria-label', teaser.paused ? 'Play film' : 'Pause film');
    filmPlay.title = teaser.paused ? 'Play film' : 'Pause film';
    filmPlay.querySelector('[data-icon="play"]').hidden = !teaser.paused;
    filmPlay.querySelector('[data-icon="pause"]').hidden = teaser.paused;
    teaser.setAttribute('aria-pressed', String(!teaser.paused));
  }
  const playFilm = () => { teaserStarted = true; loadSource(teaser); teaser.play().catch(updateFilm); };
  const toggleFilm = () => { teaserStarted = true; teaser.paused ? playFilm() : teaser.pause(); };
  teaser.addEventListener('click', toggleFilm);
  teaser.addEventListener('keydown', event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    toggleFilm();
  });
  filmPlay.addEventListener('click', toggleFilm);
  teaserControls.querySelector('.teaser-replay').addEventListener('click', () => {
    teaser.currentTime = 0;
    playFilm();
  });
  function closeFilm() {
    if (!filmPlaceholder) return;
    filmPlaceholder.replaceWith(teaserPlayer);
    filmPlaceholder = null;
    if (teaserDialog.open) teaserDialog.close();
    document.documentElement.classList.remove('comparison-open');
    filmExpand.innerHTML = icon('expand');
    attrsFilmExpand(false);
    filmExpand.focus({preventScroll: true});
  }
  function attrsFilmExpand(open) {
    filmExpand.setAttribute('aria-expanded', String(open));
    filmExpand.setAttribute('aria-label', open ? 'Close expanded film' : 'Expand film');
    filmExpand.title = open ? 'Close expanded film' : 'Expand film';
  }
  filmExpand.addEventListener('click', () => {
    if (teaserDialog.open) { closeFilm(); return; }
    filmPlaceholder = document.createElement('div');
    filmPlaceholder.style.height = `${teaserPlayer.getBoundingClientRect().height}px`;
    teaserPlayer.replaceWith(filmPlaceholder);
    teaserDialog.append(teaserPlayer);
    teaserDialog.showModal();
    document.documentElement.classList.add('comparison-open');
    filmExpand.innerHTML = icon('close');
    attrsFilmExpand(true);
    teaserDialog.scrollTop = 0;
    filmExpand.focus({preventScroll: true});
  });
  teaserDialog.addEventListener('cancel', event => { event.preventDefault(); closeFilm(); });
  teaserDialog.addEventListener('close', () => { if (!teaserDialog.open) closeFilm(); });
  function beginFilmSeek() {
    if (filmSeeking) return;
    resumeFilm = !teaser.paused;
    filmSeeking = true;
    teaserStarted = true;
    teaser.pause();
  }
  function finishFilmSeek() {
    if (!filmSeeking) return;
    filmSeeking = false;
    if (resumeFilm && Number(filmRange.value) < Number(filmRange.max) - .05) playFilm();
    updateFilm();
  }
  filmRange.addEventListener('pointerdown', beginFilmSeek);
  filmRange.addEventListener('input', () => {
    beginFilmSeek();
    if (teaser.readyState >= 1) teaser.currentTime = Number(filmRange.value);
    else { pendingFilmSeek = Number(filmRange.value); teaser.preload = 'metadata'; loadSource(teaser); teaser.load(); }
    updateFilm();
  });
  for (const event of ['change', 'pointerup', 'pointercancel', 'blur'])
    filmRange.addEventListener(event, finishFilmSeek);
  teaser.addEventListener('loadedmetadata', () => {
    if (pendingFilmSeek !== null) { teaser.currentTime = pendingFilmSeek; pendingFilmSeek = null; }
    updateFilm();
  });
  teaser.addEventListener('play', () => { teaserStarted = true; updateFilm(); });
  for (const event of ['pause', 'timeupdate', 'ended', 'durationchange']) teaser.addEventListener(event, updateFilm);
  updateFilm();
  new IntersectionObserver(entries => {
    for (const entry of entries) {
      const box = entry.target.getBoundingClientRect();
      const width = Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0));
      const height = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
      const visible = box.width > 0 && box.height > 0 && width * height / (box.width * box.height) >= .35;
      // Visibility starts the film once; scrolling away must not stop playback.
      if (visible && !teaserStarted && !reduced.matches && !saveData && !document.hidden) {
        loadSource(teaser);
        teaser.play().catch(() => {});
      }
    }
  }, {threshold: [0, .35]}).observe(teaser);
  const pauseHidden = () => {
    for (const state of states.values()) {
      if (document.hidden || reduced.matches) stop(state);
      else if (state.visible) start(state);
    }
    if (document.hidden || reduced.matches) teaser.pause();
  };
  document.addEventListener('visibilitychange', pauseHidden);
  reduced.addEventListener('change', pauseHidden);
})();
