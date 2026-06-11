# Publicar reglas Firebase

Este paso protege la base real. Los cambios de codigo no alcanzan si `firebase-rules.json` no esta publicado en Realtime Database.

## Archivo fuente

Usa este archivo local:

```text
f1-mercado-static/firebase-rules.json
```

La copia de GitHub Pages debe tener el mismo contenido:

```text
f1-mercado-github-pages/firebase-rules.json
```

## Publicacion manual

1. Abrir Firebase Console.
2. Entrar al proyecto `pujasf1manager`.
3. Ir a Realtime Database.
4. Abrir la pestana Reglas.
5. Reemplazar todo el contenido por el contenido completo de `firebase-rules.json`.
6. Pulsar Publicar.

## Validacion despues de publicar

Estas lecturas sin sesion deben fallar con `401` o `permission_denied`:

```text
https://pujasf1manager-default-rtdb.firebaseio.com/.json?shallow=true
https://pujasf1manager-default-rtdb.firebaseio.com/auctions.json?orderBy=%22status%22&equalTo=%22active%22
```

Luego probar desde la pagina:

1. Login admin.
2. Login de un equipo.
3. El equipo debe poder ver subastas activas.
4. El equipo debe poder abrir una subasta con puja minima.
5. Otro equipo no debe poder levantarla durante los 2 minutos de arrepentimiento.
6. Una subasta vencida no debe aceptar nuevas pujas.

Si Firebase rechaza las reglas al publicarlas, copia el error exacto y no abras el mercado hasta corregirlo.
