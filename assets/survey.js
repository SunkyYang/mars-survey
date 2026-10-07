/* TC12 Survey: renders a survey definition with Qualtrics-style DOM and classes so skin.css styles it.
   Three question types only: text, entry, rating (1-7).
   /s/?id=<sid>   live survey (loads from the API, submits answers)
   /s/?preview=1  preview inside the editor (definition arrives by postMessage, nothing is submitted) */
(function () {
  'use strict';
  var SCALE = 7;
  var DEFAULT_THANKS = 'We thank you for your time spent taking this survey.\nYour response has been recorded.';
  var params = new URLSearchParams(location.search);
  var PREVIEW = params.get('preview') === '1';
  var page = document.getElementById('Page');
  var box = document.getElementById('Questions');
  var buttons = document.getElementById('Buttons');
  var def = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // plain text with a tiny markup: **bold**, __underline__, a line starting with "# " is a heading; newlines kept
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/ {2}/g, ' &nbsp;');
  }
  function rich(s) {
    return String(s).split('\n').map(function (l) {
      return /^#\s+/.test(l) ? '<span style="font-size:19px;"><strong>' + inline(l.replace(/^#\s+/, '')) + '</strong></span>' : inline(l);
    }).join('<br>');
  }
  function plain(s, n) {
    var t = String(s).replace(/\*\*|__/g, '').replace(/^#\s+/gm, '').replace(/\s+/g, ' ').trim();
    return n && t.length > n ? t.slice(0, n - 1) + '…' : t;
  }
  function firstLine(s) { return plain(String(s).split('\n')[0]); }

  function sep(q) { return '<div id="' + q + 'Separator" class="Separator"></div>'; }
  function vdivs(q) {
    return '<div id="QR~' + q + '~VALIDATION" class="ValidationError" role="alert" style="display: none;"></div> ' +
      '<div id="QR~' + q + '~SDPVALIDATION" class="ValidationError" role="alert" style="display: none;"></div>';
  }
  function outer(q, kind) {
    return '<div class="QuestionOuter BorderColor ' + kind + '  ' + q + '" id="' + q + '" questionid="' + q + '" posttag="' + q + '"> ' + vdivs(q);
  }

  function textBlock(q, item) {
    return outer(q, 'DB') + ' <div class="Inner BorderColor TB"> <div class="InnerInner BorderColor">  ' +
      '<div class="QuestionText BorderColor"><div style="text-align: center;">' + rich(item.text) + '</div></div>' +
      '<div class="QuestionBody"></div>  </div> </div>  </div>';
  }

  function entryBlock(q, item) {
    return outer(q, 'TE') + ' <div class="Inner BorderColor SL"> <div class="InnerInner BorderColor"> ' +
      '<fieldset aria-describedby="QR~' + q + '~VALIDATION QR~' + q + '~SDPVALIDATION"> ' +
      '<legend><label for="QR~' + q + '" class="QuestionText BorderColor">' + rich(item.text) + '</label></legend>' +
      '<div class="QuestionBody"> <div class="ChoiceStructure">  ' +
      '<input type="TEXT" autocomplete="off" id="QR~' + q + '" value="" class="InputText QR-' + q + ' QWatchTimer" maxlength="2000" ' +
      'aria-describedby="QR~' + q + '~VALIDATION"> </div></div> </fieldset> </div> </div>  </div>';
  }

  function rowLabel(s) {
    var lines = String(s).split('\n');
    if (lines.length === 1) return inline(s);
    return '<span class="row-multi"><span class="row-first">' + inline(lines[0]) + '</span><br>' + lines.slice(1).map(inline).join('<br>') + '</span>';
  }

  function ratingBlock(q, item) {
    var k, h = outer(q, 'SBS') + ' <div class="Inner BorderColor SBSMatrix"> <div class="InnerInner BorderColor"> ' +
      '<fieldset aria-describedby="QR~' + q + '~VALIDATION QR~' + q + '~SDPVALIDATION"> ' +
      '<legend> <label class="QuestionText BorderColor">' + rich(item.text) + '</label></legend><fieldset> <div class="QuestionBody"> ' +
      '<table class="ChoiceStructure" border="0" cellpadding="0" cellspacing="0" style="width:370px" summary="' + esc(plain(item.text)) + '"> ' +
      '<caption class="QuestionText BorderColor">' + esc(plain(item.text)) + '</caption> <thead>  <tr class="Headings">     ' +
      '<td class="c1" style="width: 0%">  </td>  <td class="c2 BorderColor"></td>      <td class="Separator2 BorderColor"></td> ' +
      '<th scope="col" id="question1' + q + '" colspan="' + SCALE + '" class="SBS1 SubQuestionText">  <span>' + inline(item.label) + '</span>  </th>  ' +
      '<td class="last">&nbsp;</td>     </tr>  ' +
      '<tr class="ValidationDiv" style="display: none;">   <td></td>  <td class="c2 BorderColor"></td>     <td class="Separator2 BorderColor"></td> ' +
      '<td colspan="' + SCALE + '" class="ValidationError Sub SBS" style="opacity: 0"></td>  <td class="last">&nbsp;</td>    </tr> ' +
      '<tr class="ValidationDiv" style="display: none;">   <td></td>  <td class="c2 BorderColor"></td>     <td class="Separator2 BorderColor"></td> ' +
      '<td colspan="' + SCALE + '" class="ValidationError Sub SBS" style="opacity: 0"></td>  <td class="last">&nbsp;</td>    </tr>  ' +
      '<tr class="Answers">     <td class="c1 BorderColor"></td>  <td class="c2 BorderColor"></td>      <td class="LightBG Separator2 BorderColor c3"></td>    ';
    for (k = 1; k <= SCALE; k++) {
      h += '<th scope="col" id="question1' + q + '-answer' + k + q + '" class="LightBG BorderColor SBS1 c' + (k + 3) + ' AnswerText">' + k + '</th>   ';
    }
    h += '  <td class="LightBG last BorderColor c' + (SCALE + 4) + '"></td>      </tr> </thead> <tbody>           ';
    item.rows.forEach(function (row, i) {
      var r = i + 1, name = 'QR~' + q + '#1~' + r;
      h += '<tr class="Choice ' + (r % 2 ? '' : 'ReadableAlt') + '">     <th scope="row" id="choice' + r + q + '" class="c1"> ' +
        '<span class="LabelWrapper"> <label> <span>' + rowLabel(row) + '</span>  </label> </span>  </th>  ' +
        '<td class="c2 BorderColor"></td>      <td class="Separator2 BorderColor c3"></td>    ';
      for (k = 1; k <= SCALE; k++) {
        h += '<td class="SBS1 c' + (k + 3) + ' AnswerCell">  <input id="' + name + '~' + k + '" type="radio" name="' + name + '" value="' + k + '" ' +
          'aria-labelledby="question1' + q + ' question1' + q + '-answer' + k + q + ' choice' + r + q + '" class="QWatchTimer"> ' +
          '<label for="' + name + '~' + k + '" class="q-radio" aria-hidden="true"></label>  </td>   ';
      }
      h += '  <td class="last c' + (SCALE + 5) + '">&nbsp;</td>      </tr>';
    });
    return h + '      </tbody> </table> </div></fieldset> </fieldset> </div> </div>  </div>';
  }

  function endBlock(html) {
    return '<div id="EndOfSurvey" class="END_OF_SURVEY"><div class="QuestionOuter"><div class="Inner"><div class="InnerInner">' +
      '<div class="QuestionText">' + html + '</div></div></div></div></div>';
  }
  function message(html) {
    box.innerHTML = endBlock(html);
    buttons.innerHTML = '';
  }

  function qid(i) { return 'QID' + (i + 1); }

  // thank-you confetti (red / gold, about 5 s, skipped when the system asks for reduced motion)
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c);
    var x = c.getContext('2d'), W, H, dpr = window.devicePixelRatio || 1;
    function size() { W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); addEventListener('resize', size);
    var COLORS = ['#b31b1b', '#d4a017', '#ffffff', '#7a0f0f', '#f2c94c'], P = [], n = Math.round(Math.min(160, W / 6 + 60));
    // cannons in both bottom corners, then one from the middle; pieces rise near the top and flutter down
    function burst(cx, ang, spread) {
      for (var i = 0; i < n; i++) {
        var a = ang + (Math.random() - .5) * spread, v = Math.sqrt(H) * .95 * (.75 + Math.random() * .5);
        P.push({ x: cx, y: H + 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
          r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, c: COLORS[i % COLORS.length], t: Math.random() * 6 });
      }
    }
    burst(0, -Math.PI / 2 + .45, .5); burst(W, -Math.PI / 2 - .45, .5);
    setTimeout(function () { burst(W / 2, -Math.PI / 2, .7); }, 400);
    var start = performance.now(), last = start;
    (function tick(now) {
      var age = (now - start) / 1000, k = Math.min(3, (now - last) / 16.7) || 1; last = now; x.clearRect(0, 0, W, H);
      x.globalAlpha = age > 4.5 ? Math.max(0, 1 - (age - 4.5) / 1) : 1;
      P.forEach(function (p) {
        p.vy += (p.vy < 0 ? .45 : .08) * k; p.vx *= Math.pow(.985, k);
        if (p.vy > 0) p.vy = Math.min(p.vy, 2.6 + Math.sin(p.t) * .6);
        p.t += .07 * k; p.x += (p.vx + Math.sin(p.t) * 1.2) * k; p.y += p.vy * k; p.r += p.vr * k;
        var hh = p.h * Math.abs(Math.cos(p.t));
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -hh / 2, p.w, hh);
        if (p.c === '#ffffff') { x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = .6; x.strokeRect(-p.w / 2, -hh / 2, p.w, hh); }
        x.restore();
      });
      if (age < 5.6) requestAnimationFrame(tick); else done();
    })(start);
    // animation frames pause in background tabs; make sure the overlay is gone either way
    var timer = setTimeout(done, 7000);
    function done() { clearTimeout(timer); if (c.parentNode) c.remove(); removeEventListener('resize', size); }
  }

  function render(d) {
    def = d;
    document.title = d.title;
    if (d.status === 'closed' && !PREVIEW) {
      message('<div style="text-align:center">This survey is closed.</div>');
      return;
    }
    box.innerHTML = d.questions.map(function (item, i) {
      var q = qid(i);
      return sep(q) + (item.type === 'text' ? textBlock(q, item) : item.type === 'entry' ? entryBlock(q, item) : ratingBlock(q, item));
    }).join('');
    buttons.innerHTML = '<div id="submit-progress"></div>' +
      '<input id="NextButton" class="NextButton Button" title="Submit survey" type="submit" name="NextButton" value="Submit survey" aria-label="Submit survey">';
    count();
  }

  // --- answers, progress, validation ---
  function each(fn) {
    def.questions.forEach(function (item, i) { if (item.type !== 'text') fn(item, qid(i)); });
  }
  function collect() {
    var a = {};
    each(function (item, q) {
      if (item.type === 'entry') {
        a[item.id] = document.getElementById('QR~' + q).value.trim();
      } else {
        a[item.id] = item.rows.map(function (_, i) {
          var c = page.querySelector('input[name="QR~' + q + '#1~' + (i + 1) + '"]:checked');
          return c ? parseInt(c.value, 10) : null;
        });
      }
    });
    return a;
  }
  function count() {
    var n = 0, total = 0, a = collect();
    each(function (item) {
      if (item.type === 'entry') { total++; if (a[item.id]) n++; }
      else a[item.id].forEach(function (v) { total++; if (v) n++; });
    });
    var el = document.getElementById('submit-progress');
    if (!el) return;
    el.classList.toggle('done', n === total);
    el.innerHTML = n === total ? 'All ' + total + ' questions answered. Ready to submit.'
      : 'Answered <strong>' + n + '</strong> of ' + total + ' questions. All questions are required.';
  }
  function missing() {
    var out = [], first = null, a = collect();
    each(function (item, q) {
      var ok, el = document.getElementById(q);
      if (item.type === 'entry') {
        ok = !!a[item.id];
        if (!ok) out.push(plain(item.text, 60));
      } else {
        var rows = [];
        a[item.id].forEach(function (v, i) { if (!v) rows.push(firstLine(item.rows[i])); });
        ok = !rows.length;
        if (!ok) out.push(plain(item.label, 40) + ': ' + rows.join(', '));
      }
      var v = document.getElementById('QR~' + q + '~VALIDATION');
      v.innerHTML = ok ? '' : 'Please answer this question.';
      v.style.display = ok ? 'none' : '';
      el.classList.toggle('Highlight', !ok);
      if (!ok && !first) first = el;
    });
    return { list: out, first: first };
  }

  function sync(name) {
    page.querySelectorAll('input[type=radio][name="' + name + '"]').forEach(function (r) {
      page.querySelectorAll('label[for="' + r.id + '"]').forEach(function (l) { l.classList.toggle('q-checked', r.checked); });
    });
  }
  page.addEventListener('change', function (e) { if (e.target.type === 'radio') sync(e.target.name); if (def) count(); });
  page.addEventListener('input', function () { if (def) count(); });

  var modal = document.getElementById('missing-modal');
  function showModal(title, items) {
    document.getElementById('missing-title').textContent = title;
    var ul = document.getElementById('missing-list');
    ul.innerHTML = '';
    items.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
    modal.style.display = 'flex';
    document.getElementById('missing-ok').focus();
  }
  function closeModal() { modal.style.display = 'none'; }
  document.getElementById('missing-ok').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  var sending = false;
  page.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!def || sending) return;
    var m = missing();
    if (m.list.length) {
      m.first.scrollIntoView({ block: 'start' });
      showModal('Please complete the following before submitting:', m.list);
      return;
    }
    var thanks = '<div style="text-align:center">' + rich(def.thanks || DEFAULT_THANKS) + '</div>';
    if (PREVIEW) {
      message(thanks + '<p style="text-align:center;color:#b31b1b;margin-top:24px">Preview only. Nothing was submitted.</p>');
      window.scrollTo(0, 0);
      confetti();
      return;
    }
    sending = true;
    var btn = document.getElementById('NextButton');
    btn.disabled = true;
    TC12.api('POST', '/s/' + encodeURIComponent(params.get('id')) + '/submit', { answers: collect() }).then(function () {
      message(thanks);
      window.scrollTo(0, 0);
      confetti();
    }).catch(function (err) {
      sending = false;
      btn.disabled = false;
      showModal('Your answers were not submitted', [err.message, 'Please try again. Your answers are still on this page.']);
    });
  });

  // --- boot ---
  if (PREVIEW) {
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'tc12-preview') return;
      render(e.data.definition);
    });
    parent.postMessage({ type: 'tc12-preview-ready' }, location.origin);
  } else if (!params.get('id')) {
    message('<div style="text-align:center">This survey link is incomplete. Please check the link you were given.</div>');
  } else {
    TC12.api('GET', '/s/' + encodeURIComponent(params.get('id'))).then(render).catch(function (err) {
      message('<div style="text-align:center">' + esc(err.status === 404 ? 'This survey was not found. Please check the link you were given.' : err.message) + '</div>');
    });
  }
})();
