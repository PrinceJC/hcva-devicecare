# HCVA DeviceCare — Supabase backend

A backend you own and can keep in your GitHub repository. Supabase hosts Auth,
Postgres, the generated Data API, and database functions. Your React frontend
can be developed in VS Code and deployed separately to Vercel. No Laravel or
Node API server is required for this version.

This is backend source plus browser API helpers, not a complete React UI. It
does not modify or depend on the previously hosted DeviceCare prototype.

## 1. What is included

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261021000100_devicecare.sql` | Tables, checklist, permissions, RLS, scheduling, and transactional inspection functions |
| `supabase/bootstrap-admin.sql` | Manually grant your first account admin access |
| `src/lib/supabase.js` | Vite browser client |
| `src/lib/maintenance.js` | Auth, people, devices, schedules, inspections, and resolution API helpers |
| `tests/backend.test.mjs` | PostgreSQL tests for authorization, validation, history, and scheduling |
| `.env.example` | Public frontend configuration placeholders |

One company per Supabase project. Multi-company tenancy is not implemented.

## 2. Open in VS Code

Extract this folder. Either open it directly in VS Code or merge the
`supabase/` and `src/lib/` folders into your existing Vite + React project.
Do not overwrite an existing package.json: merge the listed dependencies and
scripts instead. Do not run this initial migration against an unrelated
existing schema with matching table names.

Install a current Node.js LTS version. In the terminal:

```bash
npm install
npm test
npx supabase init
```

`supabase init` creates your local CLI config. Run it once; if you already have
a Supabase project directory, retain its config. Commit your package-lock.json
after installing so GitHub and your local machine use the same versions.

The included tests passed on PGlite 0.5.11, a real PostgreSQL engine with mocked
Supabase Auth tables and JWT context. They do not require your credentials.
JavaScript syntax was checked and the Supabase CLI was verified locally. A full
local/hosted Supabase deployment has not been run in this environment.

## 3. Local Supabase development (recommended)

Install and start Docker Desktop, then run:

```bash
npx supabase start
npx supabase db reset
```

`db reset` rebuilds the LOCAL database and deletes its local data. Do not use
`--linked` or a remote database URL with reset. The migration recreates the
schema and standard checklist. Use local Studio and the local project URL and
publishable key printed by the CLI when testing your frontend.

Before rollout, smoke-test against local Supabase as well: sign in as an admin,
add a candidate and device, complete an inspection, reload the page, then sign
in as two different VAs and confirm each sees only assigned records.

## 4. Apply to your own hosted Supabase project

Create an empty project in Supabase, then use:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Review the dry run before pushing. This deploys the versioned migration to your
linked database. `bootstrap-admin.sql` is deliberately outside `migrations/`.
It must be run manually after creating an Auth account.

If you prefer the Dashboard for an initial experiment, paste the migration
into SQL Editor and run it once. Use either that approach or the CLI for the
initial migration, not both. For ongoing GitHub development use the CLI; an
SQL Editor install requires reconciling migration history before `db push`.

## 5. Create the first admin and link VAs

1. In Supabase Authentication, create or invite your own admin user.
2. Copy that user's Auth UUID.
3. Open `supabase/bootstrap-admin.sql`, substitute the UUID, and run the SQL
   in Supabase SQL Editor. Do not commit the edited file with real identifiers.
4. Sign in through your frontend with that account.
5. Add candidate/VA records. A candidate does not need a login.
6. If a VA needs read access, create or invite their Auth account, then set
   `va_people.auth_user_id` to the account's Auth UUID as an admin. Matching an
   email alone never grants access.

Do not put admin roles in user-editable metadata. This implementation checks
a private admin membership table. Only trusted database operators can change
it; the browser cannot promote itself or another user.

Configure Supabase Auth's Site URL and allowed redirect URLs for your local
frontend and production Vercel domain, particularly for invitations and
password recovery. Public signup can be disabled for this internal app. An
unlinked signed-in account has no access to VA or device records.

## 6. Connect your React + Vite frontend

Copy `.env.example` to `.env.local` and replace the placeholders with your
project URL and publishable key from Supabase's Connect/API Keys settings.
Use the local project's values when developing against local Supabase.
Restart your Vite development server after changing environment variables.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Only the publishable key goes in browser code. Secret keys and legacy
service_role keys bypass RLS and must never go in VITE_* variables, browser
bundles, or GitHub. This version needs no elevated backend key.

Your frontend project's normal commands remain:

```bash
npm run dev
npm run build
```

Those are frontend scripts; this backend-only package does not define them.

### Sign in, register a VA, and assign a device

```js
import {
  signIn, createPerson, createDevice, listSchedule,
  getChecklist, completeInspection,
} from './lib/maintenance.js';

// Call inside your own form handlers. Never hardcode a real password.
await signIn(emailFromForm, passwordFromForm);

const person = await createPerson({
  full_name: 'Sample VA',
  email: 'va@example.com',
  stage: 'active', // candidate | active | inactive
  client_team: 'Operations',
  // auth_user_id: '<UUID of this VA's Supabase Auth account>',
});
const device = await createDevice({
  person_id: person.id,
  model: 'Lenovo ThinkPad E14',
  asset_tag: 'HCVA-001',
  operating_system: 'Windows 11',
  next_due_date: '2026-10-21', // Use the first inspection date chosen in your UI.
});

