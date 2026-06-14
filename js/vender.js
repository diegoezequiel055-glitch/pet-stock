// ============================================================
//  vender.js v15
//  NUEVO: Carrito Accesorios/Farmacia con descuento de stock real
//  FIX: clavePrecio ignora unidadPeso (precios siempre tiene "")
//  FIX: color input precio mas llamativo
//  FIX: ocultar sin stock en ambos buscadores
// ============================================================

// -----------------------------------------------------------
// ESTADO LOCAL
// -----------------------------------------------------------
let catalogoLocal      = [];
let carrito            = [];
let carritoMayorista   = [];
let catalogoAccesorios = [];
let carritoAccesorios  = [];

// -----------------------------------------------------------
// CARGA DEL CATÁLOGO (BOLSAS) DESDE FIRESTORE
// -----------------------------------------------------------
async function cargarCatalogo() {
  try {
    mostrarEstadoCarga(true);
    const [snapProductos, snapPrecios] = await Promise.all([
      db.collection('productos').get(),
      db.collection('precios').get()
    ]);
    const mapaPrecios = {};
    snapPrecios.docs.forEach(function(d) {
      const p = d.data();
      mapaPrecios[clavePrecio(p.marca, p.nombre, '')] = {
        precioMinorista: p.precioMinorista || 0,
        precioMayorista: p.precioMayorista || 0
      };
    });
    const bolsas = snapProductos.docs.map(function(doc) {
      const d      = doc.data();
      const key    = clavePrecio(d.marca, d.nombre, '');
      const precio = mapaPrecios[key];
      const precioMin = precio ? (precio.precioMinorista || 0) : 0;
      return {
        id:             doc.id,
        tipo:           'bolsa',
        nombre:         (d.marca || '') + ' — ' + (d.nombre || ''),
        detalle:        [d.unidadPeso, d.especie].filter(Boolean).join(' · '),
        stock:          d.stockTotal || 0,
        precioVenta:    precioMin,
        precioMay:      precio ? (precio.precioMayorista || 0) : 0,
        precioEditable: true,
        _busqueda:      normalizar((d.marca || '') + ' ' + (d.nombre || '') + ' ' + (d.unidadPeso || '') + ' ' + (d.especie || ''))
      };
    });
    catalogoLocal = [...bolsas];
    mostrarEstadoCarga(false);
    restaurarCarritoDesdeCache('carritoMinorista', carrito,          renderCarrito);
    restaurarCarritoDesdeCache('carritoMayorista', carritoMayorista, renderCarritoMayorista);
  } catch (err) {
    console.error('Error cargando catalogo:', err);
    mostrarEstadoCarga(false, 'Error al cargar. Recarga la pagina.');
  }
}

function clavePrecio(marca, nombre, unidadPeso) {
  return normalizar((marca || '') + '|' + (nombre || '') + '|' + (unidadPeso || ''));
}

function mostrarEstadoCarga(cargando, error) {
  const input = document.getElementById('input-busqueda');
  if (!input) return;
  if (cargando) {
    input.placeholder = 'Cargando productos...';
    input.disabled    = true;
  } else if (error) {
    input.placeholder = error;
    input.disabled    = false;
  } else {
    input.placeholder = 'Buscar producto o accesorio...';
    input.disabled    = false;
  }
}

// -----------------------------------------------------------
// CARGA DE ACCESORIOS DESDE FIRESTORE
// -----------------------------------------------------------
async function cargarAccesorios() {
  try {
    const snap = await db.collection('accesorios').get();
    const items = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.tieneVariantes) {
        const varSnap = await db.collection('accesorios').doc(doc.id).collection('variantes').get();
        varSnap.docs.forEach(function(vDoc) {
          const v = vDoc.data();
          if ((v.stock || 0) <= 0) return;
          items.push({
            id:          vDoc.id,
            padreId:     doc.id,
            esVariante:  true,
            tipo:        (data.categoria === 'farmacia') ? 'farmacia' : 'accesorio',
            nombre:      (data.nombre || '') + ' — ' + (v.nombre_variante || ''),
            detalle:     [(data.categoria || ''), (data.marca || '')].filter(Boolean).join(' · '),
            stock:       v.stock       || 0,
            costo:       v.costo       || 0,
            precioVenta: v.precioVenta || 0,
            _busqueda:   normalizar((data.nombre || '') + ' ' + (v.nombre_variante || '') + ' ' + (data.marca || '') + ' ' + (data.categoria || ''))
          });
        });
      } else {
        if ((data.stock || 0) <= 0) continue;
        items.push({
          id:          doc.id,
          padreId:     null,
          esVariante:  false,
          tipo:        (data.categoria === 'farmacia') ? 'farmacia' : 'accesorio',
          nombre:      data.nombre || '(sin nombre)',
          detalle:     [(data.categoria || ''), (data.marca || '')].filter(Boolean).join(' · '),
          stock:       data.stock       || 0,
          costo:       data.costo       || 0,
          precioVenta: data.precioVenta || 0,
          _busqueda:   normalizar((data.nombre || '') + ' ' + (data.marca || '') + ' ' + (data.categoria || ''))
        });
      }
    }
    catalogoAccesorios = items;
  } catch (err) {
    console.error('Error cargando accesorios:', err);
  }
}

