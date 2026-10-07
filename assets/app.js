/* TC12 Survey shared client code: API calls, login token, small DOM helpers. */
(function () {
  'use strict';
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://' + location.hostname + ':8896/forms-api'
    : 'https://sunrenee.fun/forms-api';

  function token() { return localStorage.getItem('tc12_token'); }
  function email() { return localStorage.getItem('tc12_email'); }
  function setLogin(t, e) {
    if (t) { localStorage.setItem('tc12_token', t); localStorage.setItem('tc12_email', e); }
    else { localStorage.removeItem('tc12_token'); localStorage.removeItem('tc12_email'); }
  }

  function api(method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token()) headers.Authorization = 'Bearer ' + token();
    return fetch(API + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .catch(function () { var e = new Error('Cannot reach the server. Check your connection and try again.'); e.status = 0; throw e; })
      .then(function (res) {
        if (res.status === 401 && token() && !opts.noRedirect) {
          setLogin(null);
          location.href = '/?expired=1';
        }
        if (opts.raw && res.ok) return res;
        return res.text().then(function (txt) {
          var data = {};
          try { data = txt ? JSON.parse(txt) : {}; } catch (_) { data = { error: 'Server error' }; }
          if (!res.ok) {
            var e = new Error(data.error || ('Request failed (' + res.status + ')'));
            e.status = res.status; e.errors = data.errors || [];
            throw e;
          }
          return data;
        });
      });
  }

  function requireLogin() {
    if (!token()) { location.href = '/?next=' + encodeURIComponent(location.pathname + location.search); return false; }
    return true;
  }

  function download(path) {
    return api('GET', path, undefined, { raw: true }).then(function (res) {
      var m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
      return res.blob().then(function (b) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = m ? m[1] : 'responses.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    });
  }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // survey ids are 10 chars from the server's alphabet; anything else in a URL is ignored
  function sidParam() {
    var s = new URLSearchParams(location.search).get('sid');
    return s && /^[a-z0-9]{10}$/.test(s) ? s : null;
  }

  window.TC12 = {
    API: API, api: api, token: token, email: email, setLogin: setLogin, requireLogin: requireLogin,
    download: download, sidParam: sidParam, el: el,
    surveyUrl: function (sid) { return location.origin + '/s/?id=' + sid; }
  };
})();
