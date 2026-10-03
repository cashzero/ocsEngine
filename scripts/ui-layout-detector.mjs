// Layout detector shared by scripts/ui-layout-audit.mjs. The exported function is serialised into the page by
// Playwright, so it must stay self-contained (no imports, no closures over module scope).
//
// It reports what a player would see as broken layout, not every CSS oddity:
//   control-clipped        a button/input/select that an overflow:hidden ancestor cuts off, with no scrolling to reach it
//   content-clipped        text or children that spill out of an overflow:hidden box
//   ellipsis-truncated     text cut with an ellipsis
//   outside-viewport       visible content that is not inside any scroll container yet lies off screen
//   controls-overlap       two controls whose boxes intersect
//   controls-gap           two aligned controls closer than 4px
//   floating-overlap       overlays that are not meant to stack (toast over map controls, legend over hover info, ...)
//   tight-padding          button/card text closer than 4px to its own border
//   rail-misaligned        left-rail panels whose text does not start at the same x as the rail header
//   page-scroll            the page itself scrolls
// Font sizes are deliberately not checked here: the 13px budget is a separate product decision.
export function detectLayoutIssues() {
  const vw = innerWidth, vh = innerHeight;
  const issues = [];
  const name = (e) => {
    const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''}`;
  };
  const text = (e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const visible = (e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const scrollsY = (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY);
  const scrollsX = (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX);
  const clips = (s) => /(hidden|clip)/.test(s);
  const modal = document.querySelector('[role=dialog], .new-game-dialog, .utility-dialog');
  const reachable = (e) => {
    if (!modal || modal.contains(e)) return true;
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), Math.min(Math.max(r.top + r.height / 2, 0), vh - 1));
    return !!t && (e.contains(t) || t.contains(e));
  };
  const all = [...document.querySelectorAll('body *')].filter(visible).filter(reachable)
    .filter((e) => !e.closest('svg') || e.tagName.toLowerCase() === 'svg')
    .filter((e) => !e.closest('.visually-hidden') && !e.classList.contains('visually-hidden') && e.tagName !== 'CANVAS');
  const insideScroller = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (scrollsY(p) || scrollsX(p)) return true;
    return false;
  };
  const controlSelector = 'button, a[href], select, input:not([type=hidden]), textarea, summary, [role=button], [role=tab]';
  const controls = all.filter((e) => e.matches(controlSelector));

  for (const e of all) {
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    const ownsText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    // Content spilling out of a clipping box. Absolutely positioned children (toasts) are meant to hang outside.
    const spillX = e.scrollWidth - e.clientWidth, spillY = e.scrollHeight - e.clientHeight;
    const flowSpill = (axis) => [...e.children].some((c) => {
      const cs = getComputedStyle(c); if (cs.position === 'absolute' || cs.position === 'fixed') return false;
      const cr = c.getBoundingClientRect(); const er = e.getBoundingClientRect();
      return axis === 'x' ? cr.right > er.right + 1 || cr.left < er.left - 1 : cr.bottom > er.bottom + 1 || cr.top < er.top - 1;
    });
    if (e.clientWidth > 0 && spillX > 1 && clips(s.overflowX) && !scrollsX(e) && (ownsText || flowSpill('x'))) issues.push({ kind: 'content-clipped', el: name(e), text: text(e), axis: 'x', by: spillX });
    if (e.clientHeight > 0 && spillY > 1 && clips(s.overflowY) && !scrollsY(e) && flowSpill('y')) issues.push({ kind: 'content-clipped', el: name(e), text: text(e), axis: 'y', by: spillY });
    if (ownsText && s.textOverflow === 'ellipsis' && spillX > 1) issues.push({ kind: 'ellipsis-truncated', el: name(e), text: text(e), by: spillX });
    if (!insideScroller(e) && s.position !== 'fixed' && s.position !== 'absolute' && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)) {
      issues.push({ kind: 'outside-viewport', el: name(e), text: text(e), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) });
    }
    // Padding: only boxes a player reads as buttons or cards.
    const isBoxy = e.matches('button, summary, .deck-unit, .roster-unit, .end-note, [class*=card]');
    if (isBoxy && ownsText) {
      const pl = parseFloat(s.paddingLeft), pr = parseFloat(s.paddingRight);
      if (pl < 4 || pr < 4) issues.push({ kind: 'tight-padding', el: name(e), text: text(e), padding: [pl, pr] });
    }
  }

  // A control that is cut off by a non-scrolling ancestor cannot be reached with the mouse.
  for (const c of controls) {
    const r = c.getBoundingClientRect();
    let scrolledY = false, scrolledX = false; // a scroller between the control and a clipping ancestor makes it reachable
    for (let p = c.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p); const pr = p.getBoundingClientRect();
      if (ps.position === 'fixed') break;
      const cutY = !scrolledY && clips(ps.overflowY) && !scrollsY(p) && (r.bottom > pr.bottom + 1 || r.top < pr.top - 1);
      const cutX = !scrolledX && clips(ps.overflowX) && !scrollsX(p) && (r.right > pr.right + 1 || r.left < pr.left - 1);
      if (cutY || cutX) { issues.push({ kind: 'control-clipped', el: name(c), text: text(c), by: name(p) }); break; }
      if (scrollsY(p)) scrolledY = true;
      if (scrollsX(p)) scrolledX = true;
    }
  }

  // Controls on top of each other, or aligned and nearly touching.
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.contains(b) || b.contains(a) || a.matches('summary') || b.matches('summary')) continue;
    if (a.matches('input[type=checkbox], input[type=radio]') || b.matches('input[type=checkbox], input[type=radio]')) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dx = Math.max(rb.left - ra.right, ra.left - rb.right), dy = Math.max(rb.top - ra.bottom, ra.top - rb.bottom);
    if (dx < -1 && dy < -1) { issues.push({ kind: 'controls-overlap', el: name(a), other: name(b), text: text(a), otherText: text(b) }); continue; }
    const alignedY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 4;
    const alignedX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 4;
    if ((dx >= 0 && dx < 4 && alignedY) || (dy >= 0 && dy < 4 && alignedX)) {
      issues.push({ kind: 'controls-gap', el: name(a), other: name(b), text: text(a), otherText: text(b), gap: Math.round(Math.max(dx, dy) * 10) / 10 });
    }
  }

  // Overlays that must not sit on each other (a toast hiding the zoom buttons, a legend under the hover read-out).
  const overlays = ['.end-notes', '.map-controls', '.map-legend', '.hover-info', '.roster-popup', '.deck-notice']
    .map((selector) => document.querySelector(selector)).filter((e) => e && visible(e));
  const allowed = new Set(['.roster-popup|.map-controls', '.roster-popup|.map-legend', '.roster-popup|.hover-info']);
  const sel = (e) => ['.end-notes', '.map-controls', '.map-legend', '.hover-info', '.roster-popup', '.deck-notice'].find((s) => e.matches(s));
  for (let i = 0; i < overlays.length; i++) for (let j = i + 1; j < overlays.length; j++) {
    const a = overlays[i], b = overlays[j];
    if (allowed.has(`${sel(a)}|${sel(b)}`) || allowed.has(`${sel(b)}|${sel(a)}`)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) issues.push({ kind: 'floating-overlap', el: sel(a), other: sel(b), overlapPx: [Math.round(ox), Math.round(oy)] });
  }

  // Left rail: every panel's content should start where the rail header text starts.
  const header = document.querySelector('.command-rail > .deck-objective');
  if (header) {
    const start = (e) => e.getBoundingClientRect().left + parseFloat(getComputedStyle(e).paddingLeft);
    const reference = start(header);
    for (const panel of document.querySelectorAll('.command-rail .deck-body > section, .command-rail .deck-body > .deck-context')) {
      if (visible(panel) && Math.abs(start(panel) - reference) > 4) issues.push({ kind: 'rail-misaligned', el: name(panel), text: text(panel), contentX: Math.round(start(panel)), headerX: Math.round(reference) });
    }
  }

  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) issues.push({ kind: 'page-scroll', axis: 'x', by: doc.scrollWidth - vw });
  if (doc.scrollHeight > vh + 1) issues.push({ kind: 'page-scroll', axis: 'y', by: doc.scrollHeight - vh });

  const seen = new Set();
  return issues.filter((i) => { const k = JSON.stringify([i.kind, i.el, i.other, i.by, i.axis]); if (seen.has(k)) return false; seen.add(k); return true; });
}
