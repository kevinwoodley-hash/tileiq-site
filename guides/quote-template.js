// Free tiling quote template on /guides/tiling-quote-template/.
// Everything stays in the page: nothing is stored (no cookies, localStorage or uploads) and nothing
// is sent anywhere. "Print or save as PDF" builds a clean quote document from the boxes and opens the
// browser's print dialog, where "Save as PDF" is one of the printers. The logo is read in the browser
// only. Analytics: anonymous quote_template_used / _example / _printed events, no values, and only
// after the visitor has accepted analytics (the site's gtag / PostHog).
(function () {
  var root = document.querySelector('[data-quote-template]');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var UNITS = ['', 'm²', 'm', 'item', 'day', 'kit'];
  var DEFAULT_LINES = [
    ['Wall tiling labour', 'm²'], ['Floor tiling labour', 'm²'],
    ['Tanking', ''], ['Adhesive, grout, primer, trims and silicone', '']];
  var EXAMPLE = {
    biz: 'Your Tiling Ltd', phone: '01234 567890', email: 'hello@yourtiling.co.uk', bizaddr: '1 High Street, Anytown',
    cust: 'Mrs A Customer', jobaddr: '12 Example Road, Anytown', work: 'Main bathroom. Tile walls full height (about 20 m²) and floor (5 m²) in customer-supplied 300×600 mm porcelain, straight lay. Tank the bath and shower area. Fit chrome trims to external corners and seal around the bath with silicone.',
    days: '4', lines: [['Wall tiling labour', '20', 'm²', '45'], ['Floor tiling labour', '5', 'm²', '50'],
      ['Tanking, bath and shower area', '', '', '250'], ['Adhesive, grout, primer, trims and silicone', '', '', '180']]
  };
  var logo = null, used = false;

  function track(name) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, { guide: 'tiling-quote-template' }); } catch (e) {}
    try { if (window.posthog && window.posthog.__loaded) window.posthog.capture(name, { guide: 'tiling-quote-template' }); } catch (e) {}
  }
  var num = function (v) { v = parseFloat(v); return isFinite(v) && v > 0 ? v : 0; };
  var gbp = function (n) { return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function longDate(iso) {
    if (!iso) return '';
    var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function addDays(iso, days) {
    if (!iso || !days) return '';
    var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + days);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ── Quote lines ──
  var items = $('qt-items'), n = 0;
  function addLine(desc, qty, unit, rate) {
    n++;
    var row = document.createElement('div');
    row.className = 'qt-row qt-line'; row.setAttribute('role', 'row');
    row.innerHTML =
      '<input class="qt-desc" placeholder="Item" aria-label="Item ' + n + '">' +
      '<input class="qt-qty" type="number" placeholder="Qty" min="0" step="0.01" inputmode="decimal" aria-label="Quantity, item ' + n + '">' +
      '<select class="qt-unit" aria-label="Unit, item ' + n + '">' + UNITS.map(function (u) { return '<option value="' + u + '">' + (u || '–') + '</option>'; }).join('') + '</select>' +
      '<input class="qt-rate" type="number" placeholder="Rate £" min="0" step="0.01" inputmode="decimal" aria-label="Rate in pounds, item ' + n + '">' +
      '<output class="qt-amt" aria-label="Amount, item ' + n + '">–</output>' +
      '<button type="button" class="qt-del" aria-label="Remove item ' + n + '">×</button>';
    row.querySelector('.qt-desc').value = desc || '';
    row.querySelector('.qt-qty').value = qty || '';
    row.querySelector('.qt-unit').value = unit || '';
    row.querySelector('.qt-rate').value = rate || '';
    items.appendChild(row);
  }
  function lines() {
    return Array.prototype.map.call(items.querySelectorAll('.qt-line'), function (r) {
      var q = r.querySelector('.qt-qty').value, rate = num(r.querySelector('.qt-rate').value);
      var amount = q !== '' ? num(q) * rate : rate;
      return { row: r, desc: r.querySelector('.qt-desc').value.trim(), qty: q !== '' ? num(q) : null,
               unit: r.querySelector('.qt-unit').value, rate: rate, amount: Math.round(amount * 100) / 100 };
    });
  }
  function resetLines(list) {
    items.querySelectorAll('.qt-line').forEach(function (r) { r.remove(); });
    n = 0;
    list.forEach(function (l) { addLine.apply(null, l); });
  }

  // ── Totals ──
  function totals() {
    var ls = lines(), sub = 0;
    ls.forEach(function (l) {
      sub += l.amount;
      l.row.querySelector('.qt-amt').textContent = l.rate ? gbp(l.amount) : '–';
    });
    sub = Math.round(sub * 100) / 100;
    var vatRate = num($('qt-vat').value), vat = Math.round(sub * vatRate) / 100, total = Math.round((sub + vat) * 100) / 100;
    var depPct = Math.min(100, num($('qt-dep').value)), dep = Math.round(total * depPct) / 100;
    $('qt-sub').textContent = gbp(sub);
    $('qt-vat-row').hidden = !vatRate; $('qt-vatamt').textContent = gbp(vat);
    $('qt-total').textContent = gbp(total);
    $('qt-dep-row').hidden = !depPct; $('qt-depamt').textContent = gbp(dep) + ' (' + depPct + '%)';
    return { lines: ls, sub: sub, vatRate: vatRate, vat: vat, total: total, depPct: depPct, dep: dep };
  }

  // ── The printable quote, built with textContent only ──
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function para(label, text) {
    if (!text) return null;
    var p = el('p'); p.appendChild(el('strong', null, label + ' ')); p.appendChild(document.createTextNode(text)); return p;
  }
  function buildDoc() {
    var t = totals(), v = function (id) { return $(id).value.trim(); };
    var doc = $('qt-doc'); doc.textContent = '';
    var head = el('div', 'qtd-head'), who = el('div', 'qtd-who');
    if (logo) { var img = el('img', 'qtd-logo'); img.src = logo; img.alt = ''; who.appendChild(img); }
    who.appendChild(el('div', 'qtd-biz', v('qt-biz') || 'Your business name'));
    [v('qt-bizaddr'), [v('qt-phone'), v('qt-email')].filter(Boolean).join(' · '), v('qt-vatno') ? 'VAT no. ' + v('qt-vatno') : '']
      .filter(Boolean).forEach(function (line) { who.appendChild(el('div', 'qtd-small', line)); });
    var meta = el('div', 'qtd-meta');
    meta.appendChild(el('div', 'qtd-title', 'Quotation'));
    if (v('qt-num')) meta.appendChild(el('div', 'qtd-small', v('qt-num')));
    if (v('qt-date')) meta.appendChild(el('div', 'qtd-small', 'Issued ' + longDate(v('qt-date'))));
    var until = addDays(v('qt-date'), Math.round(num(v('qt-valid'))));
    if (until) meta.appendChild(el('div', 'qtd-small', 'Valid until ' + until));
    head.appendChild(who); head.appendChild(meta); doc.appendChild(head);

    var forP = para('For:', [v('qt-cust'), v('qt-jobaddr')].filter(Boolean).join(', '));
    if (forP) doc.appendChild(forP);
    if (v('qt-work')) { doc.appendChild(el('h3', null, 'The work')); doc.appendChild(el('p', 'qtd-pre', v('qt-work'))); }

    var table = el('table', 'qtd-table'), thead = el('thead'), hr = el('tr');
    ['Item', 'Qty', 'Rate', 'Amount'].forEach(function (h, i) { hr.appendChild(el('th', i ? 'num' : null, h)); });
    thead.appendChild(hr); table.appendChild(thead);
    var tb = el('tbody');   // lines without a price (e.g. an unused default line) are left off
    t.lines.filter(function (l) { return l.rate > 0; }).forEach(function (l) {
      var tr = el('tr');
      tr.appendChild(el('td', null, l.desc));
      tr.appendChild(el('td', 'num', l.qty != null ? l.qty.toLocaleString('en-GB') + (l.unit ? ' ' + l.unit : '') : ''));
      tr.appendChild(el('td', 'num', l.qty != null && l.rate ? gbp(l.rate) + (l.unit ? '/' + l.unit : '') : ''));
      tr.appendChild(el('td', 'num', l.rate ? gbp(l.amount) : ''));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    var tf = el('tfoot');
    var foot = [['Subtotal', gbp(t.sub)]];
    if (t.vatRate) foot.push(['VAT ' + t.vatRate + '%', gbp(t.vat)]);
    foot.push([t.vatRate ? 'Total including VAT' : 'Total', gbp(t.total)]);
    if (!t.vatRate) foot.push(['', 'No VAT charged']);
    foot.forEach(function (f, i) {
      var tr = el('tr', f[0].indexOf('Total') === 0 ? 'qtd-total' : null);
      var c = el('td', null, f[0]); c.colSpan = 3; tr.appendChild(c); tr.appendChild(el('td', 'num', f[1])); tf.appendChild(tr);
    });
    table.appendChild(tf); doc.appendChild(table);

    [para('Tiles:', $('qt-tiles').value === 'me' ? 'Supplied by us and included above.' : 'Supplied by the customer.'),
     para('Timing:', [v('qt-start') ? 'Start ' + longDate(v('qt-start')) : '', num(v('qt-days')) ? 'about ' + num(v('qt-days')) + (num(v('qt-days')) === 1 ? ' day' : ' days') + ' on site' : ''].filter(Boolean).join(', ')),
     para('Not included:', v('qt-excl')),
     para('Payment:', [t.depPct ? 'Deposit of ' + gbp(t.dep) + ' (' + t.depPct + '%) to book the start date.' : '', v('qt-pay')].filter(Boolean).join(' ')),
     para('Guarantee:', v('qt-guar'))
    ].forEach(function (p) { if (p) doc.appendChild(p); });
  }

  // ── Events ──
  function changed() {
    totals();
    if (!used) { used = true; track('quote_template_used'); }
  }
  root.addEventListener('input', function (e) { if (e.target.id !== 'qt-logo') changed(); });
  root.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') changed(); });
  items.addEventListener('click', function (e) {
    var b = e.target.closest('.qt-del');
    if (!b) return;
    if (items.querySelectorAll('.qt-line').length > 1) b.closest('.qt-line').remove();
    else b.closest('.qt-line').querySelectorAll('input').forEach(function (i) { i.value = ''; });
    changed();
  });
  $('qt-add').addEventListener('click', function () { addLine(); items.querySelector('.qt-line:last-child .qt-desc').focus(); });
  $('qt-logo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) { logo = null; return; }
    if (f.size > 2 * 1024 * 1024) { alert('Please choose a logo under 2 MB.'); this.value = ''; logo = null; return; }
    var r = new FileReader(); r.onload = function () { logo = r.result; }; r.readAsDataURL(f);
  });
  $('qt-example').addEventListener('click', function () {
    ['biz', 'phone', 'email', 'bizaddr', 'cust', 'jobaddr', 'work', 'days'].forEach(function (k) { $('qt-' + k).value = EXAMPLE[k]; });
    resetLines(EXAMPLE.lines);
    root.classList.add('qt-is-example');
    totals(); track('quote_template_example');
  });
  $('qt-clear').addEventListener('click', function () {
    root.querySelectorAll('input:not([type=file]), textarea').forEach(function (i) { i.value = i.defaultValue; });
    root.querySelectorAll('select').forEach(function (s) { s.selectedIndex = 0; });
    $('qt-logo').value = ''; logo = null;
    $('qt-date').value = today();
    resetLines(DEFAULT_LINES);
    root.classList.remove('qt-is-example');
    totals();
  });
  $('qt-print').addEventListener('click', function () {
    buildDoc();
    document.documentElement.classList.add('qt-printing');
    track('quote_template_printed');
    window.print();
  });
  window.addEventListener('afterprint', function () { document.documentElement.classList.remove('qt-printing'); });

  // ── Start ──
  $('qt-date').value = today();
  resetLines(DEFAULT_LINES);
  totals();
  window.tileiqQuoteTemplate = { buildDoc: buildDoc };   // used by the tests to check the printed quote
})();
