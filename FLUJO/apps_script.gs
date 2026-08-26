/**
 * Google Apps Script para recibir los envíos del formulario (FLUJO/index.html)
 * y escribirlos en el Google Sheet:
 * https://docs.google.com/spreadsheets/d/1HHSIzZ9rVhyX05RmryG_0Ej9QVB8Vd8BMJKLtJ1Kk_U/edit
 *
 * Maneja 5 tipos de envio (campo "accion" en el POST):
 *  - "venta"               (o sin campo accion): agrega una fila nueva en la hoja "Ventas".
 *  - "borrador"             : autoguardado en progreso -> upsert (crea o actualiza) una fila
 *                            en la hoja "Borradores", identificada por draftId.
 *  - "cerrarBorrador"       : se presiono GUARDAR -> borra esa fila de "Borradores".
 *  - "agendarLlamada"       : boton "Agendar llamada" -> agrega una fila en "Llamadas Agendadas".
 *  - "actualizarEstadoAgenda": botones "Tomar caso"/"Concretado" -> actualiza la columna
 *                            "estado" de la fila con ese id en "Llamadas Agendadas".
 *
 * Ver pasos de instalacion en GUIA_APPS_SCRIPT.md
 */

var HOJA_VENTAS = "Ventas";
var HOJA_BORRADORES = "Borradores";
var HOJA_AGENDA = "Llamadas Agendadas";

var COLUMNAS_VENTA = [
  "fecha", "guionAni", "guionAniReferencia", "guionDni", "guionEsTitular", "guionNombreCliente", "guionNombreTitular", "guionNumero",
  "zondeoPedidoPendiente", "zondeoNumeroPedidoPendiente", "zondeoPenalidadActiva", "zondeoFechaPenalidad", "zondeoNuevoNumero",
  "plan",
  "distrito", "provincia", "departamento", "direccion",
  "express", "expressHasta", "regularRango", "regularDia",
  "cargoFijoMaximo", "codFinanciamiento", "capFinanciamiento", "creditoTipoGestion", "creditoCuotas", "creditoAplicaEspecial",
  "tipo", "subtipo",
  "equipoActualCliente", "marcaFavorita", "equipoValora", "presupuestoEquipo",
  "equipo", "equipoMarca", "equipoModelo", "equipoGama", "equipoPantalla",
  "equipoRom", "equipoRam", "equipoCamara", "equipoSelfie", "equipoBateria",
  "equipoProcesador", "equipoColoresStock", "equipoSo", "equipoPack",
  "costoConvenio", "costoPlanUsado", "costoMonto", "costoPagoMensual", "medioPago",
  "resumenColorEquipo",
  "contratoFechaNacimiento", "contratoNombrePadreMadre", "contratoCorreo",
  "contratoValidNombre", "contratoValidDni", "contratoValidFechaNac", "contratoValidPadreMadre", "contratoValidCorreo",
  "contratoTelRef1", "contratoTelRef2",
  "contratoCicloInicio", "contratoCicloVencimiento",
  "contratoConsentimientoComercial",
  "contratoTipoEntrega", "contratoBiometria",
  "contratoTipoDomicilio", "contratoCLEmpresa", "contratoCLArea", "contratoCLCargo", "contratoCLPiso",
  "contratoLCNombre", "contratoLCArea", "contratoLCPiso",
  "contratoPermanenciaMeses", "contratoMontoPenalidad",
  "contratoAceptacionEquipo", "contratoConsentimientoDatosLeido",
  "bitacoraRebate", "cantidadObjeciones", "negativaResultado",
  "vendido", "motivo"
];

var COLUMNAS_BORRADOR = [
  "draftId", "actualizado", "guionAni", "guionAniReferencia", "guionDni", "guionEsTitular", "guionNombreCliente", "guionNombreTitular", "guionNumero",
  "zondeoPedidoPendiente", "zondeoNumeroPedidoPendiente", "zondeoPenalidadActiva", "zondeoFechaPenalidad", "zondeoNuevoNumero",
  "plan",
  "distrito", "provincia", "departamento", "direccion",
  "cargoFijoMaximo", "codFinanciamiento", "capFinanciamiento", "creditoTipoGestion", "creditoCuotas", "creditoAplicaEspecial",
  "tipo", "subtipo", "equipoActualCliente", "marcaFavorita", "equipoValora", "presupuestoEquipo",
  "equipo", "convenioCosto", "medioPago", "resumenColorEquipo",
  "contratoFechaNacimiento", "contratoNombrePadreMadre", "contratoCorreo",
  "contratoTelRef1", "contratoTelRef2",
  "contratoCicloInicio", "contratoCicloVencimiento",
  "contratoConsentimientoComercial",
  "contratoTipoEntrega", "contratoBiometria",
  "contratoTipoDomicilio", "contratoCLEmpresa", "contratoCLArea", "contratoCLCargo", "contratoCLPiso",
  "contratoLCNombre", "contratoLCArea", "contratoLCPiso",
  "contratoPermanenciaMeses", "contratoMontoPenalidad",
  "contratoAceptacionEquipo",
  "bitacoraRebate", "negativaResultado",
  "vendido", "motivo"
];

