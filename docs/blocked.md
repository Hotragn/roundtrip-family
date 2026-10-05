# Blocked

Problems that failed three times or need the builder. Each entry says what is blocked, what still works, and the fix.

## DEMO_ALERT_EMAIL is not a valid email address

- **Blocked:** sending real email (planning email, safety alert, weekly summary) to the adult child.
- **Still works:** everything else. Email code runs against a mocked client in tests, and the live code validates the address and sends nothing while it's invalid.
- **Fix:** set DEMO_ALERT_EMAIL in .env and in the Codespaces secret to your own address, for example `DEMO_ALERT_EMAIL=you@example.com`.
