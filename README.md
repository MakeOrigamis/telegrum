# Telegrum

Solana-native encrypted messenger — wallet identity, DMs, groups, replies, and images.

- **Identity**: Solana address (Phantom / Solflare)
- **Encryption**: TweetNaCl E2EE in the browser (conversation keys wrapped per member)
- **Relay**: Next.js API + Netlify Blobs (ciphertext only)
- **Client**: Web / PWA (no App Store gate)

## Features

- Connect Solana wallet
- Encrypted DMs and groups
- Replies
- Image sharing
- Display names
- Chat search

## Local

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Deploy (Netlify)

```bash
# set SESSION_SECRET in Netlify env
netlify deploy --prod
```

Env vars:

- `SESSION_SECRET` — random long string for auth tokens
- `NEXT_PUBLIC_SOLANA_RPC` — optional custom RPC
