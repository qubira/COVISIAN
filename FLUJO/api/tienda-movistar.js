// Lee el catalogo real de tienda.movistar.com.pe (celulares en renovacion) cada vez que
// alguien abre tienda-movistar.html.
//
// OJO — por que esto abre un navegador de verdad en vez de solo hacer fetch():
// La PAGINA de la tienda esta detras de Cloudflare y bloquea cualquier fetch que no sea un
// navegador real. Se probo (2026-08-28) que ni siquiera el fetch() nativo de Node (con el
// mismo User-Agent que un navegador real) pasa el bloqueo — Cloudflare distingue la huella
// TLS/HTTP del cliente, no solo los headers, y detecta que no es un navegador de verdad. curl
// si pasaba, pero Vercel usa el mismo motor de fetch que Node, asi que una funcion liviana NO
// es confiable en produccion. La unica forma confirmada que funciona es abrir un Chromium
// real (headless) — de ahi @sparticuz/chromium + puppeteer-core.
//
// Esto es mas lento (varios segundos por arranque de Chromium) y mas fragil que un fetch
// normal: si Movistar refuerza la deteccion de bots contra navegadores headless especificamente,
// esto podria dejar de funcionar sin aviso. Se cachea la respuesta (Cache-Control) para no
// tener que levantar Chromium en cada visita.
//
// @sparticuz/chromium y puppeteer-core se publican como ES Module en sus versiones recientes
// (require() tira ERR_REQUIRE_ESM en ambos) — por eso este archivo es ESM (package.json tiene
// "type":"module") en vez de CommonJS.
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

function transformarProductos(data) {
  return (data.products || []).map(function (p) {
    var precioRegular = p.price;
    var precioOferta = p.special_price;
    var descuentoPct = precioRegular > 0 ? Math.round((precioRegular - precioOferta) / precioRegular * 100) : 0;

    var planesVistos = {};
    var planes = [];
    (p.plans || []).forEach(function (pl) {
      var nombrePlan = String(pl.plan_comercial || "").replace(/<[^>]+>/g, "").trim();
      if (!nombrePlan || planesVistos[nombrePlan]) return;
      planesVistos[nombrePlan] = true;
      planes.push({ plan: nombrePlan, precioOferta: pl.special_price, precioRegular: pl.price });
    });

    var coloresVistos = {};
    var colores = [];
    (p.variant || []).forEach(function (v) {
      if (v.color && !coloresVistos[v.color]) { coloresVistos[v.color] = true; colores.push(v.color); }
    });

    return {
      id: p.id,
      nombre: p.name,
      marca: p.marca_text,
      imagen: p.image,
      memoria: p.memory_text,
      camara: p.frontal_camera_text,
      precioRegular: precioRegular,
      precioOferta: precioOferta,
      descuentoPct: descuentoPct,
      url: p.url,
      planes: planes,
      colores: colores,
      recomendado: !!p.recomended
    };
  });
}

export default async function handler(req, res) {
  var browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
    var page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    );

    // primero la pagina normal: pasa el challenge de Cloudflare y deja la sesion/cookies listas
    await page.goto("https://tienda.movistar.com.pe/celulares/renovacion", {
      waitUntil: "domcontentloaded",
      timeout: 25000
    });

    // con la sesion ya valida, se pide el mismo JSON que la tienda usa para pintar la grilla
    // de productos, pero como fetch() DESDE DENTRO de la pagina (page.evaluate), no como una
    // navegacion aparte — un page.goto() directo a esa URL volvia a chocar con el bloqueo (la
    // pagina de error de Cloudflare en vez del JSON), porque no es una navegacion real de
    // usuario. Un fetch interno es exactamente lo que hace la propia app Angular de la tienda,
    // asi que pasa igual que cualquier llamada AJAX normal de la pagina.
    var texto = await page.evaluate(async () => {
      var r = await fetch("https://tienda.movistar.com.pe/renovacion/ajax/products/", {
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      return r.text();
    });
    var data = JSON.parse(texto);

    var equipos = transformarProductos(data);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({ actualizado: new Date().toISOString(), equipos: equipos });
  } catch (err) {
    res.status(500).json({ error: "Error leyendo la tienda Movistar: " + err.message });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (err) {}
    }
  }
}
