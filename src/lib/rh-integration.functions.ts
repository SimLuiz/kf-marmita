import { createServerFn } from "@tanstack/react-start";
import { soAdmin } from "./middleware";

/** Devolve a chave de integração do RH — somente para administradores. */
export const getRhApiKey = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .handler(async () => {
    const key = process.env["RH_API_KEY"];
    return { key: key ?? null };
  });
