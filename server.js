// STAYCAMPRV LLC — runs the app as a normal Node server (local development or a VPS).
// On Vercel, api/index.js serves the same app instead.
import app, { BASE_URL, PORT, STRIPE_KEY } from './app.js';

app.listen(PORT, () => {
  console.log(`\n  STAYCAMPRV LLC is running at ${BASE_URL}`);
  console.log(`  Admin dashboard:  ${BASE_URL}/admin`);
  console.log(`  Online payments:  ${STRIPE_KEY ? 'Stripe enabled' : 'off (set STRIPE_SECRET_KEY to enable)'}\n`);
});