// -----------------------------------------------------------
// BUSCADOR MINORISTA
// -----------------------------------------------------------
function inicializarBuscador() {
  const input      = document.getElementById('input-busqueda');
  const resultados = document.getElementById('resultados-busqueda');
  input.addEventListener('input', function() {
    const q = input.value.trim();
    if (q.length < 2) { resultados.style.display = 'none'; return; }
    const encontrados = catalogoLocal
      .filter(function(p) { return p._busqueda.includes(normalizar(q)); })
      .filter(function(p) { return p.stock > 0; })
      .slice(0, 15);
    renderResultados(encontrados);
  });
  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('wrap-busqueda');
    if (wrap && !wrap.contains(e.target)) {
      resultados.style.display = 'none';
    }
  });
}

function renderResultados(items) {
  const contenedor = document.getElementById('resultados-busqueda');
  if (items.length === 0) {
    contenedor.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">Sin resultados</div>';
    contenedor.style.display = 'block';
    return;
  }
  contenedor.innerHTML = items.map(function(p) {
    const sinStock  = (p.stock || 0) <= 0;
    const precioStr = p.precioVenta > 0
      ? formatPrecioLocal(p.precioVenta)
      : '<span style="color:#16a34a;font-size:12px">Editable</span>';
    return '<div class="resultado-item ' + (sinStock ? 'resultado-sin-stock' : '') + '"' +
      (sinStock ? '' : ' onclick="agregarAlCarrito(\'' + p.id + '\')"') + '>' +
      '<div>' +
        '<div class="resultado-nombre">' +
          '<span class="badge-tipo ' + (p.tipo === 'bolsa' ? 'badge-bolsa' : 'badge-acc') + '">' +
            (p.tipo === 'bolsa' ? 'Bolsa' : 'Acc') +
          '</span> ' + p.nombre +
        '</div>' +
        '<div class="resultado-detalle">' + p.detalle +
          (sinStock
            ? ' · <span style="color:#ef4444;font-weight:600">Sin stock</span>'
            : ' · Stock: ' + p.stock) +
        '</div>' +
      '</div>' +
      '<div class="resultado-precio">' + precioStr + '</div>' +
    '</div>';
  }).join('');
  contenedor.style.display = 'block';
}

// -----------------------------------------------------------
// CARRITO MINORISTA
// -----------------------------------------------------------
function agregarAlCarrito(productoId) {
  const producto = catalogoLocal.find(function(p) { return p.id === productoId; });
  if (!producto || producto.stock <= 0) return;
  document.getElementById('resultados-busqueda').style.display = 'none';
  document.getElementById('input-busqueda').value = '';
  const existente = carrito.find(function(c) { return c.id === productoId; });
  if (existente) {
    if (existente.cantidad < producto.stock) existente.cantidad++;
    else { mostrarToast('No hay mas stock disponible'); return; }
  } else {
    carrito.push(Object.assign({}, producto, { cantidad: 1 }));
  }
  renderCarrito();
}

function cambiarCantidad(productoId, delta) {
  const item     = carrito.find(function(c) { return c.id === productoId; });
  if (!item) return;
  const maxStock = (catalogoLocal.find(function(p) { return p.id === productoId; }) || {}).stock || 9999;
  item.cantidad  = Math.max(0, Math.min(item.cantidad + delta, maxStock));
  if (item.cantidad === 0) carrito = carrito.filter(function(c) { return c.id !== productoId; });
  renderCarrito();
}

function quitarDelCarrito(productoId) {
  carrito = carrito.filter(function(c) { return c.id !== productoId; });
  renderCarrito();
}

function actualizarPrecioCarrito(productoId, valor) {
  const item = carrito.find(function(c) { return c.id === productoId; });
  if (item) item.precioVenta = parseFloat(valor) || 0;
  actualizarTotal();
  guardarCache('carritoMinorista', carrito);
}

function vaciarCarrito() {
  carrito = [];
  renderCarrito();
  localStorage.removeItem('carritoMinorista');
}

