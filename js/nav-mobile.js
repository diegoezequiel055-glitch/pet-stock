// =============================================
// nav-mobile.js — Tab Bar inferior fija (mobile)
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

  // Crear tab bar
  var nav = document.createElement('nav');
  nav.className = 'nav-bottom';

  // Estilos base FIJOS directamente por JS — no dependen del CSS ni media queries
  nav.style.cssText =
    'display:none;' +
    'position:fixed;' +
    'bottom:0;' +
    'left:0;' +
    'right:0;' +
    'top:auto;' +
    'z-index:9999;' +
    'height:62px;' +
    'background:#1e293b;' +
    'border-top:1px solid #334155;' +
    'box-shadow:0 -2px 16px rgba(0,0,0,.4);' +
    'flex-direction:row;' +
    'align-items:stretch;';

  nav.innerHTML = items.map(function(item) {
    var esActivo = pagina === item.href;
    var color    = esActivo ? '#4ade80' : '#64748b';
    return '<a href="' + item.href + '" class="nav-item' + (esActivo ? ' activo' : '') + '" ' +
      'style="' +
        'flex:1;' +
        'display:flex;' +
        'flex-direction:column;' +
        'align-items:center;' +
        'justify-content:center;' +
        'color:' + color + ';' +
        'text-decoration:none;' +
        'font-size:10px;' +
        'font-weight:600;' +
        'gap:3px;' +
        'padding:6px 0;' +
      '">' +
      '<span style="font-size:20px;line-height:1">' + item.icon + '</span>' +
      '<span>' + item.label + '</span>' +
      '</a>';
  }).join('');

  document.body.appendChild(nav);

  // Detectar si es mobile y aplicar layout
  function configurarNav() {
    var esMobile = window.innerWidth <= 900 ||
      /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
    var topNav = document.querySelector('body > nav:not(.nav-bottom)');

    if (esMobile) {
      // Ocultar nav superior
      if (topNav) {
        topNav.style.display = 'none';
      }
      // Mostrar tab bar en el fondo — forzar bottom:0 siempre
      nav.style.display    = 'flex';
      nav.style.bottom     = '0';
      nav.style.top        = 'auto';
      nav.style.position   = 'fixed';
      // Padding inferior al body para que el contenido no quede tapado
      document.body.style.paddingBottom = '72px';
    } else {
      // Desktop: nav superior visible, tab bar oculta
      if (topNav) {
        topNav.style.display = '';
      }
    