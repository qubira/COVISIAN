/**
 * Google Apps Script para recibir los envíos del formulario (FLUJO/index.html)
 * y escribirlos en el Google Sheet al que este script esté vinculado (Extensiones →
 * Apps Script del propio Sheet — ver GUIA_APPS_SCRIPT.md).
 *
 * Maneja 6 tipos de envio (campo "accion" en el POST):
 *  - "venta"               (o sin campo accion): agrega una fila nueva en la hoja "Ventas"
 *                            si datos.vendido="SI", o en la hoja "No venta" si es "NO".
 *  - "borrador"             : autoguardado en progreso -> upsert (crea o actualiza) una fila
 *                            en la hoja "Borradores", identificada por draftId.
 *  - "cerrarBorrador"       : se presiono GUARDAR -> borra esa fila de "Borradores".
 *  - "agendarLlamada"       : boton "Agendar llamada" -> agrega una fila en "Llamadas Agendadas".
 *  - "actualizarEstadoAgenda": botones "Tomar caso"/"Concretado" -> actualiza la columna
 *                            "estado" de la fila con ese id en "Llamadas Agendadas".
 *  - "editarAgenda"        : boton "Editar" de un caso agendado -> actualiza fecha/hora/
 *                            celReferencia/equipoInteres/tipoCliente/observacion de la fila
 *                            con ese id en "Llamadas Agendadas" (no toca "estado").
 *  - "eliminarAgenda"      : boton "Eliminar" de un caso agendado -> borra esa fila de
 *                            "Llamadas Agendadas".
 *  - "tipificacion"        : boton "Tipificar" -> agrega una fila (mismas columnas que
 *                            "Ventas") en la hoja con el nombre exacto de datos.tipificacion
 *                            ("Contacto efectivo" / "No contacto efectivo" / "No contacto"),
 *                            creandola si todavia no existe.
 *
 * Tambien responde GET (?accion=listarCitas): devuelve todas las filas de "Llamadas
 * Agendadas" en JSONP, para que "Casos agendados" funcione como base de datos compartida
 * entre navegadores (ver doGet mas abajo).
 *
 * Ver pasos de instalacion en GUIA_APPS_SCRIPT.md
 */

var HOJA_VENTAS = "Ventas";
var HOJA_NO_VENTA = "No venta";
var HOJA_BORRADORES = "Borradores";
var HOJA_AGENDA = "Llamadas Agendadas";
var TIPIFICACIONES_VALIDAS = ["Contacto efectivo", "No contacto efectivo", "No contacto"];

