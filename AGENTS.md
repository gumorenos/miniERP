# miniERP / Samiiwara — continuidad para agentes

Última actualización: 2026-08-19

Este archivo es el punto de entrada para continuar el desarrollo si la conversación original se llena, se cambia de herramienta o se agota el saldo del agente. Leerlo antes de modificar código.

## Objetivo del proyecto

`miniERP` es un ERP ligero, mobile-first, para Samiiwara, un pequeño taller peruano de prendas con bordado ayacuchano/andino. Debe reducir la carga de registro manual y responder rápidamente:

- qué pedidos están pendientes, próximos o atrasados;
- qué prendas están con el bordador;
- qué materiales y prendas terminadas hay disponibles;
- cuánto se vendió, cobró, gastó y ganó de forma referencial.

La usuaria principal indicó que le da pereza ingresar información a mano. La siguiente prioridad funcional es captura conversacional: escribir o enviar un mensaje y obtener un borrador de pedido/compra/gasto para confirmar.

## Estado al 2026-08-19

- Repositorio: `gumorenos/miniERP`
- Producción: `https://prueba.gumorenos.space`
- Ruta en VPS: `/home/ubuntu/apps/minierp-samiiwara`
- Compose productivo: `minierp_samiiwara_prod`
- App en VPS: `127.0.0.1:3050 -> 3000`
- Base de datos: PostgreSQL privado en Docker, volumen `minierp_samiiwara_prod_minierp_pg`
- Producción última confirmada: commit `1a76b00f28ddd5676753133689e24405d0f953f0`
- Rama desplegada: `codex/telegram-direct-candidate`
- Health de producción: `200 {"ok":true,"database":"ok"}`; contenedor saludable.
- Backup pre-deploy: `backups/minierp-samiiwara/minierp-prod-pre-1a76b00-20260819T000527-0500.dump`.
- Rollback preparado: `minierp_samiiwara_prod-app:rollback-dddb892-c6781cb3649c`.
- La rama remota anterior `origin/codex/ux-less-data-entry` está en `49cb891` y fue preservada.
- QA aislado y deploy controlado fueron completados por OpenClaw. No se hizo merge ni force-push sobre la rama anterior.
- Desarrollo actual (no desplegado): rama `codex/capture-operational-confirmation`, candidato remoto de re-QA `de5d3f6f5f088421fee8f3030652808076965656`, con confirmación transaccional de compras, gastos y ajustes de stock y una corrección del baseline del E2E de corte; producción sigue intacta en `1a76b00f28ddd5676753133689e24405d0f953f0`.
- Cloudflare Access: pendiente; no habilitado. No cambiar DNS, Tunnel ni exposición sin una tarea explícita.

## Stack y reglas técnicas

- React + Vite + TypeScript en `src/client`.
- Hono + Node en `src/server`.
- PostgreSQL + Drizzle en `src/db`.
- Reglas puras y pruebas en `src/domain`.
- Migraciones SQL en `migrations/`.
- QA principal: `npm run qa`.
- E2E: `npm run test:e2e` contra una base aislada.
- No ejecutar `db:seed`, `bootstrap-user` ni fixtures sobre producción.
- No usar `docker compose down -v` sobre producción.
- No guardar `.env`, contraseñas, tokens, dumps ni datos reales en Git.
- Toda modificación de producción requiere backup verificable, commit exacto, gates y rollback identificable.

## Trabajo ya completado

- Navegación principal reducida a Inicio, Pedidos, Taller, Contactos y Dinero.
- Pedido y Nuevo pedido unificados.
- Quick-create contextual de cliente, producto, material, bordador y proveedor.
- Proveedores persistentes con migración `0010_suppliers.sql`.
- Compras con proveedor seleccionable y compatibilidad con compras históricas.
- Archivado seguro y mensajes concretos cuando no se puede borrar un pedido.
- Preferencias locales para recordar últimas selecciones válidas.
- Formularios de captura mínima con campos secundarios bajo “Más detalles”.
- Dirección visual Samiiwara documentada en `docs/samiiwara-ux-design.md` y `docs/samiiwara-branding.md`.

## Siguiente funcionalidad: captura conversacional

El núcleo interno de captura y el adaptador directo de Telegram ya están implementados y desplegados. La rama también conserva un adaptador HTTP provisional diseñado para OpenClaw, pero queda fuera de la arquitectura acordada: no debe activarse ni ampliarse.

