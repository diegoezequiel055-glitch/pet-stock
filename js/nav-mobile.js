// =============================================
// nav-mobile.js
// - Nav inferior fija al fondo (mobile)
// - Toggle dark/light mode
// =============================================
(function () {

  var pagina = window.location.pathname.split('/').pop() || 'index.html';

  var items = [
    { href: 'index.html',         icon: '🐾', label: 'Inicio'    },
    { href: 'stock-bolsas.html',  icon: '📦', label: 'Bolsas'    },
    { href: 'accesorios.html',    icon: '🧸', label: 'Acces.'    },
    { href: 'lista-precios.html', icon: '💲', label: 'Precios'   },
    { href: 'vender.html',        icon: '🛒', label: 'Vender'    },
    { href: 'ventas.html',        icon: '📋', label: 'Historial' }
  ];

  // Crear nav inferior
  var nav = document.createElement('nav');
  nav.className = 'nav-bottom';
  nav.innerHTML = items.map(function(item) {
    var activo = pagina === item.href ? 'activo' : '';
    return '<a href="' + item.href + '" class="nav-item ' + activo + '">' +
      '<span class="nav-icon">' + item.icon + '</span>' +
      '<span>' + item.label + '</span>' +
      '</a>';
  }).join('');
  document.body.appendChild(nav);

  // Aplicar layout segun tamano de pantalla
  function configurarNav() {
    var esMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    var topNav   = document.querySelector('body > nav:not(.nav-bottom)');
    var oscuro   = document.body.classList.contains('dark');

    if (esMobile) {
      if (topNav) topNav.style.display = 'none';
      var bgColor = oscuro ? '#1e293b' : '#2e7d32';
      nav.setAttribute('style',
        'display:flex !important;' +
        'position:fixed !important;' +
        'bottom:0 !important;' +
        'left:0 !important;' +
        'right:0 !important;' +
        'z-index:9999 !important;' +
        'height:62px !important;' +
        'background:' + bgColor + ' !important;' +
        'box-shadow:0 -2px 10px rgba(0,0,0,.25) !important;'
      );
      document.body.style.paddingBottom = '70px';
    } else {
      if (topNav) topNav.style.display = '';
      nav.setAttribute('style', 'display:none !important;');
      document.body.style.paddingBottom = '';
    }
  }

  configurarNav();
  window.addEventListener('resize', configurarNav);

  // Dark / Light mode
  var CLAVE = 'pet-stock-tema';

  function aplicarTema(oscuro) {
    document.body.classList.toggle('dark', oscuro);
    var btnTema = document.getElementById('btn-toggle-tema');
    if (btnTema) btnTema.textContent = oscuro ? 'Sol' : 'Luna';
    configurarNav();
  }

  var guardado = localStorage.getItem(CLAVE);
  var prefiere = guardado === null
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : guardado === 'oscuro';

  if (prefiere) document.body.classList.add('dark');

  var btnToggle = document.createElement('button');
  btnToggle.id        = 'btn-toggle-tema';
  btnToggle.className = 'toggle-tema';
  btnToggle.title     = 'Cambiar tema';
  btnToggle.textContent = document.body.classList.contains('dark') ? 'Sol' : 'Luna';

  btnToggle.addEventListener('click', function() {
    var ahora = document.body.classList.toggle('dark');
    localStorage.setItem(CLAVE, ahora ? 'oscuro' : 'claro');
    aplicarTema(ahora);
  });

  document.body.appendChild(btnToggle);

})();
