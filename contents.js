(() => {
  'use strict';
  const contents = document.querySelector('.page-contents');
  if (!contents) return;
  const header = document.querySelector('.site-header');
  const desktop = matchMedia('(min-width: 1200px)');
  const links = [...contents.querySelectorAll('a[href^="#"]')];
  const targets = links.map(link => document.querySelector(link.getAttribute('href')));
  let frame = 0;

  function update() {
    frame = 0;
    const headerHeight = getComputedStyle(header).position === 'sticky'
      ? header.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    contents.style.setProperty('--contents-menu-height',
      `${Math.max(80, innerHeight - contents.getBoundingClientRect().bottom - 12)}px`);
    if (!desktop.matches && contents.open) return;
    const threshold = desktop.matches ? headerHeight + 64
      : Math.max(headerHeight, contents.getBoundingClientRect().bottom) + 24;
    let active = 0;
    for (let i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top <= threshold) active = i;
    }
    if (Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2) {
      active = links.length - 1;
    }
    links.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function adapt() {
    contents.open = desktop.matches;
    schedule();
  }
  links.forEach(link => link.addEventListener('click', () => {
    if (!desktop.matches) contents.open = false;
    schedule();
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !desktop.matches && contents.open) {
      contents.open = false;
      contents.querySelector('summary').focus({preventScroll: true});
    }
  });
  document.addEventListener('click', event => {
    if (!desktop.matches && contents.open && !contents.contains(event.target)) contents.open = false;
  });
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', schedule);
  desktop.addEventListener('change', adapt);
  contents.addEventListener('toggle', schedule);
  new ResizeObserver(schedule).observe(header);
  new ResizeObserver(schedule).observe(document.getElementById('main'));
  document.fonts.ready.then(schedule);
  adapt();
})();
