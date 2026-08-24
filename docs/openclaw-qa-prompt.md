# Prompt compacto para OpenClaw

Este documento queda como referencia histórica del deploy de b6. No volver a ejecutarlo: `b6b51b0bc637e1b8504c0964c985f37ab96f67d0` ya está desplegado y pasó QA, smoke autenticado, migraciones, health y deploy.

Para la próxima funcionalidad, ChatGPT debe publicar un SHA nuevo y preparar un prompt autocontenido con:
- contexto miniERP/Samiiwara;
- SHA exacto y verificación sin fallback;
- QA aislado;
- smoke correspondiente;
- backup, rollback y deploy condicionado;
- regla de no revelar secretos.

OpenClaw solo hace QA, backup y deploy. Nunca modifica código ni se integra al runtime.
