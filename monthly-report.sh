#!/usr/bin/env bash
# Generate a GoAccess HTML traffic report for ONE partner site from the front-nginx access logs.
# Runs ON THE DROPLET (reads /srv/logs) via the GoAccess container — no host install needed.
# Pulled to /opt/partner-stack/monthly-report.sh with the rest of the infra stack.
#
# Usage:
#   sudo bash /opt/partner-stack/monthly-report.sh <domain> [month]
#     <domain>  the partner domain as logged (e.g. sandwpool.com)
#     [month]   optional, e.g. "Sep/2026" — limits the report to that month (default: all time)
#
# Output: /srv/reports/<domain>-<month|alltime>.html  → scp it down or open it to send the partner.
set -euo pipefail

DOMAIN="${1:?usage: monthly-report.sh <domain> [month e.g. Sep/2026]}"
MONTH="${2:-}"
LOG="${LOG:-/srv/logs/partner-access.log}"
GOACCESS_IMAGE="${GOACCESS_IMAGE:-allinurl/goaccess:latest}"   # pin a digest in build-plan as-built

OUT_DIR=/srv/reports; mkdir -p "$OUT_DIR"
TAG="${MONTH:-alltime}"; TAG="${TAG//\//-}"
OUT_NAME="${DOMAIN}-${TAG}.html"
[ -f "$LOG" ] || { echo "no log yet at $LOG (site needs some traffic first)" >&2; exit 1; }

# Filter to this site (and month if given). nginx 'cf' log_format tags each line with host=<domain>.
filter() {
  if [ -n "$MONTH" ]; then grep "host=$DOMAIN" "$LOG" | grep "/$MONTH:"
  else grep "host=$DOMAIN" "$LOG"; fi
}

count="$(filter | wc -l)"
[ "$count" -gt 0 ] || { echo "no log lines for host=$DOMAIN ${MONTH:+in $MONTH}" >&2; exit 1; }
echo "==> $count log lines for $DOMAIN ${MONTH:+($MONTH)} → $OUT_DIR/$OUT_NAME"

# GoAccess reads the filtered stream on stdin; log-format mirrors infra/front-nginx/conf.d/00-logging.conf.
filter | docker run --rm -i -v "$OUT_DIR:/out" "$GOACCESS_IMAGE" - \
  --log-format='%h - %e [%d:%t %^] "%r" %s %b "%R" "%u" host=%v' \
  --date-format='%d/%b/%Y' --time-format='%H:%M:%S' \
  --ignore-crawlers --no-query-string \
  --html-report-title="$DOMAIN — ${MONTH:-all time}" \
  -o "/out/$OUT_NAME"

echo "==> Done: $OUT_DIR/$OUT_NAME"
