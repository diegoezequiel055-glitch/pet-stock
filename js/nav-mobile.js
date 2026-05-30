// nav-mobile.js — Tab Bar inferior + Dark mode
(function () {
  var pagina = window.location.pathname.split('/').pop() || 'index.html';

  var NAV_ITEMS = [
    { href: 'index.html',         cp: 0x1F43E, label: 'Inicio'    },
    { href: 'stock-bolsas.html',  cp: 0x1F4E6, label: 'Bolsas'    },
    { href: 'accesorios.html',    cp: 0x1F9F8, label: 'Acces.'    },
    { href: 'lista-precios.html', cp: 0x1F4B2, label: 'Precios'   },
    { href: 'vender.html',        cp: 0x1F6D2, label: 'Vender'    },
    { href: 'ventas.html',        cp: 0x1F4CB, label: 'Historial' }
  ];

  var css = document.createElement('style');
  css.textContent =
    '.nb{display:none;position:fixed;bottom:0;left:0;right:0;top:auto;z-index:9999;' +
    'height:62px;background:#1e293b;border-top:1px solid #334155;' +
    'box-shadow:0 -2px 12px rgba(0,0,0,.5);flex-direction:row;align-items:stretch}' +
    '.nb a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'color:#64748b;text-decoration:none;font-size:10px;font-weight:600;gap:3px;padding:6px 2px}' +
    '.nb a .ico{font-size:19px;line-height:1}' +
    '.nb a.ok{color:#4ade80}' +
    '.nb a:active{opacity:.7}' +
    '@media(max-width:900px){' +
    'body>nav:not(.nb){display:none!important}' +
    '.nb{display:flex!important}' +
    'body{padding-bottom:72px!important}}';
  document.head.appendChild(css);

  var nav = document.createElement('nav');
  nav.className = 'nb';
  nav.innerHTML = NAV_ITEMS.map(function(it) {
    var cl = pagina === it.href ? ' ok' : '';
    var ico = String.fromCodePoint(it.cp);
    return '<a href="' + it.href + '" class="' + cl.trim() + '">' +
      '<span class="ico">' + ico + '</span>' +
      '<span>' + it.label + '</span></a>';
  }).join('');
  document.body.appendChild(nav);

  var CLAVE = 'pet-stock-tema';
  var guardado = localStorage.getItem(CLAVE);
  var prefiere = guardado === null
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : guardado === 'oscuro';
  if (prefiere) { document.body.classList.add('dark'); }

  var btn = document.createElement('button');
  btn.id = 'btn-toggle-tema';
  btn.className = 'toggle-tema';
  btn.title = 'Cambiar tema';
  btn.textContent = document.body.classList.contains('dark') ? 'Sol' : 'Luna';
  btn.addEventListener('click', function() {
    var ahora = document.body.classList.toggle('dark');
    localStorage.setItem(CLAVE, ahora ? 'oscuro' : 'claro');
    btn.textContent = ahora ? 'Sol' : 'Luna';
  });
  document.body.appendChild(btn);

})();
