// Launch "Duck, Employee of the Month" ($EOTM) on pump.fun: create only, never a buy.
// usage:
//   node launch.mjs simulate <wallet.json> <mint.json> <metadataUri>   build, sign, simulate (spends nothing)
//   node launch.mjs send     <wallet.json> <mint.json> <metadataUri>   same checks, then broadcast
// Node 22 standard library only. Keys are read locally and never sent anywhere; only signatures leave.
import fs from "node:fs";
import crypto from "node:crypto";

const NAME = "Duck, Employee of the Month";
const SYMBOL = "EOTM";
const RPC = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
const PRIORITY_FEE_SOL = 0.00002;
const MAX_SPEND_LAMPORTS = 7_000_000; // refuse anything costing the wallet more than 0.007 SOL
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58enc(buf) {
  let n = 0n; for (const b of buf) n = n * 256n + BigInt(b);
  let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

function loadKeypair(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw) || raw.length !== 64) throw new Error(`${file}: not a 64-byte solana keypair`);
  const bytes = Uint8Array.from(raw);
  const seed = Buffer.from(bytes.slice(0, 32)), pub = Buffer.from(bytes.slice(32));
  const key = crypto.createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: seed.toString("base64url"), x: pub.toString("base64url") }, format: "jwk" });
  return { pubkey: b58enc(pub), sign: (msg) => crypto.sign(null, msg, key) };
}

function makeKeypairFile(file) {
  const k = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  fs.writeFileSync(file, JSON.stringify([...Buffer.from(k.d, "base64url"), ...Buffer.from(k.x, "base64url")]), { mode: 0o600, flag: "wx" });
}

async function rpc(method, params) {
  let last;
  for (let i = 0; i < 6; i++) {
    const url = RPC[i % RPC.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (!r.ok) { last = `${url} http ${r.status}`; await new Promise((s) => setTimeout(s, 800)); continue; }
      const j = await r.json();
      if (j.error) { last = JSON.stringify(j.error); if (method === "sendTransaction") break; continue; }
      return j.result;
    } catch (e) { last = e.message; }
  }
  throw new Error(`${method}: ${last}`);
}

// --- minimal transaction parsing -------------------------------------------------------------
function readCompact(buf, o) {
  let len = 0, size = 0;
  for (;;) { const b = buf[o + size]; len |= (b & 0x7f) << (7 * size); size++; if ((b & 0x80) === 0) break; }
  return [len, o + size];
}
function parseTx(buf) {
  let o = 0, nsig;
  [nsig, o] = readCompact(buf, o);
  const sigStart = o; o += 64 * nsig;
  const msgStart = o;
  const versioned = (buf[o] & 0x80) !== 0; if (versioned) o++;
  const header = { req: buf[o], roSigned: buf[o + 1], roUnsigned: buf[o + 2] }; o += 3;
  let nkeys; [nkeys, o] = readCompact(buf, o);
  const keys = []; for (let i = 0; i < nkeys; i++) { keys.push(b58enc(buf.subarray(o, o + 32))); o += 32; }
  o += 32; // recent blockhash
  let nix; [nix, o] = readCompact(buf, o);
  const ixs = [];
  for (let i = 0; i < nix; i++) {
    const prog = buf[o++];
    let na; [na, o] = readCompact(buf, o); const accts = [...buf.subarray(o, o + na)]; o += na;
    let nd; [nd, o] = readCompact(buf, o); const data = Buffer.from(buf.subarray(o, o + nd)); o += nd;
    ixs.push({ program: keys[prog] ?? `lookup#${prog}`, accts, data });
  }
  let nlut = 0; if (versioned) [nlut, o] = readCompact(buf, o);
  return { nsig, sigStart, msgStart, header, keys, ixs, lookups: nlut };
}

// Anchor discriminators for pump.fun's trade instructions: sha256("global:<name>")[0..8]
const disc = (n) => crypto.createHash("sha256").update(`global:${n}`).digest().subarray(0, 8).toString("hex");
const BUY_DISCS = new Set(["buy", "buy_exact_sol_in", "buy_v2", "buy_v3", "buy_exact_quote_in", "buy_exact_quote_in_v2", "create_coin_and_buy_bonding_curve_v3"].map(disc));

