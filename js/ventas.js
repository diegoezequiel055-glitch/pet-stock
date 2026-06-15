// =============================================
// ventas.js v4 — Historial de Ventas + Caja PetShop
// =============================================

// ---- ESTADO ----
var ventasCache = [];
var cajaCache   = [];
var grafico7diasInstance = null;

// =============================================
// CARGAR DATOS
// =============================================
async function cargarVentas() {
  var btnRecargar = document.getElementById('btn-recargar');
  if (btnRecargar) btnRecargar.disabled = true;

  try {
    var resultados = await Promise.all([
      db.collection('ventas').orderBy('fecha', 'desc').limit(500).get(),
      db.collection('caja_petshop').orderBy('fecha', 'desc').limit(1000).get()
    ]);
    var snapVentas = resultados[0];
    var snapCaja   = resultados[1];

    // Leer ambos formatos:
    // - Formato nuevo (flat): nombreProducto, cantidad, precioVenta, totalVenta, costoFIFO
    // - Formato antiguo (cart de vender.js): items[] con {nombre, cantidad, precioVenta, subtotal, costo}
    ventasCache = [];
    snapVentas.docs.forEach(function(doc) {
      var d = doc.data();

      // Formato nuevo (flat por producto)
      if (d.nombreProducto) {
        ventasCache.push({
          id:         doc.id,
          tipo:       d.tipo           || 'bolsa',
          nombre:     d.nombreProducto,
          cantidad:   d.cantidad       || 0,
          precio:     d.precioVenta    || 0,
          total:      d.totalVenta     || 0,
          costo:      d.costoFIFO      || d.costo || 0,
          ganancia:   d.ganancia       || 0,
          cliente:    d.cliente        || '-',
          audio:      d.origenAudio    || false,
          productoId: d.productoId     || '',
          fecha:      d.fecha
        });
        return;
      }

      // Formato antiguo (items[] de vender.js anterior)
      if (d.items && Array.isArray(d.items) && d.items.length > 0) {
        var nItems = d.items.length;
        // OPCION A: calcular el total del carrito para distribuir el costoTotal proporcional al subtotal de cada item
        var totalCarritoViejo = d.totalVenta || d.items.reduce(function(acc, it) {
          return acc + (it.subtotal || ((it.precioVenta || 0) * (it.cantidad || 1)));
        }, 0);
        d.items.forEach(function(item, i) {
          var subtotal   = item.subtotal || ((item.precioVenta || 0) * (item.cantidad || 1));
          var proporcion = (totalCarritoViejo > 0) ? (subtotal / totalCarritoViejo) : (1 / Math.max(nItems, 1));
          var costoItem  = item.costo || Math.round((d.costoTotal || 0) * proporcion);
          ventasCache.push({
            id:       doc.id + '_' + i,
            tipo:     item.tipo     || d.tipo || 'bolsa',
            nombre:   item.nombre   || '-',
            cantidad: item.cantidad || 0,
            precio:   item.precioVenta || 0,
            total:    subtotal,
            costo:    costoItem,
            ganancia: subtotal - costoItem,
            cliente:  d.cliente || '-',
            audio:    false,
            fecha:    d.fecha
          });
        });
        return;
      }

      // Fallback: totalVenta pero sin campos conocidos
      if (d.totalVenta) {
        ventasCache.push({
          id:       doc.id,
          tipo:     d.tipo || 'bolsa',
          nombre:   'Venta (sin detalle)',
          cantidad: 1,
          precio:   d.totalVenta || 0,
          total:    d.totalVenta || 0,
          costo:    d.costoTotal || d.costoFIFO || 0,
          ganancia: d.ganancia   || 0,
          cliente:  d.cliente    || '-',
          audio:    false,
          fecha:    d.fecha
        });
      }
    });

    cajaCache = snapCaja.docs.map(function(doc) {
      var d = doc.data();
      return {
        id:       doc.id,
        tipo:     d.tipo     || 'otro',
        monto:    d.monto    || 0,
        notas:    d.notas    || '',
        fechaISO: d.fechaISO || '',
        fecha:    d.fecha
      };
    });

    aplicarFiltros();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al cargar las ventas', 'error');
  } finally {
    if (btnRecargar) btnRecargar.disabled = false;
  }
}

