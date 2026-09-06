# Nico CRM

## Despliegue

Vercel usa la carpeta raíz `dashboard`. Railway usa la raíz del repositorio y su Dockerfile.

**Esta versión agrega tres columnas a la tabla `Lead`.** Antes de desplegar, ejecutá esto una vez en la consola SQL de Neon:

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "leadType" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastCampaignAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Lead_leadType_lastMessageAt_idx" ON "Lead" ("leadType", "lastMessageAt");
```

Las tres son opcionales, así que los leads ya cargados siguen funcionando sin tocarlos.

Variables privadas de **Vercel**:

- `DATABASE_URL`: conexión PostgreSQL existente.
- `DASHBOARD_USERNAME`: `nicofabrica` (valor predeterminado).
- `DASHBOARD_PASSWORD`: contraseña de acceso acordada. Obligatoria; sin ella no se muestran datos.
- `API_SECRET_TOKEN`: el mismo secreto que en Railway.
- `OPENAI_API_KEY`: clave para el análisis real de conversaciones.
- `BOT_STATUS_URL`: dominio público HTTPS de Railway, por ejemplo `https://tu-bot.up.railway.app`.

Variables de **Railway**:

- `NEXTJS_API_URL`: `https://tu-dashboard.vercel.app/api/process-chat`. El bot deriva de ahí las demás rutas del panel, como `/api/contacts/sync`.
- `API_SECRET_TOKEN`: el mismo secreto que en Vercel.
- `PORT`: Railway lo proporciona; el bot escucha en todas las interfaces.
- `KEYWORDS_EXTRA`: opcional; términos adicionales separados por coma. El bot ya incluye productos de limpieza, insumos y consultas comerciales, con tildes y plurales.
- `WWEBJS_AUTH_PATH`: recomendada. Sin ella, cada reinicio pierde la vinculación y vuelve a pedir el QR. Montá un volumen en Railway y usá su **ruta de montaje** más `/.wwebjs_auth`; por ejemplo, con el volumen montado en `/bot-data`, el valor es `/bot-data/.wwebjs_auth`. Debe coincidir con la ruta de montaje, no con el nombre del volumen.
- `SCAN_MESSAGES`, `SCAN_DAYS`, `SCAN_CHATS`: opcionales. Limitan el barrido de la agenda a 60 mensajes por chat, 730 días de antigüedad y 1000 conversaciones. Bajalos si Railway reinicia el contenedor por memoria.
- `INACTIVE_DAYS`: opcional, 30 días. Un contacto entra en la lista de recontacto cuando hace más de esto que no escribe.
- `SWEEP_HOURS`: opcional, 12 horas. Cada cuánto el bot vuelve a revisar la agenda. El primer barrido corre un minuto después de conectarse.
- `DEBUG_CHATS=1`: opcional. Escribe en el log una línea por chat revisado. Dejalo apagado: con miles de chats inunda los logs.
- `SEND_DAILY_CAP`: opcional, 40 por día. Tope de mensajes de reactivación. Lo que exceda queda en cola y sigue al día siguiente.

Después de modificar variables, desplegá nuevamente el servicio correspondiente. Generá un dominio público para el bot y usalo en BOT_STATUS_URL. `/health` comprueba el servidor HTTP, no la conexión con WhatsApp. `/status` exige el token privado. El navegador accede al QR por Vercel con su sesión, sin conocer ese token.

## Uso

1. Ingresar en `/login` con el usuario y contraseña.
2. Abrir Configuración y escanear el QR desde Dispositivos vinculados de WhatsApp Business. Esperar «WhatsApp conectado».
3. Enviar una consulta desde otro teléfono. Aparte, cada `SWEEP_HOURS` el bot recorre la agenda entera y carga en Campañas a los contactos que hace más de `INACTIVE_DAYS` que no escriben. Solo entran conversaciones en las que la persona respondió alguna vez.
4. En Leads, buscar por nombre, teléfono o producto; filtrar por estado; abrir la ficha y guardar el seguimiento.
5. «Abrir WhatsApp» prepara un borrador; el usuario confirma el envío. No cambia automáticamente el estado.
6. En Campañas aparece la lista de contactos sin actividad, del más olvidado al más reciente. Se elige el corte de antigüedad (1 mes a 1 año), se marcan uno por uno o con «Seleccionar todos», se escribe el mensaje con `{nombre}` y `{producto}`, y opcionalmente se adjunta una imagen (JPG, PNG, WEBP o GIF de hasta 8 MB; el texto viaja como epígrafe). No se envía nada que no esté marcado. El bot los manda de a uno, con pausas de 40 a 120 segundos, hasta el tope diario; el resto queda en cola. Los contactos pasan a «Contactado» al encolarse y, cuando responden, el bot detecta la respuesta como cualquier mensaje nuevo. Enviar solo a quienes ya escribieron alguna vez: la mensajería masiva a desconocidos hace que WhatsApp suspenda la cuenta.
6. Usar «Recuperado» para ventas concretadas. «Descartado» conserva el historial.
7. Las preferencias de mensaje y actualización automática se guardan en el navegador. Los leads y estados se guardan en PostgreSQL.

La sesión vence después de 12 horas. Cerrar sesión elimina la cookie del navegador. Cambiar DASHBOARD_PASSWORD invalida las sesiones existentes. El acceso es compartido, sin roles ni cuentas individuales.

La exportación CSV incluye los filtros actuales y hasta 10.000 registros; el historial se consulta desde la ficha. Las fórmulas de planilla se neutralizan en el CSV.

## Validación local

Desde `dashboard`: `npm ci --include=dev`, `npm run lint`, `npm run build`.
Desde la raíz, con Node 24: `node --test tests/*.test.mjs`.

Las pruebas de guardado usan una base simulada: no crean leads en producción. Agregá las variables privadas a `dashboard/.env`, que está excluido de Git.
