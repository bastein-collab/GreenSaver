# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Run the app

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


## Wire live data (Supabase)

The UI is locked. To power it with live data:

1) Create a Supabase project and set env vars

- Copy .env to your local dev env and fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (client) and SUPABASE_SERVICE_ROLE (for scrapers).
- Expo automatically exposes EXPO_PUBLIC_* to the app.

2) Create tables/views

- Run db/schema_example.sql followed by db/security_init.sql in the Supabase SQL editor. This creates minimal tables and two views used by the app:
  - _deals_by_store → summaries for the green “Top Dispensaries Today” card
  - 	op_brands_today → rows for the peach “Top Brands Today” card

3) Ingest data (optional starter)

- Use scripts/scrape_demo.mjs with the server envs to upsert products/deals from a target store. You can adapt it per vendor and schedule via GitHub Actions or a Supabase Edge Function.

4) App data contracts

- Deals list screen reads from a PostgREST resource named deals_view (see services/deals.ts). You can point that constant at any table/view that exposes:
  id, product_name, brand_name, dispensary_name, percent_off, price_cents.
- Savers screen reads:
  - _deals_by_store via an RPC fallback (see hooks/useStoreSummaries.ts).
  - 	op_brands_today via services/brands.ts.

Once the SQL and ingestion are in place, the app shows live data with safe fallbacks when envs are missing.

### SQL to run in Supabase (order)

1. `db/schema_example.sql` – base tables + core views
2. `db/deals_view.sql` – PostgREST view for deals list
3. `db/geo.sql` – ZIP centroids, haversine, geo RPCs
4. `db/reviews_subscriptions.sql` – subscriptions + reviews with RLS
5. `db/security_init.sql` – grants/policies (idempotent)

Tip: Use the Supabase SQL Editor. All scripts are idempotent and safe to re-run.

### VS Code + Supabase workflow

- Edit TypeScript/UI in VS Code as usual. The UI is frozen; only data wiring should change.
- Apply SQL by pasting the files above into the Supabase SQL Editor (or check them into a migration system if you prefer). No additional tooling required.
- Env: keep `.env` with client keys for Expo (`EXPO_PUBLIC_*`) and server keys for scrapers; VS Code uses them via `start-dev.ps1` and scripts.