// =============================================
// FILTROS
// =============================================
function aplicarFiltros() {
  var tipo  = (document.getElementById('filtro-tipo')  || {}).value || '';
  var desde = (document.getElementById('filtro-desde') || {}).value || '';
  var hasta = (document.getElementById('filtro-hasta') || {}).value || '';
  var texto = normalizar((document.getElementById('buscador-v') || {}).value || '');

  var filtradas = ventasCache.filter(function(v) {
    if (tipo && v.tipo !== tipo) return false;
    if (texto && !normalizar(v.nombre + ' ' + v.cliente).includes(texto)) return false;
    if (v.fecha) {
      var fecha = v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
      if (desde && fecha < new Date(desde + 'T00:00:00')) return false;
      if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    }
    return true;
  });

  var filtradaCaja = cajaCache.filter(function(r) {
    if (!desde && !hasta) return true;
    var iso = r.fechaISO || (r.fecha && r.fecha.toDate ? r.fecha.toDate().toISOString().slice(0, 10) : '');
    if (desde && iso < desde) return false;
    if (hasta && iso > hasta) return false;
    return true;
  });

  renderTablaVentas(filtradas);
  renderResumen(filtradas, filtradaCaja);
  renderCierresDiarios(filtradaCaja, filtradas);
  renderRankingVentas(filtradas);
  renderGrafico7Dias();

  var cont = document.getElementById('contador-ventas');
  if (cont) cont.textContent = filtradas.length + ' resultado' + (filtradas.length !== 1 ? 's' : '');
}

