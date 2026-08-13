import { serve } from "@hono/node-server";
import { secureFetch } from "./security";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: secureFetch, port }, (info) => {
  console.log(`miniERP listening on http://localhost:${info.port}`);
});