### Estado de Chat-to-ERP v1

- Implementado: parser determinista `rules-v1`, resolución contra el catálogo activo, tabla/migración `capture_drafts` (`0011_capture_drafts.sql`), borradores pendientes, idempotencia por `channel + sourceMessageId` y pantalla interna mobile-first.
- Confirmación habilitada para `NEW_ORDER` y `NEW_CUSTOMER`, siempre con revisión humana. En la rama local `codex/capture-operational-confirmation` también se habilita, con revisión humana, `NEW_PURCHASE`, `NEW_EXPENSE` y `STOCK_ADJUSTMENT`; requiere la migración `0015_capture_operation_confirmation.sql` y QA aislado antes de desplegar.
- El flujo E2E crea, duplica, confirma y verifica un pedido capturado por mensaje, incluyendo el adelanto; el candidato de re-QA añade cobertura de compra, gasto, ajuste de stock y valida el descuento de tela desde la línea base correcta después de esas operaciones.
- La implementación debe ser independiente del canal: la UI interna, Telegram directo y WhatsApp deben llamar al mismo núcleo; el webhook directo está desplegado, pero todavía no hay bot productivo configurado.
- El endpoint `POST /api/integrations/telegram/capture` pertenece al adaptador provisional para OpenClaw y queda fuera del diseño objetivo. Ya no está conectado desde `secureFetch`; no cablearlo en producción. El endpoint directo es `POST /api/integrations/telegram/webhook`.
- Hardening local agregado: contador transaccional por negocio para números de pedido, confirmación de borradores con bloqueo `FOR UPDATE`, idempotencia ante carreras de `sourceMessageId`, `confirmed_order_id`, validación de nombres de cliente, helpers monetarios centralizados, manejo global de errores, headers de seguridad, rate limit de escrituras y Docker con dependencias de producción.
- QA aislado completado: `npm ci`, `npm run qa`, 14/14 migraciones desde cero, migración sobre copia real, E2E, 6/6 pruebas de concurrencia/idempotencia, headers, rate limit, Docker build y ausencia de conexión al endpoint legacy de OpenClaw.
- Deploy controlado completado: backup, migraciones 14/14, health y smoke correctos; no hubo rollback.
- Telegram real aún no está activado porque producción no tiene sus credenciales configuradas. El webhook directo no fue probado contra la API real de Telegram.

### Revisión externa y PR

- Se revisó el informe adjunto `miniERP-code-review.md` (2026-08-18). Es útil como checklist inicial, pero mezcla código activo con rutas legacy y no rastrea siempre `secureFetch`, que es la entrada real de producción.
- No se abrirá un PR como parte de este paso; primero se publicará la rama candidata para que OpenClaw pueda probar el SHA exacto. El PR #11 (`feat/workshop-operations`) ya está fusionado y es anterior a Chat-to-ERP; no debe tratarse como el PR actual.
- El candidato local tenía dos bloqueos principales no cubiertos por el informe: confirmar un borrador no era atómico/idempotente frente a dos reintentos concurrentes, y el patch de correcciones no resolvía realmente la carrera de `nextOrderNumber`.
- Esos dos flujos ya tienen una corrección local: bloqueo transaccional del borrador, creación y marcado en una transacción, y contador por negocio. Falta probarlos con PostgreSQL bajo concurrencia.
- La carrera de `sourceMessageId` ahora captura la violación de unicidad y devuelve el borrador existente; el nombre de cliente exige al menos dos caracteres.
- El archivo `miniERP-code-review-fixes.patch` no aplica limpiamente sobre `cc41085`: `git apply --check` falla en `src/server/security.ts`, porque el patch fue generado contra una base anterior. No incorporarlo como un cherry-pick directo.
- La evidencia de la divergencia es concreta: el candidato local está en `31aa86` y la rama remota existente está en `49cb891`; `git rev-list` muestra 11 commits locales y 3 commits remotos no compartidos. No hacer force-push sobre la rama existente. Además, el patch todavía propone `0010_updated_at_trigger.sql` y modifica rutas legacy que no representan el estado activo. Por eso debe tratarse como revisión de un snapshot anterior, no como una lista aplicable literalmente al checkout actual.
- El patch tampoco debe aceptarse tal cual: crea una migración `0010_updated_at_trigger.sql` cuando ya existen `0010_suppliers.sql` y `0011_capture_drafts.sql`; el trigger omite `suppliers` y `capture_drafts`; `AppError` queda sin conectar a ningún manejador; y el rate limit/headers solo cubren parcialmente las respuestas.
- Soluciones aprovechables del patch ya incorporadas localmente: centralizar helpers monetarios, eliminar duplicación, conectar `AppError`/headers globales y separar `weightedAverageCost` en `src/server/stock-cost.ts`. La función con acceso a DB no se movió a `src/domain/stock.ts`.

