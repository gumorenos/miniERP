# Samiiwara miniERP — Roadmap pendiente

Última actualización: 2026-08-25. Documentación canónica: `continuidad.md`, `qa.md`, `openclaw-qa.md` y este archivo.

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
- **Captura conversacional — núcleo v1, hardening inicial y webhook directo de Telegram implementados y desplegados.** Producción está en `eb455839c42ef0b6e411edfc4f356dae3fe00b1d`, con QA aislado, E2E, concurrencia/idempotencia, migraciones 0016, Docker, health y smoke autenticado PASS. Telegram real aún requiere secretos privados, webhook y prueba con el bot autorizado. OpenClaw queda fuera del runtime.
- **Seguimiento conversacional UX — implementado localmente.** Los borradores incompletos o ambiguos muestran preguntas agrupadas y la confirmación sigue bloqueada hasta resolverlas.
- **Captura multi-turno — publicada y desplegada.** `eb455839c42ef0b6e411edfc4f356dae3fe00b1d` añade captura por conversación en Telegram y en la UI interna, junto con la migración 0016. Asocia mensajes, permite completar el mismo borrador, registra cada mensaje y evita replay/duplicados. Falta probar el webhook con Telegram real.
- **Hardening post-code-review — ya validado y desplegado como parte de `eb455…`.** Mantener regresión de carreras de estado/stock y confirmaciones idempotentes en cada candidato posterior.
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
