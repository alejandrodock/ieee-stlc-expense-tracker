# 🧾 IEEE STLC ExpenseTracker

> **PWA Mobile-First** para automatizar la gestión de compras, digitalización de facturas/recibos y rendición de fondos en bolivianos (BOB) y dólares (USD) para IEEE STLC 2026.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)

## ✨ Funcionalidades

- 📊 **Dashboard en tiempo real** — Saldo restante, total gastado, desglose por categorías
- 📝 **Registro de compras** — Formulario de 3 pasos con calculadora de saldo y equivalente USD (T.C. 11,58)
- 📸 **Escáner tipo CamScanner (en el celular)** — Detección automática de bordes, ajuste manual de esquinas con lupa, corrección de perspectiva, giro y filtros *Color nítido* / *Grises* / *Original*. El filtro por defecto elimina sombras, deja el papel blanco y resalta la letra sin aspecto de fotocopia
- 📎 **Recibos digitales en PDF** — Se adjuntan tal cual, con una portada de rendición al inicio
- 📄 **PDF de auditoría** — Encabezado IEEE, datos del gasto y comprobante; nombre `YYYYMMDD_Categoria_Proveedor_MontoBOB.pdf`
- 🔒 **Almacenamiento privado** — PDFs en Supabase Storage (bucket privado `comprobantes`), servidos con URLs firmadas de corta duración
- 📈 **Exportación Excel** — Rendición con totales por categoría y enlaces a cada comprobante
- 📱 **PWA Mobile-First** — Instalable como app

## 🏗️ Arquitectura

```
src/
├── app/api/
│   ├── gastos/               # GET (liviano) · POST (validado) · DELETE (+ borra comprobante)
│   ├── comprobantes/         # POST: URL firmada de subida directa a Storage
│   ├── comprobantes/[id]/    # GET: redirige a una URL firmada del PDF
│   └── export/               # Excel (.xlsx)
├── components/
│   ├── scanner/              # DocumentScanner + CornerEditor (UI del escáner)
│   └── …                     # Dashboard, NuevaCompraModal, GastosList, …
└── lib/
    ├── scanner/core.ts       # Detección (Hough), perspectiva y realce — sin dependencias
    ├── scanner/*.worker.ts   # Procesamiento en Web Worker (UI fluida en el celular)
    ├── pdf/comprobante.ts    # Generación de PDF con pdf-lib
    └── server/               # Supabase (service role), Storage, validación, Drive opcional
supabase/
├── schema.sql                # Esquema completo (instalación nueva)
└── migrations/               # Cambios incrementales (ejecutar en SQL Editor)
```

**Flujo de un gasto:** foto → escaneo en el navegador → PDF (pdf-lib) → subida directa a Supabase Storage con URL firmada (no pasa por la función serverless, evitando el límite de 4,5 MB de Vercel) → registro en la tabla `gastos`.

## 🚀 Configuración

1. `npm install`
2. En Supabase > SQL Editor ejecutar `supabase/schema.sql` (proyecto nuevo) o los archivos de `supabase/migrations/` (proyecto existente).
3. Crear `.env.local` a partir de `.env.example`.
4. `npm run dev` y abrir http://localhost:3000

El bucket privado `comprobantes` se crea automáticamente en la primera subida.

### Copia opcional en Google Drive

Si se define `GOOGLE_DRIVE_FOLDER_ID` (más las credenciales de la service account), cada PDF se copia a Drive en segundo plano. **La carpeta debe estar en una Unidad compartida (Google Workspace)** donde la service account sea miembro: una service account no tiene cuota propia y no puede subir a carpetas de “Mi unidad” de una cuenta Gmail.

## ☁️ Despliegue

El proyecto de Vercel está conectado a este repositorio: cada `git push` a `main` despliega a producción. Variables de entorno necesarias en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (y las de Drive si se usa la copia opcional).

## 📋 Categorías de Presupuesto

| Categoría | Ícono | Color |
|-----------|-------|-------|
| Catering / Coffee Break | ☕ | Amber |
| Transporte Ponentes | 🚗 | Blue |
| Imprenta y Kits | 🖨️ | Purple |
| Premios / Hackathon | 🏆 | Emerald |
| Materiales / Varios | 📦 | Red |

## 🔧 Stack Tecnológico

| Tecnología | Uso |
|-----------|-----|
| **Next.js 15.5** | Framework full-stack |
| **Tailwind CSS 4** | Diseño UI |
| **Supabase** | Base de datos PostgreSQL |
| **Canvas + Web Worker** | Escáner de documentos (sin dependencias) |
| **pdf-lib** | Generación y unión de PDFs |
| **Supabase Storage** | Comprobantes PDF (bucket privado) |
| **SheetJS (xlsx)** | Exportación Excel |
| **Framer Motion** | Animaciones |
| **Lucide React** | Íconos |

## 📄 Licencia

MIT — IEEE Sección Bolivia / STLC 2026
