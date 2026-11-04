# 🧾 IEEE STLC ExpenseTracker

> **PWA Mobile-First** para automatizar la gestión de compras, digitalización de facturas/recibos y rendición de fondos en bolivianos (BOB) y dólares (USD) para IEEE STLC 2026.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)

## ✨ Funcionalidades

- 📊 **Dashboard en tiempo real** — Saldo restante, total gastado, desglose por categorías
- 📝 **Registro de compras** — Formulario multi-step con calculadora automática de descuento
- 📸 **Escaneo tipo CamScanner** — Procesamiento de imágenes (escala de grises, contraste, nitidez)
- 📄 **Conversión automática a PDF** — Con nomenclatura estricta `YYYYMMDD_Categoria_Proveedor_MontoBOB.pdf`
- ☁️ **Subida a Google Drive** — Automática a carpeta `STLC_2026_Facturas_Y_Recibos`
- 📈 **Exportación Excel** — Rendición oficial con totales por categoría y enlaces a comprobantes
- 📱 **PWA Mobile-First** — Instalable como app nativa en celulares

## 🏗️ Arquitectura

```
src/
├── app/
│   ├── api/
│   │   ├── gastos/          # CRUD de gastos (Supabase)
│   │   ├── process-image/   # Procesamiento de imagen (Sharp)
│   │   ├── upload-drive/    # Subida a Google Drive
│   │   └── export/          # Generación Excel (.xlsx)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Dashboard.tsx        # Página principal
│   ├── BudgetOverview.tsx   # Resumen de presupuesto
│   ├── GastosList.tsx       # Lista de gastos recientes
│   ├── NuevaCompraModal.tsx # Formulario multi-step
│   └── ExportButton.tsx     # Botón de exportación
├── lib/
│   ├── supabase.ts          # Cliente Supabase
│   └── constants.ts         # Categorías, utilidades
public/
├── manifest.json            # PWA manifest
├── sw.js                    # Service Worker
└── icons/                   # Íconos PWA
supabase/
└── schema.sql               # Esquema de base de datos
```

## 🚀 Configuración Rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/alejandro-dock/ieee-stlc-expense-tracker.git
cd ieee-stlc-expense-tracker
npm install
```

### 2. Configurar Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com)
2. Ir al **SQL Editor** y ejecutar el contenido de `supabase/schema.sql`
3. Copiar las credenciales del proyecto

### 3. Configurar Google Drive API

1. Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar la **Google Drive API**
3. Crear una **Service Account** y descargar la clave JSON
4. Crear una carpeta en Google Drive llamada `STLC_2026_Facturas_Y_Recibos`
5. Compartir la carpeta con el email de la Service Account (permisos de Editor)
6. Copiar el ID de la carpeta (de la URL)

### 4. Variables de Entorno

Crear archivo `.env.local` basado en `.env.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...

# Google Drive API (Service Account)
GOOGLE_DRIVE_CLIENT_EMAIL=expense-tracker@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GOOGLE_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## ☁️ Despliegue en Vercel (Un Clic)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/alejandro-dock/ieee-stlc-expense-tracker)

1. Hacer clic en el botón de arriba
2. Conectar con GitHub
3. Agregar las **5 variables de entorno** en la configuración de Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_DRIVE_CLIENT_EMAIL`
   - `GOOGLE_DRIVE_PRIVATE_KEY`
   - `GOOGLE_DRIVE_FOLDER_ID`
4. ¡Deploy!

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
| **Next.js 15** | Framework full-stack |
| **Tailwind CSS 4** | Diseño UI |
| **Supabase** | Base de datos PostgreSQL |
| **Sharp** | Procesamiento de imágenes |
| **jsPDF** | Generación de PDFs |
| **Google Drive API** | Almacenamiento de comprobantes |
| **SheetJS (xlsx)** | Exportación Excel |
| **Framer Motion** | Animaciones |
| **Lucide React** | Íconos |

## 📄 Licencia

MIT — IEEE Sección Bolivia / STLC 2026
