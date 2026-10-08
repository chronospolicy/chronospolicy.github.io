(() => {
  "use strict";
  const root = document.getElementById("randomization-demo");
  if (!root) return;
  const svg = root.querySelector("svg");
  const play = root.querySelector("#randomization-play");
  const next = root.querySelector("#randomization-next");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const namespace = "http://www.w3.org/2000/svg";
  // Illustrative times in milliseconds, relative to a fixed policy request.
  // Every selected point belongs to this same recording.
  const lanes = [
    {id: "camera", title: "Camera", short: "Camera", step: 50, y: 76},
    {id: "state", title: "Proprioception", short: "State", step: 20, y: 113},
    {id: "force", title: "Force / torque", short: "Force", step: 10, y: 150},
  ];
  const examples = [
    {delay: [0, 20, 10], times: [
      [-300, -200, -100, 0], [-320, -260, -200, -140, -80, -20],
      [-290, -250, -210, -170, -130, -90, -50, -10],
    ], actionStart: 0},
    {delay: [100, 60, 80], times: [
      [-550, -400, -250, -100], [-460, -380, -300, -220, -140, -60],
      [-500, -440, -380, -320, -260, -200, -140, -80],
    ], actionStart: 150},
    {delay: [50, 40, 40], times: [
      [-500, -350, -200, -50], [-540, -440, -340, -240, -140, -40],
      [-390, -340, -290, -240, -190, -140, -90, -40],
    ], actionStart: 200},
  ];
  const color = {ink: "#292725", muted: "#6a625b", line: "#cfc8bf",
    source: "#b4aaa0", observation: "#497eaa", action: "#ad5736"};
  const nodes = new Map(), used = new Set();
  let index = 0, playing = !reduced.matches, visible = false, timer = null;

  function node(tag, id, attributes, text) {
    let element = nodes.get(id);
    if (!element) {
      element = document.createElementNS(namespace, tag);
      element.dataset.part = id;
      svg.append(element);
      nodes.set(id, element);
    }
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function label(id, x, y, text, anchor = "start", fill = color.muted, size = 14) {
    return node("text", id, {x, y, fill, "font-size": size, "text-anchor": anchor,
      "dominant-baseline": "middle"}, text);
  }
  const defs = document.createElementNS(namespace, "defs");
  defs.innerHTML = '<pattern id="randomization-delay-pattern" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="5" fill="#ede8e0"/><line x1="0" x2="0" y1="0" y2="5" stroke="#c4baae" stroke-width="1"/></pattern>';
  svg.append(defs);

  function draw() {
    const width = Math.max(220, svg.clientWidth);
    const compact = width < 520, left = compact ? 64 : 142, right = width - 10;
    const x = time => left + (time + 600) / 1000 * (right - left);
    const example = examples[index];
    svg.setAttribute("viewBox", `0 0 ${width} 246`);
    root.dataset.example = String(index + 1);
    root.querySelector("#randomization-example").textContent = `Example ${index + 1} of 3`;
    label("request-label", x(0), 12, compact ? "Request" : "Policy request", "middle");
    label("time-unit", right, 12, "ms", "end");
    node("line", "time-axis", {x1: left, x2: right, y1: 29, y2: 29, stroke: color.line});
    for (const time of [-600, 0, 400]) {
      node("line", `tick-${time}`, {x1: x(time), x2: x(time), y1: 26, y2: 32, stroke: color.muted});
      label(`time-${time}`, x(time), 44, time > 0 ? `+${time}` : String(time),
        time < 0 ? "start" : time > 0 ? "end" : "middle");
    }
    node("line", "request-line", {x1: x(0), x2: x(0), y1: 56, y2: 218,
      stroke: color.muted, "stroke-dasharray": "3 4", opacity: .55});
    lanes.forEach((lane, row) => {
      const delay = example.delay[row], chosen = new Set(example.times[row]);
      label(`${lane.id}-label`, 0, lane.y, compact ? lane.short : lane.title, "start", color.ink, compact ? 16 : 17);
      node("line", `${lane.id}-line`, {x1: left, x2: x(0), y1: lane.y, y2: lane.y, stroke: color.line});
      node("rect", `${lane.id}-delay`, {x: x(-delay), y: lane.y - 12,
        width: x(0) - x(-delay), height: 24, fill: "url(#randomization-delay-pattern)",
        rx: 2, "data-delay": delay});
      for (let time = -600; time <= 0; time += lane.step) {
        const selected = chosen.has(time), available = time + delay <= 0;
        const id = `${lane.id}-${time}`;
        if (selected) used.add(id);
        const seen = used.has(id) && available;
        const point = node("circle", id, {cx: x(time), cy: lane.y,
          r: selected ? (compact ? 3 : 4) : seen ? 1.7 : 1,
          fill: selected || seen ? color.observation : color.source,
          opacity: selected ? 1 : seen ? .55 : .5,
          class: "randomization-sample", "data-modality": lane.id,
          "data-time": time, "data-delay": delay, "data-selected": selected,
          "data-available": available, "data-used": used.has(id)});
        let title = point.querySelector("title");
        if (!title) {title = document.createElementNS(namespace, "title"); point.append(title);}
        title.textContent = `${lane.title}: captured at ${time} ms; arrives at ${time + delay} ms. ${selected ? "Selected." : available ? "Available, not selected." : "Observation delay: arrives after the request."}`;
      }
    });
    label("actions-label", 0, 204, "Actions", "start", color.ink, compact ? 16 : 17);
    node("line", "actions-line", {x1: x(0), x2: right, y1: 204, y2: 204, stroke: color.line});
    const actionWindow = node("g", "action-window", {class: "randomization-action-window", "data-start": example.actionStart});
    actionWindow.style.transform = `translateX(${x(example.actionStart)}px)`;
    let box = actionWindow.querySelector("rect");
    if (!box) {box = document.createElementNS(namespace, "rect"); actionWindow.append(box);}
    for (const [name, value] of Object.entries({x: -6, y: 190, width: x(150) - x(0) + 12,
      height: 28, rx: 4, fill: "#f7e9df", stroke: color.action})) box.setAttribute(name, value);
    for (let time = 0; time <= 400; time += 50) {
      const selected = time >= example.actionStart && time <= example.actionStart + 150;
      node("circle", `action-${time}`, {cx: x(time), cy: 204, r: selected ? 3.5 : 1.4,
        fill: selected ? color.action : color.source, opacity: selected ? 1 : .5,
        class: "randomization-sample", "data-modality": "action", "data-time": time,
        "data-selected": selected});
    }
    label("action-start-label", right, 235, `Action start +${example.actionStart} ms`, "end", color.action);
    const intervals = example.times.map(times => times[1] - times[0]);
    svg.querySelector("desc").textContent = `Illustrative training example ${index + 1}. Camera, proprioception, and force sampling intervals are ${intervals.join(", ")} milliseconds; delivery delays are ${example.delay.join(", ")} milliseconds. Selected measurements retain their capture times. Four action targets begin at ${example.actionStart} milliseconds, spaced 50 milliseconds apart.`;
  }
  function schedule() {
    clearTimeout(timer);
    timer = null;
    play.textContent = playing ? "Pause" : "Play";
    play.setAttribute("aria-label", playing ? "Pause resampling animation" : "Play resampling animation");
    root.dataset.playing = String(playing);
    if (playing && visible && !document.hidden) {
      timer = setTimeout(() => {index = (index + 1) % examples.length; draw(); schedule();}, 1400);
    }
  }
  play.addEventListener("click", () => {playing = !playing; schedule();});
  next.addEventListener("click", () => {
    playing = false;
    index = (index + 1) % examples.length;
    draw(); schedule();
    root.querySelector("#randomization-announcement").textContent = svg.querySelector("desc").textContent;
  });
  reduced.addEventListener("change", () => {if (reduced.matches) playing = false; schedule();});
  document.addEventListener("visibilitychange", schedule);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
    schedule();
  }, {threshold: [0, .15]}).observe(root);
  root.hidden = false;
  new ResizeObserver(draw).observe(svg);
  draw(); schedule();
})();