var COLUMNAS_VENTA = [
  "fecha", "guionAni", "guionAniReferencia", "guionDni", "guionEsTitular", "guionNombreCliente", "guionNombreTitular", "guionNumero",
  "zondeoPedidoPendiente", "zondeoNumeroPedidoPendiente", "zondeoPenalidadActiva", "zondeoFechaPenalidad", "zondeoNuevoNumero", "zondeoMontoPendiente", "zondeoNumeroLibrePenalidad",
  "plan",
  "distrito", "provincia", "departamento", "direccion", "direccionReferencia",
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
  "zondeoPedidoPendiente", "zondeoNumeroPedidoPendiente", "zondeoPenalidadActiva", "zondeoFechaPenalidad", "zondeoNuevoNumero", "zondeoMontoPendiente", "zondeoNumeroLibrePenalidad",
  "plan",
  "distrito", "provincia", "departamento", "direccion", "direccionReferencia",
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

// "tipoCliente" se agrego al FINAL a proposito (no despues de "equipoInteres", donde
// tendria mas sentido semantico) — las filas ya existentes en la hoja "Llamadas Agendadas"
// no tienen esa columna, y como guardarAgenda/listarCitas mapean por POSICION, insertarla
// en el medio habria desalineado "estado" (la ultima columna real hoy) para todas las citas
// viejas. Al ir al final, una fila vieja simplemente lee tipoCliente como vacio/undefined —
// no rompe nada de lo que ya existe.
var COLUMNAS_AGENDA = [
  "id", "agendadoEn", "fecha", "hora", "cel", "celReferencia", "nombre",
  "equipoInteres", "observacion", "estado", "tipoCliente"
];

// GET: usado para que "Casos agendados" pueda leer el Sheet como base de datos compartida
// (cualquier navegador ve las mismas citas, no solo las que agendo ese mismo navegador).
// Se responde en formato JSONP (no JSON plano) porque los Web Apps de Apps Script no dejan
// mandar el header Access-Control-Allow-Origin, asi que un fetch() cruzado normal quedaria
// bloqueado por CORS del navegador — un <script src="..."> (que es como se consume JSONP)
// no esta sujeto a esa restriccion.
function doGet(e) {
  var accion = (e.parameter && e.parameter.accion) || "";
  var payload;
  if (accion === "listarCitas") {
    payload = { ok: true, citas: listarCitas() };
  } else {
    payload = { ok: false, error: "accion GET desconocida" };
  }
  var callback = e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return respuestaJson(payload);
}

// "v instanceof Date" no detecta de forma confiable los objetos Date que devuelve
// getValues() para celdas de Sheets en algunos contextos de ejecucion de Apps Script
// (comprobado con testListarCitas: instanceof fallaba en silencio y dejaba pasar el Date
// crudo). Object.prototype.toString.call() es la forma robusta de chequear esto — no
// depende de que el objeto haya sido creado en el mismo "realm"/contexto que el Date
// global de este archivo.
function esFechaJS(v) {
  return Object.prototype.toString.call(v) === "[object Date]";
}

// Sheets auto-convierte "fecha"/"hora" a celdas de tipo Fecha/Hora reales aunque el
// codigo las escriba como texto plano — getValues() las devuelve como objetos Date, que
// JSON.stringify() serializaria como ISO completo (con la fecha epoch 1899-12-30 pegada a
// la hora, o la zona horaria corriendo el dia de la fecha). Hay que reconstruir a mano el
// "yyyy-MM-dd"/"HH:mm" que el frontend espera, o minutosHastaCita() nunca puede parsearlos.
function listarCitas() {
  var hoja = obtenerOCrearHoja(HOJA_AGENDA, COLUMNAS_AGENDA);
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];
  var valores = hoja.getRange(2, 1, ultimaFila - 1, COLUMNAS_AGENDA.length).getValues();
  var tz = Session.getScriptTimeZone();
  return valores.map(function (fila) {
    var obj = {};
    COLUMNAS_AGENDA.forEach(function (campo, i) {
      var v = fila[i];
      if (esFechaJS(v)) {
        if (campo === "fecha") v = Utilities.formatDate(v, tz, "yyyy-MM-dd");
        else if (campo === "hora") v = Utilities.formatDate(v, tz, "HH:mm");
        else v = v.toISOString();
      }
      obj[campo] = v;
    });
    return obj;
  });
}

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
    } else if (accion === "editarAgenda") {
      editarAgenda(datos);
    } else if (accion === "eliminarAgenda") {
      eliminarAgenda(datos.id);
    } else if (accion === "tipificacion") {
      guardarTipificacion(datos);
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

// GUARDAR: si el agente marco "¿SE VENDIÓ?" = NO, la fila va a la hoja "No venta" en vez de
// "Ventas" (mismas columnas/COLUMNAS_VENTA, incluida "motivo") — separadas para que los
// reportes de ventas reales no tengan que filtrar/excluir los "NO" a mano.
function guardarVenta(datos) {
  var nombreHoja = datos.vendido === "NO" ? HOJA_NO_VENTA : HOJA_VENTAS;
  var hoja = obtenerOCrearHoja(nombreHoja, COLUMNAS_VENTA);
  var fila = COLUMNAS_VENTA.map(function (campo) {
    return datos[campo] !== undefined ? datos[campo] : "";
  });
  hoja.appendRow(fila);
}

// Boton "Tipificar": mismo snapshot completo que "venta" (COLUMNAS_VENTA), pero cada
// tipificacion tiene su propia hoja (se crea sola la primera vez, como cualquier otra
// hoja de este script). Nombre de hoja restringido a las 3 tipificaciones conocidas para
// que un valor inesperado del frontend no cree una hoja nueva por error de tipeo.
function guardarTipificacion(datos) {
  var nombreHoja = datos.tipificacion;
  if (TIPIFICACIONES_VALIDAS.indexOf(nombreHoja) === -1) {
    throw new Error("Tipificación desconocida: " + nombreHoja);
  }
  var hoja = obtenerOCrearHoja(nombreHoja, COLUMNAS_VENTA);
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

// Boton "Editar" de un caso agendado: actualiza solo los campos que el modal "Agendar
// llamada" deja editar (los mismos de siempre, tanto al crear como al editar). No toca
// "estado" a proposito -- si otro navegador ya tomo/concreto el caso mientras este se
// editaba, esa columna no debe revertirse con el valor local (posiblemente desactualizado)
// que traiga el POST.
var CAMPOS_EDITABLES_AGENDA = ["fecha", "hora", "celReferencia", "equipoInteres", "tipoCliente", "observacion"];
function editarAgenda(datos) {
  var hoja = obtenerOCrearHoja(HOJA_AGENDA, COLUMNAS_AGENDA);
  var filaExistente = buscarFilaPorDraftId(hoja, datos.id);
  if (filaExistente <= 0) return;
  CAMPOS_EDITABLES_AGENDA.forEach(function (campo) {
    if (datos[campo] === undefined) return;
    var col = COLUMNAS_AGENDA.indexOf(campo) + 1;
    hoja.getRange(filaExistente, col).setValue(datos[campo]);
  });
}

// Boton "Eliminar" de un caso agendado: borra la fila definitivamente (mismo patron que
// cerrarBorrador con HOJA_BORRADORES).
function eliminarAgenda(id) {
  var hoja = obtenerOCrearHoja(HOJA_AGENDA, COLUMNAS_AGENDA);
  var filaExistente = buscarFilaPorDraftId(hoja, id);
  if (filaExistente > 0) {
    hoja.deleteRow(filaExistente);
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
// "direccionReferencia" tampoco viaja tal cual: el frontend manda "direccionReferencias"
// (en plural, un array) porque asi lo necesita para poder restaurar el borrador — se une con
// " | " igual que en el registro final de "venta", si no esta columna queda siempre vacia.
function valorBorrador(datos, campo) {
  if (campo === "distrito" || campo === "provincia" || campo === "departamento") {
    return datos.seleccionCobertura ? (datos.seleccionCobertura[campo] || "") : "";
  }
  if (campo === "direccionReferencia") {
    return Array.isArray(datos.direccionReferencias) ? datos.direccionReferencias.join(" | ") : "";
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
