import { dataProvider as supabaseDataProvider } from "@refinedev/supabase";
import { supabaseClient } from "./supabase-client";

const base = supabaseDataProvider(supabaseClient);

export const dataProvider = {
  ...base,
  update: async (args: Parameters<typeof base.update>[0]) => {
    try {
      return await base.update(args);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === "PGRST204") {
        const msg =
          (e?.message ?? "") +
          " Apply the plans migration (currency, description_by_locale) in Supabase SQL. Then run: NOTIFY pgrst, 'reload schema';";
        throw Object.assign(err as object, { message: msg, statusCode: 400 });
      }
      throw err;
    }
  },
};