### Roadmap acordado desde este checkpoint

1. **Cerrar la base técnica del review:** completado y validado en QA aislado.
2. **Estabilizar captura:** completado; concurrencia e idempotencia validadas en PostgreSQL.
3. **Completar esquema y pruebas:** completado; migraciones `0012`, `0013` y `0014`, E2E y regresión validados.
4. **Telegram piloto:** código y QA aislado completados; falta configurar secretos, registrar el webhook y realizar la prueba sintética con el bot real. OpenClaw no participa en runtime.
5. **Completar operaciones:** implementación local terminada para confirmar `NEW_PURCHASE`, `NEW_EXPENSE` y `STOCK_ADJUSTMENT`; el primer E2E quedó bloqueado por una aserción incorrecta del baseline de stock, corregida en `de5d3f6f5f088421fee8f3030652808076965656`; falta re-QA PostgreSQL/concurrencia, revisión manual y despliegue controlado.
6. **Seguimiento conversacional:** permitir que respuestas como “talla M” o “el precio es 280” actualicen el mismo borrador, con expiración y auditoría.
7. **Entrada multimodal:** voz/transcripción primero; imágenes/OCR después de estabilizar texto.
8. **WhatsApp oficial:** añadir otro adaptador al mismo contrato normalizado, sin duplicar lógica ni reutilizar sesiones personales de OpenClaw.
9. **Endurecimiento:** cookies HttpOnly/CSRF, headers globales, rate limit en el borde, secuencia/contador de pedidos, paginación y dashboard agregado cuando el volumen lo justifique.

### Decisión de canales

Telegram y WhatsApp deben ser adaptadores independientes que llamen al mismo núcleo de captura. OpenClaw no forma parte de este flujo:

```text
Telegram o WhatsApp
        -> adaptador directo del canal
        -> mensaje normalizado
        -> extracción estructurada
        -> resolución de entidades
        -> borrador
        -> confirmación humana
        -> transacción miniERP
        -> auditoría y respuesta
```

Orden recomendado:

1. **Captura interna por chat** en la aplicación, para validar UX y reglas sin depender de proveedores externos.
2. **Telegram directo** mediante Bot API, con texto y botones de confirmación.
3. **Audio e imágenes**: transcripción de notas de voz y extracción desde capturas, después de estabilizar texto.
4. **Adaptador oficial de WhatsApp Business Platform**, usando el mismo núcleo y una línea dedicada cuando la usuaria esté disponible.
5. **Flujos customer-facing**: mensajes directos de clientas, confirmaciones y seguimiento, solo después de validar la captura interna.

### Alcance inicial de Chat-to-ERP

Soportar primero estas intenciones:

- `NEW_ORDER`
- `NEW_CUSTOMER`
- `NEW_PURCHASE`
- `NEW_EXPENSE`
- `STOCK_ADJUSTMENT`

Ejemplo de entrada:

> María quiere vestido Margarita azul talla M, dejó 100 por Yape y lo quiere para el 8.

La IA debe devolver una propuesta estructurada con campos detectados, faltantes, ambiguos y nivel de confianza. La aplicación debe mostrar un borrador editable y exigir confirmación antes de escribir en la base de datos. Nunca crear silenciosamente.

### Contrato conceptual mínimo

```json
{
  "intent": "NEW_ORDER",
  "customer": "María",
  "product": "Vestido Margarita",
  "size": "M",
  "color": "Azul",
  "advance": 100,
  "payment_method": "YAPE",
  "delivery_date": "2026-08-08",
  "missing_fields": [],
  "ambiguous_fields": [],
  "needs_confirmation": true
}
```

La resolución de cliente/producto/material debe usar el catálogo existente, detectar duplicados y pedir aclaración cuando haya más de una coincidencia. El modelo nunca debe tener acceso directo a SQL ni ejecutar mutaciones.

## Telegram directo: límites de alcance

