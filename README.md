This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Admin account and member management

Copy the variables from `.env.example` into `.env.local`. Set `SUPABASE_SERVICE_ROLE_KEY` to the project's server-side service role key to enable the account and club member management screens. Keep this key private and never expose it through a `NEXT_PUBLIC_` variable.

## Task reminders (Gmail + cron)

Admins can assign tasks to members; reminders are sent from a Gmail account that an admin picks on `/manage-clubs/tasks` ("Dùng Gmail của tôi để gửi nhắc"). That admin must have connected Gmail first.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CRON_SECRET` | yes (for the cron job) | Random secret (for example `openssl rand -base64 32`). Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when it calls `/api/cron/task-reminders`; the route returns 503 if it is unset and 401 if it does not match. Server-only, never use a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | optional | Public site URL (no trailing slash), used for the `/me` link in reminder emails. If unset, the origin of the request is used. |

The cron schedule lives in `vercel.json` (`0 1 * * *` = 08:00 Vietnam time). Vercel Hobby only allows cron jobs to run once per day, so reminders go out once a day (members get "due within 36 hours" and "overdue up to 7 days" reminders, each at most once per task). The cron route also runs a database query on every call, which keeps a free Supabase project from being paused for inactivity.

## Database setup

1. Create a Supabase project and run `supabase/migrations/20261023000000_init.sql` in the SQL editor (or with the Supabase CLI). This single baseline creates the schema, RLS policies, RPCs, storage buckets and seed data. The old incremental scripts are archived in `supabase/migration/legacy/` and must not be applied to a new database.
2. Sign up the first administrator account, then link it to the club as `owner`. The snippet below uses the seeded club id `00000000-0000-4000-8000-000000000001`; if your database already has a club (for example one you created yourself), that id will not match. List the real ids with `select id, name from clubs;` and replace the id in the `where` clause with yours:

```sql
insert into public.club_members (club_id, user_id, role, full_name)
select c.id, u.id, 'owner', coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
from public.clubs c
join auth.users u on u.email = 'admin@example.com'
where c.id = '00000000-0000-4000-8000-000000000001'
on conflict do nothing;
```

3. Add teams, events and recruitment campaigns from `/manage-clubs`, or update the seeded club name/description directly if needed.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
