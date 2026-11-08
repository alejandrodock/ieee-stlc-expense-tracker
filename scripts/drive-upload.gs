/**
 * IEEE STLC · Puente a Google Drive
 *
 * Web App de Apps Script que guarda los comprobantes PDF en TU Drive (con tu cuota),
 * organizados en subcarpetas por categoría. La app lo llama desde el servidor.
 *
 * Instalación (una sola vez):
 *  1. https://script.google.com → Nuevo proyecto → pega este archivo.
 *  2. Configuración del proyecto (⚙) → Propiedades del script → agrega:
 *       SECRET     = una clave larga aleatoria (la misma que GOOGLE_DRIVE_SCRIPT_SECRET en Vercel)
 *       FOLDER_ID  = id de la carpeta destino (lo que va tras /folders/ en la URL de Drive)
 *  3. Implementar → Nueva implementación → Tipo «Aplicación web»
 *       Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
 *     Autoriza los permisos y copia la URL que termina en /exec
 *     (va en GOOGLE_DRIVE_SCRIPT_URL en Vercel).
 */

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var body = JSON.parse(e.postData.contents);
    if (!body.secret || body.secret !== props.getProperty('SECRET')) {
      return json_({ error: 'unauthorized' });
    }

    if (body.action === 'upload') {
      var root = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
      var folder = body.subfolder ? subfolder_(root, String(body.subfolder)) : root;
      var blob = Utilities.newBlob(Utilities.base64Decode(body.pdf), 'application/pdf', String(body.filename));
      var file = folder.createFile(blob);
      return json_({ id: file.getId(), url: file.getUrl() });
    }

    if (body.action === 'trash') {
      DriveApp.getFileById(String(body.fileId)).setTrashed(true);
      return json_({ ok: true });
    }

    return json_({ error: 'acción desconocida' });
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

function subfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
