(() => {
  "use strict";
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const items = [];
  const add = (id, title, description, box, group = id, kind = "block") =>
    items.push({ id, title, description, box, group, kind });
  const timeText = value => `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)} s`;
  const streams = [
    { key: "image", label: "Image", y: 15, timeY: 34, times: [-.30, -.20, -.10, -.02],
      description: "Visual features produced by the vision transformer. The image is represented by patch tokens that share its capture time." },
    { key: "proprio", label: "Proprioception", y: 68, timeY: 88, times: [-.33, -.22, -.11, -.02],
      description: "Encoded robot-state measurements, such as pose and gripper state, from one observation capture." },
    { key: "wrench", label: "Force / torque", y: 122, timeY: 141, times: [-.31, -.21, -.11, -.01],
      description: "Encoded force/torque measurements. This optional modality supplies contact information together with its own capture time." },
    { key: "action", label: "Action", y: 184, timeY: 203, times: [.20, .35, .50, .65],
      description: "A noisy action representation being denoised for a requested future execution time. This is an action slot, not an already executed command." },
  ];
  add("image-input", "Image observation", "An image captured at observation time tₒ. The vision transformer turns it into patch features.", [0, 0, 123, 46], "image-input");
  add("proprio-input", "Proprioceptive observation", "Robot pose and gripper-state measurements, paired with the time at which they were captured.", [0, 54, 123, 46], "proprio-input");
  add("wrench-input", "Optional wrench observation", "Force/torque sensing provides contact information. Its capture time is tracked separately from the camera and proprioception.", [0, 107, 123, 46], "wrench-input");
  add("noisy-action", "Noisy action Aᵏ", "The diffusion model starts from noisy action slots and refines them over denoising steps. The superscript k is a diffusion step, not physical execution time.", [0, 169, 123, 24], "noisy-action");
  add("action-input-time", "Requested execution time tₐ", "Each action slot is associated with a requested execution time relative to the policy request. In this illustration, the first shown action is requested at +0.20 s.", [0, 194, 123, 22], "noisy-action", "time");
  ["image", "proprio", "wrench"].forEach((key, i) =>
    add(`${key}-input-time`, `Capture time tₒ: ${key}`, "This is when the measurement was captured, measured relative to the policy request. It is not the time at which a delayed measurement arrives.", i === 2 ? [81, 108, 38, 23] : [35, 26 + i * 54, 60, 20], `${key}-input`, "time"));
  add("vit", "Vision transformer (ViT)", "Encodes the image into visual patch features. All patches belonging to the same image retain that image's capture timestamp.", [130, 6, 46, 34]);
  add("proprio-encoder", "Proprioceptive encoder", "An MLP maps the robot-state measurements into features used by the diffusion transformer.", [130, 59, 46, 35]);
  add("wrench-encoder", "Wrench encoder", "An MLP maps the optional force/torque measurements into sensor features.", [130, 113, 46, 35]);
  for (const stream of streams) {
    stream.times.forEach((time, i) => {
      const group = `${stream.key}-${i + 1}`;
      const x = 184 + i * 44.6;
      const event = stream.key === "action" ? "requested execution" : "capture";
      add(`${group}-token`, `${stream.label} ${i + 1}`,
        `${stream.description} Its corresponding ${event} time is ${timeText(time)}.`,
        [x, stream.y, 36, 19], group, "token");
      const description = stream.key === "action"
        ? `Requested execution time for action ${i + 1}: ${Math.round(time * 1000)} ms after the model request.${i === 0 ? " This first shown query retains the reported inference-latency offset D = 0.20 s." : " These are illustrated query times, rather than a claim about the full controller's action interval."}`
        : `Capture time for ${stream.label.toLowerCase()} ${i + 1}: ${Math.round(-time * 1000)} ms before the model request. The matching token is highlighted. This timestamp describes capture, not delivery.`;
      add(`${group}-time`, `${stream.label} ${i + 1} time: ${timeText(time)}`,
        description, [x - 4, stream.timeY, 43, 17], group, "time");
    });
  }
  const rope = "Time-aware RoPE rotates attention queries and keys using physical timestamps, so attention can depend on elapsed time. Observation times describe capture; action times describe requested execution. Token content stays unchanged.";
  add("local-rope", "Time-aware RoPE: state and actions", rope, [375, 92, 100, 56]);
  add("image-rope", "Time-aware RoPE: image features", rope, [692, 26, 137, 48]);
  add("self-attention", "Self-attention", "State and action tokens exchange information within the denoising sequence. Their time-aware attention uses the elapsed time between the corresponding observations and action requests.", [487, 102, 134, 65]);
  add("cross-attention", "Cross-attention", "The denoising sequence attends to visual features from the image encoder, using the corresponding physical times.", [637, 102, 134, 65]);
  add("feed-forward", "Feed-forward network (FFN)", "Transforms each token's features after attention. The dashed enclosure is repeated N times.", [787, 102, 49, 65]);
  add("output-head", "Action output head", "Maps the transformer features into the action representation used by the denoising process.", [851, 119, 52, 29]);
  add("denoising-loop", "Denoising steps: Aᵏ → Aᵏ⁻¹", "The action representation is refined over K diffusion steps. Those steps are not robot execution steps: the requested physical action times stay attached to the same action slots.", [772, 241, 156, 51]);

  function mount(root, figure = {
    items, asset: "architecture.svg", width: 929, height: 293, minWidth: 929,
    label: "Chronos Policy transformer architecture", initial: "image-1-token",
  }) {
    const entries = figure.items;
    const focusId = `${root.id}-focus`;
    root.style.setProperty("--diagram-min-width", `${figure.minWidth}px`);
    root.innerHTML = `<div class="diagram-scroll" role="region" aria-label="Scrollable interactive figure" tabindex="0"><div class="diagram-stage"><img src="assets/figures/${figure.asset}" alt="${esc(figure.label)}. Click an element to read its description below." width="${figure.width}" height="${figure.height}"><svg viewBox="0 0 ${figure.width} ${figure.height}" role="group" aria-label="${esc(figure.label)} elements"><defs><clipPath id="${focusId}"></clipPath></defs><image class="diagram-color-focus" href="assets/figures/${figure.asset}" width="${figure.width}" height="${figure.height}" clip-path="url(#${focusId})" pointer-events="none"/>${entries.map(item => `<g class="diagram-hotspot ${item.kind}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(item.title)}" data-item="${item.id}"><rect x="${item.box[0]}" y="${item.box[1]}" width="${item.box[2]}" height="${item.box[3]}" rx="2"/></g>`).join("")}</svg></div></div><div class="diagram-explanation" aria-live="polite" hidden><h4></h4><p></p></div>`;
    const show = id => {
      const item = entries.find(value => value.id === id);
      if (!item) return;
      root.dataset.selection = id;
      root.classList.add("has-selection");
      root.querySelector(".diagram-explanation").hidden = false;
      root.querySelector("clipPath").innerHTML = entries.filter(value => value.group === item.group)
        .map(value => `<rect x="${value.box[0]}" y="${value.box[1]}" width="${value.box[2]}" height="${value.box[3]}"/>`).join("");
      root.querySelector(".diagram-explanation h4").textContent = item.title;
      root.querySelector(".diagram-explanation p").textContent = item.description;
      root.querySelectorAll("[data-item]").forEach(target => {
        const data = entries.find(value => value.id === target.dataset.item);
        target.classList.toggle("is-selected", data.id === id);
        target.classList.toggle("is-related", data.group === item.group);
        target.setAttribute("aria-pressed", String(data.id === id));
      });
    };
    const clear = () => {
      delete root.dataset.selection;
      root.classList.remove("has-selection");
      root.querySelector(".diagram-explanation").hidden = true;
      root.querySelector("clipPath").innerHTML = "";
      root.querySelectorAll("[data-item]").forEach(target => {
        target.classList.remove("is-selected", "is-related");
        target.setAttribute("aria-pressed", "false");
      });
    };
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
  mount(document.getElementById("architecture-explorer"));

  // Descriptions follow the paper's Sections 3.1–3.2 and Eqs. (4)–(6).
  const ropeItems = [];
  const addRope = (id, title, description, box, group = id, kind = "block") =>
    ropeItems.push({ id, title, description, box, group, kind });
  addRope("asynchronous-inputs", "Asynchronous observations and action queries",
    "Each modality keeps its own capture times. Measurements do not need to be aligned to a common sampling grid; the action tokens carry the future execution times being queried.",
    [1, 1, 118, 20]);
  const ropeStreams = [
    { key: "image", label: "Image", count: 2, tokenY: 32, clockY: 28,
      timeline: [[307, 26, 11, 12], [330, 26, 11, 12]],
      content: "Image features represent visual content. All patches from the same frame inherit that frame's capture time.",
      time: "The clock marks when this image was captured, relative to the policy request. A delayed image keeps its original capture time." },
    { key: "force", label: "Force / torque", count: 5, tokenY: 56, clockY: 52,
      timeline: [[289, 44, 11, 13], [301, 44, 11, 13], [312, 44, 11, 13], [325, 44, 11, 13], [337, 44, 11, 13]],
      content: "This token contains a force/torque measurement. Its timestamp describes when contact information was measured.",
      time: "Force/torque keeps its own capture times and sensing rate, independently of the camera and proprioception." },
    { key: "proprio", label: "Proprioception", count: 4, tokenY: 80, clockY: 76,
      timeline: [[286, 62, 12, 13], [299, 62, 12, 13], [313, 62, 12, 13], [330, 62, 12, 13]],
      content: "This token encodes robot-state measurements, such as pose and gripper state. Its capture timestamp is used separately in attention.",
      time: "The timestamp is when this robot-state measurement was captured. Relative gaps to image, force/torque, and action times remain explicit." },
    { key: "action", label: "Action", count: 3, tokenY: 104, clockY: 100,
      timeline: [[350, 80, 10, 12], [362, 80, 11, 12], [374, 80, 11, 12]],
      content: "A noisy action token is refined during diffusion denoising. Its physical timestamp specifies when that action is requested to execute.",
      time: "Action times are future execution requests, not diffusion-step indices. Relative to the policy request, query j is at dₜ + jΔtₐ, including the action-start delay." },
  ];
  for (const stream of ropeStreams) {
    for (let i = 0; i < stream.count; i++) {
      const group = `rope-${stream.key}-${i + 1}`;
      const tokenX = 37.5 + i * 13.45;
      addRope(`${group}-token`, `${stream.label} ${i + 1}`, stream.content,
        [tokenX, stream.tokenY, 10, 12], group, "token");
      addRope(`${group}-clock`, `${stream.label} ${stream.key === "action" ? "execution" : "capture"} time ${i + 1}`,
        stream.time, [tokenX + 7.3, stream.clockY, 6.6, 7], group, "time");
      addRope(`${group}-timed`, `${stream.label} ${i + 1} on physical time`,
        `${stream.key === "action" ? "This action query lies after the policy request." : "This observation is placed at its capture time before the policy request."} ${stream.content} Its matching input token and clock are highlighted.`,
        stream.timeline[i], group, "token");
    }
  }
  addRope("rotation-equation", "Physical time sets the rotation",
    "R(t) rotates attention queries and keys by an angle set by the timestamp and angular frequency ω. The paper uses timestamps relative to the policy request, in seconds.",
    [140, 29, 86, 17]);
  addRope("rotation-frequencies", "Several temporal scales",
    "Different rotated coordinate pairs use different angular frequencies. This represents elapsed time at multiple scales within the attention vectors.",
    [142, 47, 83, 6]);
  addRope("attention-input", "Token content",
    "The token retains its image, sensor, or action features. Time is applied to its attention queries and keys, rather than added to the token features.",
    [140, 58, 12, 14]);
  addRope("rotation-operation", "Rotating queries and keys",
    "For token i, time-aware RoPE computes q̃ᵢ = R(t̃ᵢ)qᵢ and k̃ᵢ = R(t̃ᵢ)kᵢ. The rotation uses that token's capture or requested execution time.",
    [165, 56, 28, 18], "attention-rotation");
  addRope("rotated-attention", "Attention features with timing",
    "The tilted icon illustrates a rotation of attention queries and keys. The underlying token content stays unchanged.",
    [210, 57, 14, 16], "attention-rotation");
  addRope("relative-attention", "Attention uses elapsed time",
    "The interaction becomes qᵢᵀ R(tⱼ − tᵢ) kⱼ. Timing depends on the gap between the tokens, while their content still contributes through qᵢ and kⱼ. A 20 ms gap and a 200 ms gap therefore have different temporal representations.",
    [140, 87, 86, 17]);
  addRope("shared-clock", "One clock across modalities",
    "Observation-to-observation, observation-to-action, and action-to-action gaps are all measured in physical time. Sequence positions alone do not specify these intervals.",
    [251, 1, 144, 20]);
  addRope("request-origin", "Now: the policy request",
    "The vertical line marks the policy request, t = 0. Observations keep their earlier capture times. The first action is queried for a future execution time that includes the action-start delay.",
    [347, 22, 4, 74], "physical-clock", "time");
  addRope("physical-axis", "Time from the policy request, in seconds",
    "Negative times describe earlier captures; positive times describe future action queries. Each sensor keeps its own spacing, and action spacing specifies the requested execution frequency.",
    [287, 95, 107, 26], "physical-clock", "time");
  const ropeFigure = {
    items: ropeItems, asset: "method.svg", width: 396, height: 124, minWidth: 1100,
    label: "Time-aware RoPE", initial: "rotation-equation",
  };
  mount(document.getElementById("rope-explorer"), ropeFigure);
})();