const dueSoon = await listSchedule({ status: 'due_soon' });
const overdue = await listSchedule({ status: 'overdue' });
const flagged = await listSchedule({ attentionOnly: true });
```

### Complete an inspection

Fetch the checklist and render one selector per `code`. Send values as `pass`,
`fail`, or `na`. This example explicitly passes each check for illustration;
your UI must collect the actual inspector's results.

```js
const checks = await getChecklist();
const results = Object.fromEntries(checks.map(check => [check.code, 'pass']));

// Generate once per submission, outside a retry handler. Retain the same
// request object if a network timeout requires a retry.
const request = {
  request_id: crypto.randomUUID(),
  device_id: device.id,
  inspected_on: '2026-10-21', // Date input value, YYYY-MM-DD in Manila time.
  results,
  findings: '', // Required when any check fails.
};
const report = await completeInspection(request);
// Retrying completeInspection(request) returns the same inspection.
// Reusing its request_id with different contents is rejected.
```

Wrap calls in `try/catch` and display `error.message`. Loading/disabled states
and duplicate-click handling belong in your React forms. Pagination is
zero-based with a maximum page size of 100; keep requesting pages until a
short page is returned if building a full export.

## 7. Permission model

| Action | Admin | Linked VA | Unlinked / anonymous |
| --- | --- | --- | --- |
| Read VA and device records | All | Own only | No |
| Create, edit, archive records | Yes | No | No |
| Read completed inspections | All | Own inspection history | No |
| Complete inspection / resolve issue | Yes | No | No |
| Grant admin access | SQL operator only | No | No |
| Change saved inspection / delete history through API | No | No | No |

VA users are readers in this version. If you later want VA self-assessments,
add a separate submission/review workflow rather than treating their own
results as an IT-verified inspection.

Archiving preserves history. Archive a person or device using the provided
helpers. `stage='inactive'` alone does not remove a device from the schedule;
archive the person when you want their devices excluded. Archives can be
restored by setting `archived=false` as an admin.

An admin can change the next due date to reschedule a check. Completing a new
inspection resets it to the quarterly cadence. Device attention flags and
last-inspected dates cannot be edited directly through the browser API.

## 8. Scheduling and history rules

- The business date uses `Asia/Manila`.
- Completing a check schedules the next one three calendar months after its
  inspection date. January 31 becomes April 30.
- Checks cannot be dated in the future or earlier than the latest inspection
  for that device. Same-day rechecks are allowed and the later recorded check
  determines the current attention flag.
- All ten checklist codes are required. Extra codes, invalid values, JSON
  nulls, and an entirely N/A inspection are rejected.
- Failed checks require findings and set `needs_attention=true`. A later
  passing inspection or an admin resolution note clears the flag.
- Inspector identity comes from the authenticated session, never a name or
  user ID supplied by the browser.
- An inspection stores its person, model, and checklist text snapshots.
  Reassigning the device does not reveal the former person's inspection
  history to the new owner. Resolution notes follow the device's current
  assignment; keep these notes about device remediation only.
- Save and schedule updates happen in one transaction with a device lock.
  Retry using the same request UUID to avoid duplicate inspection records.
- Checklist version 1 is seeded in the migration. To change checklist content,
  use a new migration, bump the function's checklist version, and update the
  frontend. Historic snapshots retain their original wording.

The schedule view computes status when queried; it does not need a scheduled
job to become overdue. It returns `schedule_status` separately from
`needs_attention`, so a failed device can also be overdue.

## 9. GitHub and Vercel

Commit the source files and package lock to your own repository. Merge the
provided `.gitignore` with your project's existing one. Keep `.env.local`,
passwords, database credentials, and production exports out of Git.

For your Vite + React frontend, import your GitHub repository into Vercel,
select the Vite framework preset, and add the two VITE_* environment variables
under the relevant environments before deploying. Use separate Supabase
projects for development/preview and production data. The migration is
applied to Supabase using the CLI; deploying the frontend on Vercel does not
run database migrations.

No backend deployment to Vercel is required for this design. Vercel hosts your
frontend; Supabase hosts the backend. A Next.js frontend requires adapting the
client to the documented Supabase SSR approach, rather than copying the Vite
client file unchanged.

## 10. Current boundaries

Included: Auth integration, candidate/VA registry, multiple devices per VA,
standard checklist, quarterly dates, overdue queries, immutable inspection
history through the API, attention flags, and resolution notes.

Not included: automatic emails, cron delivery, photo uploads, full audit logs
of edits/rescheduling, a React interface, import of browser-prototype data,
or a complete deployment to your accounts. Dates are scheduled; notifications
are not sent. The sample frontend helpers are not a PHI storage system. Keep
passwords, patient data, and recovery codes out of maintenance notes.

## Official references

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/local-development/database-migrations
- https://supabase.com/docs/guides/getting-started/api-keys
