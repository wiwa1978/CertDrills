import { z } from "zod";

import { successResultSchema } from "../common/result";

export const countryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  language: z.string(),
});

export const countriesResponseSchema = successResultSchema(z.array(countryRecordSchema));

export type CountryRecord = z.infer<typeof countryRecordSchema>;
