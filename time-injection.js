(() => {
  "use strict";
  const root = document.getElementById("architecture-explorer");
  if (!root) return;
  const descriptions = {
    positions: "Use index-based positional encoding without observation or action timestamps.",
    rope: "Time-aware RoPE uses capture and requested execution times as positional coordinates in attention.",
    embedding: "Add timestamp embeddings to token features and retain index-based positional encoding.",
  };
  root.querySelector(".architecture-options").hidden = false;
  root.querySelector("#architecture-mode-description").textContent = descriptions.positions;
  root.querySelectorAll('input[name="time-injection"]').forEach(input => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      root.dispatchEvent(new CustomEvent("diagramvariantchange", {detail: input.value}));
      root.querySelector("#architecture-mode-description").textContent = descriptions[input.value];
    });
  });
})();
