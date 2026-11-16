(() => {
  'use strict';
  const root = document.getElementById('timing-issues');
  if (!root) return;
  const svg = root.querySelector('svg');
  const panel = root.querySelector('[role="tabpanel"]');
  const buttons = [...root.querySelectorAll('[data-issue]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const photos = [0, 1, 2].map(i => document.getElementById(`timing-photo-${i}`).getAttribute('src'));
  const issues = [
    {id: 'sampling-rate', title: 'Variable sampling rate', lane: 'camera',
      text: 'Changing the sampling rate changes the time between observations. Sequence positions alone no longer tell the policy how much physical time has passed.'},
    {id: 'observation-latency', title: 'Observation latency', lane: 'sensors',
      text: 'An observation can reach the policy well after it was captured. Its capture time and arrival time are different.'},
    {id: 'dropout', title: 'Sensor dropout', lane: 'pose',
      text: 'Some sensor measurements never arrive. Gaps in the history must not be mistaken for evenly spaced observations.'},
    {id: 'inference-latency', title: 'Variable inference latency', lane: 'policy',
      text: 'The policy takes longer to compute an action chunk. The prediction becomes available later, so actions must be requested for later execution times.'},
    {id: 'control-frequency', title: 'Variable control frequency', lane: 'actions',
      text: 'The controller may execute actions at a different frequency. The spacing between actions changes, even when the first action starts at the same time.'},
    {id: 'execution-latency', title: 'Variable execution latency', lane: 'execution',
      text: 'An action can start after the prediction is ready. This extra wait shifts execution later without changing how long inference takes.'},
  ];
  const color = {blue: '#497eaa', orange: '#ad5736', green: '#337f79',
    ink: '#292725', muted: '#827a73', line: '#cfc8bf', pale: '#f1eee9', bg: '#fffefc'};
  const nodes = new Map();
  let used, selected = 0, progress = reduced.matches ? 1 : 0;
  let visible = false, frame = 0, lastTime = null, elapsed = 0, started = false;
  const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  // Reuse SVG nodes between frames so real images stay decoded during animation.
  function node(tag, id, attrs, text) {
    let element = nodes.get(id);
    if (!element) {
      element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      element.dataset.part = id;
      svg.append(element);
      nodes.set(id, element);
    }
    used.add(id);
    element.removeAttribute('display');
    for (const [key, value] of Object.entries(attrs)) {
      const next = String(value);
      if (element.getAttribute(key) !== next) element.setAttribute(key, next);
    }
    if (text !== undefined && element.textContent !== text) element.textContent = text;
    return element;
  }
  const line = (id, x1, y1, x2, y2, stroke, opacity = 1, width = 2, dash = '') =>
    node('line', id, {x1, y1, x2, y2, stroke, opacity, 'stroke-width': width, 'stroke-dasharray': dash});
  const label = (id, x, y, text, fill = color.ink, size = 22, anchor = 'start', opacity = 1) =>
    node('text', id, {x, y, fill, opacity, 'font-size': size, 'font-weight': 500,
      'text-anchor': anchor, 'dominant-baseline': 'middle'}, text);
  const dot = (id, x, y, fill, opacity = 1, radius = 5, hollow = false) =>
    node('circle', id, {cx: x, cy: y, r: radius, fill: hollow ? color.bg : fill,
      stroke: fill, 'stroke-width': 2, opacity});
  const rect = (id, x, y, width, height, fill, stroke = 'none', opacity = 1, dash = '') =>
    node('rect', id, {x, y, width, height, fill, stroke, opacity,
      'stroke-width': 2, 'stroke-dasharray': dash, rx: 3});
  function arrow(id, x1, y, x2, stroke, opacity = 1, both = false) {
    line(id, x1, y, x2, y, stroke, opacity, 2.5);
    const direction = Math.sign(x2 - x1), length = 8;
    node('path', `${id}-head`, {d: `M${x2},${y} l${-direction * length},-4 v8 Z`,
      fill: stroke, opacity});
    if (both) node('path', `${id}-tail`, {d: `M${x1},${y} l${direction * length},-4 v8 Z`,
      fill: stroke, opacity});
  }
  function picture(id, index, x, y, width, opacity = 1) {
    const height = width * 202 / 360;
    node('image', id, {href: photos[index], x: x - width / 2, y, width, height,
      opacity, preserveAspectRatio: 'xMidYMid meet'});
    return y + height;
  }
  function curve(id, points, stroke, opacity = 1, dash = '') {
    node('path', id, {d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '),
      fill: 'none', stroke, opacity, 'stroke-width': 2, 'stroke-dasharray': dash});
  }
  const pose = t => Math.sin(t * 9) * 17 + Math.cos(t * 22) * 5;
  const force = t => Math.sin(t * 50) * 5 + 24 * Math.exp(-(((t + .32) / .045) ** 2));
  const action = t => Math.sin(t * 16) * 20 + Math.cos(t * 31) * 5;
  function model() {
    return {
      cameraSpacing: .2 + (selected === 0 ? .12 * progress : 0),
      observationDelay: .04 + (selected === 1 ? .13 * progress : 0),
      dropout: selected === 2 ? progress : 0,
      inferenceDuration: .17 + (selected === 3 ? .18 * progress : 0),
      executionDelay: .1 + (selected === 5 ? .18 * progress : 0),
      actionSpacing: .06 + (selected === 4 ? .045 * progress : 0),
    };
  }
  function desktop(m) {
    svg.setAttribute('viewBox', '0 0 1200 600');
    const active = issues[selected].lane;
    const opacity = lane => active === lane || (active === 'sensors' && ['camera', 'pose', 'force'].includes(lane))
      || (active === 'execution' && ['policy', 'actions'].includes(lane)) ? 1 : .26;
    const x = t => 760 + t * 630;
    const ready = x(m.inferenceDuration);
    const execute = x(m.inferenceDuration + m.executionDelay);
    const cameraY = 220, poseY = 310, forceY = 390, actionY = 485;
    arrow('time-axis', 220, 43, 1170, color.muted);
    label('time-label', 1160, 19, 'Physical time', color.muted, 22, 'end');

    for (const [id, xx, text] of [['input', 760, 'Policy input'], ['ready', ready, 'Ready'], ['start', execute, 'Start']]) {
      line(`${id}-guide`, xx, 95, xx, 522, color.muted, selected >= 3 ? .55 : .23, 1.5, '5 6');
      label(`${id}-label`, xx, 78, text, color.muted, 20, 'middle', selected >= 3 ? 1 : .55);
    }
    rect('policy', 760, 107, ready - 760, 309, color.pale, color.muted, opacity('policy'));
    label('policy-name', (760 + ready) / 2, 250, 'Policy', color.ink, 26, 'middle', opacity('policy'));
    label('policy-inference', (760 + ready) / 2, 282, 'inference', color.muted, 22, 'middle', opacity('policy'));
    if (selected === 3) arrow('inference-span', 766, 126, ready - 6, color.orange, 1, true);

    label('camera-name', 12, cameraY, 'RGB camera', color.ink, 24, 'start', opacity('camera'));
    line('camera-lane', 220, cameraY, 750, cameraY, color.line, opacity('camera'));
    for (let i = 0; i < 3; i++) {
      const xx = x(-.17 - (2 - i) * m.cameraSpacing);
      const bottom = picture(`camera-image-${i}`, i, xx, 128, 116, opacity('camera'));
      line(`camera-stem-${i}`, xx, bottom + 4, xx, cameraY, color.blue, opacity('camera'), 1.5);
      dot(`camera-dot-${i}`, xx, cameraY, color.blue, opacity('camera'));
    }
    if (selected === 0) {
      const left = x(-.17 - 2 * m.cameraSpacing), right = x(-.17 - m.cameraSpacing);
      arrow('sampling-span', left, 246, right, color.blue, 1, true);
      label('sampling-caption', (left + right) / 2, 267, 'Interval', color.blue, 20, 'middle');
    }
    for (const [lane, y, last, step, wave, title] of [
      ['pose', poseY, -.065, .045, pose, 'Proprioception'],
      ['force', forceY, -.025, .025, force, 'Force / torque'],
    ]) {
      const alpha = opacity(lane);
      label(`${lane}-name`, 12, y, title, color.ink, 24, 'start', alpha);
      const points = Array.from({length: 100}, (_, i) => {
        const t = -.84 + (.84 + last) * i / 99;
        return [x(t), y + wave(t)];
      });
      curve(`${lane}-curve`, points, color.muted, alpha * .55);
      for (let i = 0, t = last; t >= -.84; i++, t -= step) {
        const missing = lane === 'pose' && t > -.53 && t < -.34;
        dot(`${lane}-sample-${i}`, x(t), y + wave(t), color.blue,
          alpha * (missing ? 1 - m.dropout : 1), 4.5);
      }
    }
    if (selected === 2) {
      rect('dropout-gap', x(-.54), poseY - 30, x(-.33) - x(-.54), 60,
        color.bg, color.blue, m.dropout, '5 5');
      label('dropout-label', x(-.435), poseY - 48, 'Missing samples', color.blue, 21, 'middle', m.dropout);
    }
    if (selected === 1) {
      for (const [id, capture, y] of [['camera', -.17, cameraY], ['pose', -.065, poseY], ['force', -.025, forceY]]) {
        const available = capture + Math.min(-capture, m.observationDelay);
        arrow(`${id}-delivery`, x(capture) + 5, y - 18, x(available), color.blue);
        dot(`${id}-arrival`, x(available), y, color.blue, 1, 6, true);
      }
      label('capture-label', x(-.17), 111, 'Captured', color.blue, 20, 'middle');
      label('arrival-label', x(-.17 + m.observationDelay) - 18, 249, 'Arrives', color.blue, 20, 'end');
    }

    const actionAlpha = opacity('actions');
    label('action-name', 12, actionY, 'Actions', color.ink, 24, 'start', actionAlpha);
    const curvePoints = Array.from({length: 80}, (_, i) => {
      const t = .64 * i / 79;
      return [x(t), actionY + action(t)];
    });
    curve('predicted-trajectory', curvePoints, color.green, actionAlpha * .6);
    for (let i = 0, t = 0; x(t) < execute && t < .65; i++, t += .06) {
      rect(`predicted-action-${i}`, x(t) - 4, actionY + action(t) - 4, 8, 8,
        color.bg, color.green, actionAlpha);
    }
    const start = m.inferenceDuration + m.executionDelay;
    for (let i = 0, t = start; x(t) <= 1170; i++, t += m.actionSpacing) {
      dot(`executed-action-${i}`, x(t), actionY + action(t), color.orange, actionAlpha, 6);
    }
    if (selected === 4) {
      arrow('control-span', execute, 535, x(start + m.actionSpacing), color.orange, 1, true);
      label('control-caption', execute, 561, 'Execution interval', color.orange, 21, 'middle');
    }
    if (selected === 5) {
      arrow('execution-wait', ready, 535, execute, color.orange, 1, true);
      label('execution-caption', (ready + execute) / 2, 561, 'Wait after prediction', color.orange, 21, 'middle');
    }
  }

  function compact(m, width) {
    const w = Math.max(260, width);
    svg.setAttribute('viewBox', `0 0 ${w} 310`);
    const axisY = 222, font = 17;
    arrow('time-axis', 15, axisY, w - 14, color.muted);
    label('time-label', w - 16, 298, 'Physical time', color.muted, font, 'end');
    if (selected === 0) {
      label('camera-name', 16, 28, 'RGB camera', color.ink, 19);
      const gap = w * (.34 + .32 * progress);
      const xs = [w / 2 - gap / 2, w / 2 + gap / 2];
      xs.forEach((xx, i) => {
        const bottom = picture(`camera-image-${i}`, i * 2, xx, 78, Math.min(140, w * .28));
        line(`camera-stem-${i}`, xx, bottom + 5, xx, axisY, color.blue, 1, 1.5);
        dot(`camera-dot-${i}`, xx, axisY, color.blue, 1, 6);
      });
      arrow('sampling-span', xs[0], 252, xs[1], color.blue, 1, true);
      label('sampling-caption', w / 2, 276, 'Time between observations', color.blue, font, 'middle');
    } else if (selected === 1) {
      const capture = w * .18, available = w * (.59 + .22 * progress);
      label('camera-name', 16, 28, 'RGB camera', color.ink, 19);
      [capture, available].forEach((xx, i) => {
        const bottom = picture(`camera-image-${i}`, 1, xx, 78, Math.min(130, w * .29));
        line(`camera-stem-${i}`, xx, bottom + 5, xx, axisY, color.blue, 1, 1.5);
        dot(`camera-dot-${i}`, xx, axisY, color.blue, 1, 6, i === 1);
      });
      arrow('camera-delivery', capture + 6, 190, available - 6, color.blue);
      label('capture-label', capture, 253, 'Captured', color.blue, font, 'middle');
      label('arrival-label', available, 253, 'Arrives', color.blue, font, 'middle');
    } else if (selected === 2) {
      label('pose-name', 16, 28, 'Proprioception', color.ink, 19);
      const x = t => 20 + t * (w - 40), y = t => 137 + Math.sin(t * 8) * 22;
      curve('pose-curve', Array.from({length: 60}, (_, i) => [x(i / 59), y(i / 59)]), color.muted, .6);
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, missing = t > .35 && t < .65;
        dot(`pose-sample-${i}`, x(t), y(t), color.blue, missing ? 1 - progress : 1, 5);
      }
      rect('dropout-gap', x(.34), 97, x(.66) - x(.34), 77, color.bg, color.blue, progress, '5 5');
      label('dropout-label', w / 2, 190, 'Missing samples', color.blue, font, 'middle', progress);
    } else if (selected === 4) {
      label('action-name', 16, 28, 'Actions', color.ink, 19);
      const left = 26, right = w - 25, step = w * (.055 + .045 * progress);
      const y = x => 130 + Math.sin((x - left) / (right - left) * 8) * 25;
      curve('executed-trajectory', Array.from({length: 70}, (_, i) => {
        const x = left + (right - left) * i / 69; return [x, y(x)];
      }), color.green, .7);
      for (let i = 0, x = left; x <= right; i++, x += step)
        dot(`executed-action-${i}`, x, y(x), color.orange, 1, 5);
      line('start-guide', left, 163, left, axisY, color.orange, .6, 1.5, '4 4');
      label('start-label', left, 247, 'Same start', color.orange, font);
      arrow('control-span', left, 183, left + step, color.orange, 1, true);
      label('control-caption', w / 2, 277, 'Spacing between actions changes', color.orange, font, 'middle');
    } else {
      const request = w * .37;
      const ready = w * (.6 + (selected === 3 ? .12 * progress : 0));
      const start = ready + w * (.15 + (selected === 5 ? .12 * progress : 0));
      label('pipeline-name', 16, 28, 'Policy and execution', color.ink, 19);
      const capture = w * .15;
      const bottom = picture('camera-image-0', 1, capture, 92, Math.min(100, w * .22));
      line('camera-stem-0', capture, bottom + 4, capture, axisY, color.blue, .7, 1.5);
      dot('camera-dot-0', capture, axisY, color.blue, .8, 5);
      rect('policy', request, 85, ready - request, 87, color.pale, color.muted);
      label('policy-name', (request + ready) / 2, 128, 'Policy', color.ink, font, 'middle');
      for (const [id, xx] of [['input', request], ['ready', ready], ['start', start]])
        line(`${id}-guide`, xx, 178, xx, axisY, color.muted, .6, 1.5, '4 4');
      label('input-label', request, 253, 'Request', color.muted, font, 'middle');
      label('ready-label', ready, 195, 'Ready', color.muted, font, 'middle');
      label('start-label', start, 253, 'Starts', color.orange, font, 'middle');
      for (let i = 0, xx = start; xx < w - 15; i++, xx += w * .055)
        dot(`executed-action-${i}`, xx, axisY, color.orange, 1, 5);
      if (selected === 3) arrow('inference-span', request + 3, 67, ready - 3, color.orange, 1, true);
      else arrow('execution-wait', ready + 3, 67, start - 3, color.orange, 1, true);
    }
  }

  function draw() {
    used = new Set();
    const m = model();
    const width = root.querySelector('.timing-issue-figure').clientWidth;
    const narrow = width < 900;
    svg.dataset.compact = String(narrow);
    for (const [key, value] of Object.entries(m)) svg.dataset[key] = value.toFixed(4);
    root.dataset.issue = issues[selected].id;
    root.dataset.progress = progress.toFixed(4);
    narrow ? compact(m, width) : desktop(m);
    for (const [id, element] of nodes) if (!used.has(id)) element.setAttribute('display', 'none');
  }
  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
  }
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) { lastTime = null; return; }
    if (lastTime !== null) elapsed += Math.min(100, now - lastTime);
    lastTime = now;
    progress = ease((elapsed - 450) / 1800);
    draw();
    if (progress < 1) frame = requestAnimationFrame(tick);
    else lastTime = null;
  }
  function resume() {
    if (!frame && visible && !document.hidden && !reduced.matches && progress < 1)
      frame = requestAnimationFrame(tick);
  }
  function select(index) {
    cancel();
    selected = index;
    started = true;
    elapsed = 0;
    progress = reduced.matches ? 1 : 0;
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    const issue = issues[index];
    root.style.setProperty('--issue-color', index < 3 ? color.blue : color.orange);
    panel.setAttribute('aria-labelledby', buttons[index].id);
    root.querySelector('#timing-issue-copy').textContent = issue.text;
    svg.querySelector('title').textContent = issue.title;
    svg.querySelector('desc').textContent = `Schematic timing illustration. ${issue.text}`;
    draw();
    resume();
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].focus();
      select(target);
    });
  });
  new ResizeObserver(draw).observe(root.querySelector('.timing-issue-figure'));
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .2;
    if (visible) {
      if (!started) { started = true; elapsed = 0; }
      resume();
    } else cancel();
  }, {threshold: [0, .2]}).observe(svg);
  document.addEventListener('visibilitychange', () => document.hidden ? cancel() : resume());
  reduced.addEventListener('change', () => {
    cancel();
    progress = reduced.matches ? 1 : 0;
    elapsed = 0;
    draw();
    resume();
  });
  draw();
})();
