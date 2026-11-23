/* Full-screen image slides, controlled only by IMÁGENES PANTALLA. */
(function () {
  'use strict';

  const sheetId = '1987654430';
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/1wCCkZeA1R_dYFx-k-MYXMY-PUvaW4A9U5oeXQHfm7Ag/gviz/tq';
  const refreshMilliseconds = 15000;
  const requestedPreview = Number(new URLSearchParams(window.location.search).get('preview'));
  const previewRow = document.body.hasAttribute('data-images-only') && Number.isInteger(requestedPreview) && requestedPreview >= 2 && requestedPreview <= 101 ? requestedPreview : null;
  let slides = [];
  let pendingRefresh = null;
  let overlay = null;
  let activeSlide = null;
  let finishWait = null;
  let sequenceRunning = false;

  function chicagoDate() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }

  function expirationDate(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? match[3] + '-' + match[1].padStart(2, '0') + '-' + match[2].padStart(2, '0') : '';
  }

  function imageSources(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    let url;
    try { url = new URL(text, document.baseURI); } catch (error) { return []; }
    if (!['https:', 'http:'].includes(url.protocol)) return [];
    const bundledPath = '/curated-production-board/assets/';
    if (url.hostname === 'projmodesto-prog.github.io' && url.pathname.startsWith(bundledPath)) {
      url = new URL('assets/' + url.pathname.slice(bundledPath.length), document.baseURI);
    }
    if (url.hostname === 'drive.google.com') {
      const match = url.pathname.match(/\/file\/d\/([^/]+)/);
      const id = match ? match[1] : url.searchParams.get('id');
      if (id) return [
        'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1920',
        'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w1920'
      ];
    }
    return [url.href];
  }

  function parseRows(rows) {
    const today = chicagoDate();
    return rows.slice(1).map((row, index) => {
      const show = String(row[0] || '').trim().toUpperCase();
      const expires = expirationDate(row[12]);
      const images = row.slice(6, 12).map(imageSources).filter(sources => sources.length);
      if (!images.length) return null;
      if (previewRow ? index + 2 !== previewRow : show !== 'YES' || (expires && expires < today)) return null;
      const count = Math.round(Number(row[4]));
      const seconds = Math.round(Number(row[3]));
      return {
        row: index + 2,
        title: String(row[1] || 'IMÁGENES').trim(),
        order: Number(row[2]) || index + 1,
        seconds: Number.isFinite(seconds) && seconds >= 3 ? Math.min(3600, seconds) : 15,
        count: Number.isFinite(count) && count >= 1 ? Math.min(6, count) : images.length,
        fit: String(row[5] || '').trim().toUpperCase() === 'LLENAR' ? 'cover' : 'contain',
        images,
        expires
      };
    }).filter(Boolean).sort((a, b) => a.order - b.order || a.row - b.row);
  }

  function fetchRows() {
    return new Promise((resolve, reject) => {
      const callback = '__screen_images_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
      const script = document.createElement('script');
      let settled = false;
      const complete = (error, rows) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        delete window[callback];
        script.remove();
        if (error) reject(error);
        else resolve(rows);
      };
      const timeout = setTimeout(() => complete(new Error('Image control sheet timed out')), 7000);
      window[callback] = response => {
        if (response?.status !== 'ok' || !response.table) {
          complete(new Error('Image control sheet unavailable'));
          return;
        }
        const rows = (response.table.rows || []).map(row => Array.from({ length: 13 }, (_, index) => {
          const cell = row.c?.[index];
          return String(cell?.f ?? cell?.v ?? '').trim();
        }));
        complete(null, rows);
      };
      script.onerror = () => complete(new Error('Image control sheet network error'));
      const params = new URLSearchParams({
        gid: sheetId, range: 'A1:M101', headers: '0', tq: 'select *',
        tqx: 'out:json;responseHandler:' + callback, cacheBust: String(Date.now())
      });
      script.src = sheetUrl + '?' + params;
      document.head.appendChild(script);
    });
  }

  function signature(slide) { return JSON.stringify(slide); }

  function currentSlides() {
    const today = chicagoDate();
    return slides.filter(slide => previewRow || !slide.expires || slide.expires >= today);
  }

  async function refresh() {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = fetchRows().then(rows => {
      slides = parseRows(rows);
      if (activeSlide && !slides.some(slide => signature(slide) === signature(activeSlide))) cancel();
      return slides;
    }).catch(() => slides).finally(() => { pendingRefresh = null; });
    return pendingRefresh;
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = `
      #screenImagesOverlay{position:fixed;inset:0;z-index:10000;background:#171717;display:none;overflow:hidden}
      #screenImagesOverlay.isActive{display:grid}
      #screenImagesOverlay[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #screenImagesOverlay[data-count="3"]{grid-template-columns:2fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}
      #screenImagesOverlay[data-count="3"] figure:first-child{grid-row:span 2}
      #screenImagesOverlay[data-count="4"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}
      #screenImagesOverlay[data-count="5"]{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}
      #screenImagesOverlay[data-count="5"] figure:first-child{grid-row:span 2}
      #screenImagesOverlay[data-count="6"]{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}
      #screenImagesOverlay figure{position:relative;min-width:0;min-height:0;margin:0;overflow:hidden;background:#171717}
      #screenImagesOverlay img{position:absolute;width:100%;height:100%;inset:0}
      #screenImagesOverlay .screenImageBackdrop{object-fit:cover;filter:blur(30px) brightness(.72);transform:scale(1.12)}
      #screenImagesOverlay .screenImageContent{object-fit:contain}
      #screenImagesOverlay[data-fit="cover"] .screenImageContent{object-fit:cover}
      #screenImagesOverlay[data-fit="cover"] .screenImageBackdrop{display:none}
    `;
    document.head.appendChild(style);
    overlay = document.createElement('section');
    overlay.id = 'screenImagesOverlay';
    overlay.setAttribute('aria-label', 'Imágenes de pantalla');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    return overlay;
  }

  function loadImage(sources) {
    return new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      let index = 0;
      const timeout = setTimeout(() => finish(null), 6000);
      let finished = false;
      const finish = result => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(result);
      };
      const next = () => {
        if (index >= sources.length) finish(null);
        else image.src = sources[index++];
      };
      image.onload = () => finish(image);
      image.onerror = next;
      next();
    });
  }

  async function preparePage(slide, sources) {
    const loaded = (await Promise.all(sources.map(loadImage))).filter(Boolean);
    if (!loaded.length) return null;
    const fragment = document.createDocumentFragment();
    loaded.forEach((image, index) => {
      const figure = document.createElement('figure');
      if (slide.fit === 'contain') {
        const backdrop = image.cloneNode();
        backdrop.className = 'screenImageBackdrop';
        backdrop.alt = '';
        backdrop.setAttribute('aria-hidden', 'true');
        figure.appendChild(backdrop);
      }
      image.className = 'screenImageContent';
      image.alt = slide.title + ' — ' + (index + 1);
      figure.appendChild(image);
      fragment.appendChild(figure);
    });
    return { fragment, count: loaded.length };
  }

  function hide() {
    if (!overlay) return;
    overlay.classList.remove('isActive');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.replaceChildren();
  }

  function cancel() {
    activeSlide = null;
    if (finishWait) finishWait();
    hide();
  }

  function waitForSlide(seconds) {
    return new Promise(resolve => {
      const timeout = setTimeout(finish, seconds * 1000);
      function finish() {
        clearTimeout(timeout);
        finishWait = null;
        resolve();
      }
      finishWait = finish;
    });
  }

  async function playOnce(options = {}) {
    if (sequenceRunning || (!options.allowNarrow && window.matchMedia('(max-width:960px)').matches)) return false;
    sequenceRunning = true;
    let shown = false;
    try {
      await refresh();
      const playlist = currentSlides();
      for (const slide of playlist) {
        if (!currentSlides().some(current => signature(current) === signature(slide))) continue;
        activeSlide = slide;
        for (let index = 0; index < slide.images.length; index += slide.count) {
          const page = await preparePage(slide, slide.images.slice(index, index + slide.count));
          if (activeSlide !== slide) break;
          if (!options.allowNarrow && window.matchMedia('(max-width:960px)').matches) break;
          if (!page) continue;
          const host = ensureOverlay();
          host.dataset.count = String(page.count);
          host.dataset.fit = slide.fit;
          host.setAttribute('aria-label', slide.title);
          host.replaceChildren(page.fragment);
          host.classList.add('isActive');
          host.setAttribute('aria-hidden', 'false');
          if (!shown) options.onStart?.();
          shown = true;
          await waitForSlide(slide.seconds);
          if (activeSlide !== slide) break;
        }
      }
    } finally {
      activeSlide = null;
      hide();
      sequenceRunning = false;
      if (shown) options.onEnd?.();
    }
    return shown;
  }

  async function start() {
    const empty = document.getElementById('screenImagesEmpty');
    for (;;) {
      const shown = await playOnce({ allowNarrow: true });
      if (empty) {
        empty.hidden = shown;
        empty.textContent = currentSlides().length ? 'No se pudieron cargar las imágenes seleccionadas' : 'Sin imágenes seleccionadas';
      }
      await new Promise(resolve => setTimeout(resolve, shown ? 30 : 5000));
    }
  }

  window.ScreenImages = {
    playOnce, start,
    nextTitle: () => currentSlides()[0]?.title || '',
    hasSlides: () => currentSlides().length > 0
  };
  setTimeout(refresh, 1200);
  setInterval(refresh, refreshMilliseconds);
  window.addEventListener('resize', () => {
    if (!document.body.hasAttribute('data-images-only') && window.matchMedia('(max-width:960px)').matches) cancel();
  });
})();


