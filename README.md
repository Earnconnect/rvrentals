# STAYCAMPRV LLC

Website: https://staycamp.online · Email: bookings@staycamp.online

A complete web platform for an RV business operating in Florida (headquarters), Arizona, Utah and Colorado, with three revenue lines:

1. **RV rentals.** A fleet of motorhomes, camper vans and towables with live availability calendars, weekly pricing, add-ons, security deposits and online booking.
2. **RV site (pad) rentals at multiple campgrounds.** Each campground has its own page, photo, amenities and park map. Each pad has its own nightly, weekly and monthly price, rig-length limit, hookups and minimum stay.
3. **RV and RV lot sales.** Listings for RVs and deeded lots, a loan payment estimator, and inquiry, offer, tour and financing request forms.

It also includes a staff **admin back office** with a dashboard, bookings, an occupancy calendar, inventory management, a sales inbox, CSV export and business settings.

## Quick start

Requirements: **Node.js 22.13 or newer**. Node 24 is recommended. The app uses SQLite through libSQL: a local file in development, or a hosted [Turso](https://turso.tech) database in production (see *Deploying to Vercel*).

```bash
npm install
npm start
```

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin
- Default login: `admin@staycamp.online` / `StayCamp2026!` (**change this right away** in Admin → Settings)

The first run creates `data/riseflorals.db` and seeds 8 RVs, 2 campgrounds (the 28-site STAYCAMPRV Resort and a sample 8-pad Keys campground), 7 sales listings and some **demo bookings**.

| Command | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm run reset` | Wipe the database and re-seed it with inventory and demo bookings |
| `npm run reset:clean` | Wipe the database and seed inventory only (**use this before going live**) |
| `npm run db:copy` | Copy the local database (and any uploaded photos) into the database at `DATABASE_URL` |

The reset commands act on `DATABASE_URL` when it is set, so double-check it before running them.

## Configuration (environment variables)

Put these in a `.env` file in the project folder (see `.env.example`). It is loaded automatically on start and is excluded from git, so keep your keys there and never in the code.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:PORT` | Public URL, used for payment redirects. Use `https://…` in production so the session cookie is marked Secure |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | see above | Initial admin account (only applied when no users exist yet) |
| `STRIPE_SECRET_KEY` | *(none)* | Turns on online card payments through Stripe Checkout |
| `RESEND_API_KEY` | *(none)* | Turns on email through [Resend](https://resend.com) |
| `MAIL_FROM` | `bookings@staycamp.online` | Sender address. Its domain must be verified in Resend |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | *(none)* | Hosted Turso database. Required on Vercel. Without it, the local file `data/riseflorals.db` is used |
| `APP_TIMEZONE` | `America/New_York` on Vercel | Time zone for "today" (check-in dates, dashboard) |
| `DATA_DIR` | `./data` | Where the local database file is stored when `DATABASE_URL` is not set |
| `SEED_DEMO` | `1` | Set to `0` to skip demo bookings on first run |

### Email
With `RESEND_API_KEY` set, the platform sends branded emails automatically:

- **To guests:** booking received (with a link to manage or pay), booking confirmed (with pickup or check-in instructions), payment received, booking cancelled, a receipt for contact-form messages and sales inquiries, a receipt when they message the chat while staff are away, and an email copy of staff chat replies if they've left the website (sent about 90 seconds after the reply).
- **To staff** (Settings → Email → *Staff notification email*): new bookings, guest cancellations, sales inquiries, contact messages, and chats that arrive while nobody is online.

Guest replies go to the business email in Settings, so set it to a real inbox. In the admin, the booking window has **Resend confirmation** and an option to skip the email for a change, and Settings → Email has a **Send test** button and a log of recent emails. Addresses at reserved test domains (such as `@example.com` in the demo data) are skipped.

### Search engines (SEO)
Every public page has a clean URL (`/rentals/1`, `/sites/park/1`, `/sales/5`, `/reviews`) and is sent from the server with its own title, description, canonical link, social sharing tags, schema.org structured data (LocalBusiness, Campground, Product/Vehicle, FAQ, breadcrumbs) and readable content, so Google can index it without running JavaScript. `/sitemap.xml` and `/robots.txt` are generated from your live inventory, and the back office, API and booking pages are kept out of search results. Old `/#/...` links still work.

To get listed on Google once the site is live at your domain:
1. Set `BASE_URL=https://staycamp.online` in `.env` so canonical links and the sitemap use your domain.
2. Add the site in [Google Search Console](https://search.google.com/search-console) (URL prefix → HTML tag), paste the code in **Settings → Search engines**, save, and click Verify.
3. In Search Console, submit `https://staycamp.online/sitemap.xml`.
4. Create a free [Google Business Profile](https://business.google.com) for each campground location. It's what shows you on Google Maps and in "RV park near me" searches.

You can adjust the home page's Google title and description under **Settings → Search engines**, with a live preview.

### Payments
Without `STRIPE_SECRET_KEY`, bookings come in as **pending** with "pay at check-in". Staff confirm them and record payments in the admin.
With a key set, guests go to Stripe Checkout after booking. When they come back, the payment is verified with Stripe and the booking is marked **paid and confirmed**. Guests can also pay a pending booking later from "Manage Booking".

## Deploying to Vercel

Vercel runs the app as a serverless function, and its disk is wiped between requests, so the database lives in [Turso](https://turso.tech) (hosted SQLite; the free plan is plenty) and uploaded photos are stored in the database.

1. **Create the database.** Sign up at turso.tech, create a database in the region closest to your Vercel functions (for example AWS us-east-1, matching Vercel's default `iad1`), then copy its URL (`libsql://…`) and create an auth token.
2. **Copy your existing data in** (skip this to start fresh; the site seeds itself on first run):
   ```bash
   # PowerShell: $env:DATABASE_URL="libsql://..."; $env:DATABASE_AUTH_TOKEN="..."; npm run db:copy
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run db:copy
   ```
   Use the most recent copy of `data/riseflorals.db` you have (for example, downloaded from the VPS).
3. **Create the Vercel project.** Push this folder to GitHub and import it at vercel.com/new, or run `npx vercel` here. The settings come from `vercel.json`; there is no build step.
4. **Add environment variables** in Project → Settings → Environment Variables: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BASE_URL` (e.g. `https://staycamp.online`), `RESEND_API_KEY`, `MAIL_FROM`, and `STRIPE_SECRET_KEY` if you take card payments. Redeploy after adding them.
5. **Point your domain** at Vercel under Project → Settings → Domains, then update `BASE_URL` to match.

How it differs from running on a server:
- Static files in `public/` are served by Vercel's CDN; everything else (pages, API, `/uploads/…`, sitemap) goes to `api/index.js`.
- Photos are resized in the browser to at most 2000 px before upload, because Vercel limits requests to 4.5 MB.
- Emails are sent before each response finishes, so a booking request takes a moment longer when email is on.
- A staff chat reply is emailed to a guest who has left (about 90 seconds later) during the back office's regular check-ins, so this happens while someone has the back office open.
- The per-visitor rate limits are counted per server instance, so they are looser than on a single server.

`npm start` still runs the whole app as a normal server for local work or a VPS.

## How it works

**Pricing** is calculated on the server and is the same everywhere a price appears:
- RVs: weeks × weekly rate, plus leftover nights × nightly rate, never more than a cheaper combination. Then add-ons, the cleaning fee and tax. The refundable security deposit is shown separately and collected at pickup.
- Sites: months (30 nights) at the monthly rate first, then weeks, then nights, always picking the cheapest combination. Then add-ons and tax.
- Minimum nights are set per RV or site. Section D uses a 30-night minimum. Staff can bypass minimums for phone bookings.

**Availability**: a booking blocks the nights from check-in up to, but not including, check-out, so back-to-back turnovers work. Cancelled bookings free their dates. Double booking is prevented on the server.

**Guests** can look up, print, pay for or cancel a booking with their confirmation code (`SC-XXXXXX`) and email. Online cancellation is allowed up to the arrival date. Refunds follow the cancellation policy and are issued by staff.

## Admin guide

- **Dashboard**: this month's revenue, site occupancy tonight, fleet utilization, items needing attention, a 6-month revenue chart (rentals vs. sales), and arrivals and departures for the next 7 days.
- **Bookings**: search and filter, then open a booking to confirm, check in, check out, mark paid or add internal notes. **+ New booking** handles phone and walk-in reservations with a live price preview. **Export CSV** downloads every booking.
- **Calendar**: a 28-day occupancy grid for sites or the fleet. Click a booking to open it, or an empty cell to book that unit from that day.
- **Locations** (Settings): the states you operate in (Florida headquarters; Arizona and Utah locations; Colorado branch), each with an optional city, phone and short description. Each state gets its own page (`/locations/arizona`) and a card on the home page. RVs appear on the state page that matches their **Pickup location** (blank = headquarters), and campgrounds on the state in their *City / area*.
- **Campgrounds**: add as many campgrounds as you run, each with a name, location, address, photo, description, amenities and highlights. Each one gets its own page on the website (RV Sites → the campground). Set one to *hidden* to take it off the website without deleting it. A campground that still has sites can't be deleted.
- **RV Sites / Pads**: add each pad to a campground with its own site number, section, type, length, hookups and nightly, weekly and monthly price. Site numbers only need to be unique within a campground, so two campgrounds can both have an A-01. Filter the list by campground.
- **RV Fleet / RV Sites / Sales Listings**: add, edit and delete inventory, and upload photos. Without an uploaded photo, each item shows a matching stock photo (labelled "representative" on its page), so upload real photos of your units before going live. Units with booking history can't be deleted; set them to *retired* or *closed* instead. Setting a listing to **sold** records the sale date and price, which feed the YTD sales figure.
- **Live Chat**: conversations from the chat bubble on every page of the website. Guests show as online while any staff member has the back office open (it checks in every few seconds); use **Set away** to switch it off. When staff are away, guests are told the team will reply by email, and they can request a call back. New messages play a sound, show a badge and update the tab title. Each chat shows the guest's email and phone, has **Reply by email** (pre-filled with the transcript), quick replies, and **Mark resolved**. The chat bubble also offers instant answers from your FAQ (edit them in Settings).
- **Testimonials**: guest reviews. Guests get a "How was your stay?" email when you check them out, and can also review from their booking page (one review per booking, only after the stay has started). Reviews arrive as *pending*; set them to *published* to show them on the home page and the Guest Reviews page. You can also add reviews you received by email or in person. Only publish genuine reviews: fake or paid reviews are illegal under the FTC's 2024 rule.
- **Sales Inquiries / Messages**: buyer questions, offers, tour and financing requests, and contact form messages. Track each as new, contacted or closed.
- **Settings**: business name, phone, address and hours, tax rate, check-in/out and pickup/return times, add-on catalogs, policies, amenities, FAQ, and your password.

## Before going live

1. Run `npm run reset:clean` to remove the demo bookings and sample inquiries.
2. Sign in and change the admin password.
3. Under Settings, replace the placeholder phone, email and address with your real ones (the email receives guest replies), set the **Staff notification email**, send a test email, and review the policies and tax rate. The 7% default should be confirmed for your county, including any tourist development tax on stays of 6 months or less.
4. Update the RVs, sites, rates and listings, and upload real photos.
5. Have a Florida attorney review the legal pages (Terms of Service, Privacy Policy, Cancellation & Refund Policy, Accessibility Statement) in `public/js/legal.js`, and update the effective date there. They pull your business details and the rental, site and cancellation rules from Settings, so keep those accurate.
6. Deploy behind HTTPS with `BASE_URL=https://yourdomain.com`. Optionally add `STRIPE_SECRET_KEY`.
7. Back up the database regularly: the `data/` folder on a server, or Turso's backups and point-in-time restore on Vercel.

## Project layout

```
app.js             API + page rendering (Express app, shared by server.js and Vercel)
server.js          Runs app.js as a normal Node server
api/index.js       Vercel serverless entry point (see vercel.json)
db.js              Database connection (local file or Turso), schema, settings defaults, seed data
scripts/reset.js   Database reset
scripts/copy-to-turso.js  Copies a local database into DATABASE_URL
views/index.html   Customer website page template (single-page app), filled in per page for SEO
public/admin.html  Staff back office
public/js/app.js   Website logic: search, calendars, booking flow, sales, manage booking
public/js/admin.js Admin logic (including the Live Chat inbox)
public/js/chat.js  Website chat bubble: instant FAQ answers, live chat, offline messages and call-back requests
public/js/art.js   Logo and stock-photo mapping for RVs, sites and lots
public/img/        Logo and photos (Pexels, free for commercial use; sm/ = card-size copies)
public/css/styles.css
```

## Not included yet (good next steps)
- SMS text messages (for example Twilio). Email is built in (see *Email* above).
- Automatic refunds through Stripe. Today, refunds are issued from the Stripe dashboard and recorded in the admin.
- Multiple staff accounts and roles. Today there is one admin login.