// --- main ------------------------------------------------------------------------------------
const [mode, walletFile, mintFile, uri] = process.argv.slice(2);
if (!["simulate", "send"].includes(mode) || !walletFile || !mintFile || !uri) {
  console.error("usage: node launch.mjs simulate|send <wallet.json> <mint.json> <metadataUri>"); process.exit(2);
}
if (!fs.existsSync(mintFile)) { makeKeypairFile(mintFile); console.log(`made mint keypair ${mintFile}`); }
const wallet = loadKeypair(walletFile), mint = loadKeypair(mintFile);
console.log(`wallet ${wallet.pubkey}\nmint   ${mint.pubkey}\nname   ${NAME}  $${SYMBOL}\nuri    ${uri}`);

const res = await fetch("https://pumpportal.fun/api/trade-local", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ publicKey: wallet.pubkey, action: "create", tokenMetadata: { name: NAME, symbol: SYMBOL, uri },
    mint: mint.pubkey, denominatedInSol: "true", amount: 0, slippage: 10, priorityFee: PRIORITY_FEE_SOL, pool: "pump" }),
});
if (res.status !== 200) throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
const tx = Buffer.from(await res.arrayBuffer());
const p = parseTx(tx);

// Checks before anything is signed.
const signers = p.keys.slice(0, p.header.req);
console.log(`signers: ${signers.join(", ")}  lookups: ${p.lookups}`);
if (signers.length !== 2 || !signers.includes(wallet.pubkey) || !signers.includes(mint.pubkey)) throw new Error("unexpected signers");
if (p.keys[0] !== wallet.pubkey) throw new Error("fee payer is not the wallet");
for (const ix of p.ixs) {
  const d = ix.data.subarray(0, 8).toString("hex");
  console.log(`  ix ${ix.program} data[0..8]=${d} accts=${ix.accts.length}`);
  if (BUY_DISCS.has(d)) throw new Error("transaction contains a buy instruction: refusing");
}
if (!p.ixs.some((ix) => ix.program === PUMP_PROGRAM)) throw new Error("no pump.fun program instruction");

// Sign: each signature slot matches the static key at the same index.
const msg = tx.subarray(p.msgStart);
for (let i = 0; i < p.header.req; i++) {
  const kp = signers[i] === wallet.pubkey ? wallet : mint;
  kp.sign(msg).copy(tx, p.sigStart + 64 * i);
}
const b64 = tx.toString("base64");

// Simulate with signatures checked; refuse if the wallet would spend more than the cap.
const pre = (await rpc("getBalance", [wallet.pubkey])).value;
const sim = await rpc("simulateTransaction", [b64, { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false, accounts: { encoding: "base64", addresses: [wallet.pubkey] } }]);
const v = sim.value;
const logs = (v.logs || []).filter((l) => l.includes("Instruction:")).map((l) => l.split("Instruction: ")[1]);
console.log(`simulation: err=${JSON.stringify(v.err)} cu=${v.unitsConsumed}\n  instructions: ${[...new Set(logs)].join(", ")}`);
if (v.err) { console.log((v.logs || []).slice(-15).join("\n")); throw new Error("simulation failed"); }
if (logs.some((l) => /buy/i.test(l))) throw new Error("simulation shows a buy: refusing");
const postLamports = v.accounts?.[0]?.lamports;
const fee = 5000 * p.header.req + Math.round(PRIORITY_FEE_SOL * 1e9);
const spend = pre - postLamports + 0;
console.log(`wallet before ${pre} lamports, after (excl. fees) ${postLamports}; rent ${spend}, fees <= ~${fee}; total ~${spend + fee} (${((spend + fee) / 1e9).toFixed(6)} SOL)`);
if (spend + fee > MAX_SPEND_LAMPORTS) throw new Error("costs more than the cap: refusing");

if (mode === "simulate") { console.log("simulate only: nothing sent"); process.exit(0); }

const sig = await rpc("sendTransaction", [b64, { encoding: "base64", skipPreflight: false, maxRetries: 5 }]);
console.log(`sent ${sig}`);
for (let i = 0; i < 60; i++) {
  await new Promise((s) => setTimeout(s, 2000));
  const st = (await rpc("getSignatureStatuses", [[sig]])).value[0];
  if (st?.err) throw new Error(`failed on chain: ${JSON.stringify(st.err)}`);
  if (st && ["confirmed", "finalized"].includes(st.confirmationStatus)) {
    console.log(`confirmed (${st.confirmationStatus})`);
    fs.writeFileSync("LAUNCH.json", JSON.stringify({ mint: mint.pubkey, create_signature: sig }, null, 2) + "\n");
    console.log("wrote LAUNCH.json");
    process.exit(0);
  }
}
throw new Error(`not confirmed yet: check ${sig}`);
