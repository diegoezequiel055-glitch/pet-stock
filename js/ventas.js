// =============================================
// ventas.js v4 — Historial de Ventas + Caja PetShop
// =============================================

// ---- ESTADO ----
var ventasCache = [];
var cajaCache   = [];

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
          id:       doc.id,
          tipo:     d.tipo           || 'bolsa',
          nombre:   d.nombreProducto,
          cantidad: d.cantidad       || 0,
          precio:   d.precioVenta    || 0,
          total:    d.totalVenta     || 0,
          costo:    d.costoFIFO      || d.costo || 0,
          ganancia: d.ganancia       || 0,
          cliente:  d.cliente        || '-',
          audio:    d.origenAudio    || false,
          fecha:    d.fecha
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
  renderCierresDiarios(filtradaCaja);

  var cont = document.getElementById('contador-ventas');
  if (cont) cont.textContent = filtradas.length + ' resultado' + (filtradas.length !== 1 ? 's' : '');
}

// =============================================
// RENDER RESUMEN (TARJETAS)
// =============================================
function renderResumen(lista, cajaFiltrada) {
  var totalVentas    = lista.length;
  var totalFacturado = lista.reduce(function(s, v) { return s + v.total; }, 0);
  var totalCosto     = lista.reduce(function(s, v) { return s + v.costo; }, 0);
  var gananciaBolsas = lista.reduce(function(s, v) { return s + v.ganancia; }, 0);

  var totalCierre     = cajaFiltrada.filter(function(r) { return r.tipo === 'cierre' || r.tipo === 'otro'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalFarmacia   = cajaFiltrada.filter(function(r) { return r.tipo === 'farmacia'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalAccesorios = cajaFiltrada.filter(function(r) { return r.tipo === 'accesorios'; }).reduce(function(s, r) { return s + r.monto; }, 0);

  var gananciaCierre     = totalCierre     * 0.40;
  var gananciaFarmacia   = totalFarmacia   * 0.60;
  var gananciaAccesorios = totalAccesorios * 1.00;

  var totalGanancia = gananciaBolsas + gananciaCierre + gananciaFarmacia + gananciaAccesorios;
  var totalCaja     = totalFacturado + totalCierre + totalFarmacia + totalAccesorios;
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
  set('res-farmacia-gan',   '💰 Ganancia est.: ' + formatPrecio(gananciaFarmacia) + '\n(60% sobre ventas de farmacia)');

  set('res-acc-total', formatPrecio(totalAccesorios));
  set('res-acc-gan',   '💰 Ganancia est.: ' + formatPrecio(gananciaAccesorios) + '\n(100% — ganancia total sobre accesorios)');
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
    var abierto = idx === 0;

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
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-size:15px;font-weight:700;color:#e2e8f0">' + formatPrecio(v.total) + '</div>' +
        '<div style="font-size:11px;color:' + gananciaColor + '">G: ' + formatPrecio(v.ganancia) + ' (' + margenPct + '%)</div>' +
      '</div>' +
    '</div>' +
  '</div>';
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
function renderCierresDiarios(cajaFiltrada) {
  var contenedor = document.getElementById('lista-cierres-dias');
  if (!contenedor) return;

  if (cajaFiltrada.length === 0) {
    contenedor.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:14px">Sin registros en el período</div>';
    return;
  }

  var porDia = {};
  cajaFiltrada.forEach(function(r) {
    var iso = r.fechaISO || (r.fecha && r.fecha.toDate ? r.fecha.toDate().toISOString().slice(0, 10) : '');
    if (!iso) return;
    if (!porDia[iso]) porDia[iso] = [];
    porDia[iso].push(r);
  });

  var dias = Object.keys(porDia).sort().reverse();
  var html = '';

  dias.forEach(function(diaISO, idx) {
    var items    = porDia[diaISO];
    var abierto  = idx === 0;

    var accesorios = items.filter(function(r) { return r.tipo === 'accesorios'; });
    var farmacia   = items.filter(function(r) { return r.tipo === 'farmacia'; });
    var cierres    = items.filter(function(r) { return r.tipo === 'cierre' || r.tipo === 'otro'; });

    var totalAcc  = accesorios.reduce(function(s, r) { return s + r.monto; }, 0);
    var totalFarm = farmacia.reduce(function(s, r) { return s + r.monto; }, 0);
    var totalCier = cierres.reduce(function(s, r) { return s + r.monto; }, 0);
    var totalDia  = items.reduce(function(s, r) { return s + r.monto; }, 0);

    var ganAcc   = totalAcc  * 1.00;
    var ganFarm  = totalFarm * 0.60;
    var ganCier  = totalCier * 0.40;
    var ganTotal = ganAcc + ganFarm + ganCier;

    var partes   = diaISO.split('-');
    var diaLabel = partes[2] + '/' + partes[1] + '/' + partes[0];

    function renderItemsLista(lista) {
      if (lista.length === 0) return '<div style="font-size:12px;color:#475569;padding:4px 0">Sin registros</div>';
      return lista.map(function(r) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #1e3a5f">' +
          '<span style="color:#94a3b8">' + (r.notas || '—') + '</span>' +
          '<span style="color:#e2e8f0;font-weight:600">' + formatPrecio(r.monto) + '</span>' +
        '</div>';
      }).join('');
    }

    html += '<div class="dia-acord" style="margin-bottom:8px">';
    html += '<div onclick="toggleDiaVentas(this)" style="' +
      'display:flex;justify-content:space-between;align-items:center;' +
      'background:#1e293b;border:1px solid #334155;' +
      'border-radius:' + (abierto ? '10px 10px 0 0' : '10px') + ';' +
      'padding:12px 16px;cursor:pointer;user-select:none;">' +
      '<span style="font-size:14px;font-weight:700;color:#e2e8f0">📅 ' + diaLabel + '</span>' +
      '<span style="display:flex;align-items:center;gap:12px">' +
        '<span style="font-size:13px;font-weight:700;color:#f97316">' + formatPrecio(totalDia) + '</span>' +
        '<span class="dia-arrow" style="color:' + (abierto ? '#4ade80' : '#64748b') + ';font-size:12px">' + (abierto ? '▼' : '▶') + '</span>' +
      '</span>' +
    '</div>';

    html += '<div style="display:' + (abierto ? 'block' : 'none') + ';' +
      'background:#0d1625;border:1px solid #334155;border-top:none;border-radius:0 0 10px 10px;padding:12px 14px">';

    if (accesorios.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:4px">🧸 Accesorios</div>';
      html += renderItemsLista(accesorios);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalAcc) + '</div>';
    }
    if (farmacia.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#67e8f9;margin-bottom:4px">💊 Farmacia</div>';
      html += renderItemsLista(farmacia);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalFarm) + '</div>';
    }
    if (cierres.length > 0) {
      html += '<div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:4px">🏪 Cierre / Otros</div>';
      html += renderItemsLista(cierres);
      html += '<div style="font-size:12px;text-align:right;color:#e2e8f0;font-weight:700;padding-top:4px;margin-bottom:10px">Subtotal: ' + formatPrecio(totalCier) + '</div>';
    }

    html += '<div style="background:#162032;border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;margin-top:4px">';
    html += '<div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:6px">💰 Ganancia estimada del día: ' + formatPrecio(ganTotal) + '</div>';
    if (totalAcc  > 0) html += '<div style="font-size:12px;color:#94a3b8">🧸 Accesorios (100%): <span style="color:#a78bfa">' + formatPrecio(ganAcc)  + '</span></div>';
    if (totalFarm > 0) html += '<div style="font-size:12px;color:#94a3b8">💊 Farmacia (60%): <span style="color:#67e8f9">'   + formatPrecio(ganFarm) + '</span></div>';
    if (totalCier > 0) html += '<div style="font-size:12px;color:#94a3b8">🏪 Cierre (40%): <span style="color:#fbbf24">'     + formatPrecio(ganCier) + '</span></div>';
    html += '</div>';

    html += '</div></div>';
  });

  contenedor.innerHTML = html;
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
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
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
