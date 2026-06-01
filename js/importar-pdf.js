// =============================================
// importar-pdf.js
// Importación masiva de lista de precios desde PDF
// Usa PDF.js para extraer texto con posiciones y reconstruir la tabla
// =============================================

const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfFilasParseadas = [];  // todas las filas extraídas del PDF
let pdfMapeoColumnas  = { nombre: -1, peso: -1, costo: -1, minorista: -1, mayorista: -1 };
let pdfTotalColumnas  = 0;

// =============================================
// CARGAR PDF.js (lazy — solo cuando se necesita)
// =============================================
async function cargarPDFJS() {
  if (window.pdfjsLib) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      resolve();
    };
    script.onerror = () => reject(new Error('No se pudo cargar el lector de PDF'));
    document.head.appendChild(script);
  });
}

// =============================================
// EXTRAER FILAS DEL PDF CON POSICIONES
// =============================================
async function extraerFilasPDF(file) {
  await cargarPDFJS();

  const buffer = await file.arrayBuffer();
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;

  const todasFilas = [];

  for (let numPag = 1; numPag <= pdf.numPages; numPag++) {
    const pagina = await pdf.getPage(numPag);
    const tc     = await pagina.getTextContent();

    // Agrupar items por fila: misma posición Y (tolerancia 4px)
    const mapaY = {};
    for (const item of tc.items) {
      const txt = item.str.trim();
      if (!txt) continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      if (!mapaY[y]) mapaY[y] = [];
      mapaY[y].push({ txt, x: item.transform[4] });
    }

    // Ordenar filas de arriba hacia abajo, celdas de izq a der
    const filas = Object.entries(mapaY)
      .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map(i => i.txt)
      )
      .filter(f => f.length > 0);

    todasFilas.push(...filas);
  }

  return todasFilas;
}