// =============================================
// RENDER RESUMEN (TARJETAS)
// =============================================
function renderResumen(lista, cajaFiltrada) {
  // Ventas de bolsas (tipo bolsa/minorista/mayorista)
  var ventasBolsas = lista.filter(function(v) { return v.tipo !== 'accesorio' && v.tipo !== 'farmacia'; });
  var totalVentas    = lista.length;
  var totalFacturado = ventasBolsas.reduce(function(s, v) { return s + v.total; }, 0);
  var totalCosto     = ventasBolsas.reduce(function(s, v) { return s + v.costo; }, 0);
  var gananciaBolsas = ventasBolsas.reduce(function(s, v) { return s + v.ganancia; }, 0);

  // Ventas nuevas de accesorios/farmacia (con ganancia real desde costo)
  var ventasAcc  = lista.filter(function(v) { return v.tipo === 'accesorio'; });
  var ventasFarm = lista.filter(function(v) { return v.tipo === 'farmacia'; });

  var totalAccVen  = ventasAcc.reduce(function(s, v)  { return s + v.total; }, 0);
  var totalFarmVen = ventasFarm.reduce(function(s, v) { return s + v.total; }, 0);
  var ganAccVen    = ventasAcc.reduce(function(s, v)  { return s + v.ganancia; }, 0);
  var ganFarmVen   = ventasFarm.reduce(function(s, v) { return s + v.ganancia; }, 0);

  // Datos viejos de caja_petshop (porcentaje estimado)
  var totalCierre     = cajaFiltrada.filter(function(r) { return r.tipo === 'cierre' || r.tipo === 'otro'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalFarmCaja   = cajaFiltrada.filter(function(r) { return r.tipo === 'farmacia'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalAccCaja    = cajaFiltrada.filter(function(r) { return r.tipo === 'accesorios'; }).reduce(function(s, r) { return s + r.monto; }, 0);

  var gananciaCierre   = totalCierre   * 0.40;
  var ganFarmCaja      = totalFarmCaja * 0.60;
  var ganAccCaja       = totalAccCaja  * 1.00;

  var totalFarmacia   = totalFarmVen  + totalFarmCaja;
  var totalAccesorios = totalAccVen   + totalAccCaja;
  var gananciaFarmacia   = ganFarmVen + ganFarmCaja;
  var gananciaAccesorios = ganAccVen  + ganAccCaja;

  var totalGanancia = gananciaBolsas + gananciaCierre + gananciaFarmacia + gananciaAccesorios;
  var totalCaja     = totalFacturado + totalAccVen + totalFarmVen + totalCierre + totalFarmCaja + totalAccCaja;
  var margenGlobal  = totalCaja > 0 ? Math.round((totalGanancia / totalCaja) * 100) : 0;

  set('res-v-cantidad',  totalVentas);
  set('res-v-facturado', formatPrecio(totalFacturado));
  set('res-v-costo',     formatPrecio(totalCosto));

  var ganEl = document.getElementById('res-v-ganancia');
  if (ganEl) {
    ganEl.textContent = formatPrecio(totalGanancia);
    ganEl.className   = 'valor ' + (totalGanancia >= 0 ? 'ganancia-pos' : 'ganancia-neg');
  }
  set('res-v-margen', margenGlobal + '%');

  set('res-cierre-total', formatPrecio(totalCierre));
  set('res-cierre-gan',   '💰 Ganancia est.: ' + formatPrecio(gananciaCierre) + '\n(40% sobre ventas a lo suelto)');

  set('res-farmacia-total', formatPrecio(totalFarmacia));
  var labelFarm = ganFarmVen > 0
    ? '💰 Ganancia real: ' + formatPrecio(ganFarmVen) + (ganFarmCaja > 0 ? ' + est.: ' + formatPrecio(ganFarmCaja) : '')
    : '💰 Ganancia est.: ' + formatPrecio(gananciaFarmacia) + '\n(60% sobre ventas de farmacia)';
  set('res-farmacia-gan', labelFarm);

  set('res-acc-total', formatPrecio(totalAccesorios));
  var labelAcc = ganAccVen > 0
    ? '💰 Ganancia real: ' + formatPrecio(ganAccVen) + (ganAccCaja > 0 ? ' + est.: ' + formatPrecio(ganAccCaja) : '')
    : '💰 Ganancia est.: ' + formatPrecio(gananciaAccesorios) + '\n(100% — ganancia total sobre accesorios)';
  set('res-acc-gan', labelAcc);
}

function set(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// =============================================
// RENDER ACORDEONES POR DIA — bolsas
// =============================================
function renderTablaVentas(lista) {
  var contenedor = document.getElementById('lista-ventas-dias');
  if (!contenedor) return;

  // Excluir accesorios y farmacia — aparecen solo en Cierres Diarios
  lista = lista.filter(function(v) { return v.tipo !== 'accesorio' && v.tipo !== 'farmacia'; });

  if (lista.length === 0) {
    contenedor.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:14px">No hay ventas en el período seleccionado</div>';
    return;
  }

  var porDia = {};
  lista.forEach(function(v) {
    var fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
    var key   = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!porDia[key]) porDia[key] = { ventas: [], total: 0 };
    porDia[key].ventas.push(v);
    porDia[key].total += v.total;
  });

  var dias = Object.keys(porDia);
  var html = '';

  dias.forEach(function(dia, idx) {
    var grupo   = porDia[dia];
    var count   = grupo.ventas.length;
    var total   = grupo.total;
    var abierto = false;

    html += '<div class="dia-acord" style="margin-bottom:8px">';
    html += '<div onclick="toggleDiaVentas(this)" style="' +
      'display:flex;justify-content:space-between;align-items:center;' +
      'background:#1e293b;border:1px solid #334155;' +
      'border-radius:' + (abierto ? '10px 10px 0 0' : '10px') + ';' +
      'padding:12px 16px;cursor:pointer;user-select:none;">' +
      '<span style="font-size:14px;font-weight:700;color:#e2e8f0">📅 ' + dia + '</span>' +
      '<span style="display:flex;align-items:center;gap:12px">' +
        '<span style="font-size:12px;color:#94a3b8">' + count + ' venta' + (count !== 1 ? 's' : '') + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:#4ade80">' + formatPrecio(total) + '</span>' +
        '<span class="dia-arrow" style="color:' + (abierto ? '#4ade80' : '#64748b') + ';font-size:12px">' + (abierto ? '▼' : '▶') + '</span>' +
      '</span>' +
    '</div>';

    html += '<div style="display:' + (abierto ? 'block' : 'none') + ';' +
      'background:#0d1625;border:1px solid #334155;border-top:none;border-radius:0 0 10px 10px;padding:8px">';

    grupo.ventas.forEach(function(v) {
      html += renderVentaCard(v);
    });

    // Bloque ganancia del dia
    var ganDia   = grupo.ventas.reduce(function(s, v) { return s + v.ganancia; }, 0);
    var costoDia = grupo.ventas.reduce(function(s, v) { return s + v.costo; }, 0);
    var margenDia= total > 0 ? Math.round((ganDia / total) * 100) : 0;
    html += '<div style="background:#162032;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;margin-top:4px">' +
      '<div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:4px">💰 Ganancia del día: ' + formatPrecio(ganDia) + ' (' + margenDia + '%)</div>' +
      '<div style="font-size:12px;color:#94a3b8">Facturado: <span style="color:#e2e8f0">' + formatPrecio(total) + '</span> · Costo: <span style="color:#e2e8f0">' + formatPrecio(costoDia) + '</span></div>' +
    '</div>';

    html += '</div></div>';
  });

  contenedor.innerHTML = html;
}

function renderVentaCard(v) {
  var margenPct     = v.costo > 0 ? Math.round(((v.total - v.costo) / v.costo) * 100) : 0;
  var gananciaColor = v.ganancia >= 0 ? '#4ade80' : '#f87171';
  var audioTag      = v.audio ? ' 🎙️' : '';

  var tipoTag;
  if (v.tipo === 'mayorista') {
    tipoTag = '<span style="background:#c2410c;color:#ffedd5;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">MAYORISTA</span>';
  } else if (v.tipo === 'accesorio') {
    tipoTag = '<span style="background:#6b21a8;color:#f3e8ff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">ACCESORIO</span>';
  } else {
    tipoTag = '<span style="background:#1d4ed8;color:#dbeafe;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">BOLSA</span>';
  }

  return '<div style="background:#162032;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;margin-bottom:6px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
      '<div style="flex:1">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">' +
          tipoTag +
          '<span style="font-size:13px;font-weight:700;color:#e2e8f0">' + v.nombre + audioTag + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#64748b">' +
          formatFecha(v.fecha) + ' · ' + v.cantidad + ' u. × ' + formatPrecio(v.precio) +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">' +
        '<button onclick="confirmarEliminarVenta(\'' + v.id + '\',\'' + v.tipo + '\',\'' + (v.productoId||'') + '\',' + v.cantidad + ')" ' +
          'style="background:transparent;border:1px solid #7f1d1d;border-radius:6px;color:#f87171;font-size:13px;padding:2px 7px;cursor:pointer;line-height:1" ' +
          'title="Eliminar venta">🗑️</button>' +
        '<div style="text-align:right">' +
          '<div style="font-size:15px;font-weight:700;color:#e2e8f0">' + formatPrecio(v.total) + '</div>' +
          '<div style="font-size:11px;color:' + gananciaColor + '">G: ' + formatPrecio(v.ganancia) + ' (' + margenPct + '%)</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function confirmarEliminarVenta(ventaId, tipo, productoId, cantidad) {
  if (!confirm('¿Eliminar esta venta y reponer el stock?')) return;
  eliminarVenta(ventaId, tipo, productoId, cantidad);
}

async function eliminarVenta(ventaId, tipo, productoId, cantidad) {
  try {
    var batch = db.batch();

    // Eliminar el documento de ventas
    var ventaRef = db.collection('ventas').doc(ventaId);
    batch.delete(ventaRef);

    // Reponer stock según tipo
    if (tipo === 'accesorio' || tipo === 'farmacia') {
      // Accesorios: reponer directo en accesorios o variante
      // productoId puede ser "padreId/variantes/id" o solo "id"
      var partes = productoId ? productoId.split('/') : [];
      if (partes.length === 3) {
        var varRef = db.collection('accesorios').doc(partes[0]).collection('variantes').doc(partes[2]);
        batch.update(varRef, { stock: firebase.firestore.FieldValue.increment(cantidad) });
      } else if (partes.length === 1 && partes[0]) {
        var accRef = db.collection('accesorios').doc(partes[0]);
        batch.update(accRef, { stock: firebase.firestore.FieldValue.increment(cantidad) });
      }
    } else {
      // Bolsas: reponer stockTotal en productos
      if (productoId) {
        var prodRef = db.collection('productos').doc(productoId);
        batch.update(prodRef, { stockTotal: firebase.firestore.FieldValue.increment(cantidad) });
      }
    }

    await batch.commit();
    mostrarAlerta('Venta eliminada y stock repuesto', 'ok');
    cargarVentas();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar la venta', 'error');
  }
}

function toggleDiaVentas(header) {
  var body    = header.nextElementSibling;
  var arrow   = header.querySelector('.dia-arrow');
  var abierto = body.style.display === 'none' || body.style.display === '';
  body.style.display        = abierto ? 'block' : 'none';
  header.style.borderRadius = abierto ? '10px 10px 0 0' : '10px';
  if (arrow) {
    arrow.textContent = abierto ? '▼' : '▶';
    arrow.style.color = abierto ? '#4ade80' : '#64748b';
  }
}

// =============================================
// RENDER CIERRES DIARIOS
// =============================================
function renderCierresDiarios(cajaFiltrada, ventasFiltradas) {
  var contenedor = document.getElementById('lista-cierres-dias');
  if (!contenedor) return;

  ventasFiltradas = ventasFiltradas || [];

  var ventasAccFarm = ventasFiltradas.filter(function(v) {
    return v.tipo === 'accesorio' || v.tipo === 'farmacia';
  });

  var porDia = {};

  cajaFiltrada.forEach(function(r) {
    var iso = r.fechaISO || (r.fecha && r.fecha.toDate ? r.fecha.toDate().toISOString().slice(0, 10) : '');
    if (!iso) return;
    if (!porDia[iso]) porDia[iso] = { caja: [], ventas: [] };
    porDia[iso].caja.push(r);
  });

  ventasAccFarm.forEach(function(v) {
    var fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate() : (v.fecha ? new Date(v.fecha) : null);
    if (!fecha) return;
    var iso = fecha.toISOString().slice(0, 10);
    if (!porDia[iso]) porDia[iso] = { caja: [], ventas: [] };
    porDia[iso].ventas.push(v);
  });

  if (Object.keys(porDia).length === 0) {
    contenedor.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:14px">Sin registros en el periodo</div>';
    return;
  }

  var dias = Object.keys(porDia).sort().reverse();
  var html = '';

  dias.forEach(function(diaISO, idx) {
    var grupo   = porDia[diaISO];
    var abierto = false;

    var cajaItems   = grupo.caja   || [];
    var ventasItems = grupo.ventas || [];

    var accCaja  = cajaItems.filter(function(r) { return r.tipo === 'accesorios'; });
    var farmCaja = cajaItems.filter(function(r) { return r.tipo === 'farmacia'; });
    var cierres  = cajaItems.filter(function(r) { return r.tipo === 'cierre' || r.tipo === 'otro'; });

    var totalAccCaja  = accCaja.reduce(function(s, r)  { return s + r.monto; }, 0);
    var totalFarmCaja = farmCaja.reduce(function(s, r) { return s + r.monto; }, 0);
    var totalCier     = cierres.reduce(function(s, r)  { return s + r.monto; }, 0);

    var accVen  = ventasItems.filter(function(v) { return v.tipo === 'accesorio'; });
    var farmVen = ventasItems.filter(function(v) { return v.tipo === 'farmacia'; });

    var totalAccVen  = accVen.reduce(function(s, v)  { return s + (v.total || 0); }, 0);
    var totalFarmVen = farmVen.reduce(function(s, v) { return s + (v.total || 0); }, 0);
    var ganAccVen    = accVen.reduce(function(s, v)  { return s + (v.ganancia   || 0); }, 0);
    var ganFarmVen   = farmVen.reduce(function(s, v) { return s + (v.ganancia   || 0); }, 0);

    var ganAccCaja  = totalAccCaja  * 1.00;
    var ganFarmCaja = totalFarmCaja * 0.60;
    var ganCier     = totalCier     * 0.40;
    var ganTotal    = ganAccCaja + ganFarmCaja + ganCier + ganAccVen + ganFarmVen;

    var totalDia = totalAccCaja + totalFarmCaja + totalCier + totalAccVen + totalFarmVen;
    if (totalDia === 0) return;

    var partes   = diaISO.split('-');
    var diaLabel = partes[2] + '/' + partes[1] + '/' + partes[0];

    function renderItemsCaja(lista) {
      if (lista.length === 0) return '';
      return lista.map(function(r) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #1e3a5f">' +
          '<span style="color:#94a3b8">' + (r.notas || '—') + '</span>' +
          '<span style="color:#e2e8f0;font-weight:600">' + formatPrecio(r.monto) + '</span>' +
        '</div>';
      }).join('');
    }

    function renderItemsVenta(lista) {
      if (lista.length === 0) return '';
      return lista.map(function(v) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid #1e3a5f">' +
          '<span style="color:#94a3b8">' + (v.nombre || '—') + ' x' + v.cantidad + '</span>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="color:#e2e8f0;font-weight:600">' + formatPrecio(v.total || 0) + '</span>' +
            '<button onclick="confirmarEliminarVenta(\'' + v.id + '\',\'' + v.tipo + '\',\'' + (v.productoId || '') + '\',' + v.cantidad + ')" ' +
              'style="background:transparent;border:1px solid #7f1d1d;border-radius:5px;color:#f87171;font-size:11px;padding:2px 5px;cursor:pointer;line-height:1.4" ' +
              'title="Eliminar">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    html += '<div class="dia-acord" style="margin-bottom:8px">';
    html += '<div onclick="toggleDiaVentas(this)" style="display:flex;justify-content:space-between;align-items:center;background:#1e293b;border:1px solid #334155;border-radius:' + (abierto ? '10px 10px 0 0' : '10px') + ';padding:12px 16px;cursor:pointer;user-select:none;">' +
      '<span style="font-size:14px;font-weight:700;color:#e2e8f0">📅 ' + diaLabel + '</span>' +
      '<span style="display:flex;align-items:center;gap:12px">' +
        '<span style="font-size:13px;font-weight:700;color:#f97316">' + formatPrecio(totalDia) + '</span>' +
        '<span class="dia-arrow" style="color:' + (abierto ? '#4ade80' : '#64748b') + ';font-size:12px">' + (abierto ? '▼' : '▶') + '</span>' +
      '</span>' +
    '</div>';

    html += '<div style="display:' + (abierto ? 'block' : 'none') + ';background:#0d1625;border:1px solid #334155;border-top:none;border-radius:0 0 10px 10px;padding:12px 14px">';

    if (accVen.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:4px">🧸 Accesorios</div>';
      html += renderItemsVenta(accVen);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalAccVen) + ' G: ' + formatPrecio(ganAccVen) + '</div>';
    }
    if (accCaja.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:4px">🧸 Accesorios (anterior)</div>';
      html += renderItemsCaja(accCaja);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalAccCaja) + '</div>';
    }
    if (farmVen.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#67e8f9;margin-bottom:4px">💊 Farmacia</div>';
      html += renderItemsVenta(farmVen);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalFarmVen) + ' G: ' + formatPrecio(ganFarmVen) + '</div>';
    }
    if (farmCaja.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#67e8f9;margin-bottom:4px">💊 Farmacia (anterior)</div>';
      html += renderItemsCaja(farmCaja);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalFarmCaja) + '</div>';
    }
    if (cierres.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:4px">🏪 Alimento suelto</div>';
      html += renderItemsCaja(cierres);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalCier) + '</div>';
    }

    html += '<div style="background:#162032;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;margin-top:4px">';
    html += '<div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:6px">💰 Ganancia del dia: ' + formatPrecio(ganTotal) + '</div>';
    if (ganAccVen    > 0) html += '<div style="font-size:12px;color:#94a3b8">🧸 Accesorios (real): <span style="color:#a78bfa">'        + formatPrecio(ganAccVen)   + '</span></div>';
    if (ganFarmVen   > 0) html += '<div style="font-size:12px;color:#94a3b8">💊 Farmacia (real): <span style="color:#67e8f9">'          + formatPrecio(ganFarmVen)  + '</span></div>';
    if (totalAccCaja > 0) html += '<div style="font-size:12px;color:#94a3b8">🧸 Accesorios est. (100%): <span style="color:#a78bfa">'  + formatPrecio(ganAccCaja)  + '</span></div>';
    if (totalFarmCaja> 0) html += '<div style="font-size:12px;color:#94a3b8">💊 Farmacia est. (60%): <span style="color:#67e8f9">'      + formatPrecio(ganFarmCaja) + '</span></div>';
    if (totalCier    > 0) html += '<div style="font-size:12px;color:#94a3b8">🏪 Suelto est. (40%): <span style="color:#fbbf24">'        + formatPrecio(ganCier)     + '</span></div>';
    html += '</div>';

    html += '</div></div>';
  });

  contenedor.innerHTML = html || '<div style="padding:24px;text-align:center;color:#64748b;font-size:14px">Sin registros en el periodo</div>';
}


