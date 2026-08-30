/**
 * Envio automatico de WhatsApp via Twilio (WhatsApp Business API), sin abrir WhatsApp del
 * lado del asesor. Vercel Serverless Function — no usa ningun paquete npm (solo fetch/
 * Buffer/URLSearchParams, globales en el runtime de Node de Vercel), asi que no hace falta
 * package.json ni instalar nada.
 *
 * Requiere 3 variables de entorno en Vercel (Project Settings -> Environment Variables):
 *   TWILIO_ACCOUNT_SID    - Account SID de la cuenta de Twilio
 *   TWILIO_AUTH_TOKEN     - Auth Token de esa misma cuenta
 *   TWILIO_WHATSAPP_FROM  - numero de WhatsApp habilitado en Twilio, con codigo de pais y
 *                           SIN el prefijo "whatsapp:" (ej. "+14155238886" para el sandbox,
 *                           o el numero de produccion ya aprobado por Meta)
 *
 * Sin esas 3 variables cargadas, este endpoint responde { ok:false, configurado:false } en
 * vez de fallar oscuro — el frontend usa ese campo para explicarle al asesor que la funcion
 * todavia no esta activa, y mientras tanto sigue ofreciendo el enlace wa.me / codigo QR
 * (gratis, ya funcionando) como alternativa.
 *
 * OJO — politica de WhatsApp/Meta: este endpoint manda TEXTO LIBRE. Eso solo se entrega si
 * el cliente ya le escribio a este numero antes y la conversacion sigue dentro de la ventana
 * de 24 horas desde su ultimo mensaje. Para el PRIMER contacto (o fuera de esa ventana), Meta
 * exige usar una "plantilla" (template) pre-aprobada — un mensaje libre en ese caso Twilio lo
 * rechaza (o, peor, puede derivar en que Meta suspenda el numero por spam). Si se necesita
 * iniciar conversaciones en frio, hay que crear y aprobar plantillas en el Twilio/Meta
 * Business Manager primero; este endpoint no las maneja todavia.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido" });
    return;
  }

  var sid = process.env.TWILIO_ACCOUNT_SID;
  var token = process.env.TWILIO_AUTH_TOKEN;
  var from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    res.status(200).json({
      ok: false,
      configurado: false,
      error: "Falta configurar TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM en Vercel."
    });
    return;
  }

  var numero = ((req.body && req.body.numero) || "").replace(/\D/g, "");
  var mensaje = ((req.body && req.body.mensaje) || "").trim();
  if (numero.length === 9) numero = "51" + numero; // celular peruano sin codigo de pais

  if (!numero || numero.length < 9) {
    res.status(400).json({ ok: false, error: "Número inválido." });
    return;
  }
  if (!mensaje) {
    res.status(400).json({ ok: false, error: "Falta el mensaje." });
    return;
  }

  try {
    var auth = Buffer.from(sid + ":" + token).toString("base64");
    var body = new URLSearchParams({
      From: "whatsapp:" + from,
      To: "whatsapp:+" + numero,
      Body: mensaje
    });

    var resp = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    var data = await resp.json();

    if (!resp.ok) {
      res.status(200).json({ ok: false, error: data.message || "Twilio rechazó el envío.", detalle: data });
      return;
    }
    res.status(200).json({ ok: true, sid: data.sid, estado: data.status });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err) });
  }
};
