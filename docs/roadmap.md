# Samiiwara miniERP — Roadmap pendiente

Este documento conserva explícitamente decisiones postergadas. Un ítem pendiente no debe interpretarse como descartado.

## Seguridad / operación

- **Cloudflare Access — PENDIENTE.** Mantener el login propio de la aplicación y añadir Access delante del hostname como defensa en profundidad antes de ampliar el piloto o convertirlo en un servicio externo más estable.
- Gestor de secretos — pendiente. El `.env.production` con permisos estrictos sigue siendo la solución de piloto; evaluar un gestor dedicado cuando aumente el alcance operativo.
- Migrar bearer token en `localStorage` a cookie segura `HttpOnly` + protección CSRF.
- MFA, recuperación de contraseña y administración visible de sesiones/dispositivos.
- Revisión de headers/CSP y reglas WAF/rate-limit de Cloudflare además del rate-limit de aplicación.
- Backups automatizados, prueba periódica de restore y política de retención.

## Operación del taller

- Automatización de WhatsApp mediante proveedor/API. La etapa actual solo genera enlaces y mensajes para revisión humana antes de enviar.
- **Captura conversacional — núcleo v1, hardening inicial y webhook directo de Telegram implementados y desplegados (2026-08-19).** El núcleo está en producción junto con las operaciones conversacionales en `de5d3f6f5f088421fee8f3030652808076965656`, que pasó QA aislado, E2E, concurrencia/idempotencia, migraciones y Docker. Telegram aún requiere configurar secretos, registrar el webhook y hacer una prueba sintética con el bot real. OpenClaw queda fuera del runtime funcional y se usa únicamente para testing, QA y despliegue. Conectar WhatsApp oficial cuando la usuaria esté disponible. Telegram y WhatsApp deben ser adaptadores intercambiables, no dos implementaciones de negocio distintas.
- **Seguimiento conversacional UX — implementado en el candidato `8ad1bf85548fbc35aad89eb709da953178bf45fd`, aún no desplegado.** Los borradores incompletos o ambiguos muestran etiquetas legibles y preguntas agrupadas con ejemplos; cualquier ambigüedad bloquea la confirmación. El siguiente incremento es asociar respuestas posteriores al borrador pendiente correcto y reparsear/mezclar sus campos sin duplicar registros.
- **Hardening post-code-review — en desarrollo.** El siguiente candidato corrige carreras de estado/stock en corte, bordado, ensamblaje, entrega, ajustes manuales y edición/anulación de compras. También añade escenarios E2E concurrentes para corte, ensamblaje y preparación de entrega. No está desplegado: requiere QA aislado con PostgreSQL, pruebas de rollback/concurrencia y aprobación del SHA exacto.
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
