# Seguridad Firebase

Esta app no debe publicarse con reglas publicas. Usa Firebase Authentication + Realtime Database Rules.

## 1. Activar Authentication

En Firebase Console:

1. Authentication.
2. Comenzar.
3. Metodo de acceso.
4. Habilita `Correo electronico/contrasena`.

## 2. Crear usuarios

Crea estos usuarios manualmente en Authentication. Usa contrasenas reales de al menos 6 caracteres; no uses PINs simples como seguridad final.

| Rol | Email |
| --- | --- |
| Admin | `admin@manager.local` |
| Andretti | `andretti@ligaf1.local` |
| Aston Martin | `astonmartin@ligaf1.local` |
| Ferrari | `ferrari@ligaf1.local` |
| HAAS | `haas@ligaf1.local` |
| McLaren | `mclaren@ligaf1.local` |
| Mercedes | `mercedes@ligaf1.local` |
| Porsche | `porsche@ligaf1.local` |
| Red Bull | `redbull@ligaf1.local` |
| Sauber | `sauber@ligaf1.local` |
| Williams | `williams@ligaf1.local` |

## 3. Publicar reglas

En Realtime Database > Rules, pega y publica el contenido de `firebase-rules.json`.

Las reglas actuales hacen esto:

- Nadie lee ni escribe si no inicio sesion.
- `admin@manager.local` puede administrar config, pool, rosters, mercado y cierres de subastas.
- Cada equipo solo puede leer su propio presupuesto/config y su propio roster.
- El admin abre/cierra periodos de mercado desde el nodo `market`.
- Cada equipo solo puede abrir subastas mientras `market.status` sea `open`.
- Cada subasta queda asociada a `market.periodId`; no se puede reabrir el mismo item dentro del mismo periodo.
- Cada equipo solo puede pujar como su propio equipo en subastas activas del periodo abierto.
- La puja debe respetar identidad Firebase, incremento minimo de `0.5M`, monto base/reserva, deadline razonable e historial append-only.
- Si el deadline anterior ya vencio, un equipo no puede reactivar la subasta cambiando el deadline a futuro.
- Una puja reciente queda bloqueada por 2 minutos para que solo el lider pueda arrepentirse.
- Un equipo no puede cerrar subastas ni cambiar ganador, item, categoria, historial viejo o estado.

## 4. Archivos privados

No publiques saves ni exports operativos en la carpeta estatica. Mantelos en `private-data` o fuera del sitio.

## 5. Orden recomendado

1. Crea los usuarios de Auth.
2. Entra una vez como admin si la base todavia necesita config inicial.
3. Publica `firebase-rules.json`.
4. Prueba login admin y un equipo.
