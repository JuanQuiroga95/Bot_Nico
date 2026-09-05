# Nico CRM

## Despliegue

Vercel usa la carpeta raíz `dashboard`. Railway usa la raíz del repositorio y su Dockerfile. No se requieren cambios en el esquema de la base de datos.

Variables privadas de **Vercel**:

- `DATABASE_URL`: conexión PostgreSQL existente.
- `DASHBOARD_USERNAME`: `nicofabrica` (valor predeterminado).
- `DASHBOARD_PASSWORD`: contraseña de acceso acordada. Obligatoria; sin ella no se muestran datos.
- `API_SECRET_TOKEN`: el mismo secreto que en Railway.
- `OPENAI_API_KEY`: clave para el análisis real de conversaciones.
- `BOT_STATUS_URL`: dominio público HTTPS de Railway, por ejemplo `https://tu-bot.up.railway.app`.

Variables de **Railway**:

- `NEXTJS_API_URL`: `https://tu-dashboard.vercel.app/api/process-chat`.
- `API_SECRET_TOKEN`: el mismo secreto que en Vercel.
- `PORT`: Railway lo proporciona; el bot escucha en todas las interfaces.
- `KEYWORDS_EXTRA`: opcional; términos adicionales separados por coma. El bot ya incluye productos de limpieza, insumos y consultas comerciales, con tildes y plurales.
- `WWEBJS_AUTH_PATH`: recomendada. Sin ella, cada reinicio pierde la vinculación y vuelve a pedir el QR. Montá un volumen en Railway y usá su **ruta de montaje** más `/.wwebjs_auth`; por ejemplo, con el volumen montado en `/bot-data`, el valor es `/bot-data/.wwebjs_auth`. Debe coincidir con la ruta de montaje, no con el nombre del volumen.
- `SCAN_MESSAGES`, `SCAN_DAYS`, `SCAN_CHATS`: opcionales. Limitan el escaneo inicial a 30 mensajes por chat, 30 días de antigüedad y 150 conversaciones. Bajalos si Railway reinicia el contenedor por falta de memoria al vincular.

Después de modificar variables, desplegá nuevamente el servicio correspondiente. Generá un dominio público para el bot y usalo en BOT_STATUS_URL. `/health` comprueba el servidor HTTP, no la conexión con WhatsApp. `/status` exige el token privado. El navegador accede al QR por Vercel con su sesión, sin conocer ese token.

## Uso

1. Ingresar en `/login` con el usuario y contraseña.
2. Abrir Configuración y escanear el QR desde Dispositivos vinculados de WhatsApp Business. Esperar «WhatsApp conectado».
3. Enviar una consulta desde otro teléfono. El bot también examina conversaciones anteriores al iniciar.
4. En Leads, buscar por nombre, teléfono o producto; filtrar por estado; abrir la ficha y guardar el seguimiento.
5. «Abrir WhatsApp» prepara un borrador; el usuario confirma el envío. No cambia automáticamente el estado.
6. Usar «Recuperado» para ventas concretadas. «Descartado» conserva el historial.
7. Las preferencias de mensaje y actualización automática se guardan en el navegador. Los leads y estados se guardan en PostgreSQL.

La sesión vence después de 12 horas. Cerrar sesión elimina la cookie del navegador. Cambiar DASHBOARD_PASSWORD invalida las sesiones existentes. El acceso es compartido, sin roles ni cuentas individuales.

La exportación CSV incluye los filtros actuales y hasta 10.000 registros; el historial se consulta desde la ficha. Las fórmulas de planilla se neutralizan en el CSV.

## Validación local

Desde `dashboard`: `npm ci --include=dev`, `npm run lint`, `npm run build`.
Desde la raíz, con Node 24: `node --test tests/*.test.mjs`.

Las pruebas de guardado usan una base simulada: no crean leads en producción. Agregá las variables privadas a `dashboard/.env`, que está excluido de Git.
