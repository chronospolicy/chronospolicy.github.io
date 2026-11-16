(() => {
  'use strict';

  // A native horizontal scroller keeps each policy readable on a phone.
  document.querySelectorAll('.pair:not(.dex-grid)').forEach(pair => {
    pair.classList.add('mobile-comparison');
    pair.tabIndex = 0;
    pair.setAttribute('role', 'group');
    pair.setAttribute('aria-label', 'Policy comparison videos');
    const hint = document.createElement('p');
    hint.className = 'mobile-swipe-hint';
    hint.textContent = 'Swipe to compare policies →';
    pair.before(hint);
  });

  // Native selects offer a larger touch target than the dense SVG labels.
  document.querySelectorAll('.diagram-explorer').forEach(root => {
    const figure = window.CHRONOS_DIAGRAMS?.[root.id];
    const scroller = root.querySelector('.diagram-scroll');
    if (!figure || !scroller) return;
    const tools = document.createElement('div');
    tools.className = 'diagram-mobile-tools';
    const label = document.createElement('label');
    const picker = document.createElement('select');
    picker.id = `${root.id}-detail-picker`;
    picker.className = 'diagram-detail-picker';
    label.htmlFor = picker.id;
    label.textContent = 'Explore a detail';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.setAttribute('aria-label', 'Clear diagram selection');
    const controls = document.createElement('div');
    controls.className = 'diagram-detail-controls';
    controls.append(picker, clear);
    tools.append(label, controls);
    scroller.before(tools);

    let previousMode;
    function sync() {
      const mode = root.dataset.mode || 'positions';
      if (mode !== previousMode) {
        const state = mode === 'positions' ? figure : figure.variants[mode];
        picker.replaceChildren(new Option('Choose a token or layer', ''),
          ...state.items.map(item => new Option(item.title, item.id)));
        previousMode = mode;
      }
      picker.value = root.dataset.selection || '';
      clear.disabled = !root.dataset.selection;
    }
    picker.addEventListener('change', () => {
      if (!picker.value) {
        root.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        return;
      }
      const target = root.querySelector(`[data-item="${CSS.escape(picker.value)}"]`);
      target.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      const box = target.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      scroller.scrollLeft += box.left + box.width / 2 - viewport.left - viewport.width / 2;
    });
    clear.addEventListener('click', () => {
      root.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    });
    new MutationObserver(sync).observe(root, {
      attributes: true, attributeFilter: ['data-mode', 'data-selection'],
    });
    sync();
  });
})();
