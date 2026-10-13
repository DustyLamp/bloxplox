# BloxPlox

Blocks for your day, Habits for routines, and Things for one-off tasks. Plan sessions containing several Things, with shared task completion wherever they appear. The React application lives in `apps/web`; the approved design remains runnable in `apps/prototype`.

## Development

Use Node 22 (see `.nvmrc`) and Yarn 4.18.1 with `nodeLinker: node-modules`.

```sh
corepack enable
yarn install --immutable
VITE_LOCAL_TEST=true yarn dev
```

Open http://127.0.0.1:5174. Local test mode uses a persistent, isolated browser database without AWS. It is a development-only Vite flag and is never included in deployment builds. To develop against AWS, copy the deployed `/config.json` to `apps/web/public/config.json` (ignored) and run `yarn dev` without the flag.

```sh
yarn typecheck
yarn test
yarn test:install
yarn test:e2e
yarn build
yarn synth
```

`yarn dev:prototype` opens the original prototype on port 4173; `yarn test:prototype` runs its original interaction checks. An existing Chromium binary can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | React browser application |
| `apps/mobile` | Expo / React Native iOS and Android application |
| `packages/auth`, `packages/graph`, `packages/ui` | Shared authentication, React Flow canvas and live form behaviour |
| `packages/domain` | Validated records, calendar rules, schedule and conflict resolution |
| `packages/sync` | RxDB with browser IndexedDB or native SQLite, shared authenticated replication |
| `services/functions` | HTTP synchronization, WebSocket sessions and Streams notifications |
| `infrastructure` | TypeScript CDK application, hosting and deployment pipeline |
| `tests/production` | Production application browser checks |
| `apps/prototype`, `design`, `samples` | Approved visual reference and synthetic sample data |

## Deployment

Live at **https://bloxplox.com**, account `807550663091`, region `eu-north-1`, local AWS profile `bloxplox`. Public account creation requires email verification.

Email, Google and Apple login are verified live on the web. Matching verified
Google and Apple emails were confirmed to use the existing account and planner.
Physical-device checks remain part of native beta verification.
iOS build 1002 is available to the invited internal TestFlight tester. Android
build 1003 is available as a [signed beta download](https://github.com/DustyLamp/bloxplox/releases/tag/android-beta-0.1.0-1003).
Neither app has been released publicly through the App Store or Google Play.

The `bloxplox-production` CodePipeline watches `main`, tests the application, synthesizes and updates itself, deploys the backend, then publishes a matching build and runtime configuration to Amplify. Merge to `main` to deploy. No manual pipeline approval is required.

The first pipeline deployment requires the account to be bootstrapped and a GitHub source token in Secrets Manager at `bloxplox/github-token`. Never put the token in source or CDK context.

```sh
AWS_PROFILE=bloxplox yarn cdk deploy BloxPloxPipeline --require-approval never
```

See [architecture](docs/architecture.md), [product behaviour](docs/product.md), and the [implementation and verification log](docs/implementation.md). [Handoff notes](docs/handoff.md) distinguish the retained prototype from the production source.

Poppins and Lucide assets are bundled locally; see [third-party notices](licenses/README.md). No application source license has been selected.

## Current preview policy

All features are free for every account. There is no paywall, checkout or five-habit limit during the preview. `paidPlansEnabled` in the shared domain and `PAID_PLANS_ENABLED=false` in CDK make this explicit. The proposed USD $4/month and $30/year plans are implemented behind this release policy; creating a Stripe secret alone cannot activate them.

## Native development

```sh
yarn workspace @bloxplox/mobile start --max-workers 2
yarn typecheck:mobile
yarn workspace @bloxplox/mobile export --max-workers 2
```

The native app uses the same records, recurrence, completion, prerequisites, schedule actions, authentication and replication as the browser app. Credentials use SecureStore; account-specific RxDB data uses transactional SQLite. The React Flow graph runs in a bundled offline DOM component, alongside native prerequisite controls. Native social sign-in uses the system browser and the `bloxplox://auth` callback; it requires an installed build with the app's URL scheme, rather than Expo Go.


Native preview builds are manual and do not deploy production:

```sh
gh workflow run native.yml --ref main -f platform=both
```

Use `android` or `ios` to build only one platform. The workflow produces an Android APK with development signing and a Release iOS simulator application; artifacts expire after one day. Physical iPhone/TestFlight builds use the manual **Build and upload iOS beta** workflow and the selected Xube Apple team; see [native release setup](docs/mobile-release.md). Google and Apple buttons appear only when their provider configuration is active.

The separate **Build signed Android beta** workflow runs manually on `main` and
uses private signing material from the `native-beta` GitHub environment. See the
[native release guide](docs/mobile-release.md) for signing, distribution, account
deletion and cost controls. Web and native Settings include permanent account
deletion; the public web path is https://bloxplox.com/delete-account.

`yarn test:live` and `yarn test:live:deletion` verify the deployed service using
new disposable accounts, then remove their data. These are explicit operator
checks, not part of pull-request CI.