// =============================================
// DETECTAR FILA DE ENCABEZADO
// =============================================
function detectarEncabezado(filas) {
  const palabrasClave = ['nombre','producto','descripcion','costo','precio','peso','mayor','minor','unidad','kg'];
  for (let i = 0; i < Math.min(8, filas.length); i++) {
    const texto = filas[i].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const hits  = palabrasClave.filter(p => texto.includes(p)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

// =============================================
// MAPEAR COLUMNAS SEGÚN ENCABEZADO
// =============================================
function mapearColumnasDesdeEncabezado(celdas) {
  const mapa = { nombre: -1, peso: -1, costo: -1, minorista: -1, mayorista: -1 };
  celdas.forEach((cel, i) => {
    const c = cel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (mapa.nombre    === -1 && (c.includes('nombre') || c.includes('producto') || c.includes('descripcion'))) mapa.nombre    = i;
    else if (mapa.peso === -1 && (c.includes('peso') || c.includes('kg') || c.includes('kilo') || c.includes('unidad')))     mapa.peso      = i;
    else if (mapa.costo === -1 && (c.includes('costo') || c.includes('compra')))                                             mapa.costo     = i;
    else if (mapa.minorista === -1 && (c.includes('minor') || c.includes('publ') || c.includes('venta')))                   mapa.minorista = i;
    else if (mapa.mayorista === -1 && (c.includes('mayor') || c.includes('distrib')))                                       mapa.mayorista = i;
  });
  return mapa;
}

// =============================================
// LIMPIAR NÚMERO (maneja $15.000, 15000, 15,5)
// =============================================
function limpiarNumero(texto) {
  if (!texto) return 0;
  const limpio = texto.replace(/[$\s]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  return parseFloat(limpio) || 0;
}

// =============================================
// ABRIR MODAL
// =============================================
function abrirModalImportarPDF() {
  pdfFilasParseadas = [];
  pdfMapeoColumnas  = { nombre: -1, peso: -1, costo: -1, minorista: -1, mayorista: -1 };

  const modal = document.getElementById('modal-importar-pdf');
  const paso1 = document.getElementById('pdf-paso-config');
  if (modal)  modal.style.display = 'flex';
  if (paso1)  paso1.style.display = 'none';
  document.getElementById('pdf-archivo').value = '';
  document.getElementById('pdf-estado').textContent  = '';
}

// =============================================
// PROCESAR EL ARCHIVO PDF SELECCIONADO
// =============================================
async function procesarArchivoPDF() {
  const input = document.getElementById('pdf-archivo');
  if (!input.files.length) {
    mostrarAlerta('Seleccioná un archivo PDF primero', 'warning');
    return;
  }

  const estado = document.getElementById('pdf-estado');
  const btn    = document.getElementById('btn-procesar-pdf');
  btn.disabled = true;
  estado.innerHTML = '<em>⏳ Leyendo el PDF, esperá...</em>';

  try {
    const filas = await extraerFilasPDF(input.files[0]);

    if (filas.length === 0) {
      estado.textContent = '❌ No se pudo extraer texto. ¿Es un PDF de texto (no imagen)?';
      btn.disabled = false;
      return;
    }

    const idxEncabezado = detectarEncabezado(filas);
    let encabezado = [];
    let filasDatos = filas;

    if (idxEncabezado >= 0) {
      encabezado = filas[idxEncabezado];
      filasDatos = filas.slice(idxEncabezado + 1);
    }

    pdfMapeoColumnas  = mapearColumnasDesdeEncabezado(encabezado);
    pdfFilasParseadas = filasDatos.filter(f => f.length >= 1);
    pdfTotalColumnas  = Math.max(...pdfFilasParseadas.map(f => f.length), encabezado.length, 1);

    estado.innerHTML = `✅ <strong>${pdfFilasParseadas.length} filas detectadas</strong>. Configurá las columnas abajo.`;
    mostrarConfigColumnas(encabezado);

  } catch (err) {
    console.error(err);
    estado.textContent = '❌ Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// MOSTRAR CONFIGURACIÓN DE COLUMNAS + PREVIEW
// =============================================
function mostrarConfigColumnas(encabezado) {
  const contenedor = document.getElementById('pdf-paso-config');

  function selectColumna(campo, etiqueta) {
    const actual = pdfMapeoColumnas[campo];
    const opciones = ['<option value="-1">— No usar —</option>',
      ...Array.from({ length: pdfTotalColumnas }, (_, i) => {
        const titulo = encabezado[i] ? `Col ${i+1}: "${encabezado[i]}"` : `Columna ${i+1}`;
        return `<option value="${i}" ${actual === i ? 'selected' : ''}>${titulo}</option>`;
      })
    ].join('');
    return `
      <div class="form-grupo" style="min-width:190px">
        <label>${etiqueta}</label>
        <select onchange="pdfMapeoColumnas['${campo}']=parseInt(this.value);refrescarPreviewPDF()">${opciones}</select>
      </div>`;
  }

  contenedor.innerHTML = `
    <hr style="margin:16px 0">
    <h3 style="color:var(--verde);margin-bottom:8px">Paso 2 — Asignar columnas</h3>
    <p style="font-size:13px;color:var(--gris);margin-bottom:12px">
      El sistema detectó las columnas automáticamente. Corregí si algo está mal.
    </p>

    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      ${selectColumna('nombre',    '📝 Nombre del producto *')}
      ${selectColumna('peso',      '⚖️ Peso / Unidad')}
      ${selectColumna('costo',     '💰 Costo ($)')}
      ${selectColumna('minorista', '🏪 Precio minorista ($)')}
      ${selectColumna('mayorista', '📦 Precio mayorista ($)')}
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <div class="form-grupo" style="min-width:200px">
        <label>🏷️ Marca (se aplica a todos)</label>
        <input type="text" id="pdf-marca" placeholder="Ej: Royal Canin" list="lista-marcas">
      </div>
      <div class="form-grupo" style="min-width:140px">
        <label>🐾 Especie</label>
        <select id="pdf-especie">
          <option value="perros">🐶 Perros</option>
          <option value="gatos">🐱 Gatos</option>
          <option value="ambos">Ambos</option>
        </select>
      </div>
      <div class="form-grupo" style="min-width:120px">
        <label>% Margen minorista</label>
        <input type="number" id="pdf-margen-min" value="35" min="0" max="500"
          title="Solo se usa si el PDF no tiene precio minorista">
      </div>
      <div class="form-grupo" style="min-width:120px">
        <label>% Margen mayorista</label>
        <input type="number" id="pdf-margen-may" value="20" min="0" max="500"
          title="Solo se usa si el PDF no tiene precio mayorista">
      </div>
    </div>

    <p style="font-size:12px;color:var(--gris);margin-bottom:6px">
      Primeras 8 filas detectadas (verificá que los datos se vean bien):
    </p>
    <div style="overflow-x:auto;max-height:220px;overflow-y:auto;border:1px solid var(--borde);border-radius:8px;margin-bottom:16px">
      <table class="tabla-precios" id="tabla-preview-pdf">
        <thead><tr id="thead-preview-pdf"></tr></thead>
        <tbody id="tbody-preview-pdf"></tbody>
      </table>
    </div>

    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="btn btn-verde" onclick="confirmarImportacionPDF()">
        ⬆️ Importar <strong id="pdf-cant-importar">${pdfFilasParseadas.length}</strong> productos
      </button>
      <button class="btn btn-outline" onclick="cerrarModal('modal-importar-pdf')">Cancelar</button>
    </div>
  `;

  contenedor.style.display = 'block';
  refrescarPreviewPDF();
}

// =============================================
// REFRESCAR TABLA DE PREVIEW
// =============================================
function refrescarPreviewPDF() {
  const thead = document.getElementById('thead-preview-pdf');
  const tbody = document.getElementById('tbody-preview-pdf');
  if (!thead || !tbody) return;

  // Encabezado: marcamos las columnas asignadas
  const camposAsignados = Object.entries(pdfMapeoColumnas)
    .filter(([, v]) => v >= 0)
    .reduce((acc, [k, v]) => { acc[v] = k; return acc; }, {});

  const etiquetas = { nombre: '📝 Nombre', peso: '⚖️ Peso', costo: '💰 Costo', minorista: '🏪 Minorista', mayorista: '📦 Mayorista' };

  thead.innerHTML = Array.from({ length: pdfTotalColumnas }, (_, i) => {
    const asignado = camposAsignados[i];
    const estilo   = asignado ? 'background:#e8f5e9;color:var(--verde);font-weight:700' : '';
    const label    = asignado ? etiquetas[asignado] : `Col ${i+1}`;
    return `<th style="${estilo}">${label}</th>`;
  }).join('');

  tbody.innerHTML = pdfFilasParseadas.slice(0, 8).map(fila => `
    <tr>${Array.from({ length: pdfTotalColumnas }, (_, i) => {
      const asignado = camposAsignados[i];
      const estilo   = asignado ? 'background:#f1f8e9' : '';
      return `<td style="${estilo}">${fila[i] || ''}</td>`;
    }).join('')}</tr>
  `).join('');
}

// =============================================
// CONFIRMAR E IMPORTAR A FIRESTORE
// =============================================
async function confirmarImportacionPDF() {
  const marca     = document.getElementById('pdf-marca')?.value.trim();
  const especie   = document.getElementById('pdf-especie')?.value;
  const margenMin = parseFloat(document.getElementById('pdf-margen-min')?.value) || 35;
  const margenMay = parseFloat(document.getElementById('pdf-margen-may')?.value) || 20;

  if (!marca) {
    mostrarAlerta('Ingresá la marca antes de importar', 'warning');
    document.getElementById('pdf-marca')?.focus();
    return;
  }
  if (pdfMapeoColumnas.nombre < 0) {
    mostrarAlerta('Asigná la columna "Nombre del producto"', 'warning');
    return;
  }

  const btn = document.querySelector('#pdf-paso-config .btn-verde');
  if (btn) btn.disabled = true;

  const productos = [];

  for (const fila of pdfFilasParseadas) {
    const nombre = fila[pdfMapeoColumnas.nombre]?.trim();
    if (!nombre || nombre.length < 2) continue;
    // Saltar filas que parecen subtotales o separadores
    if (/^[-=*]+$/.test(nombre)) continue;

    const peso     = pdfMapeoColumnas.peso      >= 0 ? (fila[pdfMapeoColumnas.peso]      || '') : '';
    const costo    = limpiarNumero(pdfMapeoColumnas.costo     >= 0 ? fila[pdfMapeoColumnas.costo]     : '');
    let precioMin  = limpiarNumero(pdfMapeoColumnas.minorista >= 0 ? fila[pdfMapeoColumnas.minorista] : '');
    let precioMay  = limpiarNumero(pdfMapeoColumnas.mayorista >= 0 ? fila[pdfMapeoColumnas.mayorista] : '');

    // Si no hay precio pero hay costo, calcular con el margen configurado
    if (!precioMin && costo) precioMin = Math.round(costo * (1 + margenMin / 100));
    if (!precioMay && costo) precioMay = Math.round(costo * (1 + margenMay / 100));

    const margenMinReal = costo > 0 ? Math.round(((precioMin - costo) / costo) * 100) : margenMin;
    const margenMayReal = costo > 0 ? Math.round(((precioMay - costo) / costo) * 100) : margenMay;

    productos.push({
      nombre,
      marca,
      especie,
      unidadPeso:          peso.trim(),
      costo,
      precioMinorista:     precioMin,
      precioMayorista:     precioMay,
      margenMinorista:     margenMinReal,
      margenMayorista:     margenMayReal,
      ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  if (productos.length === 0) {
    mostrarAlerta('No se encontraron productos válidos. Revisá el mapeo de columnas.', 'warning');
    if (btn) btn.disabled = false;
    return;
  }

  try {
    // Firestore batch: máximo 500 operaciones por lote
    const LOTE_MAX = 400;
    let importados = 0;

    for (let i = 0; i < productos.length; i += LOTE_MAX) {
      const porcion = productos.slice(i, i + LOTE_MAX);
      const batch   = db.batch();
      for (const p of porcion) {
        batch.set(db.collection('precios').doc(), p);
      }
      awai