# Noctra 3.0 — Database Migrations, Backups & Recovery Guide

This guide details the schema management, data protection, backup procedures, and restore workflows for Noctra's hosted Supabase PostgreSQL backend.

---

## 1. Schema Migration Strategy

All schema changes in Noctra follow **additive, versioned migrations**:
- Files are located in `supabase/migrations/` and numbered chronologically (`0001_*.sql`, `0002_*.sql`, etc.).
- Migrations must be **idempotent**: use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and `DROP POLICY IF EXISTS`.
- **Never modify past applied migrations.** Any schema alterations, indexes, or RLS changes must be committed as new migration files.
- **Never disable Row Level Security (RLS).** Every table must have RLS enabled and explicit restrictive/permissive policies.

### Applied Migrations Registry

| File | Scope | Key Objects |
| :--- | :--- | :--- |
| `0001_conversions.sql` | Conversion history | `public.conversions` table, RLS, Firebase issuer policy |
| `0002_add_docx_file_type.sql` | Document types | Adds `docx` to `file_type` check constraint |
| `0003_reader_and_organization.sql` | Reader & Metadata | `public.reader_preferences`, `public.reader_annotations`, favorites, tags |
| `0004_add_cancelled_status.sql` | Conversion cancellation | Adds `cancelled` to `status` check constraint |
| `0005_supabase_auth_and_platform.sql` | Noctra 3.0 Platform | `public.user_identities`, `public.api_rate_limits`, delete account cascading |

---

## 2. Backup Strategy

Noctra utilizes three levels of database protection:

### Level 1: Supabase Automated Daily Backups
- Supabase performs automated physical and logical backups every 24 hours.
- Backups are stored across redundant cloud storage regions.
- Daily backups are retained in accordance with the project's Supabase service plan (7 days on Pro, 30+ days on Enterprise).

### Level 2: Point-in-Time Recovery (PITR)
- Write-Ahead Logs (WAL) are continuously archived.
- Allows the database to be restored to any specific second in time within the retention window.
- Eliminates data loss during accidental bulk modifications or schema errors.

### Level 3: Manual Logical Backups (`pg_dump`)
For pre-migration snapshots or disaster recovery, run a logical dump using standard PostgreSQL tools or the Supabase CLI:

```bash
# Export schema and data (requires DB connection string from Supabase Settings > Database)
pg_dump "$DATABASE_URL" \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  -F p -f "backup-$(date +%Y%m%d_%H%M%S).sql"
```

Or using Supabase CLI:
```bash
supabase db dump --project-ref oxjcxtyfdzczubaomswe -f backup.sql
```

---

## 3. Disaster Recovery & Restore Procedures

### Restoring from Point-in-Time Recovery (Supabase Dashboard)
1. Go to the Supabase Dashboard: `https://supabase.com/dashboard/project/oxjcxtyfdzczubaomswe`
2. Navigate to **Database** > **Backups** > **Point in Time**.
3. Select the timestamp immediately prior to the incident.
4. Confirm the restore target. Supabase provisions the restored instance and swaps connection strings seamlessly.

### Restoring from Logical SQL Backup
If restoring to a fresh database or recovering specific tables:
```bash
# 1. Verify target connection
psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"

# 2. Apply the backup SQL
psql "$DATABASE_URL" -f "backup-<timestamp>.sql"

# 3. Verify backend connectivity and RLS
npm run verify:backend
```

---

## 4. Post-Restore Verification Checklist

After any restore or migration, run the automated verification suite:
```bash
# Verify connection, column schema, anon denial, and service role access:
node scripts/verify-backend.mjs

# Verify read/write roundtrip:
node scripts/verify-backend.mjs --write
```
Ensure all 13 checks return `PASS`.
