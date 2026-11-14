# IEEE STLC & HART 2026 — workspace

Dos módulos aislados bajo **un único proceso Next.js y un único dominio**.

```text
fullstack/ieee-fondos/
├── auto-registro-fondos-ieee/  # Host Next.js 15 + módulo STLC existente
│   ├── src/app/               # Hub, /stlc, /hart y adaptadores de las API
│   └── supabase/migrations/20261113_add_multi_project_support.sql
├── hart-registro-fondos-ieee/  # UI, reglas, PDF, Excel y API del módulo HART
├── tests/                     # Pruebas de conversión, umbral, PDF y Excel
├── package.json               # npm workspaces y comandos unificados
└── package-lock.json          # Dependencias del workspace completo
```

HART es un paquete fuente del workspace, no otro servidor ni otro despliegue. El host importa sus componentes y handlers mediante `@hart/*`. No requiere Turborepo, proxy remoto ni rewrites a un segundo dominio.

## Ubicación y límites del proyecto

`fullstack/` contiene proyectos independientes; `ieee-fondos/` contiene exclusivamente esta plataforma. Sus dependencias, pruebas, scripts y herramientas locales de despliegue se mantienen aquí. Los proyectos futuros deben ser carpetas hermanas de `ieee-fondos`, con su propio repositorio y configuración.

La raíz publicada en GitHub corresponde al contenido de `ieee-fondos/`; no incluye el contenedor local `fullstack/`. Vercel conserva `auto-registro-fondos-ieee` como Root Directory y ambos módulos siguen en la misma URL. `.deployment/` es material local ignorado por Git; `scripts/prepare-release.ps1` prepara el checkout de publicación sin copiar secretos.

## Puesta en marcha

Requiere Node 22.18+ y npm. Desde esta carpeta:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
npm start
```

En PowerShell con scripts deshabilitados, usar `npm.cmd`. Las variables siguen en `auto-registro-fondos-ieee/.env.local`; el ejemplo está en esa carpeta. No copiar credenciales al repositorio ni al paquete HART.

Las pruebas unitarias ejecutan una migración real en PostgreSQL embebido (PGlite), preservan una fila STLC de ejemplo y validan PDF/Excel. Las pruebas de navegador requieren Chromium (`npx playwright install chromium`, o `PLAYWRIGHT_CHROMIUM_EXECUTABLE` para usar uno ya instalado) y un build previo. Lanzan la app en el puerto 3100 con una API de almacenamiento/base de datos local en 54399. No escriben en Supabase real. `SUPABASE_URL` permite fijar una URL exclusivamente del servidor durante esas pruebas; en producción se usa normalmente `NEXT_PUBLIC_SUPABASE_URL` como antes.

Variables obligatorias: `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Las opciones existentes de Google Drive y firma STLC se conservan. `HART_BUDGET_USD` es opcional: su valor predeterminado es **9000**. HART captura una firma por declaración; no reutiliza automáticamente la firma de STLC. ExchangeRate-API no necesita clave en el endpoint elegido.

## Migración y compatibilidad

**Ejecutar primero** `auto-registro-fondos-ieee/supabase/migrations/20261113_add_multi_project_support.sql` en Supabase SQL Editor, antes de desplegar el nuevo código. Para una instalación vacía, ejecutar primero el `schema.sql` existente y después esta migración. El script se puede repetir.

- Se conserva la tabla real `gastos`; no existe una tabla `expenses` en este proyecto.
- `project_id TEXT NOT NULL DEFAULT 'STLC'` asigna los registros anteriores a STLC sin cambiar importes, fechas, categorías, comprobantes ni evidencias.
- Los campos adicionales de moneda se usan en HART. Los valores históricos de `monto_bob` y `monto_usd` de STLC permanecen intactos.
- HART guarda `original_amount`, `original_currency`, `exchange_rate` (USD por unidad de moneda), `amount_usd`, `has_receipt`, nombre del firmante y origen/fecha de la tasa. No se inventa un equivalente en BOB para compras HART en EUR/USD.
- Las tablas mantienen RLS y se revocan permisos directos de `anon`/`authenticated`. El servidor usa `service_role`, que omite RLS: por ello todas las operaciones se restringen también explícitamente por proyecto. No se agrega una política pública que confíe en LocalStorage.
- La vista antigua `resumen_categorias` sigue resumiendo exclusivamente STLC.
- STLC conserva su presupuesto de **1176 USD / 13618,08 BOB**, cambio **11,58**, nueve categorías, formulario, escáner, PDF, Excel, Drive, borradores y enlaces anteriores. Los cambios mínimos en STLC son navegación, filtro de proyecto, configuración del workspace y PWA.

El selector **no es autenticación**. Se conserva el modelo de acceso existente, sin cuentas ni roles nuevos. Si el despliegue tiene protección de acceso externa, conservarla.

## Rutas y almacenamiento

