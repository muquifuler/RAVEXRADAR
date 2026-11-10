# studio-server · análisis de canciones del Estudio

Servidor pequeño e independiente (no es el `server.mjs` de recopilar eventos).
Analiza canciones de **cualquier tamaño y formato** con ffmpeg. Para cada canción saca:

- el BPM,
- la rejilla de golpes,
- los drops y las subidas.

Con eso el vídeo del Estudio rompe justo cuando rompe la canción. Cada canción se analiza una sola vez y el resultado se guarda en caché.

- `GET /health`: estado del servidor y versión de ffmpeg.
- `POST /analyze`, con `{ "url": "https://…" }`: analiza la canción de una fiesta o de un perfil.
- `POST /analyze/upload`, con el archivo de audio en el cuerpo: analiza la canción que se sube desde el Estudio.

Solo atiende a usuarios con sesión iniciada: la web manda el token de Supabase y el servidor lo comprueba.
Solo descarga de tu Supabase Storage y de los dominios de previews de Deezer e iTunes. No admite IPs privadas y tiene límites de tamaño, de tiempo y de peticiones por usuario.

## 1. Probarlo en tu ordenador

Necesitas Node 18 o superior y ffmpeg. Hay dos formas de tener ffmpeg:

- Que esté instalado en el sistema.
- Que `npm install` instale `ffmpeg-static`.

Los pasos son:

```bash
cd studio-server
cp .env.example .env      # rellena SUPABASE_URL y SUPABASE_ANON_KEY
npm install
npm start                 # → [studio] escuchando en :8787
```

En el `.env` de la web (el de Vite) añade:

```
VITE_STUDIO_API_URL=http://localhost:8787
```

Para comprobar que funciona, abre `http://localhost:8787/health`.

## 2. Ponerlo en internet

Cualquier sitio que ejecute Docker o Node sirve. Por ejemplo:

**Render.com (Docker)**

1. New → Web Service → tu repo.
2. *Root Directory*: `studio-server`. Runtime: **Docker**. El `Dockerfile` ya instala ffmpeg.
3. En *Environment* pon las variables de `.env.example`. Como mínimo:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ALLOWED_ORIGINS=https://ravexradar.com,https://www.ravexradar.com`
4. En el plan gratis el servidor se duerme y el primer análisis tarda en despertar. Para uso real conviene el plan más barato de pago.

**VPS (por ejemplo, Hostinger VPS)**

```bash
sudo apt install -y ffmpeg nodejs npm
cd studio-server && npm install --omit=optional
cp .env.example .env && nano .env
npx pm2 start server.mjs --name studio && npx pm2 save
```

Pon delante un proxy con https (Nginx o Caddy) hacia el puerto 8787.

**Subdominio**: en el DNS de Hostinger crea `studio.ravexradar.com`:

- con un CNAME, si lo tienes en Render;
- con un registro A apuntando a la IP, si lo tienes en un VPS.

Después, en el `.env` de la web de producción:

```
VITE_STUDIO_API_URL=https://studio.ravexradar.com
```

## 3. Caché en Supabase (opcional, recomendado)

Si el servidor no tiene disco persistente (Render gratis, por ejemplo), la caché en disco se borra en cada reinicio.

Para guardar los análisis en Supabase:

1. Ejecuta la migración `supabase/migrations/11_estudio_analisis_audio.sql`.
2. Pon `SUPABASE_SERVICE_ROLE_KEY` en las variables del servidor.

La tabla tiene RLS sin políticas: solo este servidor puede leerla y escribirla.

⚠️ La service role key va **solo** en el servidor del estudio, nunca en la web ni en el `.env` de Vite.

## 4. Si algo falla

- **`/health` devuelve `"ffmpeg": null`**: no encuentra ffmpeg. Instálalo o pon `FFMPEG_PATH`.
- **La web dice «El servidor del estudio no responde…»**: revisa estas tres cosas:
  - `VITE_STUDIO_API_URL`;
  - que el servidor esté arrancado;
  - que tu dominio esté en `ALLOWED_ORIGINS`.
- **«Esa canción está en una web desde la que no se permite analizar»**: añade ese dominio a `ALLOWED_AUDIO_HOSTS`.
- **Si el servidor no está configurado o no responde**, la web analiza en el navegador las canciones pequeñas (plan B).

## Nota

`lib/beatCore.mjs` es una copia exacta de `src/lib/studio/beatCore.js`. La web lo usa para el plan B. Si cambias uno, copia el otro.
