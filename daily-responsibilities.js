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
  async function playOnce() {
    if (showing) return false;
    try {
      const [controls, data] = await Promise.all([
        query(1987654460, 'A1:C8'), query(1987654470, 'A1:F60')
      ]);
      const config = new Map(controls.map(row => [String(row[0] || '').toUpperCase(), row[1]]));
      if (!yes(config.get('SHOW DAILY RESPONSIBILITIES'))) return false;
      if (!data.some(row => String(row[0]).toUpperCase() === 'DATE')) return false;
      const dateRow = data.find(row => String(row[0]).toUpperCase() === 'DATE');
      const show = dateRow?.[5], date = dateRow?.[1];
      if (!yes(show)) return false;
      const normalizeDate = value => {
        const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        return m ? m[1].padStart(2,'0') + '/' + m[2].padStart(2,'0') + '/' + m[3] : value;
      };
      // The master switch and SHOW DAY govern visibility, as with the schedule.\n      // Date is displayed as a label, not used to silently suppress the slide.
      const taskHeader = data.findIndex(row => String(row[0]).trim().toUpperCase() === 'TIME' && String(row[1]).trim().toUpperCase() === 'RESPONSIBILITY');\n      const tasks = data.slice(taskHeader >= 0 ? taskHeader + 1 : 4).filter(row => row[1] || row[2] || row[4]);
      if (!tasks.length) return false;
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
      return true;
    } catch (error) {
      if (overlay) {overlay.classList.remove('active');overlay.setAttribute('aria-hidden','true');}
      showing = false;
      console.warn('Daily responsibilities slide:', error);
      return false;
    }
  }
  setTimeout(cycle, 12000);
  setInterval(cycle, 90000);
})();
