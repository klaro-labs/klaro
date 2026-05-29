// Manually enqueue the screen-and-settle BullMQ job for a paid invoice.
// Used to bypass listener flakiness on local daemon (the worker logic is
// what we want to verify for P0-7).

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = Object.fromEntries(
  readFileSync(resolve("../daemon/.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const q = new Queue("screen-and-settle", {
  connection,
  prefix: env.BULLMQ_PREFIX || "klaro",
});

const invoiceId =
  "0xc5835e4b5794a1d0f9f9a279b14edfadbcc2eec9fe8c69f2ffd7e9e3d59a1d41";
const paidTxHash =
  "0x36fbdc091f072fa2037be7bae96ee5d77cbc4514261565e97a3cb5669a0bceff";

const job = await q.add(
  invoiceId,
  {
    invoiceId,
    buyerAddress: "0x2a369C18C59aD000668e0329dA4b2122317e22C9",
    amount: "1000000",
    paidTxHash,
  },
  { jobId: `screen-and-settle_${invoiceId}` },
);
console.log("Enqueued job:", job.id, "for invoice:", invoiceId);

await q.close();
await connection.quit();