function renderCarrito() {
  const lista   = document.getElementById('carrito-lista');
  const count   = document.getElementById('carrito-count');
  const btnConf = document.getElementById('btn-confirmar');
  if (carrito.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:8px">' +
      '<div style="font-size:40px">🛒</div>' +
      '<div style="font-size:14px;font-weight:700;color:#1e293b">Carrito vacio</div>' +
      '<div style="font-size:13px;color:#94a3b8;max-width:240px;text-align:center">Usa el buscador para agregar productos</div>' +
    '</div>';
    count.textContent = '';
    document.getElementById('total-carrito').textContent = '$0';
    if (btnConf) btnConf.disabled = true;
    guardarCache('carritoMinorista', carrito);
    return;
  }
  count.textContent = '(' + carrito.length + ')';
  if (btnConf) btnConf.disabled = false;
  lista.innerHTML = carrito.map(function(item) {
    const subtotal   = (item.precioVenta || 0) * item.cantidad;
    const precioHtml = '<input type="number" min="0" value="' + (item.precioVenta || '') + '" placeholder="$ precio"' +
      ' onchange="actualizarPrecioCarrito(\'' + item.id + '\', this.value)"' +
      ' style="width:110px;padding:5px 10px;background:#dcfce7;border:2px solid #16a34a;border-radius:8px;font-size:14px;font-weight:800;color:#166534">';
    return '<div class="carrito-item">' +
      '<div>' +
        '<div class="ci-nombre">' + item.nombre + '</div>' +
        '<div class="ci-detalle">' + item.detalle + '</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          precioHtml +
          (item.cantidad > 1 ? '<span class="ci-subtotal">= ' + formatPrecioLocal(subtotal) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ci-controles">' +
        '<button class="ci-btn" onclick="cambiarCantidad(\'' + item.id + '\', -1)">−</button>' +
        '<span class="ci-cant">' + item.cantidad + '</span>' +
        '<button class="ci-btn" onclick="cambiarCantidad(\'' + item.id + '\', 1)">+</button>' +
        '<button class="ci-btn eliminar" onclick="quitarDelCarrito(\'' + item.id + '\')">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
  actualizarTotal();
  guardarCache('carritoMinorista', carrito);
}

function actualizarTotal() {
  const total = carrito.reduce(function(s, c) { return s + (c.precioVenta || 0) * c.cantidad; }, 0);
  document.getElementById('total-carrito').textContent = formatPrecioLocal(total);
}

// -----------------------------------------------------------
// CARRITO MAYORISTA
// -----------------------------------------------------------
function toggleCarritoMayorista() {
  const sec = document.getElementById('seccion-mayorista');
  if (!sec) return;
  const visible = sec.style.display !== 'none' && sec.style.display !== '';
  sec.style.display = visible ? 'none' : 'block';
}

function agregarAlCarritoMayorista(productoId) {
  const producto = catalogoLocal.find(function(p) { return p.id === productoId; });
  if (!producto || producto.stock <= 0) return;
  document.getElementById('resultados-busqueda-may').style.display = 'none';
  document.getElementById('input-busqueda-may').value = '';
  const existente = carritoMayorista.find(function(c) { return c.id === productoId; });
  if (existente) {
    if (existente.cantidad < producto.stock) existente.cantidad++;
    else { mostrarToast('Sin stock'); return; }
  } else {
    carritoMayorista.push(Object.assign({}, producto, {
      cantidad:       1,
      precioVenta:    producto.precioMay || 0,
      precioEditable: true
    }));
  }
  renderCarritoMayorista();
}

function cambiarCantidadMay(productoId, delta) {
  const item     = carritoMayorista.find(function(c) { return c.id === productoId; });
  if (!item) return;
  const maxStock = (catalogoLocal.find(function(p) { return p.id === productoId; }) || {}).stock || 9999;
  item.cantidad  = Math.max(0, Math.min(item.cantidad + delta, maxStock));
  if (item.cantidad === 0) carritoMayorista = carritoMayorista.filter(function(c) { return c.id !== productoId; });
  renderCarritoMayorista();
}

function quitarDelCarritoMay(productoId) {
  carritoMayorista = carritoMayorista.filter(function(c) { return c.id !== productoId; });
  renderCarritoMayorista();
}

function actualizarPrecioMay(productoId, valor) {
  const item = carritoMayorista.find(function(c) { return c.id === productoId; });
  if (item) item.precioVenta = parseFloat(valor) || 0;
  actualizarTotalMay();
  guardarCache('carritoMayorista', carritoMayorista);
}

function vaciarCarritoMay() {
  carritoMayorista = [];
  renderCarritoMayorista();
  localStorage.removeItem('carritoMayorista');
}

function renderCarritoMayorista() {
  const lista   = document.getElementById('carrito-lista-may');
  const count   = document.getElementById('carrito-count-may');
  const btnConf = document.getElementById('btn-confirmar-may');
  if (carritoMayorista.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">Carrito mayorista vacio</div>';
    count.textContent = '';
    document.getElementById('total-carrito-may').textContent = '$0';
    if (btnConf) btnConf.disabled = true;
    guardarCache('carritoMayorista', carritoMayorista);
    return;
  }
  count.textContent = '(' + carritoMayorista.length + ')';
  if (btnConf) btnConf.disabled = false;
  lista.innerHTML = carritoMayorista.map(function(item) {
    const subtotal   = (item.precioVenta || 0) * item.cantidad;
    const precioHtml = '<input type="number" min="0" value="' + (item.precioVenta || '') + '" placeholder="$ precio"' +
      ' onchange="actualizarPrecioMay(\'' + item.id + '\', this.value)"' +
      ' style="width:110px;padding:5px 10px;background:#fff7ed;border:2px solid #f97316;border-radius:8px;font-size:14px;font-weight:800;color:#c2410c">';
    return '<div class="carrito-item">' +
      '<div>' +
        '<div class="ci-nombre">' + item.nombre + '</div>' +
        '<div class="ci-detalle">' + item.detalle + '</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          precioHtml +
          (item.cantidad > 1 ? '<span class="ci-subtotal">= ' + formatPrecioLocal(subtotal) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ci-controles">' +
        '<button class="ci-btn" onclick="cambiarCantidadMay(\'' + item.id + '\', -1)">−</button>' +
        '<span class="ci-cant">' + item.cantidad + '</span>' +
        '<button class="ci-btn" onclick="cambiarCantidadMay(\'' + item.id + '\', 1)">+</button>' +
        '<button class="ci-btn eliminar" onclick="quitarDelCarritoMay(\'' + item.id + '\')">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
  actualizarTotalMay();
  guardarCache('carritoMayorista', carritoMayorista);
}

function actualizarTotalMay() {
  const total = carritoMayorista.reduce(function(s, c) { return s + (c.precioVenta || 0) * c.cantidad; }, 0);
  const el    = document.getElementById('total-carrito-may');
  if (el) el.textContent = formatPrecioLocal(total);
}

function inicializarBuscadorMay() {
  const input      = document.getElementById('input-busqueda-may');
  const resultados = document.getElementById('resultados-busqueda-may');
  if (!input) return;
  input.addEventListener('input', function() {
    const q = input.value.trim();
    if (q.length < 2) { resultados.style.display = 'none'; return; }
    const encontrados = catalogoLocal
      .filter(function(p) { return p._busqueda.includes(normalizar(q)); })
      .filter(function(p) { return p.stock > 0; })
      .slice(0, 15);
    renderResultadosMay(encontrados);
  });
  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('wrap-busqueda-may');
    if (wrap && !wrap.contains(e.target)) resultados.style.display = 'none';
  });
}

function renderResultadosMay(items) {
  const contenedor = document.getElementById('resultados-busqueda-may');
  if (items.length === 0) {
    contenedor.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">Sin resultados</div>';
    contenedor.style.display = 'block';
    return;
  }
  contenedor.innerHTML = items.map(function(p) {
    const sinStock  = (p.stock || 0) <= 0;
    const precioStr = p.precioMay > 0 ? formatPrecioLocal(p.precioMay) : '<span style="color:#f97316;font-size:12px">Editable</span>';
    return '<div class="resultado-item ' + (sinStock ? 'resultado-sin-stock' : '') + '"' +
      (sinStock ? '' : ' onclick="agregarAlCarritoMayorista(\'' + p.id + '\')"') + '>' +
      '<div>' +
        '<div class="resultado-nombre"><span class="badge-tipo badge-bolsa">Bolsa</span> ' + p.nombre + '</div>' +
        '<div class="resultado-detalle">' + p.detalle +
          (sinStock ? ' · <span style="color:#ef4444;font-weight:600">Sin stock</span>' : ' · Stock: ' + p.stock) +
        '</div>' +
      '</div>' +
      '<div class="resultado-precio">' + precioStr + '</div>' +
    '</div>';
  }).join('');
  contenedor.style.display = 'block';
}

// -----------------------------------------------------------
// CARRITO ACCESORIOS / FARMACIA
// -----------------------------------------------------------
function toggleCarritoAccesorios() {
  const sec = document.getElementById('seccion-accesorios');
  if (!sec) return;
  const visible = sec.style.display !== 'none' && sec.style.display !== '';
  sec.style.display = visible ? 'none' : 'block';
}

function inicializarBuscadorAcc() {
  const input      = document.getElementById('input-busqueda-acc');
  const resultados = document.getElementById('resultados-busqueda-acc');
  if (!input) return;
  input.addEventListener('input', function() {
    const q = input.value.trim();
    if (q.length < 2) { resultados.style.display = 'none'; return; }
    const encontrados = catalogoAccesorios
      .filter(function(p) { return p._busqueda.includes(normalizar(q)); })
      .slice(0, 15);
    renderResultadosAcc(encontrados);
  });
  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('wrap-busqueda-acc');
    if (wrap && !wrap.contains(e.target)) resultados.style.display = 'none';
  });
}

function renderResultadosAcc(items) {
  const contenedor = document.getElementById('resultados-busqueda-acc');
  if (items.length === 0) {
    contenedor.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">Sin resultados</div>';
    contenedor.style.display = 'block';
    return;
  }
  contenedor.innerHTML = items.map(function(p) {
    const esFarm     = p.tipo === 'farmacia';
    const badgeStyle = esFarm
      ? 'background:#e0f2fe;color:#0369a1'
      : 'background:#ede9fe;color:#6d28d9';
    const badgeLabel = esFarm ? '💊 Farm' : '🧸 Acc';
    const precioColor = esFarm ? '#0369a1' : '#6d28d9';
    return '<div class="resultado-item" onclick="agregarAlCarritoAcc(\'' + p.id + '\')">' +
      '<div>' +
        '<div class="resultado-nombre">' +
          '<span class="badge-tipo" style="' + badgeStyle + '">' + badgeLabel + '</span> ' + p.nombre +
        '</div>' +
        '<div class="resultado-detalle">' + p.detalle + ' · Stock: ' + p.stock + '</div>' +
      '</div>' +
      '<div class="resultado-precio" style="color:' + precioColor + '">' + formatPrecioLocal(p.precioVenta) + '</div>' +
    '</div>';
  }).join('');
  contenedor.style.display = 'block';
}

function agregarAlCarritoAcc(productoId) {
  const producto = catalogoAccesorios.find(function(p) { return p.id === productoId; });
  if (!producto || producto.stock <= 0) return;
  document.getElementById('resultados-busqueda-acc').style.display = 'none';
  document.getElementById('input-busqueda-acc').value = '';
  const existente = carritoAccesorios.find(function(c) { return c.id === productoId; });
  if (existente) {
    if (existente.cantidad < producto.stock) existente.cantidad++;
    else { mostrarToast('No hay mas stock'); return; }
  } else {
    carritoAccesorios.push(Object.assign({}, producto, { cantidad: 1 }));
  }
  renderCarritoAcc();
}

function cambiarCantidadAcc(productoId, delta) {
  const item     = carritoAccesorios.find(function(c) { return c.id === productoId; });
  if (!item) return;
  const maxStock = (catalogoAccesorios.find(function(p) { return p.id === productoId; }) || {}).stock || 9999;
  item.cantidad  = Math.max(0, Math.min(item.cantidad + delta, maxStock));
  if (item.cantidad === 0) carritoAccesorios = carritoAccesorios.filter(function(c) { return c.id !== productoId; });
  renderCarritoAcc();
}

function quitarDelCarritoAcc(productoId) {
  carritoAccesorios = carritoAccesorios.filter(function(c) { return c.id !== productoId; });
  renderCarritoAcc();
}

function actualizarPrecioAcc(productoId, valor) {
  const item = carritoAccesorios.find(function(c) { return c.id === productoId; });
  if (item) item.precioVenta = parseFloat(valor) || 0;
  actualizarTotalAcc();
}

function vaciarCarritoAcc() {
  carritoAccesorios = [];
  renderCarritoAcc();
}

function renderCarritoAcc() {
  const lista   = document.getElementById('carrito-lista-acc');
  const count   = document.getElementById('carrito-count-acc');
  const btnConf = document.getElementById('btn-confirmar-acc');
  if (!lista) return;
  if (carritoAccesorios.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">Carrito de accesorios vacío</div>';
    if (count) count.textContent = '';
    const totalEl = document.getElementById('total-carrito-acc');
    if (totalEl) totalEl.textContent = '$0';
    if (btnConf) btnConf.disabled = true;
    return;
  }
  if (count) count.textContent = '(' + carritoAccesorios.length + ')';
  if (btnConf) btnConf.disabled = false;
  lista.innerHTML = carritoAccesorios.map(function(item) {
    const subtotal    = (item.precioVenta || 0) * item.cantidad;
    const esFarm      = item.tipo === 'farmacia';
    const borderColor = esFarm ? '#0ea5e9' : '#7c3aed';
    const bgColor     = esFarm ? '#f0f9ff' : '#f5f3ff';
    const textColor   = esFarm ? '#0369a1' : '#5b21b6';
    const precioHtml  = '<input type="number" min="0" value="' + (item.precioVenta || '') + '" placeholder="$ precio"' +
      ' onchange="actualizarPrecioAcc(\'' + item.id + '\', this.value)"' +
      ' style="width:110px;padding:5px 10px;background:' + bgColor + ';border:2px solid ' + borderColor + ';border-radius:8px;font-size:14px;font-weight:800;color:' + textColor + '">';
    return '<div class="carrito-item">' +
      '<div>' +
        '<div class="ci-nombre">' + item.nombre + '</div>' +
        '<div class="ci-detalle">' + item.detalle + '</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          precioHtml +
          (item.cantidad > 1 ? '<span class="ci-subtotal">= ' + formatPrecioLocal(subtotal) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ci-controles">' +
        '<button class="ci-btn" onclick="cambiarCantidadAcc(\'' + item.id + '\', -1)">−</button>' +
        '<span class="ci-cant">' + item.cantidad + '</span>' +
        '<button class="ci-btn" onclick="cambiarCantidadAcc(\'' + item.id + '\', 1)">+</button>' +
        '<button class="ci-btn eliminar" onclick="quitarDelCarritoAcc(\'' + item.id + '\')">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
  actualizarTotalAcc();
}

function actualizarTotalAcc() {
  const total = carritoAccesorios.reduce(function(s, c) { return s + (c.precioVenta || 0) * c.cantidad; }, 0);
  const el    = document.getElementById('total-carrito-acc');
  if (el) el.textContent = formatPrecioLocal(total);
}

// -----------------------------------------------------------
// CONFIRMAR VENTA ACCESORIOS / FARMACIA
// -----------------------------------------------------------
async function confirmarVentaAcc() {
  if (carritoAccesorios.length === 0) return;
  const sinPrecio = carritoAccesorios.filter(function(c) { return !c.precioVenta || c.precioVenta <= 0; });
  if (sinPrecio.length > 0) {
    mostrarToast('Ingresa el precio de: ' + sinPrecio.map(function(p) { return p.nombre; }).join(', '));
    return;
  }
  const btn = document.getElementById('btn-confirmar-acc');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }
  try {
    const batch = db.batch();
    carritoAccesorios.forEach(function(item) {
      // Descontar stock segun tipo (variante o simple)
      if (item.esVariante) {
        const varRef = db.collection('accesorios').doc(item.padreId).collection('variantes').doc(item.id);
        batch.update(varRef, { stock: firebase.firestore.FieldValue.increment(-item.cantidad) });
      } else {
        const accRef = db.collection('accesorios').doc(item.id);
        batch.update(accRef, { stock: firebase.firestore.FieldValue.increment(-item.cantidad) });
      }
      // Guardar venta en coleccion ventas
      const costoFIFO = (item.costo || 0) * item.cantidad;
      const ganancia  = (item.precioVenta * item.cantidad) - costoFIFO;
      const vRef      = db.collection('ventas').doc();
      batch.set(vRef, {
        fecha:          firebase.firestore.FieldValue.serverTimestamp(),
        tipo:           item.tipo,
        nombreProducto: item.nombre,
        cantidad:       item.cantidad,
        precioVenta:    item.precioVenta,
        totalVenta:     item.precioVenta * item.cantidad,
        costoFIFO:      costoFIFO,
        ganancia:       ganancia,
        origen:         'carrito_acc',
        productoId:     item.esVariante ? (item.padreId + '/variantes/' + item.id) : item.id
      });
    });
    await batch.commit();
    // Actualizar stock local
    carritoAccesorios.forEach(function(item) {
      const enCat = catalogoAccesorios.find(function(p) { return p.id === item.id; });
      if (enCat) enCat.stock -= item.cantidad;
    });
    const gananciaTotal = carritoAccesorios.reduce(function(s, item) {
      return s + ((item.precioVenta * item.cantidad) - ((item.costo || 0) * item.cantidad));
    }, 0);
    mostrarToast('Venta confirmada — Ganancia: ' + formatPrecioLocal(gananciaTotal));
    carritoAccesorios = [];
    renderCarritoAcc();
  } catch (err) {
    console.error('Error al confirmar venta acc:', err);
    mostrarToast('Error al procesar. Intenta de nuevo.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar venta'; }
  }
}

// -----------------------------------------------------------
// CONFIRMAR VENTA MINORISTA
// -----------------------------------------------------------
async function confirmarVenta() {
  if (carrito.length === 0) return;
  const sinPrecio = carrito.filter(function(c) { return !c.precioVenta || c.precioVenta <= 0; });
  if (sinPrecio.length > 0) {
    mostrarToast('Ingresa el precio de: ' + sinPrecio.map(function(p) { return p.nombre; }).join(', '));
    return;
  }
  await _procesarVenta(carrito, 'minorista');
  carrito = [];
  renderCarrito();
  localStorage.removeItem('carritoMinorista');
}

// -----------------------------------------------------------
// CONFIRMAR VENTA MAYORISTA
// -----------------------------------------------------------
async function confirmarVentaMayorista() {
  if (carritoMayorista.length === 0) return;
  const sinPrecio = carritoMayorista.filter(function(c) { return !c.precioVenta || c.precioVenta <= 0; });
  if (sinPrecio.length > 0) {
    mostrarToast('Ingresa el precio de: ' + sinPrecio.map(function(p) { return p.nombre; }).join(', '));
    return;
  }
  await _procesarVenta(carritoMayorista, 'mayorista');
  carritoMayorista = [];
  renderCarritoMayorista();
  localStorage.removeItem('carritoMayorista');
}

// Motor FIFO compartido para bolsas
async function _procesarVenta(items, tipoVenta) {
  const btnId = tipoVenta === 'mayorista' ? 'btn-confirmar-may' : 'btn-confirmar';
  const btn   = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }
  try {
    const datosBolsas = [];
    for (const item of items) {
      if (item.tipo !== 'bolsa') continue;
      const productoRef = db.collection('productos').doc(item.id);
      const lotesSnap   = await productoRef.collection('lotes').orderBy('fechaCompra', 'asc').get();
      const lotes = lotesSnap.docs
        .map(function(d) { return Object.assign({ ref: d.ref }, d.data()); })
        .filter(function(l) { return l.cantidadRestante > 0; });
      const stockEnLotes = lotes.reduce(function(s, l) { return s + l.cantidadRestante; }, 0);
      if (stockEnLotes < item.cantidad) {
        mostrarToast('Stock insuficiente en lotes para: ' + item.nombre);
        if (btn) { btn.disabled = false; btn.textContent = tipoVenta === 'mayorista' ? 'Confirmar venta mayorista' : 'Confirmar venta'; }
        return;
      }
      datosBolsas.push({ item, productoRef, lotes });
    }
    const operaciones = datosBolsas.map(function(dato) {
      var restante    = dato.item.cantidad;
      var costoFIFO   = 0;
      var loteUpdates = [];
      for (const lote of dato.lotes) {
        if (restante <= 0) break;
        const tomados = Math.min(lote.cantidadRestante, restante);
        costoFIFO    += tomados * lote.costoUnitario;
        restante     -= tomados;
        loteUpdates.push({ ref: lote.ref, nuevaCantidad: lote.cantidadRestante - tomados });
      }
      return {
        item:        dato.item,
        productoRef: dato.productoRef,
        loteUpdates,
        costoFIFO,
        totalVenta:  dato.item.precioVenta * dato.item.cantidad,
        ganancia:    (dato.item.precioVenta * dato.item.cantidad) - costoFIFO
      };
    });
    const batch = db.batch();
    for (const op of operaciones) {
      op.loteUpdates.forEach(function(lu) {
        batch.update(lu.ref, { cantidadRestante: lu.nuevaCantidad });
      });
      batch.update(op.productoRef, {
        stockTotal: firebase.firestore.FieldValue.increment(-op.item.cantidad)
      });
    }
    const gananciaTotal = operaciones.reduce(function(s, op) { return s + op.ganancia; }, 0);
    items.forEach(function(item) {
      const op   = operaciones.find(function(o) { return o.item.id === item.id; });
      const vRef = db.collection('ventas').doc();
      batch.set(vRef, {
        fecha:          firebase.firestore.FieldValue.serverTimestamp(),
        tipo:           tipoVenta,
        nombreProducto: item.nombre,
        cantidad:       item.cantidad,
        precioVenta:    item.precioVenta,
        totalVenta:     item.precioVenta * item.cantidad,
        costoFIFO:      op ? op.costoFIFO : 0,
        ganancia:       op ? op.ganancia : 0,
        origen:         'vender',
        productoId:     item.id
      });
    });
    await batch.commit();
    operaciones.forEach(function(op) {
      const enCatalogo = catalogoLocal.find(function(p) { return p.id === op.item.id; });
      if (enCatalogo) enCatalogo.stock -= op.item.cantidad;
    });
    mostrarToast('Venta ' + tipoVenta + ' confirmada — Ganancia: ' + formatPrecioLocal(gananciaTotal));
  } catch (err) {
    console.error('Error al confirmar venta:', err);
    mostrarToast('Error al procesar la venta. Intenta de nuevo.');
  } finally {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = tipoVenta === 'mayorista' ? 'Confirmar venta mayorista' : 'Confirmar venta';
    }
  }
}

// -----------------------------------------------------------
// CACHE localStorage
// -----------------------------------------------------------
function guardarCache(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify(datos.map(function(item) {
      return {
        id:             item.id,
        nombre:         item.nombre,
        detalle:        item.detalle,
        tipo:           item.tipo,
        stock:          item.stock,
        precioVenta:    item.precioVenta,
        precioMay:      item.precioMay,
        precioEditable: true,
        cantidad:       item.cantidad,
        _busqueda:      item._busqueda
      };
    })));
  } catch(e) {}
}

