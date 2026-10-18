// Loads secrets and config from .env (if present) before any other module reads process.env.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')); } catch {}

// "Today" for bookings is computed in this time zone. Vercel servers run on UTC, so default to the headquarters' zone there.
if (process.env.APP_TIMEZONE) process.env.TZ = process.env.APP_TIMEZONE;
else if (process.env.VERCEL) process.env.TZ = 'America/New_York';
