# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's "Report a vulnerability" button (private security
advisory) on the repository's Security tab. If that is not available, contact the maintainer at `support@iacopolibero.dev`.
Include what you found, how to reproduce it, and what you think the impact is. You will get an answer within a few days;
we will credit you in the fix unless you prefer not.

## Scope and the security model

The Reel Hub runs on your own computer. Its design assumes a single trusted user:

- The hub listens on `127.0.0.1` only and every request needs the token from `.env` (`HUB_TOKEN`, random, mode 600).
  Do not publish the ports to the network or put the hub behind a public reverse proxy without adding your own authentication
  and TLS: the hub contains a terminal that runs Claude Code and a browser logged in to your Instagram.
- Credentials stay on your machine: the Claude login (`~/.claude`), the Composio login (`~/.composio`, read-only mount),
  the Instagram session (Docker volume `chrome-profile`) and the token. The hub never sends them anywhere. You type your own
  Instagram password into the browser window yourself.
- Claude jobs started by the hub read untrusted web text. `platform/hub/src/jobs/claude-safety.ts` denies them any read of
  credential files and limits the shell tools of research jobs. The reel-making job keeps a broad shell (voice, Blender and
  rendering need it) but cannot read credential files or use curl, wget, ssh or `env`. A script written from scratch by a
  prompt-injected model could still read other files in the project; treat the project folder as the trust boundary.
- Do not commit `.env`, `platform/data/`, or anything from `~/.claude`. `.gitignore` excludes them.

In scope: the hub's API and web app, the scripts in this repository, the Docker setup. Out of scope: vulnerabilities in
Docker, Claude Code, Chromium, VoiceStudio, Remotion or other upstream projects (report those upstream).
