import { Inngest } from "inngest";

import { env } from "../env";

export const inngest = new Inngest({
  id: env.INNGEST_APP_ID,
});
