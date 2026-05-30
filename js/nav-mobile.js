// =============================================
// nav-mobile.js
// - Nav inferior fija al fondo (mobile)
// - Toggle dark/light mode
// =============================================
(function () {

  const pagina = window.location.pathname.split('/').pop() || 'index.html';

  const items = [
    { href: 'index.html',         icon: '🐾', label: 'Inicio'    },
    { href: 'stock-bolsas.html',  icon: '📦', label: 'Bolsas'    },
    { href: 'accesorios.html',    icon: '🧸', label: 'Acces.'    },
    { href: 'lista-precios.html', icon: '💲', label: 'Precios'   },
    { href: 'vender.html',        icon: '🛒', label: 'Vender'    },
    { href: 'ventas.html',        icon: '📋', label: 'Historial' }
  ];

  // ── Crear nav inferior ───────────────────────────────
  const nav = document.createElement('nav');
  nav.className = 'nav-bottom';
  nav.innerHTML = items.map(item => `
    <a href="${item.href}" class="nav-item ${pagina === item.href ? 'activo' : ''}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `).join('');
  document.body.appendChild(nav);

  // ── Aplicar layout según tamaño de pantalla ──────────
  function configurarNav() {
    const esMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const topNav   = document.querySelector('body > nav:not(.nav-bottom)');
    const oscuro   = document.body.classList.contains('dark');

    if (esMobile) {
      // Ocultar nav superior
      if (topNav) topNav.style.display = 'none';

      // Nav inferior: fija al fondo, siempre visible
      const bgColor = oscuro ? '#1e293b' : '#2e7d32';
      nav.setAttribute('style',
        `display:flex !important;
         position:fixed !important;
         bottom:0 !important;
         left:0 !important;
         right:0 !important;
         z-index:9999 !important;
         height:62px !important;
         background:${bgColor} !important;
         box-shadow:0 -2px 10px rgba(0,0,0,.25) !important;`
      );

      // Espacio para que el contenido no quede detrás del nav
      document.body.style.paddingBottom = '70px';

    } else {
      // Desktop: mostrar nav superior, ocultar inferior
      if (topNav) topNav.style.display = '';
      nav.setAttribute('style', 'display:none !important;');
      document.body.style.paddingBottom = '';
    }
  }

  configurarNav();
  window.addEventListener('resize', configurarNav);

  // ── Dark / Light mode ────────────────────────────────
  const CLAVE = 'pet-stock-tema';

  function aplicarTema(oscuro) {
    document.body.classList.toggle('dark', oscuro);
    const btn = document.getElementById('btn-toggle-tema');
    if (btn) btn.textContent = oscuro ? '☀️' : '🌙';
    // Actualizar color del nav cuando cambia el tema
    configurarNav();
  }

  // Cargar preferencia guardada (o preferencia del sistema)
  const guardado = localStorage.getItem(CLAVE);
  const prefiere = guardado === null
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : guardado === 'oscuro';

  if (prefiere) document.body.classList.add('dark');

  // Botón flotante toggle
  const btn = document.createElement('button');
  btn.id        = 'btn-toggle-tema';
  btn.className = 'toggle-tema';
  btn.title     = 'Cambiar tema';
  btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    const ahora = document.body.classList.toggle('dark');
    localStorage.setItem(CLAVE, ahora ? 'oscuro' : 'claro');
    aplicarTema(ahora);
  });

  document.body.appendChild(b