# Store privacy labels

The answers to give App Store Connect (App Privacy) and the Google Play Console (Data safety) for the BeStats app, written so they match `/privacy` (spec [0033](specs/0033-mobile-app-expo/index.md), AC-15). You type them in once each developer account exists ([deploy.md](deploy.md), section 12). Each answer names the `/privacy` text or the code it rests on, so when either changes you can see which answer moves with it.

Recorded on 2026-11-22 against `LEGAL_LAST_UPDATED` 2026-11-22. If you change `PROCESSORS` or `/privacy`, read this file again in the same PR.

## What the app actually collects

| Data | Why | Where it lives | Rests on |
|---|---|---|---|
| Email address | Your account and sign in | Supabase Auth | `/privacy`, "What we collect" |
| Username and user ID | Your account; the username is the one profile field | Supabase (`profiles`, `auth.users`) | AGENTS.md section 8 |
| Marks, ratings, tracked shows, game statuses | The app's whole purpose | Supabase, your rows only (RLS) | `/privacy`, "What we collect" |
| Password | Sign in | Supabase stores only a hash | `/privacy`, "Security" |
| IP address and device details | Requests to our API (Vercel logs), image loads (TMDB, IGDB), update checks (Expo) | Each provider's own logs | `/privacy`, "Who processes your data" |

Not collected: no analytics, no crash reporting, no advertising ID, no location (the API reads an approximate country from Vercel for watch providers and age ratings, uses it for that one answer and never stores it), no contacts, photos or health data, no purchases. Nothing is used to track you across other companies' apps or sites.

## App Store Connect, App Privacy

1. **Do you or your third party partners collect data from this app?** Yes.
2. Data types to select, each **linked to the user**, **not used for tracking**, purpose **App Functionality** only:
   - Contact Info, **Email Address**.
   - Identifiers, **User ID** (the account ID and the username, which Apple counts as a screen name).
   - User Content, **Other User Content** (marks, ratings, tracked shows and game statuses).
3. Leave everything else unselected. IP addresses seen only in provider logs, and the country read for one answer and not stored, count as processed briefly rather than collected under Apple's definitions, which matches `/privacy` saying it is not stored.
4. **Privacy Policy URL**: `https://bestats-app.vercel.app/privacy` (kept reachable by the firewall rule, deploy.md section 5).
5. **Account deletion** (guideline 5.1.1(v)): the app has it under Account, Delete account. Say so in the review notes.

## Google Play Console, Data safety

1. **Does your app collect or share any of the required user data types?** Yes.
2. **Is all of the user data collected by your app encrypted in transit?** Yes (every request is https).
3. **Which way can users request that their data is deleted?** In the app (Account, Delete account), and by the delete account URL below.
4. Data types, each **collected**, **not shared** (Supabase, Vercel, TMDB, IGDB and Expo act as service providers, which Play does not count as sharing), **processed ephemerally: no**, **required**:
   - Personal info, **Email address**: App functionality, Account management.
   - Personal info, **User IDs**: App functionality, Account management.
   - App activity, **Other user generated content**: App functionality.
5. Leave location, financial info, contacts, photos, app info and performance, and device IDs unselected (no crash reporting, no advertising ID).
6. **Delete account URL** (Play asks for a web page that works without the app): `https://bestats-app.vercel.app/privacy#how-long-we-keep-it`, which explains deletion in the app and by email to the contact address.
7. **Privacy policy**: `https://bestats-app.vercel.app/privacy`.

## When this goes stale

- A new processor, analytics, crash reporting or push notifications (spec 0033, Follow up) changes both labels: update `PROCESSORS`, `/privacy`, `LEGAL_LAST_UPDATED` and this file in one PR, then the two consoles.
- Google or Apple sign in adds the provider's account ID to the data types.
