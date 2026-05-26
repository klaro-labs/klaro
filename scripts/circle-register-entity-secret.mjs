#!/usr/bin/env node
// One-shot: encrypt the local CIRCLE_ENTITY_SECRET with Circle's RSA public key
// (OAEP / SHA-256), then POST the ciphertext to Circle to register it. Circle
// returns a recovery file which is the only way to rotate the entity secret
// later — save it somewhere safe and OFFLINE.
//
// Usage:
//   CIRCLE_API_KEY=... CIRCLE_ENTITY_SECRET=... node scripts/circle-register-entity-secret.mjs

import { publicEncrypt, constants } from "node:crypto";
import { writeFileSync } from "node:fs";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set");
  process.exit(1);
}

const BASE = "https://api.circle.com";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

const { data: pkData } = await api("GET", "/v1/w3s/config/entity/publicKey");
const publicKey = pkData.publicKey;
if (!publicKey) {
  console.error("No publicKey in response");
  process.exit(1);
}

const ciphertextBuf = publicEncrypt(
  {
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  Buffer.from(entitySecret, "hex"),
);
const ciphertext = ciphertextBuf.toString("base64");

console.log("Registering entity-secret ciphertext with Circle…");

const result = await api("POST", "/v1/w3s/config/entity/entitySecret", {
  entitySecretCiphertext: ciphertext,
});

const recovery = result?.data?.recoveryFile;
if (!recovery) {
  console.error("No recoveryFile returned. Full response:", JSON.stringify(result, null, 2));
  process.exit(1);
}

const filename = `circle-recovery-file-${new Date().toISOString().slice(0, 10)}.dat`;
writeFileSync(filename, recovery, "utf8");
console.log(`\nDone. Recovery file written to ./${filename}`);
console.log("MOVE THIS FILE OFFLINE — it is the only way to rotate the entity secret.");
