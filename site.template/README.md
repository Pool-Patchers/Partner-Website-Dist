# site.template — onboard a new partner into the stack

Replace `<slug>` (repo folder name) and `{{DOMAIN}}` (partner's real domain) throughout.

## 1. Add the site container to `docker-compose.yml`
```yaml
  site-<slug>:
    image: nginx:1.27-alpine
    restart: unless-stopped
    volumes:
      - /srv/sites/<slug>/current:/usr/share/nginx/html:ro
      - ./site-nginx/default.conf:/etc/nginx/conf.d/default.conf:ro   # clean URLs, no scheme-downgrading 301
    networks: [partnernet]
```

## 2. Add the front-nginx routing block — `front-nginx/conf.d/<slug>.conf`
```nginx
server {
    listen 80;
    server_name www.{{DOMAIN}};
    return 301 https://{{DOMAIN}}$request_uri;
}
server {
    listen 80;
    server_name {{DOMAIN}};
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    location / {
        proxy_pass http://site-<slug>:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## 3. Deploy target + pull timer
- Publish built files: `scripts/deploy-site.sh <slug> https://{{DOMAIN}}` → `Partner-Website-Dist`
  branch `deploy/<slug>`.
- Ensure the droplet's pull timer syncs that branch into `/srv/sites/<slug>/current`.

## 4. Cloudflare (owner)
- Tunnel public hostnames `{{DOMAIN}}` + `www.{{DOMAIN}}` → `http://front-nginx:80`.
- Point the registrar nameservers at Cloudflare (in-office).

## 5. Bring up
`docker compose up -d site-<slug> front-nginx` (front-nginx reload picks up the new block).

## Staging (optional, per partner — build-plan P5)
Add `site-<slug>-staging` (serves `/srv/sites/<slug>-staging/current`) + a `review-sidecar-<slug>`
(runs `staging-review/server.mjs`), a `staging.{{DOMAIN}}` front-nginx block that proxies `/` to the
staging container and `/api/*` to the sidecar, a tunnel hostname `staging.{{DOMAIN}}`, and a Cloudflare
Access app on it (emails TBD).
