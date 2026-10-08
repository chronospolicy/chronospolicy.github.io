// Responsive film labels: the page's font family, with larger equation symbols.
(() => {
  'use strict';
  const schedule = window.CHRONOS_TEASER;
  const video = document.getElementById('story-teaser');
  const frame = video?.closest('.teaser-visual');
  const overlay = frame?.querySelector('.teaser-text');
  const etymology = frame?.querySelector('.hero-etymology');
  if (!schedule?.segments?.length || !overlay || !video.dataset.backgroundSrc) return;

  const canvas = document.createElement('div');
  canvas.className = 'film-canvas-text';
  overlay.append(canvas);
  const nodes = new Map();
  const taskNames = {cup: 'Dynamic Cup', peg: 'Peg Insertion', pivot: 'Pivoting'};
  const ease = value => {
    const x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
  };
  const anchors = {mm: 'center', lm: 'left', lt: 'top-left', rt: 'top-right'};
  let specs = [];
  let equationMotion = null;
  const equationMarkup =
    '<span class="film-eq-action">A</span>' +
    '<span class="film-eq-addition"><span class="film-eq-width"><sub class="film-action">tₐ</sub></span></span>' +
    '<span> = f</span>' +
    '<span class="film-eq-addition"><span class="film-eq-width"><sub>θ</sub></span></span>' +
    '<span>(</span><span class="film-eq-observation">O</span>' +
    '<span class="film-eq-addition"><span class="film-eq-width"><sub class="film-observation">tₒ</sub></span></span>' +
    '<span class="film-eq-addition"><span class="film-eq-width"><span class="film-observation">, t<sub>o</sub>,</span> ' +
    '<span class="film-action">t<sub>a</sub></span></span></span><span>)</span>';
  const label = (id, text, x, y, classes = '', anchor = 'mm', opacity = 1, html = false) => {
    specs.push({id, text, x, y, classes, anchor, opacity, html});
  };
  function title(opacity = 1) {
    label('title-card', '<span class="film-title">Chronos Policy</span>' +
      '<span class="film-subtitle">Learning Robot Policies on Physical Time</span>',
    960, 540, 'film-title-card', 'mm', opacity, true);
  }
  function problem(part, local, opacity = 1) {
    const prefix = `problem-${part.key}`;
    const color = part.key === 'inference' ? 'film-action' : 'film-observation';
    const phase = ease((local - 1) / 1.15);
    const add = (key, text, x, y, classes = '', anchor = 'mm', alpha = 1, html = false) =>
      label(`${prefix}-${key}`, text, x, y, classes, anchor, opacity * alpha, html);
    add('heading', part.heading, 960, 85, 'film-heading film-main-heading');
    add('issue', part.title, 960, 210, `film-subheading film-issue ${color}`);
    if (part.key !== 'multirate') add('time', 'Time', 1740, 720, 'film-muted film-time', 'lm');
    if (part.key === 'observation') {
      const arrival = 1110 + 380 * phase;
      add('delay', 'Delay', (480 + arrival) / 2, 610, 'film-observation');
      add('captured', 'Captured', 480, 825, 'film-observation');
      add('arrival', 'Arrives', arrival, 825, 'film-observation');
    } else if (part.key === 'inference') {
      const execute = 1280 + 330 * phase;
      add('computing', '<span class="film-wide">Computing</span><span class="film-compact">Compute</span>',
        (850 + execute) / 2, 686, 'film-action', 'mm', 1, true);
      add('observation', 'Observation', 530, 825, 'film-observation');
      add('action', 'Action', execute, 825, 'film-action');
    } else {
      add('images', 'Images', 75, 658, 'film-observation film-modality', 'lm');
      add('pose', 'Pose', 75, 805, 'film-observation film-modality', 'lm');
      add('force', '<span class="film-wide">Force / torque</span>' +
        '<span class="film-compact">Force/<br>torque</span>', 75, 960,
      'film-force film-modality film-force-label', 'lm', 1, true);
    }
  }
  function ending(local, opacity = 1) {
    equationMotion = {room: ease((local - .8) / .45), reveal: ease((local - 1.25) / .3)};
    label('ending-card',
      '<span class="film-title">Chronos Policy</span>' +
      '<span class="film-subtitle">Learning Robot Policies on Physical Time</span>' +
      '<span data-film-label="policy-equation" class="film-equation film-equation-morph">' + equationMarkup + '</span>' +
      '<span class="film-ending-legend"><span class="film-observation">Observation capture times</span>' +
      '<span class="film-action">Requested action times</span></span>',
    960, 540, 'film-ending-card', 'mm', opacity, true);
  }
  function comparison(part, opacity = 1, chronosOpacity = opacity) {
    label('comparison-task', taskNames[part.task], 960, 64,
      'film-heading film-comparison-task', 'mm', opacity);
    label('comparison-dp', `<span class="film-wide">${taskNames[part.task]} · DP</span>` +
      '<span class="film-compact">DP</span>', 55, 64,
    'film-policy film-policy-dp', 'lt', opacity, true);
    label('comparison-chronos', 'Chronos Policy', 1020, 64,
      'film-policy film-policy-chronos', 'lt', chronosOpacity);
    label('comparison-speed', '2×', 1855, 64, 'film-speed', 'rt', opacity);
  }
  function contextNote(part, opacity = 1) {
    label('problem-context', `DP: ${part.context}`, 480, 190, 'film-context', 'mm', opacity);
  }
  function update(time = video.currentTime) {
    const t = Number.isFinite(time) ? time : 0;
    specs = [];
    equationMotion = null;
    let scene = 'title';
    let titleFill = 0;
    if (t < schedule.introEnd) {
      const fade = ease((t - schedule.introEnd + schedule.introFade) / schedule.introFade);
      titleFill = 1 - fade;
      title(1 - fade);
      if (fade) problem(schedule.segments[0], 0, fade);
    } else if (t >= schedule.policyStart) {
      scene = 'ending';
      titleFill = 1;
      ending(t - schedule.policyStart);
    } else {
      const part = schedule.segments.find(part => t >= part.start && t < part.next);
      if (part) {
        if (t < part.diagramEnd) {
          scene = 'timing';
          problem(part, t - part.start);
        } else if (t < part.play) {
          scene = 'comparison';
          const zoom = ease((t - part.diagramEnd) / (part.zoomEnd - part.diagramEnd));
          const split = ease((t - part.splitStart) / (part.play - part.splitStart));
          problem(part, schedule.diagramSeconds, 1 - ease(zoom / .45));
          comparison(part, ease((zoom - .55) / .45), ease((split - .9) / .1));
        } else if (t < part.end) {
          scene = 'comparison';
          comparison(part);
          contextNote(part);
        } else if (t < part.returnEnd) {
          scene = 'return';
          const returning = ease((t - part.end) / (part.returnEnd - part.end));
          problem(part, schedule.diagramSeconds, ease((returning - .65) / .35));
          const alpha = 1 - ease(returning / .35);
          comparison(part, alpha);
          contextNote(part, alpha);
        } else {
          scene = 'timing';
          const next = ease((t - part.holdEnd) / (part.next - part.holdEnd));
          problem(part, schedule.diagramSeconds, 1 - next);
          if (next) {
            const i = schedule.segments.indexOf(part);
            if (i + 1 < schedule.segments.length) problem(schedule.segments[i + 1], 0, next);
            else {
              titleFill = next;
              ending(0, next);
            }
          }
        }
      } else {
        titleFill = 1;
        title();
      }
    }
    if (etymology) {
      etymology.hidden = t >= schedule.introEnd;
      etymology.style.opacity = t < schedule.introEnd ? titleFill : 0;
    }
    frame.dataset.scene = scene;
    frame.style.setProperty('--film-title-fill', titleFill);
    const live = new Set();
    for (const spec of specs) {
      if (spec.opacity <= 0) continue;
      live.add(spec.id);
      let node = nodes.get(spec.id);
      if (!node) {
        node = document.createElement('span');
        node.dataset.filmLabel = spec.id;
        nodes.set(spec.id, node);
        canvas.append(node);
      }
      const classes = `film-label film-anchor-${anchors[spec.anchor]} ${spec.classes}`;
      if (node.className !== classes) node.className = classes;
      if (node.dataset.value !== spec.text) {
        if (spec.html) node.innerHTML = spec.text;
        else node.textContent = spec.text;
        node.dataset.value = spec.text;
      }
      for (const [property, value] of [
        ['--x', `${spec.x / 19.2}%`], ['--y', `${spec.y / 10.8}%`], ['opacity', String(spec.opacity)],
      ]) {
        if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
      }
    }
    for (const [id, node] of nodes) {
      if (!live.has(id)) { node.remove(); nodes.delete(id); }
    }
    const equation = canvas.querySelector('.film-equation-morph');
    if (equation && equationMotion) {
      if (!equation.dataset.measured) measureEquation(equation);
      equation.style.setProperty('--eq-room', equationMotion.room);
      equation.style.setProperty('--eq-reveal', equationMotion.reveal);
    }
  }
  function measureEquation(equation = canvas.querySelector('.film-equation-morph')) {
    if (!equation) return;
    for (const part of equation.querySelectorAll('.film-eq-addition')) {
      const width = part.querySelector('.film-eq-width').getBoundingClientRect().width;
      part.style.setProperty('--eq-width', `${width}px`);
    }
    equation.dataset.measured = 'true';
  }
  new ResizeObserver(() => measureEquation()).observe(frame);
  document.fonts.ready.then(() => measureEquation());

  // Without JavaScript the original fully labelled film remains available.
  frame.classList.add('text-enhanced');
  overlay.hidden = false;
  video.poster = video.dataset.backgroundPoster;
  video.dataset.src = video.dataset.backgroundSrc;
  update(0);
  for (const event of ['loadedmetadata', 'seeking', 'seeked', 'timeupdate', 'play', 'pause', 'ended'])
    video.addEventListener(event, () => update());
  if ('requestVideoFrameCallback' in video) {
    const onFrame = (_now, metadata) => { update(metadata.mediaTime); video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  } else {
    let animation = 0;
    const tick = () => {
      update();
      animation = video.paused || video.ended ? 0 : requestAnimationFrame(tick);
    };
    video.addEventListener('play', () => { if (!animation) tick(); });
    video.addEventListener('pause', () => { cancelAnimationFrame(animation); animation = 0; });
  }
})();
