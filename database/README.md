# Active Directory setup (database deferred)

The current application signs users in directly against Active Directory. **MySQL is not needed for AD login.** Until database persistence is enabled, dashboard analysis history exists only in the current page session and is cleared when the page is refreshed or the user signs out. User profiles, audit/login records, and analysis reports are not stored.

## Configure AD sign-in

Copy `.env.example` to `.env.local` and configure `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PW`, and `AD_EMAIL_DOMAIN`. These variables must be available to the Next.js server only; do not prefix them with `NEXT_PUBLIC_`.

Use `LDAP_URL=ldaps://...:636` or `LDAP_URL=ldap://...:389` with StartTLS enabled; do not disable TLS for LDAP. For LDAP URLs, the route upgrades the connection with StartTLS before either service-account or user credentials are sent. Install the organization's trusted directory TLS certificate on the application server and allow the server to reach the domain controller. The bind account should have read-only permission to search the configured base DN. The route includes the AD host/base-DN/service-account-name defaults from the supplied integration; set `LDAP_*` values explicitly when your environment differs.

Also set `AD_SESSION_SECRET` to a random value of at least 32 bytes (for example, generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). It signs an eight-hour, HTTP-only session cookie. Since there is no session database yet, signing out clears the browser cookie but cannot revoke a copied cookie before it expires. All authenticated AD accounts currently receive the `user` role; database-backed roles and account status will be added with the database phase.

For local development only, `DEV_AUTH_BYPASS=true` enables a **Continue without AD** button that signs in as a local developer account. The endpoint refuses this mode whenever `NODE_ENV=production`; keep the setting false or unset for deployed environments.

## Run the application

Install dependencies with `npm install`, then run `npm run dev`. The AD domain controller must be reachable from the Next.js server, not merely from the user's browser. Use HTTPS in deployed environments so the AD password and HTTP-only session cookie are protected in transit.

Put credentials only in a secret manager or local, untracked `.env.local`; never commit them or print them in logs.

## Enable MySQL later

When ready to enable persisted users, audit/login records, and report history, configure `MYSQL_*` values and run [`schema.sql`](./schema.sql) using MySQL Workbench or the MySQL command-line client. The application does not create or migrate tables automatically. Use a dedicated MySQL account with only the privileges required on the `statement_analyzer` database. The database-backed role can then be granted to an approved account:

```sql
UPDATE statement_analyzer.users
SET role = 'admin'
WHERE ad_username = 'approved.account';
```

The report API stores filenames, file hashes, reconciliation totals, integrity indicators, and a compact analysis summary. It does not store uploaded statement files or transaction rows. Passwords are never persisted.