// =============================================
// RENDER RANKING TOP 10 LO MÁS VENDIDO
// =============================================
function renderRankingVentas(lista) {
  var contenedor = document.getElementById('ranking-ventas');
  if (!contenedor) return;

  // Solo bolsas (excluir accesorios y farmacia)
  var bolsas = lista.filter(function(v) {
    return v.tipo !== 'accesorio' && v.tipo !== 'farmacia';
  });

  if (bolsas.length === 0) {
    contenedor.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;font-size:13px">Sin ventas en el período seleccionado</div>';
    return;
  }

  // Agrupar por nombre de producto
  var porProducto = {};
  bolsas.forEach(function(v) {
    var key = v.nombre || 'Sin nombre';
    if (!porProducto[key]) porProducto[key] = { nombre: key, cantidad: 0, monto: 0 };
    porProducto[key].cantidad += (v.cantidad || 0);
    porProducto[key].monto   += (v.total    || 0);
  });

  var ranking = Object.values(porProducto)
    .sort(function(a, b) { return b.cantidad - a.cantidad; })
    .slice(0, 10);

  var maxCant  = ranking[0] ? ranking[0].cantidad : 1;
  var medallas = ['🥇','🥈','🥉'];
  var barColors = ['#f97316','#fb923c','#fdba74','#4ade80','#4ade80','#4ade80','#4ade80','#4ade80','#4ade80','#4ade80'];

  var html = '';
  ranking.forEach(function(p, i) {
    var pct   = Math.round((p.cantidad / maxCant) * 100);
    var label = i < 3 ? medallas[i] : String(i + 1);
    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e3a5f;">' +
      '<span style="font-size:' + (i < 3 ? '16' : '12') + 'px;min-width:22px;text-align:center;color:#94a3b8;">' + label + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.nombre + '</div>' +
        '<div style="height:5px;background:#0f172a;border-radius:3px;margin-top:5px;">' +
          '<div style="height:100%;width:' + pct + '%;background:' + barColors[i] + ';border-radius:3px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0;">' +
        '<div style="font-size:13px;font-weight:700;color:#e2e8f0;">' + p.cantidad + ' u.</div>' +
        '<div style="font-size:11px;color:#64748b;">' + formatPrecio(p.monto) + '</div>' +
      '</div>' +
    '</div>';
  });

  contenedor.innerHTML = html;
}

