/* TC12 Survey editor: Basics / Background questions / Attributes / Profiles, live preview, publish.
   The server compiles the spec (POST /compile) so the preview is exactly the published survey.
   Profiles are chosen by the author, one dropdown per attribute; nothing is generated automatically. */
(function () {
  'use strict';
  if (!TC12.requireLogin()) return;
  document.body.classList.add('wide');
  var E = TC12.el;
  var MAX = { title: 200, purpose: 1000, product: 60, profile_name: 30, team: 100, background: 300,
    attr_name: 60, level_name: 60, level_note: 300, backgrounds: 3, attrs: 8, levels: 5, profiles: 30 };
  var sid = TC12.sidParam();
  var DRAFT = 'tc12_draft_' + (sid || 'new');
  var state, locked = false, lastCompiled = null, lastErrors = ['Loading...'], frameReady = false, timer = null, seq = 0;
  var defaults = {}, textMeta = [];  // fixed survey wording: defaults and labels come from the server with each compile
  var $ = function (id) { return document.getElementById(id); };
  document.getElementById('who').textContent = TC12.email();

  function blank() {
    return { title: '', purpose: '', product: '', profile_name: '', team: '', background: [],
      attributes: [{ name: '', levels: [{ name: '', note: '' }, { name: '', note: '' }] },
        { name: '', levels: [{ name: '', note: '' }, { name: '', note: '' }] }],
      profiles: [], texts: {} };
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function isBlank(s) {
    return !s.title && !s.purpose && !s.product && !s.profile_name && !s.team && !s.background.length && !s.profiles.length &&
      !Object.keys(s.texts || {}).length &&
      s.attributes.every(function (a) { return !a.name && a.levels.every(function (l) { return !l.name && !l.note; }); });
  }
  function msg(kind, text, list) {
    var m = $('msg'); m.className = 'msg ' + kind; m.textContent = text;
    if (list && list.length) { var ul = E('ul'); list.forEach(function (x) { ul.appendChild(E('li', {}, x)); }); m.appendChild(ul); }
  }

  // ---------- change handling ----------
  function changed(structural) {
    if (structural) render();
    else renderProfiles();
    if (!locked) localStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), spec: state }));
    clearTimeout(timer);
    timer = setTimeout(compile, 700);
    setStatus('Updating preview...', '');
  }

  function compile() {
    var my = ++seq;
    TC12.api('POST', '/compile', { spec: state }).then(function (r) {
      if (my !== seq) return;
      lastErrors = r.errors;
      if (r.compiled) { lastCompiled = r.compiled; push(); }
      defaults = r.defaults || {}; textMeta = r.texts || [];
      refreshTexts();
      showChecks(r.errors, r.warnings);
    }).catch(function (err) { if (my === seq) { lastErrors = [err.message]; showChecks([err.message], []); } });
  }
  function push() {
    if (frameReady && lastCompiled) $('preview').contentWindow.postMessage({ type: 'tc12-preview', definition: lastCompiled }, location.origin);
  }
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'tc12-preview-ready') { frameReady = true; push(); }
  });

  function setStatus(text, kind) { var s = $('status'); s.textContent = text; s.className = 'status ' + (kind || ''); }
  function showChecks(errors, warnings) {
    var box = $('checks'); box.innerHTML = '';
    if (errors.length) {
      setStatus(errors.length + (errors.length === 1 ? ' problem' : ' problems') + ' to fix before publishing', 'bad');
      var ul = E('ul', { 'class': 'errs' }); errors.forEach(function (x) { ul.appendChild(E('li', {}, x)); }); box.appendChild(ul);
    } else {
      setStatus(locked ? 'Preview up to date (read only)' : 'Ready to publish', 'good');
    }
    if (warnings.length) {
      var wl = E('ul', { 'class': 'warns' }); warnings.forEach(function (x) { wl.appendChild(E('li', {}, x)); }); box.appendChild(wl);
    }
    $('publish').disabled = locked || errors.length > 0;
    if (!errors.length && !lastCompiled) $('publish').disabled = true;
    if (errors.length && lastCompiled === null) $('preview-note').textContent = 'The preview appears once the required fields are filled in.';
    else $('preview-note').textContent = errors.length ? 'Preview shows the last valid version.' : '';
  }

  // ---------- view / edit: each item shows as text with a pencil; one item is edited at a time ----------
  var editing = null, focusEl = null;  // editing = {key, read, apply}
  function commitEdit() {
    var e = editing;
    editing = null;
    if (!e || !e.read) return false;
    e.apply(e.read());
    return true;
  }
  // structural buttons first save the item being edited, so indexes never shift under an open editor
  function act(fn) { return function () { commitEdit(); fn.apply(this, arguments); }; }
  function startEdit(key) { commitEdit(); editing = { key: key }; changed(true); }
  function btn(text, cls, onClick, title) {
    var b = E('button', { type: 'button', 'class': 'btn small ghost ' + (cls || ''), title: title || text }, text);
    b.addEventListener('click', onClick);
    return b;
  }
  function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return false; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; return true; }

  /* opts: label, hint, cls, fields [{value, max, placeholder, multiline, cls, aria}], view(el), apply(values), extra [buttons] */
  function editRow(key, opts) {
    var w = E('div', { 'class': 'item ' + (opts.cls || '') });
    if (opts.label) w.appendChild(E('div', { 'class': 'item-label' }, opts.label));
    var line = E('div', { 'class': 'item-line' }), body = E('div', { 'class': 'item-body' });
    if (editing && editing.key === key && !locked) {
      w.classList.add('editing');
      var inputs = opts.fields.map(function (f) {
        var i = f.multiline ? E('textarea', { 'class': 'f', rows: '3' }) : E('input', { 'class': 'f ' + (f.cls || '') });
        i.setAttribute('maxlength', String(f.max));
        i.setAttribute('placeholder', f.placeholder || '');
        if (f.aria) i.setAttribute('aria-label', f.aria);
        i.value = f.value || '';
        i.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') { ev.preventDefault(); editing = null; render(); }
          else if (ev.key === 'Enter' && (!f.multiline || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); commitEdit(); changed(true); }
        });
        body.appendChild(i);
        return i;
      });
      editing.read = function () { return inputs.map(function (i) { return i.value; }); };
      editing.apply = opts.apply;
      focusEl = inputs[0];
      line.appendChild(body);
      line.appendChild(btn('Done', 'primary', function () { commitEdit(); changed(true); }, 'Save (Enter)'));
      line.appendChild(btn('Cancel', '', function () { editing = null; render(); }, 'Discard changes (Esc)'));
    } else {
      opts.view(body);
      line.appendChild(body);
      if (!locked) line.appendChild(btn('✎', 'pencil', function () { startEdit(key); }, 'Edit'));
    }
    (opts.extra || []).forEach(function (b) { line.appendChild(b); });
    w.appendChild(line);
    if (opts.hint) w.appendChild(E('div', { 'class': 'hint' }, opts.hint));
    return w;
  }
  function viewText(el, value, empty, multiline) {
    if (value) el.appendChild(E('div', { 'class': 'val' + (multiline ? ' multi' : '') }, value));
    else el.appendChild(E('div', { 'class': 'val empty' }, empty));
  }

  function basicsField(key, label, hint, max, example, required, multiline) {
    return editRow(key, {
      label: label, hint: hint,
      fields: [{ value: state[key], max: max, placeholder: example, multiline: multiline, aria: label }],
      view: function (el) { viewText(el, state[key], (required ? 'Required. ' : 'Not set. ') + 'e.g. ' + example, multiline); },
      apply: function (v) { state[key] = v[0]; }
    });
  }

  function renderBasics() {
    var box = $('basics'); box.innerHTML = '';
    box.appendChild(basicsField('title', 'Title', 'Shown as the heading of the survey.', MAX.title,
      'NCC 5030 Marketing Management: Premium SUV Survey', true));
    box.appendChild(basicsField('purpose', 'Purpose: why are you collecting this?', 'One or two sentences, shown at the top of the survey.',
      MAX.purpose, 'It is part of our Go-To-Market conjoint project for NCC 5030.', true, true));
    var row = E('div', { 'class': 'two' });
    row.appendChild(basicsField('product', 'Product', 'Used in "Imagine you are buying your next ___".', MAX.product, 'premium SUV', true));
    row.appendChild(basicsField('profile_name', 'Profile name', 'Profiles are numbered "SUV 1", "SUV 2"...', MAX.profile_name, 'SUV', true));
    box.appendChild(row);
    box.appendChild(basicsField('team', 'Team (optional)', 'Shown on the thank-you page as "From ___".', MAX.team, 'Core Team 4', false));
  }

  function renderBackground() {
    var box = $('background'); box.innerHTML = '';
    box.appendChild(textRow('name_q', [E('span', { 'class': 'tag' }, 'always included')]));
    box.appendChild(textRow('netid_q', [E('span', { 'class': 'tag' }, 'always included')]));
    state.background.forEach(function (q, i) {
      box.appendChild(editRow('bg:' + i, {
        cls: 'bg-q',
        fields: [{ value: q, max: MAX.background, placeholder: 'What industry do you work in?', aria: 'Background question ' + (i + 1) }],
        view: function (el) { viewText(el, q, 'Empty question. Click the pencil to write it, or delete it.'); },
        apply: function (v) { state.background[i] = v[0]; },
        extra: [btn('↑', '', act(function () { if (move(state.background, i, -1)) changed(true); }), 'Move up'),
          btn('↓', '', act(function () { if (move(state.background, i, 1)) changed(true); }), 'Move down'),
          btn('Delete', 'danger', act(function () { state.background.splice(i, 1); changed(true); }))]
      }));
    });
    if (state.background.length < MAX.backgrounds) {
      box.appendChild(btn('+ Add a question', '', act(function () {
        state.background.push(''); editing = { key: 'bg:' + (state.background.length - 1) }; changed(true);
      })));
    }
  }

  // profiles store level numbers (1-based); keep them consistent when levels/attributes move or disappear
  function remapLevels(ai, map) { state.profiles.forEach(function (p) { if (p[ai] != null) p[ai] = map(p[ai]); }); }

  function renderAttributes() {
    var box = $('attributes'); box.innerHTML = '';
    state.attributes.forEach(function (a, ai) {
      var card = E('div', { 'class': 'attr' });
      var head = editRow('attr:' + ai, {
        cls: 'attr-head',
        fields: [{ value: a.name, max: MAX.attr_name, placeholder: 'Attribute name, e.g. Price', aria: 'Attribute ' + (ai + 1) + ' name' }],
        view: function (el) { viewText(el, a.name, 'Attribute name not set'); },
        apply: function (v) { a.name = v[0]; },
        extra: [btn('↑', '', act(function () {
          if (move(state.attributes, ai, -1)) { state.profiles.forEach(function (p) { move(p, ai, -1); }); changed(true); }
        }), 'Move attribute up'), btn('↓', '', act(function () {
          if (move(state.attributes, ai, 1)) { state.profiles.forEach(function (p) { move(p, ai, 1); }); changed(true); }
        }), 'Move attribute down'), btn('Delete', 'danger', act(function () {
          if (!confirm('Delete attribute "' + (a.name || ai + 1) + '"? Its column is removed from every profile.')) return;
          state.attributes.splice(ai, 1); state.profiles.forEach(function (p) { p.splice(ai, 1); }); changed(true);
        }))]
      });
      head.querySelector('.item-line').insertBefore(E('span', { 'class': 'num' }, String(ai + 1)), head.querySelector('.item-body'));
      card.appendChild(head);
      a.levels.forEach(function (l, li) {
        var r = editRow('lv:' + ai + ':' + li, {
          cls: 'level',
          fields: [{ value: l.name, max: MAX.level_name, placeholder: 'Level, e.g. $60,000', cls: 'lname', aria: 'Level ' + (li + 1) },
            { value: l.note, max: MAX.level_note, placeholder: 'Explanation (optional)', cls: 'lnote', aria: 'Level ' + (li + 1) + ' explanation' }],
          view: function (el) {
            el.appendChild(E('span', { 'class': 'lv-name' + (l.name ? '' : ' empty') }, l.name || 'Level name not set'));
            if (l.note) el.appendChild(E('span', { 'class': 'lv-note' }, l.note));
          },
          apply: function (v) { l.name = v[0]; l.note = v[1]; },
          extra: [btn('↑', '', act(function () {
            if (move(a.levels, li, -1)) { remapLevels(ai, function (v) { return v === li + 1 ? li : v === li ? li + 1 : v; }); changed(true); }
          }), 'Move level up'), btn('↓', '', act(function () {
            if (move(a.levels, li, 1)) { remapLevels(ai, function (v) { return v === li + 1 ? li + 2 : v === li + 2 ? li + 1 : v; }); changed(true); }
          }), 'Move level down'), btn('×', 'danger', act(function () {
            a.levels.splice(li, 1);
            remapLevels(ai, function (v) { return v === li + 1 ? null : v > li + 1 ? v - 1 : v; });
            changed(true);
          }), 'Delete level')]
        });
        r.querySelector('.item-line').insertBefore(E('span', { 'class': 'letter' }, 'abcde'.charAt(li) + ')'), r.querySelector('.item-body'));
        card.appendChild(r);
      });
      if (a.levels.length < MAX.levels) {
        card.appendChild(btn('+ Add a level', '', act(function () {
          a.levels.push({ name: '', note: '' }); editing = { key: 'lv:' + ai + ':' + (a.levels.length - 1) }; changed(true);
        })));
      }
      var last = a.levels.length ? a.levels[a.levels.length - 1].name : '';
      card.appendChild(E('div', { 'class': 'hint' }, 'The last level' + (last ? ' (' + last + ')' : '') + ' is the baseline in the dummy-coded CSV.'));
      box.appendChild(card);
    });
    if (state.attributes.length < MAX.attrs) {
      box.appendChild(btn('+ Add an attribute', '', act(function () {
        state.attributes.push({ name: '', levels: [{ name: '', note: '' }, { name: '', note: '' }] });
        state.profiles.forEach(function (p) { p.push(null); });
        editing = { key: 'attr:' + (state.attributes.length - 1) };
        changed(true);
      })));
    }
  }

  // ---------- fixed survey wording (defaults follow the spec; a custom text replaces the default) ----------
  function textRow(key, extraNodes) {
    var meta = textMeta.filter(function (m) { return m.key === key; })[0] || { label: key, max: 1000, multiline: true };
    var custom = Object.prototype.hasOwnProperty.call(state.texts, key);
    var value = custom ? state.texts[key] : (defaults[key] || '');
    var extra = (extraNodes || []).slice();
    if (custom) extra.unshift(btn('Reset', '', act(function () { delete state.texts[key]; changed(true); }), 'Go back to the default text'));
    var row = editRow('tx:' + key, {
      cls: 'text-item' + (custom ? ' custom' : ''),
      label: extraNodes ? null : meta.label,
      fields: [{ value: value, max: meta.max, multiline: meta.multiline, aria: meta.label }],
      view: function (el) {
        viewText(el, value, 'Loading...', true);
        if (extraNodes) el.appendChild(badge());  // rows without a label (name, NetID) keep the badge next to the text
      },
      apply: function (v) {
        var t = v[0].trim();
        if (!t || t.replace(/\s+/g, ' ') === (defaults[key] || '').replace(/\s+/g, ' ')) delete state.texts[key];
        else state.texts[key] = t;
      },
      hint: editing && editing.key === 'tx:' + key ? 'Leave it empty to use the default. A custom text stays as you wrote it, even if you later change attributes or profiles.' : '',
      extra: extra
    });
    function badge() { return E('span', { 'class': 'badge ' + (custom ? 'custom' : 'default') }, custom ? 'custom' : 'default'); }
    var lab = row.querySelector('.item-label');
    if (lab) lab.appendChild(badge());
    return row;
  }
  // where each fixed text sits in the editor, following the order of the survey (name / NetID live in Background)
  var TEXT_GROUPS = {
    'texts-welcome': ['welcome_before', 'welcome_after'],
    'texts-intro': ['conjoint_heading', 'conjoint_text', 'desc_heading', 'desc_intro'],
    'texts-middle': ['desc_outro', 'imp_text', 'imp_label', 'rate_text', 'rate_label'],
    'texts-end': ['thanks']
  };
  function renderTexts() {
    Object.keys(TEXT_GROUPS).forEach(function (id) {
      var box = $(id); box.innerHTML = '';
      if (!textMeta.length) { box.appendChild(E('p', { 'class': 'muted' }, 'Loading...')); return; }
      TEXT_GROUPS[id].forEach(function (k) { box.appendChild(textRow(k)); });
    });
  }
  // after each compile the defaults may change (counts, product); redraw the text rows unless one is open for editing
  function refreshTexts() {
    if (editing && /^(tx:|bg:)/.test(editing.key)) return;
    renderBackground(); renderTexts();
  }

  function renderProfiles() {
    var box = $('profiles'); box.innerHTML = '';
    var pn = state.profile_name || 'Profile';
    var seen = {};
    var wrap = E('div', { 'class': 'ptable-wrap' }), t = E('table', { 'class': 'ptable' }), hr = E('tr');
    hr.appendChild(E('th', {}, '#'));
    state.attributes.forEach(function (a, ai) { hr.appendChild(E('th', {}, a.name || 'Attribute ' + (ai + 1))); });
    hr.appendChild(E('th', {}, ''));
    var thead = E('thead'); thead.appendChild(hr); t.appendChild(thead);
    var tb = E('tbody');
    state.profiles.forEach(function (p, pi) {
      var tr = E('tr'), key = p.join(',');
      var dup = p.indexOf(null) < 0 && seen[key];
      if (p.indexOf(null) < 0 && !seen[key]) seen[key] = pi + 1;
      if (dup) tr.className = 'dup';
      tr.appendChild(E('td', { 'class': 'pnum', title: dup ? 'Same combination as ' + pn + ' ' + dup : '' }, pn + ' ' + (pi + 1)));
      state.attributes.forEach(function (a, ai) {
        var td = E('td'), s = E('select', { 'class': 'f', 'aria-label': pn + ' ' + (pi + 1) + ' ' + (a.name || 'attribute ' + (ai + 1)) });
        s.appendChild(E('option', { value: '' }, '-- choose --'));
        a.levels.forEach(function (l, li) {
          var o = E('option', { value: String(li + 1) }, l.name || 'Level ' + 'abcde'.charAt(li));
          if (p[ai] === li + 1) o.selected = true;
          s.appendChild(o);
        });
        if (p[ai] == null) s.classList.add('empty');
        s.addEventListener('change', function () { var c = commitEdit(); p[ai] = s.value ? parseInt(s.value, 10) : null; changed(c); });
        td.appendChild(s); tr.appendChild(td);
      });
      var ops = E('td', { 'class': 'ops' });
      ops.appendChild(btn('Copy', '', act(function () {
        if (state.profiles.length >= MAX.profiles) return; state.profiles.splice(pi + 1, 0, p.slice()); changed(true);
      }), 'Duplicate this row, then change one level'));
      ops.appendChild(btn('↑', '', act(function () { if (move(state.profiles, pi, -1)) changed(true); }), 'Move up'));
      ops.appendChild(btn('↓', '', act(function () { if (move(state.profiles, pi, 1)) changed(true); }), 'Move down'));
      ops.appendChild(btn('×', 'danger', act(function () { state.profiles.splice(pi, 1); changed(true); }), 'Delete'));
      tr.appendChild(ops);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    if (state.profiles.length) box.appendChild(wrap);
    else box.appendChild(E('p', { 'class': 'muted' }, 'No profiles yet. Add one, then choose a level for each attribute.'));
    var bar = E('div', { 'class': 'actions' });
    if (state.profiles.length < MAX.profiles) {
      bar.appendChild(btn('+ Add profile', '', act(function () {
        state.profiles.push(state.attributes.map(function () { return null; })); changed(true);
      })));
    }
    bar.appendChild(E('span', { 'class': 'muted' }, ' ' + state.profiles.length + ' of up to ' + MAX.profiles + ' profiles'));
    box.appendChild(bar);
  }

  function render() {
    focusEl = null;
    renderBasics(); renderBackground(); renderAttributes(); renderProfiles(); renderTexts();
    if (focusEl) { focusEl.focus(); if (focusEl.setSelectionRange) focusEl.setSelectionRange(focusEl.value.length, focusEl.value.length); }
    $('form').disabled = locked;
  }

  // ---------- load / publish ----------
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (_) { return null; }
  }
  function draftBanner(d, onDiscard) {
    var b = $('draft'); b.innerHTML = ''; b.style.display = '';
    b.appendChild(E('span', {}, 'Restored your unsaved changes from ' + new Date(d.at).toLocaleString() + '. '));
    var x = E('a', { href: '#' }, 'Discard them');
    x.addEventListener('click', function (e) { e.preventDefault(); localStorage.removeItem(DRAFT); b.style.display = 'none'; onDiscard(); });
    b.appendChild(x);
  }
  function start(spec) { state = spec; state.texts = state.texts || {}; render(); compile(); }

  $('example').addEventListener('click', function () {
    if (!isBlank(state) && !confirm('Replace everything in the form with the example survey?')) return;
    fetch('/assets/example-gtm.json').then(function (r) { return r.json(); }).then(function (ex) {
      editing = null; state = ex; state.texts = state.texts || {}; changed(true); window.scrollTo(0, 0);
    });
  });
  $('clear').addEventListener('click', function () {
    if (!confirm('Clear the whole form?')) return;
    editing = null; state = blank(); changed(true);
  });

  $('publish').addEventListener('click', function () {
    if (commitEdit()) changed(true);  // an item still open in the editor is saved before publishing
    var b = this; b.disabled = true;
    var call = sid ? TC12.api('PUT', '/surveys/' + encodeURIComponent(sid), { spec: state }) : TC12.api('POST', '/surveys', { spec: state });
    call.then(function (r) {
      localStorage.removeItem(DRAFT);
      $('editor').style.display = 'none';
      $('done-title').textContent = sid ? 'Saved' : 'Published';
      $('link').value = TC12.surveyUrl(r.sid);
      $('go-admin').href = '/admin/?sid=' + r.sid;
      $('done').style.display = '';
      window.scrollTo(0, 0);
    }).catch(function (err) { b.disabled = false; msg('err', err.message, err.errors); window.scrollTo(0, 0); });
  });
  $('copy').addEventListener('click', function () {
    var i = $('link'); i.select();
    (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
    this.textContent = 'Copied';
  });

  if (sid) {
    $('heading').textContent = 'Edit survey';
    TC12.api('GET', '/surveys/' + encodeURIComponent(sid)).then(function (s) {
      if (s.responses.length) {
        locked = true;
        msg('err', 'This survey already has ' + s.responses.length + ' response' + (s.responses.length === 1 ? '' : 's') +
          ', so its questions are locked. You can still view them here, or create a new survey.');
        $('example').style.display = 'none'; $('clear').style.display = 'none';
        return start(s.spec);
      }
      var d = loadDraft();
      if (d) { draftBanner(d, function () { start(clone(s.spec)); }); return start(d.spec); }
      start(s.spec);
    }).catch(function (err) { msg('err', err.message); });
  } else {
    var d = loadDraft();
    if (d && !isBlank(d.spec)) { draftBanner(d, function () { start(blank()); }); start(d.spec); }
    else start(blank());
  }
  $('preview').src = '/s/?preview=1';
})();
