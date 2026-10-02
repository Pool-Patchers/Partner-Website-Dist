# cloudflared — Cloudflare Tunnel (dashboard-managed)

The tunnel is **dashboard-managed** (token-based): `cloudflared` in the compose stack runs with
`TUNNEL_TOKEN` and all ingress (hostname → service) is configured in the Cloudflare Zero Trust
dashboard, not a local config file. No inbound ports are opened on the droplet — cloudflared makes
only outbound connections to Cloudflare.

## Owner setup (once)
1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel** (name e.g. `partner-web`).
2. Copy the **tunnel token** → Vault `box-partners` item `Partners · Cloudflare Tunnel` (field `token`).
   Ping DevServer to wire the host-side pull → `TUNNEL_TOKEN`.
3. Per partner, add a **Public Hostname** on the tunnel:
   - `partner.com`         → service `http://front-nginx:80`
   - `www.partner.com`     → service `http://front-nginx:80`
   - `staging.partner.com` → service `http://front-nginx:80` (+ a Cloudflare Access app on it)
   - (if Umami) `analytics.<infra-domain>` → `http://umami:3000` (+ Access for Travis@/Admin@)
4. Cloudflare auto-creates the DNS CNAMEs for tunnel hostnames. Owner points each partner domain's
   registrar nameservers at Cloudflare (in-office).

## Isolation rule
**Never** add a `*.pool-patchers.com` hostname to this tunnel — partner infra uses partner domains (and,
for analytics, a separate infra domain), never PP's zone. (Security bars this box from PP's zone.)

## Catch-all
Set the tunnel's catch-all rule to return a 404 for any unmatched hostname.
