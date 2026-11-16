// Aplica o tema escolhido (claro/escuro/automático) antes da tela aparecer, para não piscar.
(function () {
  var pref = 'auto';
  try { pref = localStorage.getItem('tema') || 'auto'; } catch (e) { /* sem armazenamento */ }
  var root = document.documentElement;
  if (pref === 'light' || pref === 'dark') { root.setAttribute('data-theme', pref); root.setAttribute('data-theme-by', 'app'); }
})();
