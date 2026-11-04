#!/usr/bin/env node
/**
 * Generates the secrets Visualize Proposal needs, and hashes staff passwords for STAFF_ACCOUNTS.
 *
 *   node scripts/visualize-setup.mjs          prints the variables to paste into Vercel → Settings → Environment Variables
 *   node scripts/visualize-setup.mjs --dev    writes .env.local for local testing (in-memory storage)
 *
 * Passwords are typed at a hidden prompt and never written anywhere except as scrypt hashes.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

// keep in step with server/passwords.ts
const clean = (s) => s.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "").trim();

export function hashStaffPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scryptCb(clean(password), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e ? reject(e) : resolve(`scrypt:16384:8:1:${salt.toString("base64")}:${key.toString("base64")}`),
    ),
  );
}

function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    const write = rl._writeToOutput.bind(rl);
    if (hidden) rl._writeToOutput = (s) => write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, "•"));
    rl.question(question, (answer) => {
      rl._writeToOutput = write;
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const dev = process.argv.includes("--dev");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  console.log("Add every staff account that signs in to Event Bridge (all of them: once this is live, only these can sign in).");
  console.log("Leave the email empty to finish.\n");
  const staff = {};
  for (;;) {
    const email = clean(await ask(rl, "Staff email: ")).toLowerCase();
    if (!email) break;
    const password = await ask(rl, "Password (hidden): ", true);
    if (!clean(password)) {
      console.log("  The password can't be empty.\n");
      continue;
    }
    if (clean(password).length < 8) console.log("  Tip: this password is short and easy to guess; consider a longer one.");
    staff[email] = await hashStaffPassword(password);
    console.log(`  Added ${email}\n`);
  }
  rl.close();
  if (!Object.keys(staff).length) {
    console.log("No accounts added; nothing written.");
    return;
  }

  const vars = {
    SESSION_SECRET: randomBytes(32).toString("base64url"),
    FILE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    STAFF_ACCOUNTS: JSON.stringify(staff),
  };
  if (dev) {
    if (existsSync(".env.local")) console.log("Replacing the existing .env.local.");
    const lines = ["# Local testing only (gitignored). Files and sessions are kept in memory.", "VISUALIZE_STORE=memory", ...Object.entries(vars).map(([k, v]) => `${k}='${v}'`)];
    writeFileSync(".env.local", lines.join("\n") + "\n");
    console.log("Wrote .env.local. Restart `npm run dev`.");
  } else {
    console.log("\nAdd these in Vercel → your project → Settings → Environment Variables (Production), then redeploy.");
    console.log("Keep FILE_ENCRYPTION_KEY safe: changing it makes every shared file unreadable.\n");
    for (const [k, v] of Object.entries(vars)) console.log(`${k}\n${v}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
