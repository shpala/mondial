# Security policy

Mondial is a read-only public web app: it has no user accounts, no database, and no
write paths. It reads from public, keyless data sources, with one optional API key
(`THESPORTSDB_KEY`) supplied via the environment.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Preferred: open a [private vulnerability report](https://github.com/shpala/mondial/security/advisories/new)
  via GitHub Security Advisories.
- Or email the maintainer (see the GitHub profile / commit history).

I'll acknowledge reports as soon as I can. Since there is no production user data at
stake, please allow reasonable time to fix before any public disclosure.
