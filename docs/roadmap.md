# Samiiwara miniERP — Roadmap pendiente

Última actualización: 2026-09-03. Documentación canónica: `continuidad.md`, `qa.md`, `openclaw-qa.md` y este archivo.

Este documento conserva explícitamente decisiones postergadas. Un ítem pendiente no debe interpretarse como descartado.

## Seguridad / operación

- **Cloudflare Access — PENDIENTE.** Mantener el login propio de la aplicación y añadir Access delante del hostname como defensa en profundidad antes de ampliar el piloto o convertirlo en un servicio externo más estable.
- Gestor de secretos — pendiente. El `.env.production` con permisos estrictos sigue siendo la solución de piloto; evaluar un gestor dedicado cuando aumente el alcance operativo.
- Cookie segura `HttpOnly` ya está implementada; mantener pendiente la protección CSRF explícita si se amplían mutaciones cross-site.
- MFA, recuperación de contraseña y administración visible de sesiones/dispositivos.
- Revisión de headers/CSP y reglas WAF/rate-limit de Cloudflare además del rate-limit de aplicación.
- Backups automatizados, prueba periódica de restore y política de retención.

## Operación del taller

- Automatización de WhatsApp mediante proveedor/API. La etapa actual solo genera enlaces y mensajes para revisión humana antes de enviar.
- **Captura conversacional — núcleo v1, hardening inicial y webhook directo de Telegram implementados y desplegados.** Producción está en `f0a01b53f427da5709ea55989a82fdec079bb791`, con QA aislado, E2E, concurrencia/idempotencia, migraciones 0016, Docker, health y smoke autenticado PASS. El webhook está activo; queda validar manualmente la nueva resolución de entidades. OpenClaw queda fuera del runtime.
- **Seguimiento conversacional UX — implementado localmente.** Los borradores incompletos o ambiguos muestran preguntas agrupadas y la confirmación sigue bloqueada hasta resolverlas.
- **Captura multi-turno — publicada y desplegada.** `f0a01b53f427da5709ea55989a82fdec079bb791` añade captura por conversación en Telegram y en la UI interna, junto con la migración 0016. Asocia mensajes, permite completar el mismo borrador, registra cada mensaje y evita replay/duplicados.
- **Resolución de entidades Telegram — candidato publicado, QA/deploy pendientes.** `65944069ca7b9a9a6fda8cd10342f08073d611c1` añade botones para crear clientas, seleccionar productos similares o crear productos nuevos de forma explícita, conservando el mismo borrador y la confirmación humana.
- **Hardening post-code-review — ya validado y desplegado como parte de `f0a01b53…`.** Mantener regresión de carreras de estado/stock y confirmaciones idempotentes en cada candidato posterior.
- Intenciones iniciales de captura: nuevo pedido, nuevo cliente, nueva compra, nuevo gasto y ajuste de stock. La IA propone datos; nunca crea silenciosamente.
- Audio e imágenes quedan después de estabilizar la captura textual y la confirmación.
- Fotos/adjuntos por producto y pedido: referencia de la clienta, bordado enviado/recibido y prenda terminada. Evaluar almacenamiento R2 u objeto equivalente antes de implementarlo.
- Medidas corporales y fittings por cliente **solo si el flujo real lo requiere**; no convertirlo en requisito para pedidos por talla S/M/L/XL/XXL.
- Consumo de otros materiales adicionales (hilo, accesorios u otros) si aparecen como costo/stock relevante en el uso real.
- Posible vinculación automática entre prendas terminadas y pedidos de venta desde stock después de observar cómo Samiiwara registra esas ventas en la práctica.

## Dinero / gestión

- El módulo Dinero es gerencial/referencial, no contabilidad tributaria.
- Definir con uso real si el pago al bordador debe generar automáticamente un gasto de caja o si se registrará manualmente con su fecha real de pago.
- Reportes históricos por rango, exportación CSV/Excel y conciliación simple Yape/Plin/banco.
- Costeo y margen por modelo/talla con histórico suficiente para comparar estimado vs real.

## Producto / UX

- Buscador/filtros cuando el volumen de clientes/pedidos/productos ya lo justifique.
- Mejoras de accesibilidad restantes (IDs/names/autocomplete en todos los campos y auditoría completa de teclado/lectores de pantalla).
- Restaurar registros archivados desde una papelera administrativa si el soft-delete empieza a usarse de forma frecuente.
- PWA/offline solo si el uso móvil y conectividad del taller lo justifican.
