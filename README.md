# Sakura Timecard

## Local setup

This project now uses React, Vite, and Vitest.

Recommended local toolchain:

- Node.js 22
- npm 10 or newer

If you use `nvm`:

```bash
nvm install
nvm use
```

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build production assets:

```bash
npm run build
```

## GitHub accounts

To use this repository with a store GitHub account while keeping personal repositories on a personal account, see [the multiple-account setup guide](docs/github-multiple-accounts.md).

For the Supabase online expansion specification and phased rollout plan, see [the online expansion specification](docs/online-expansion-spec.md).

For the current branch, environment setup, Supabase migrations, and the next implementation steps, see [the development handoff memo](docs/development-handoff.md).

To test from Android on the same Wi-Fi:

```bash
npm run dev -- --host
```

Then open `http://<your-mac-ip>:5173` on the Android device.

## Security note

Current `npm audit` findings are centered on dev tooling. To reduce risk:

- keep the dev server local unless you are actively testing on another device
- avoid leaving `npm run dev -- --host` running longer than needed
- do not use Vitest UI

## Next upgrade path

Once Node 22 is installed locally, we can safely move the dev dependencies to newer Vite and Vitest releases and then re-check `npm audit`.
