# CancionOva Backend

Backend para procesar pagos de Square y enviar notificaciones por Formspree.

## Pasos para publicar en Railway

### 1. Obtener el Access Token de Square
1. Ve a developer.squareup.com
2. Selecciona tu aplicacion
3. Cambia a Production
4. Copia el Access Token (empieza con EAAA...)

### 2. Subir a Railway
1. Crea cuenta gratis en railway.app
2. Click en "New Project" -> "Deploy from GitHub repo"
3. Sube esta carpeta a un repo de GitHub (ver paso 3)
4. Railway despliega automaticamente

### 3. Subir a GitHub
1. Crea cuenta en github.com
2. New repository -> nombre: cancionova-backend
3. Sube los archivos (NO subas .env)
4. En Railway conecta ese repositorio

### 4. Configurar variables de entorno en Railway
En Railway -> tu proyecto -> Variables, agrega:
  SQUARE_ACCESS_TOKEN = EAAAl...tu token real...
  ALLOWED_ORIGIN      = https://cancionova.com
  NODE_ENV            = production

### 5. Obtener la URL de Railway
Railway te da una URL como: https://cancionova-backend.up.railway.app
Copia esa URL para el siguiente paso.

### 6. Actualizar el frontend
En cancionova.html busca esta linea:
  var res = await fetch('/api/payment', {
Y cambiala por:
  var res = await fetch('https://TU-URL.up.railway.app/api/payment', {

## Endpoints
- GET  /        -> Health check
- GET  /health  -> Health check
- POST /api/payment -> Procesar pago

## Flujo de pago
1. Frontend tokeniza tarjeta con Square Web Payments SDK
2. Frontend envia token + datos del formulario a POST /api/payment
3. Backend cobra la tarjeta via Square Payments API
4. Backend envia notificacion a Formspree (llega a tu email)
5. Backend responde OK al frontend
6. Frontend muestra pantalla de exito al cliente