// =============================================
// RENDER GRÁFICO ÚLTIMOS 7 DÍAS
// =============================================
function renderGrafico7Dias() {
  var canvas = document.getElementById('grafico-7dias');
  if (!canvas) return;
  if (typeof Chart === 'undefined') { setTimeout(renderGrafico7Dias, 500); return; }

  // Calcular los últimos 7 días
  var hoy    = new Date();
  var dias   = [];
  var labels = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    var iso = d.toISOString().slice(0, 10);
    dias.push(iso);
    labels.push(d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }));
  }

  var facturadoPorDia = {};
  var gananciaPorDia  = {};
  dias.forEach(function(d) { facturadoPorDia[d] = 0; gananciaPorDia[d] = 0; });

  // Sumar ventas de bolsas/accesorios/farmacia registradas en la colección ventas
  ventasCache.forEach(function(v) {
    if (!v.fecha) return;
    var fecha = v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
    var iso   = fecha.toISOString().slice(0, 10);
    if (facturadoPorDia.hasOwnProperty(iso)) {
      facturadoPorDia[iso] += (v.total    || 0);
      gananciaPorDia[iso]  += (v.ganancia || 0);
    }
  });

  // Sumar caja_petshop con ganancia estimada por tipo
  cajaCache.forEach(function(r) {
    var iso = r.fechaISO || '';
    if (!iso && r.fecha && r.fecha.toDate) iso = r.fecha.toDate().toISOString().slice(0, 10);
    if (facturadoPorDia.hasOwnProperty(iso)) {
      facturadoPorDia[iso] += (r.monto || 0);
      var ganEst = r.tipo === 'farmacia'   ? (r.monto || 0) * 0.60
                 : r.tipo === 'accesorios' ? (r.monto || 0) * 1.00
                 : (r.monto || 0) * 0.40;
      gananciaPorDia[iso] += ganEst;
    }
  });

  var dataFact = dias.map(function(d) { return Math.round(facturadoPorDia[d]); });
  var dataGan  = dias.map(function(d) { return Math.round(gananciaPorDia[d]);  });

  if (grafico7diasInstance) { grafico7diasInstance.destroy(); grafico7diasInstance = null; }

  grafico7diasInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Facturado',     data: dataFact, backgroundColor: '#4ade80', borderRadius: 4, barPercentage: 0.55, categoryPercentage: 0.8 },
        { label: 'Ganancia est.', data: dataGan,  backgroundColor: '#f97316', borderRadius: 4, barPercentage: 0.55, categoryPercentage: 0.8 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ' ' + formatPrecio(ctx.raw); }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(148,163,184,0.08)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: function(v) {
              if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
              if (v >= 1000)    return '$' + Math.round(v / 1000) + 'k';
              return '$' + v;
            }
          }
        }
      }
    }
  });
}