/* Daily responsibilities MVIX slide — independent of the image-slide switch. */
(function () {
  'use strict';
  if (document.body.hasAttribute('data-images-only')) return;
  const book = '1wCCkZeA1R_dYFx-k-MYXMY-PUvaW4A9U5oeXQHfm7Ag';
  const endpoint = 'https://docs.google.com/spreadsheets/d/' + book + '/gviz/tq';
  let showing = false;
  let overlay;
  function query(gid, range) {
    return new Promise((resolve, reject) => {
      const callback = '__daily_resp_' + Math.floor(Math.random() * 1e9);
      const script = document.createElement('script');
      let done = false;
      const finish = (err, data) => {
        if (done) return;
        done = true; clearTimeout(timer); script.remove(); delete window[callback];
        err ? reject(err) : resolve(data);
      };
      const timer = setTimeout(() => finish(new Error('Timeout')), 9000);
      window[callback] = response => {
        if (response?.status !== 'ok' || !response.table) return finish(new Error('Sheet unavailable'));
        finish(null, (response.table.rows || []).map(row =>
          Array.from({length: 6}, (_, i) => String(row.c?.[i]?.f ?? row.c?.[i]?.v ?? '').trim())));
      };
      script.onerror = () => finish(new Error('Network'));
      script.src = endpoint + '?' + new URLSearchParams({
        gid: String(gid), range, headers: '0', tq: 'select *',
        tqx: 'out:json;responseHandler:' + callback, cb: String(Date.now())
      });
      document.head.appendChild(script);
    });
  }
  const yes = v => String(v || '').trim().toUpperCase() === 'YES';
  const today = () => new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',
    month:'2-digit', day:'2-digit', year:'numeric'}).format(new Date());
  function ensureOverlay() {
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = [
      '#dailyResponsibilitiesOverlay{position:fixed;inset:0;z-index:11000;background:#101b2a;color:#fff;display:none;box-sizing:border-box;padding:3vh 4vw;font-family:Arial,Helvetica,sans-serif;overflow:auto}',
      '#dailyResponsibilitiesOverlay.active{display:block}',
      '#dailyResponsibilitiesOverlay .drBrand{font-size:clamp(14px,1.8vw,26px);letter-spacing:.19em;color:#c8d5e8;font-weight:700}',
      '#dailyResponsibilitiesOverlay h1{margin:1.2vh 0 2vh;font-size:clamp(30px,4.2vw,72px);letter-spacing:.02em}',
      '#dailyResponsibilitiesOverlay .drDetails{display:flex;justify-content:space-between;gap:2vw;font-size:clamp(15px,1.5vw,25px);margin-bottom:2vh;color:#d3deea}',
      '#dailyResponsibilitiesOverlay table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:clamp(13px,1.5vw,26px)}',
      '#dailyResponsibilitiesOverlay th{color:#c9d6e7;text-align:left;background:#22344a;font-size:.8em;letter-spacing:.05em}',
      '#dailyResponsibilitiesOverlay td,#dailyResponsibilitiesOverlay th{padding:1.3vh 1vw;border-bottom:1px solid #425168;vertical-align:top;overflow-wrap:anywhere}',
      '#dailyResponsibilitiesOverlay th:nth-child(1){width:12%}',
      '#dailyResponsibilitiesOverlay th:nth-child(2){width:32%}',
      '#dailyResponsibilitiesOverlay th:nth-child(3){width:18%}',
      '#dailyResponsibilitiesOverlay th:nth-child(4){width:16%}',
      '#dailyResponsibilitiesOverlay th:nth-child(5){width:22%}',
      '#dailyResponsibilitiesOverlay .drStatus{font-weight:bold;color:#8cd9a3}',
      '@media(max-width:800px){#dailyResponsibilitiesOverlay{padding:3vh 3vw}#dailyResponsibilitiesOverlay table{font-size:12px}}'
    ].join('\n');
    document.head.appendChild(style);
    overlay = document.createElement('section');
    overlay.id = 'dailyResponsibilitiesOverlay';
    overlay.setAttribute('aria-label', 'Daily Responsibilities');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    return overlay;
  }
  function el(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = String(value);
    if (className) node.className = className;
    return node;
  }
  async function cycle() {
    if (showing || window.matchMedia('(max-width:960px)').matches) return;
    try {
      const [controls, data] = await Promise.all([
        query(1987654460, 'A1:C8'), query(1987654470, 'A1:F60')
      ]);
      const config = new Map(controls.map(row => [String(row[0] || '').toUpperCase(), row[1]]));
      if (!yes(config.get('SHOW DAILY RESPONSIBILITIES'))) return;
      if (!data.some(row => String(row[0]).toUpperCase() === 'DATE')) return;
      const dateRow = data.find(row => String(row[0]).toUpperCase() === 'DATE');
      const show = dateRow?.[5], date = dateRow?.[1];
      if (!yes(show)) return;
      const normalizeDate = value => {
        const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        return m ? m[1].padStart(2,'0') + '/' + m[2].padStart(2,'0') + '/' + m[3] : value;
      };
      if (normalizeDate(date) !== today()) return;
      const tasks = data.slice(4).filter(row => row[1] || row[2] || row[4]);
      if (!tasks.length) return;
      const duration = Math.max(5, Math.min(60, Number(data[2]?.[1]) || 15));
      const host = ensureOverlay();
      const frag = document.createDocumentFragment();
      frag.append(el('div', 'CURATED EVENTS  /  TENT & PRODUCTION', 'drBrand'));
      frag.append(el('h1', 'DAILY RESPONSIBILITIES'));
      const detail = el('div', null, 'drDetails');
      detail.append(el('span', 'DATE: ' + date));
      detail.append(el('span', 'LOCATION: ' + (dateRow?.[3] || 'CENTENNIAL')));
      frag.append(detail);
      const table = el('table'), head = el('thead'), headRow = el('tr');
      ['TIME','RESPONSIBILITY','ASSIGNED CREW','LOCATION','STATUS / NOTES'].forEach(v => headRow.append(el('th',v)));
      head.append(headRow); table.append(head);
      const body = el('tbody');
      for (const task of tasks.slice(0, 14)) {
        const tr = el('tr');
        [task[0],task[1],task[2],task[3],(task[4] || '') + (task[5] ? ' — ' + task[5] : '')]
          .forEach((v,i) => tr.append(el('td',v,i===4?'drStatus':'')));
        body.append(tr);
      }
      table.append(body); frag.append(table);
      showing = true;
      host.replaceChildren(frag);
      host.classList.add('active'); host.setAttribute('aria-hidden','false');
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
      host.classList.remove('active'); host.setAttribute('aria-hidden','true');
      showing = false;
    } catch (error) {
      if (overlay) {overlay.classList.remove('active');overlay.setAttribute('aria-hidden','true');}
      showing = false;
      console.warn('Daily responsibilities slide:', error);
    }
  }
  setTimeout(cycle, 12000);
  setInterval(cycle, 90000);
})();