function restaurarCarritoDesdeCache(clave, destino, renderFn) {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return;
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return;
    items.forEach(function(item) { destino.push(item); });
    renderFn();
  } catch(e) {
    localStorage.removeItem(clave);
  }
}

// -----------------------------------------------------------
// CIERRE DIARIO PET SHOP
// -----------------------------------------------------------
function toggleCierre() {
  const body    = document.getElementById('cierre-body');
  const chevron = document.getElementById('cierre-chevron');
  body.classList.toggle('abierto');
  chevron.style.transform = body.classList.contains('abierto') ? 'rotate(180deg)' : '';
  if (body.classList.contains('abierto')) cargarResumenCierrePetShop();
}

async function guardarCierrePetShop() {
  const monto = parseFloat(document.getElementById('input-cierre-monto').value);
  const notas = (document.getElementById('input-cierre-notas') ? document.getElementById('input-cierre-notas').value : '').trim();
  const tipo  = 'cierre';

  if (isNaN(monto) || monto < 0) { mostrarToast('Ingresa un monto valido'); return; }

  const btn = document.getElementById('btn-guardar-cierre');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const ahora = new Date();
    await db.collection('caja_petshop').add({
      fecha:    firebase.firestore.FieldValue.serverTimestamp(),
      fechaISO: ahora.toISOString().slice(0, 10),
      monto,
      notas:    notas || '',
      tipo,
      origen:   'cierre_diario'
    });
    mostrarToast('Cierre registrado: ' + formatPrecioLocal(monto));
    document.getElementById('input-cierre-monto').value = '';
    if (document.getElementById('input-cierre-notas')) document.getElementById('input-cierre-notas').value = '';
    await cargarResumenCierrePetShop();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}