var COLUMNAS_AGENDA = [
  "id", "agendadoEn", "fecha", "hora", "cel", "celReferencia", "nombre",
  "equipoInteres", "observacion", "estado"
];

function doPost(e) {
  // Varios agentes pueden guardar al mismo tiempo. Sin lock, dos "borrador" casi
  // simultáneos para el mismo draftId podrían leer la hoja antes de que el otro
  // termine de escribir y duplicar la fila en vez de actualizarla.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return respuestaJson({ ok: false, error: "No se pudo obtener el lock: " + lockErr.toString() });
  }

  try {
    var datos = JSON.parse(e.postData.contents);
    var accion = datos.accion || "venta";

    if (accion === "borrador") {
      guardarBorrador(datos);
    } else if (accion === "cerrarBorrador") {
      cerrarBorrador(datos.draftId);
    } else if (accion === "agendarLlamada") {
      guardarAgenda(datos);
    } else if (accion === "actualizarEstadoAgenda") {
      actualizarEstadoAgenda(datos.id, datos.estado);
    } else {
      guardarVenta(datos);
    }

    return respuestaJson({ ok: true });
  } catch (err) {
    return respuestaJson({ ok: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function guardarVenta(datos) {
  var hoja = obtenerOCrearHoja(HOJA_VENTAS, COLUMNAS_VENTA);
  var fila = COLUMNAS_VENTA.map(function (campo) {
    return datos[campo] !== undefined ? datos[campo] : "";
  });
  hoja.appendRow(fila);
}

// Autoguardado: si ya existe una fila con este draftId la actualiza (como el autoguardado
// de Drive); si no existe, la crea. Así el Sheet siempre refleja el avance en vivo.
function guardarBorrador(datos) {
  var hoja = obtenerOCrearHoja(HOJA_BORRADORES, COLUMNAS_BORRADOR);
  var filaExistente = buscarFilaPorDraftId(hoja, datos.draftId);

  var fila = COLUMNAS_BORRADOR.map(function (campo) {
    return valorBorrador(datos, campo);
  });

  if (filaExistente > 0) {
    hoja.getRange(filaExistente, 1, 1, fila.length).setValues([fila]);
  } else {
    hoja.appendRow(fila);
  }
}

function guardarAgenda(datos) {
  var hoja = obtenerOCrearHoja(HOJA_AGENDA, COLUMNAS_AGENDA);
  var fila = COLUMNAS_AGENDA.map(function (campo) {
    return datos[campo] !== undefined ? datos[campo] : "";
  });
  hoja.appendRow(fila);
}

// "Tomar caso" / "Concretado": actualiza solo la columna "estado" de la cita con ese id.
// Reutiliza buscarFilaPorDraftId porque busca por columna 1 (aqui "id" tambien es la
// primera columna de COLUMNAS_AGENDA), igual que hace con draftId en Borradores.
function actualizarEstadoAgenda(id, estado) {
  var hoja = obtenerOCrearHoja(HOJA_AGENDA, COLUMNAS_AGENDA);
  var filaExistente = buscarFilaPorDraftId(hoja, id);
  if (filaExistente > 0) {
    var colEstado = COLUMNAS_AGENDA.indexOf("estado") + 1;
    hoja.getRange(filaExistente, colEstado).setValue(estado);
  }
}

// Se llama cuando el agente presiona GUARDAR: la llamada ya no esta "en progreso".
function cerrarBorrador(draftId) {
  var hoja = obtenerOCrearHoja(HOJA_BORRADORES, COLUMNAS_BORRADOR);
  var filaExistente = buscarFilaPorDraftId(hoja, draftId);
  if (filaExistente > 0) {
    hoja.deleteRow(filaExistente);
  }
}

function buscarFilaPorDraftId(hoja, draftId) {
  if (!draftId) return -1;
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return -1;
  var ids = hoja.getRange(2, 1, ultimaFila - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === draftId) return i + 2;
  }
  return -1;
}

// "distrito"/"provincia"/"departamento" del borrador viajan dentro de seleccionCobertura.
function valorBorrador(datos, campo) {
  if (campo === "distrito" || campo === "provincia" || campo === "departamento") {
    return datos.seleccionCobertura ? (datos.seleccionCobertura[campo] || "") : "";
  }
  return datos[campo] !== undefined ? datos[campo] : "";
}

function obtenerOCrearHoja(nombre, columnas) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
    hoja.appendRow(columnas);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function respuestaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
