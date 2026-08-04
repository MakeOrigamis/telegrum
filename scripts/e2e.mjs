// End-to-end check of the live relay: two wallets, DM, group, reply, image.
// Signs real ed25519 challenges and does the NaCl envelope round trip.
import nacl from "tweetnacl";
import bs58 from "bs58";

const BASE = process.argv[2] || "https://telegrum-solana.netlify.app";
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (b) => Buffer.from(b).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures += 1;
};

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function signIn(name) {
  const signKp = nacl.sign.keyPair();
  const pubkey = bs58.encode(signKp.publicKey);

  const challenge = await api("/api/auth/challenge", {
    method: "POST",
    body: { pubkey },
  });
  if (challenge.status !== 200) throw new Error(`challenge failed ${challenge.status}`);

  const signature = bs58.encode(
    nacl.sign.detached(te.encode(challenge.json.message), signKp.secretKey),
  );

  // Mirrors the browser: box keys are derived from a wallet signature.
  const seedSig = nacl.sign.detached(te.encode(`Telegrum encryption v1\n${pubkey}`), signKp.secretKey);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", seedSig));
  const boxKp = nacl.box.keyPair.fromSecretKey(digest);

  const verified = await api("/api/auth/verify", {
    method: "POST",
    body: {
      pubkey,
      message: challenge.json.message,
      signature,
      boxPublicKey: bs58.encode(boxKp.publicKey),
      displayName: name,
    },
  });
  if (verified.status !== 200) {
    throw new Error(`verify failed ${verified.status} ${JSON.stringify(verified.json)}`);
  }
  return { name, pubkey, boxKp, token: verified.json.token };
}

function wrapFor(convKey, recipientBoxPub, sender) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  return {
    nonce: b64(nonce),
    ciphertext: b64(nacl.box(convKey, nonce, recipientBoxPub, sender.boxKp.secretKey)),
    fromBoxPublicKey: bs58.encode(sender.boxKp.publicKey),
  };
}

function unwrap(wrap, me) {
  const opened = nacl.box.open(
    unb64(wrap.ciphertext),
    unb64(wrap.nonce),
    bs58.decode(wrap.fromBoxPublicKey),
    me.boxKp.secretKey,
  );
  if (!opened) throw new Error("unwrap failed");
  return opened;
}

const seal = (text, key) => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { nonce: b64(nonce), ciphertext: b64(nacl.secretbox(te.encode(text), nonce, key)) };
};

const open = (payload, key) => {
  const out = nacl.secretbox.open(unb64(payload.ciphertext), unb64(payload.nonce), key);
  if (!out) throw new Error("decrypt failed");
  return td.decode(out);
};

console.log(`Testing ${BASE}\n`);

const alice = await signIn("Alice");
const bob = await signIn("Bob");
check("wallet sign-in issues session tokens", !!alice.token && !!bob.token);

const bobProfile = await api(`/api/profile?pubkey=${bob.pubkey}`, { token: alice.token });
check("peer profile is discoverable", bobProfile.status === 200 && !!bobProfile.json.profile?.boxPublicKey);

const bobBoxPub = bs58.decode(bobProfile.json.profile.boxPublicKey);

// --- DM ---
const dmKey = nacl.randomBytes(nacl.secretbox.keyLength);
const dm = await api("/api/conversations", {
  method: "POST",
  token: alice.token,
  body: {
    type: "dm",
    memberPubkeys: [bob.pubkey],
    keyWraps: {
      [alice.pubkey]: wrapFor(dmKey, alice.boxKp.publicKey, alice),
      [bob.pubkey]: wrapFor(dmKey, bobBoxPub, alice),
    },
  },
});
check("create DM", dm.status === 200, JSON.stringify(dm.json).slice(0, 120));
const dmId = dm.json.conversation?.id;

const sent = await api(`/api/conversations/${dmId}/messages`, {
  method: "POST",
  token: alice.token,
  body: { kind: "text", ...seal("gm bob, telegram is down again", dmKey) },
});
check("send encrypted DM", sent.status === 200);

const bobList = await api("/api/conversations", { token: bob.token });
const bobDm = bobList.json.conversations?.find((c) => c.id === dmId);
check("DM appears in peer's inbox", !!bobDm);

const bobKey = unwrap(bobDm.keyWraps[bob.pubkey], bob);
const bobInbox = await api(`/api/conversations/${dmId}/messages`, { token: bob.token });
const decrypted = open(bobInbox.json.messages[0], bobKey);
check("peer decrypts the message", decrypted === "gm bob, telegram is down again", decrypted);

// --- reply threading ---
const reply = await api(`/api/conversations/${dmId}/messages`, {
  method: "POST",
  token: bob.token,
  body: { kind: "text", replyToId: bobInbox.json.messages[0].id, ...seal("gm, this is faster", bobKey) },
});
check("reply carries replyToId", reply.status === 200 && reply.json.message.replyToId === bobInbox.json.messages[0].id);

// --- group ---
const groupKey = nacl.randomBytes(nacl.secretbox.keyLength);
const group = await api("/api/conversations", {
  method: "POST",
  token: alice.token,
  body: {
    type: "group",
    title: "Telegrum HQ",
    memberPubkeys: [bob.pubkey],
    keyWraps: {
      [alice.pubkey]: wrapFor(groupKey, alice.boxKp.publicKey, alice),
      [bob.pubkey]: wrapFor(groupKey, bobBoxPub, alice),
    },
  },
});
check("create group chat", group.status === 200 && group.json.conversation?.type === "group");

const gid = group.json.conversation?.id;
await api(`/api/conversations/${gid}/messages`, {
  method: "POST",
  token: alice.token,
  body: { kind: "text", ...seal("welcome to the group", groupKey) },
});
const bobGroup = await api(`/api/conversations/${gid}/messages`, { token: bob.token });
const bobGroupKey = unwrap(bobGroup.json.conversation.keyWraps[bob.pubkey], bob);
check("group message decrypts for member", open(bobGroup.json.messages[0], bobGroupKey) === "welcome to the group");

// --- encrypted image ---
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const imgNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
const imgCipher = nacl.secretbox(new Uint8Array(png), imgNonce, dmKey);
const upload = await api("/api/media", {
  method: "POST",
  token: alice.token,
  body: { contentType: "image/png", dataBase64: b64(imgCipher) },
});
check("upload encrypted image", upload.status === 200 && !!upload.json.id);

const fetched = await fetch(`${BASE}${upload.json.url}`);
const roundTripped = nacl.secretbox.open(new Uint8Array(await fetched.arrayBuffer()), imgNonce, dmKey);
check("image round trips and decrypts", !!roundTripped && Buffer.from(roundTripped).equals(png));

// --- access control ---
const mallory = await signIn("Mallory");
const intrusion = await api(`/api/conversations/${dmId}/messages`, { token: mallory.token });
check("non-member cannot read a conversation", intrusion.status === 404);
const noAuth = await api(`/api/conversations/${dmId}/messages`);
check("unauthenticated read is rejected", noAuth.status === 401);

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
