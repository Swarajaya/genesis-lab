# Blood LIVE MODE

Two modes on the Blood experiment page: **NORMAL MODE** (unchanged) and **LIVE MODE**.

## Demo flow
1. Open `/experiments/blood`, choose **LIVE MODE**, press **Open live session**. A QR code appears.
2. Scan it with a phone on the same network. Choose DONOR, pick group / Rh / units / zone, press BECOME AVAILABLE.
3. On the desktop press **START EMERGENCY** (12 patients, 31 units required, 27 available, 4-unit shortage).
   The phone receives a live match for the critical patient P-07 and can ACCEPT or DECLINE.
4. Use the event console (donor cancels, unit expires, new donor, emergency worsens, hospital request, donor returns, escalate) and **STRESS TEST**.
5. **End session**. The old session accepts no further changes.

## Phone on a local network
A phone cannot open `localhost`. Set `NEXT_PUBLIC_APP_URL=http://<your-LAN-IP>:3000` (or type the address in the QR panel).
For a smooth demo use `npm run build && npm start` rather than `npm run dev`. The QR contains only
`<app url>/experiments/blood/live/<session id>`: no keys, tokens or secrets.

## How it works
- **Rules engine** (`lib/engines/blood/live.ts`): pure and deterministic. Compatibility, ranking and allocation call the existing
  `evaluateDonor` / `rankDonors`. AI never decides anything.
- **Priority**: critical, urgent, routine, then patient number. Simulated bank donors are allocated automatically; a real phone is only
  *offered* units (it must ACCEPT). Pending offers are sticky until answered or invalid.
- **Server authority**: every action runs server-side against the stored session (`lib/blood-live/service.ts`), validated with Zod,
  authorised by a signed capability bound to one session (host or participant), applied with compare-and-swap so races cannot double-allocate.
  A database unique index also forbids two live allocations for the same patient and donor.
- **Realtime**: with Supabase configured the server publishes a tiny `tick` on the Supabase Realtime Broadcast channel `blood-live:<session id>`;
  desktop and phones subscribe and refetch the authoritative snapshot. No table is readable with the anon key (RLS on, no policies).
  Without Supabase, a local server-sent-events stream is used instead (single server process, labelled "local stream" in the UI).
- **AI** (`/api/blood/live/[id]/explain`): the existing Gemini/Grok router (key pools, cooldown, failover) explains decisions from the
  engine's structured facts. If every provider fails, the exact engine facts are still shown.

## Database
Run the new block at the end of `supabase/schema.sql` (tables `blood_live_sessions`, `blood_live_participants`, `blood_live_events`,
`blood_live_allocations`, function `blood_live_commit`). Existing tables are untouched. Environment: `LIVE_SECRET` (optional signing secret).

## Not tested here
Real Supabase Realtime delivery, real Gemini/Grok calls and a physical phone were not tested (no credentials or device in the build environment).
The SQL was executed on an embedded Postgres engine, and the two-device flow was run in a real browser using the local stream transport.
