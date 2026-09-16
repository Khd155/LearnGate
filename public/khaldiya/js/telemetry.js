// Silent outbound-engagement tracking for lesson/practice resource cards.
// Fires a background beacon on click, then lets the card's normal
// target="_blank" navigation proceed untouched — no UI, no delay, no
// visible effect on browsing either way.
(function () {
  function getToken() {
    try {
      var raw = sessionStorage.getItem('lg_session_student') || localStorage.getItem('lg_xsession_student');
      var sess = raw ? JSON.parse(raw) : null;
      return sess && sess.token ? sess.token : '';
    } catch (e) { return ''; }
  }

  function skillKeyFromPath() {
    var m = location.pathname.match(/\/(lessons|quizzes)\/([^/]+)\//);
    return m ? m[2] : '';
  }

  function resourceTypeFromPath() {
    return /\/quizzes\//.test(location.pathname) ? 'practice_form' : 'video';
  }

  function resourceIndexOf(card) {
    if (card.classList.contains('intro')) return 0;
    var badge = card.querySelector('.badge, .card-num');
    var n = badge ? parseInt(badge.textContent, 10) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  document.addEventListener('click', function (evt) {
    var card = evt.target.closest('a.card');
    if (!card || card.classList.contains('soon') || !card.href) return;
    var token = getToken();
    if (!token) return;
    try {
      var payload = JSON.stringify({
        token: token,
        skillKey: skillKeyFromPath(),
        resourceType: resourceTypeFromPath(),
        resourceIndex: resourceIndexOf(card),
        targetUrl: card.href,
      });
      var blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/click', blob);
      } else {
        fetch('/api/telemetry/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }, true);
})();
