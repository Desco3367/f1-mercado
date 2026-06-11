# F1 Manager - Mercado de Fichajes

Version estatica sin npm, Vite, React ni node_modules.

## Configuracion

1. Edita `firebase-config.js`.
2. Reemplaza:
   - `TU_API_KEY`
   - `TU_PROYECTO`
   - `TU_SENDER_ID`
   - `TU_APP_ID`
3. En Firebase Console > Realtime Database > Rules, usa el contenido de `firebase-rules.json`.
4. Antes de publicar, sigue `SECURITY.md` para crear los usuarios de Firebase Auth.

## Probar en la PC

Opcion recomendada si ya tenes Node instalado, sin usar npm ni instalar paquetes:

```text
abrir-app.bat
```

Tambien podes iniciarlo manualmente:

```bash
node serve-static.cjs
```

Luego abre:

```text
http://localhost:8080
```

Si tenes Python instalado, tambien sirve:

```bash
python -m http.server 8080
```

Tambien se puede desplegar como sitio estatico en Vercel, Netlify, GitHub Pages o Firebase Hosting.

## Datos por defecto

- Los equipos iniciales se cargan solos la primera vez si la base esta vacia.
- Las claves reales se administran en Firebase Authentication. No se guardan PINs iniciales en la base.

## Pujas

- El admin inicia y cierra periodos de mercado.
- Durante un periodo abierto, los equipos abren subastas desde el `Pool`.
- Abrir una subasta exige la puja minima del equipo que la abre.
- Los pilotos pueden abrirse como reserva por media base si se elige slot de reserva.
- Cada puja posterior debe superar a la lider por al menos `0.5M`.
- La puja inicial activa el reloj; cada puja valida mueve el cierre a manana 23:59.
- La puja nueva queda protegida durante 2 minutos: el lider puede arrepentirse y nadie puede levantarla durante esa ventana.
- Una subasta cerrada no puede reabrirse dentro del mismo periodo de mercado.
- En otro periodo de mercado, el mismo item puede volver a abrirse.
- Las listas de subastas se pueden filtrar por pilotos o cada tipo de ingeniero/staff.

## Importaciones

En el panel admin, pestana `Importar`:

- `Importar desde save`: lee un `.sav`, calcula medias de pilotos/staff y los importa al pool.
- `Importar dinero`: lee un JSON `lfm_money_export` y actualiza el dinero libre de los equipos con `budgetRemaining`.

## Nota de seguridad

La seguridad real depende de Firebase Authentication y `firebase-rules.json`. Las reglas locales no tienen efecto hasta pegarlas y publicarlas en Firebase Console. Usa `FIREBASE_RULES_PUBLICATION.md` como checklist.

No publiques `save0.sav` ni exports `lfm-money-*.json` / `lfm-staff-*.json` dentro de la carpeta estatica. Guarda esos archivos en `private-data` o fuera del sitio publicado.
