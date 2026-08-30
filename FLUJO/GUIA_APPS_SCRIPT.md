# Conectar el formulario al Google Sheet

El formulario (`index.html`) es una página HTML estática: no tiene backend propio.
Para que el botón **GUARDAR** escriba una fila en tu Google Sheet, hay que publicar
un pequeño script de Google (Apps Script) como "Web App" y pegar su URL en el
formulario. Se hace una sola vez, dura 5 minutos.

## Pasos

1. Abre el Google Sheet que quieras conectar a este formulario.

2. Ve a **Extensiones → Apps Script**.

3. Borra el contenido de `Code.gs` y pega todo el contenido del archivo
   [`apps_script.gs`](apps_script.gs) que está en esta misma carpeta (`FLUJO/`).

4. Guarda el proyecto (ícono de disquete o Ctrl+S). Ponle un nombre, ej.
   "Recibir ventas formulario".

5. Haz clic en **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Descripción: la que quieras.
   - "Ejecutar como": **Yo (tu cuenta)**.
   - "Quién tiene acceso": **Cualquier usuario**.
   - Clic en **Implementar**.

6. Google pedirá autorizar permisos (porque el script escribe en tu Sheet).
   Acepta con tu cuenta.

7. Copia la **URL de la aplicación web** que te entrega (termina en `/exec`).

8. Abre `FLUJO/index.html` y busca esta línea cerca del inicio del `<script>`:

   ```js
   var GOOGLE_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";
   ```

   Reemplaza el texto entre comillas por la URL que copiaste. Guarda el archivo.

9. Listo. El script crea las pestañas solo (con encabezados, la primera vez que
   les llega algo):

   - **"Borradores"**: autoguardado en vivo. Mientras el agente llena el
     formulario, cada ~3 segundos se sincroniza una fila con el avance actual
     (como el autoguardado de Google Drive). Si se apaga la PC / se va la luz
     y se vuelve a abrir `index.html`, el formulario se restaura solo desde el
     navegador (`localStorage`) — el Sheet es un respaldo adicional, no
     depende de él para restaurar.
   - **"Ventas"**: se agrega una fila nueva solo cuando se presiona **GUARDAR**
     (haya salido SI o NO en ¿SE VENDIÓ?). En ese momento la fila
     correspondiente en "Borradores" se borra, porque esa llamada ya no está
     "en progreso".
   - **"Llamadas Agendadas"**: se agrega una fila cada vez que se usa el botón
     **"📅 Agendar llamada"** del encabezado y se guarda la cita (fecha, hora,
     número, celular/celular referencia, nombre, equipo de interés y
     observación). Esta hoja también funciona como base de datos compartida:
     el modal **"Casos agendados"** y la alerta de llamada agendada leen de
     acá (vía `doGet`) para que un caso agendado desde un navegador/asesor
     aparezca en cualquier otro, no solo en el que lo creó.
   - **"Contacto efectivo" / "No contacto efectivo" / "No contacto"**: se
     agrega una fila (mismas columnas que "Ventas") cada vez que se usa el
     botón **"🏷️ Tipificar"** (encabezado o junto a GUARDAR) y se elige una de
     estas 3 opciones. No exige que "¿SE VENDIÓ?" esté contestado — pensado
     para casos que no llegan a completar todo el formulario (ej. el cliente
     no contesta). Igual que con GUARDAR, el formulario se limpia solo y
     empieza un caso nuevo.

## Notas

- El progreso solo se reinicia al presionar **GUARDAR**. Mientras no se
  presione, el formulario queda guardado en el navegador y se restaura
  automáticamente al reabrir `index.html` (verás un aviso "Se restauró una
  llamada que quedó en progreso"). El botón **"Empezar de nuevo"** de ese
  aviso descarta el borrador a propósito.
- Si más adelante cambias campos del formulario, actualiza también los
  arreglos `COLUMNAS_VENTA` / `COLUMNAS_BORRADOR` / `COLUMNAS_AGENDA` en
  `apps_script.gs` y vuelve a hacer **Implementar → Administrar
  implementaciones → Editar (lápiz) → Nueva versión** para que el cambio se
  publique (la URL no cambia).
- El envío usa `mode: "no-cors"`, así que el navegador no puede leer la
  respuesta del script (limitación de Apps Script Web Apps); el formulario
  asume éxito si el `fetch` no lanza error de red. Si no hay internet, el
  autoguardado local sigue funcionando igual; solo la sincronización con el
  Sheet queda pendiente hasta que vuelva la conexión.