// =============================================
// FILTRO RAPIDO POR PERIODO
// =============================================
function filtroRapido(periodo) {
  var hoy   = new Date();
  var desde = document.getElementById('filtro-desde');
  var hasta = document.getElementById('filtro-hasta');

  hasta.value = hoyISO();

  if (periodo === 'hoy') {
    desde.value = hoyISO();
  } else if (periodo === 'semana') {
    var lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    desde.value = lunes.toISOString().split('T')[0];
  } else if (periodo === 'mes') {
    desde.value = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-01';
  } else if (periodo === 'todo') {
    desde.value = '';
    hasta.value = '';
  }

  aplicarFiltros();
}

// =============================================
// EXPORTAR A CSV
// =============================================
function exportarCSV() {
  var tipo  = (document.getElementById('filtro-tipo')  || {}).value || '';
  var desde = (document.getElementById('filtro-desde') || {}).value || '';
  var hasta = (document.getElementById('filtro-hasta') || {}).value || '';

  var filtradas = ventasCache.filter(function(v) {
    if (tipo && v.tipo !== tipo) return false;
    if (v.fecha) {
      var fecha = v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
      if (desde && fecha < new Date(desde + 'T00:00:00')) return false;
      if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    }
    return true;
  });

  if (filtradas.length === 0) {
    mostrarAlerta('No hay datos para exportar', 'warning');
    return;
  }

  var encabezado = ['Fecha','Tipo','Producto','Cantidad','Precio unit.','Total','Costo','Ganancia','Cliente'];
  var filas = filtradas.map(function(v) {
    return [formatFecha(v.fecha), v.tipo, '"' + v.nombre + '"',
            v.cantidad, v.precio, v.total, v.costo, v.ganancia, '"' + v.cliente + '"'].join(',');
  });

  var csv  = [encabezado.join(',')].concat(filas).join('\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'ventas_' + hoyISO() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  mostrarAlerta('Exportacion lista', 'success');
}

// =============================================
// INIT
// =============================================
function _initVentas() {
  filtroRapido('mes');
  cargarVentas();
  var bv = document.getElementById('buscador-v');
  var ft = document.getElementById('filtro-tipo');
  var fd = document.getElementById('filtro-desde');
  var fh = document.getElementById('filtro-hasta');
  if (bv) bv.addEventListener('input',  aplicarFiltros);
  if (ft) ft.addEventListener('change', aplicarFiltros);
  if (fd) fd.addEventListener('change', aplicarFiltros);
  if (fh) fh.addEventListener('change', aplicarFiltros);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initVentas);
} else {
  _initVentas();
}
