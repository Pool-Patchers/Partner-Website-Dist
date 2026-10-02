# infra/ — the shared partner-hosting docker-compose stack

One shared droplet. `cloudflared` (Cloudflare Tunnel, outbound-only) → `front-nginx` (routes by Host) →
one `nginx:alpine` container per partner serving that partner's built static files. See `../build-plan.md`
for the full architecture + decisions.

## Files
- `docker-compose.yml` — the stack (cloudflared + front-nginx + one `site-<slug>` per partner; Umami
  deferred/commented pending the analytics decision).
- `front-nginx/conf.d/<slug>.conf` — one reverse-proxy server block per partner domain (`{{DOMAIN}}`
  filled at onboarding). Does `www`→apex 301 + security headers, proxies to the site container.
- `site.template/` — the copy-paste template for onboarding a new partner (compose service + front-nginx
  block + the cloudflared ingress hostname to add in the CF dashboard).
- `cloudflared/README.md` — how the dashboard-managed tunnel ingress is set up.

## Env (from Vault `box-partners`, pulled host-side)
- `TUNNEL_TOKEN` — the Cloudflare Tunnel token (`Partners · Cloudflare Tunnel`).
- (if Umami) `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET` (`Partners · Umami`).

## Onboarding a partner (summary)
1. Build the site on partners-box → publish to `Partner-Website-Dist` `deploy/<slug>`.
2. Add a `site-<slug>` service (from `site.template/`) + a `front-nginx/conf.d/<slug>.conf` block; set the
   droplet pull timer for the branch → `/srv/sites/<slug>/current`.
3. In the CF dashboard: add the partner domain as a public hostname on the tunnel → `http://front-nginx:80`;
   the owner points the registrar nameservers at Cloudflare (in-office).
4. `docker compose up -d` on the droplet.

## Deploy
Unchanged, pull-based: partners-box builds + publishes; the droplet's pull timer updates
`/srv/sites/<slug>/current`; the site container serves it (no image rebuild per deploy).

## Status
P1 draft. Not yet run on a droplet (no Docker on partners-box — structural validation only). Live
bring-up is build-plan P4.