- El bot de Telegram debe ser un adaptador del miniERP, no un segundo sistema de negocio.
- No poner lógica de dominio importante dentro del transporte del canal.
- El token del bot debe vivir únicamente en el entorno privado del servidor.
- Validar webhook/firma, `chat_id`/usuario permitido, idempotencia y auditoría de cada confirmación.
- El primer bot puede aceptar solo texto y botones/respuestas de confirmación. Audio e imágenes quedan para una iteración posterior.
- OpenClaw no debe recibir tokens, sesiones ni datos de negocio; solo se usará para testing, QA y despliegue.

## WhatsApp después

- No reutilizar automáticamente sesiones o credenciales de WhatsApp de OpenClaw como integración productiva.
- Preferir la WhatsApp Business Platform oficial con webhook HTTPS y línea dedicada.
- El webhook debe ser idempotente, validado, limitado por tasa y separado de la UI administrativa.
- Guardar mensajes entrantes como eventos/borradores, no como operaciones confirmadas.
- Considerar privacidad, retención limitada, redacción de logs y control de acceso antes de usar datos reales.
- La ventana y las reglas de mensajería de WhatsApp deben verificarse nuevamente al implementar, porque son dependencias externas cambiantes.

## Qué no priorizar todavía

- Integración customer-facing completa.
- Automatización autónoma que cree pedidos sin confirmación.
- WhatsApp no oficial como solución definitiva.
- Contabilidad tributaria, SUNAT, POS complejo o marketplace.
- Migración inmediata a Cloudflare Pages.

## Operación con OpenClaw

OpenClaw debe recibir prompts cortos y específicos:

- `QA ONLY`: worktree y base efímeros; no modificar código, no commit, no merge, no deploy.
- `DEPLOY CONTROLADO`: solo después de QA PASS; backup, commit exacto, gates, migraciones, health, smoke, rollback y logs.

Nunca pedir a OpenClaw que “arregle” el código durante QA. Si encuentra un FAIL, debe reportarlo; el código se corrige en este repositorio y luego se repite QA.

## Archivos de referencia

- `README.md`: objetivo y dominio general.
- `docs/roadmap.md`: backlog explícito.
- `docs/architecture.md`: arquitectura modular.
- `docs/mvp-spec.md`: especificación funcional inicial.
- `docs/deployment.md`: desarrollo, QA y producción.
- `docs/qa.md`: criterios de validación.
- `docs/qa-pendiente.md`: evidencia de QA/deploy, candidato de operaciones y checklist para el siguiente QA.
- `docs/openclaw-qa-prompt.md`: prompt corto para QA/despliegue condicionado; reemplazar el SHA antes de enviarlo.
- `docs/openclaw-qa-operations-prompt.md`: prompt corto para validar el candidato de operaciones y desplegarlo solo con PASS completo.
- `src/domain/whatsapp.ts`: helpers actuales para enlaces y mensajes WhatsApp; no es todavía una integración API.
- `src/client/capture-preferences.ts`: preferencias locales de captura.
- `src/server/telegram-webhook.ts`: adaptador directo del webhook oficial de Telegram; `src/domain/telegram.ts` contiene el contrato de presentación.
- `src/server/telegram-capture.ts`: implementación provisional del puente anterior para OpenClaw; queda legacy y no está conectada al runtime.

## Procedimiento para continuar después de perder contexto

1. Leer este archivo, `README.md`, `docs/roadmap.md` y `docs/deployment.md`.
2. Ejecutar `git status --short --branch` y `git log -8 --oneline --decorate`.
3. Confirmar si existe un commit candidato publicado y un reporte QA de OpenClaw; el commit desplegado actual es `1a76b00f28ddd5676753133689e24405d0f953f0`.
4. Revisar producción solo de forma no destructiva; no tocarla para desarrollar.
5. Implementar el siguiente paso de Chat-to-ERP en una rama de desarrollo.
6. Ejecutar `npm run qa` y pruebas específicas antes de publicar.
7. Actualizar este archivo con la fecha, commit, resultado, bloqueos y siguiente acción.

## Regla de actualización

Este archivo debe actualizarse al terminar cada tarea relevante. Añadir o modificar siempre:

- fecha y estado actual;
- commit local/remoto si existe;
- qué se implementó o verificó;
- qué quedó pendiente o bloqueado;
- siguiente acción exacta;
- si producción fue o no tocada.