| Ruta | Función |
|---|---|
| `/` | Selector de proyectos, recuerda el último utilizado |
| `/stlc` | Dashboard STLC existente |
| `/hart` | Dashboard HART con presupuesto y totales USD |
| `/api/gastos`, `/api/export` | Operaciones y Excel exclusivamente STLC |
| `/api/comprobantes/*`, `/api/media/*`, `/galeria/*` | Enlaces STLC existentes |
| `/api/hart/gastos` | Listar, registrar y eliminar gastos HART |
| `/api/hart/comprobantes` | Preparar subida directa de factura o recibo |
| `/api/hart/comprobantes/[id]` | Abrir/descargar PDF HART mediante URL firmada |
| `/api/hart/rates?currency=EUR` | Consultar tasa a USD; también BOB y USD |
| `/api/hart/export` | Excel HART, con resumen y detalle separados |

Los archivos históricos siguen en `comprobantes` y `evidencias`. HART usa el bucket privado separado `hart-comprobantes`. Sus recibos se suben directamente a Storage; el servidor valida el PDF/JPG/PNG y genera el documento final. Se admiten recibos de hasta 20 MB. Los PDF protegidos se conservan tal cual, sin agregar portada, igual que en STLC; los PDF legibles conservan sus páginas originales después de la portada HART. La copia temporal se retira después del registro. Subidas abandonadas pueden dejar archivos temporales `original`; una limpieza administrativa debe limitarse a IDs sin registro y cargas ya vencidas.

HART reutiliza directamente `InAppCamera`, `DocumentScanner`, `CornerEditor` y el Web Worker de STLC. Su selector ofrece **Escanear / Imagen / PDF**, con cámara interna, repetición y confirmación de foto, cámara nativa como alternativa, detección y ajuste de esquinas, perspectiva, filtros y giro. Las imágenes de la galería pasan por el mismo escáner y se convierten a JPEG antes de subir; HEIC/HEIF dependen del soporte del navegador, igual que en STLC. El botón Guardar espera a que termine el procesamiento y la portada se genera con los datos financieros propios de HART.

## HART: monedas y declaraciones

Las ocho categorías cubren vuelos, alojamiento, transporte, alimentación, inscripción IEEE/ISICAS, materiales/prototipo, seguros/visados y gastos menores. El total es `round(original_amount × exchange_rate, 2)` y lo recalcula el servidor. El reporte usa el total guardado, no una cotización posterior.

La API gratuita [ExchangeRate-API](https://www.exchangerate-api.com/docs/free) actualiza diariamente, no en tiempo real intradía. Se muestra la fecha de la cotización y la atribución exigida. La tasa es editable y queda marcada como manual al modificarla. Sin proveedor se ofrece la última tasa guardada, con fecha y aviso para revisarla, o se solicita una tasa manual. Las tasas actuales no constituyen tasas históricas del día de la compra.

La regla de este módulo es **estrictamente menor de 25,00 USD** para gastos sin recibo. Desde 25,00 USD se exige un archivo válido antes de guardar. El límite se aplica al total redondeado a centavos. Sin recibo se requieren descripción, nombre completo y firma manuscrita en Canvas; el servidor genera la declaración y almacena el PDF antes de insertar el gasto. La firma es una imagen manuscrita, no una firma criptográfica certificada.

La [guía pública IEEE](https://mga.ieee.org/images/files/TE_Guidelines_08.2022_volunteers_only_FINAL_08.26.22.pdf) describe documentación para gastos que exceden 25 USD. Por petición del proyecto se implementa el criterio más estricto `>= 25`. El documento generado no implica aprobación de reembolso ni sustituye la presentación oficial que corresponda.

## PWA y persistencia

El manifiesto abre el hub. El último proyecto se guarda en `ieee:active-project`; los borradores HART usan una clave separada de STLC. Cambiar de módulo conserva los datos del formulario, pero los archivos y firmas se vuelven a adjuntar después de recargar. El service worker renueva su caché y excluye API, galerías y respuestas RSC. Guardar gastos y consultar datos requiere conexión; no hay cola de sincronización de gastos offline.

## Un solo despliegue Vercel

1. El checkout del repositorio conectado debe contener **ambas carpetas y los archivos raíz**. La carpeta padre actual no era un repositorio Git y STLC tiene un `.git` propio: hacer push solo desde STLC **no incluye** el módulo hermano. No se movió ni eliminó ese historial. Para publicar el monorepo, integrar ambos módulos en el repositorio elegido conservando el historial de STLC, o preparar un nuevo repositorio raíz; no agregar STLC como un submódulo vacío por accidente.
2. Reutilizar el **mismo proyecto Vercel y dominio**, configurando Root Directory en `auto-registro-fondos-ieee` y habilitando la inclusión de archivos fuera de ese directorio raíz.
3. Install Command: `cd .. && npm ci`; Build Command: `npm run build`; Framework: Next.js. `outputFileTracingRoot` incluye la carpeta padre para incorporar HART en las funciones.
4. Conservar las variables Supabase y Drive existentes; añadir opcionalmente `HART_BUDGET_USD=9000`.
5. Aplicar la migración, desplegar una vista previa, verificar ambos módulos y promover el mismo proyecto de Vercel.

El rollback de código a STLC anterior es compatible con la migración aditiva y con la vista STLC filtrada. La migración debe aplicarse antes de promover el despliegue multi-proyecto.