async function cargarResumenCierrePetShop() {
  const contenedor = document.getElementById('cierre-historial');
  if (!contenedor) return;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const snap = await db.collection('caja_petshop')
      .where('fechaISO', '==', hoy)
      .orderBy('fecha', 'desc')
      .get();

    if (snap.empty) {
      contenedor.innerHTML = '<p style="color:#94a3b8;font-size:13px;margin:8px 0 0">Sin registros hoy.</p>';
      document.getElementById('cierre-total-hoy').textContent = '';
      return;
    }

    const registros = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    const totalHoy  = registros.reduce(function(s, r) { return s + (r.monto || 0); }, 0);
    document.getElementById('cierre-total-hoy').textContent = 'Total hoy: ' + formatPrecioLocal(totalHoy);

    contenedor.innerHTML = registros.map(function(r) {
      const hora = r.fecha && r.fecha.toDate
        ? r.fecha.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">' +
        '<div>' +
          '<span style="color:#64748b">' + hora + '</span>' +
          (r.notas ? '<span style="color:#94a3b8;margin-left:6px">· ' + r.notas + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<strong style="color:#16a34a">' + formatPrecioLocal(r.monto) + '</strong>' +
          '<button onclick="eliminarCierrePetShop(\'' + r.id + '\')" style="background:none;border:none;color:#ef4444;font-size:15px;cursor:pointer;padding:0 2px" title="Eliminar">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = '<p style="color:#ef4444;font-size:13px">Error al cargar historial.</p>';
  }
}

async function eliminarCierrePetShop(docId) {
  if (!confirm('Eliminar este registro de caja?')) return;
  try {
    await db.collection('caja_petshop').doc(docId).delete();
    mostrarToast('Registro eliminado');
    await cargarResumenCierrePetShop();
  } catch (err) {
    mostrarToast('Error al eliminar');
  }
}

// -----------------------------------------------------------
// UTILIDADES
// -----------------------------------------------------------
function normalizar(str) {
  if (!str) return '';
  return str.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatPrecioLocal(n) {
  if (typeof formatPrecio === 'function') return formatPrecio(n);
  return '$' + Math.round(n || 0).toLocaleString('es-AR');
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(function() { t.classList.remove('visible'); }, 3000);
}

// -----------------------------------------------------------
// INICIALIZACION
// -----------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    inicializarBuscador();
    inicializarBuscadorMay();
    inicializarBuscadorAcc();
    renderCarrito();
    renderCarritoMayorista();
    renderCarritoAcc();
    cargarCatalogo();
    cargarAccesorios();
  });
} else {
  inicializarBuscador();
  inicializarBuscadorMay();
  inicializarBuscadorAcc();
  renderCarrito();
  renderCarritoMayorista();
  renderCarritoAcc();
  cargarCatalogo();
  cargarAccesorios();
}
