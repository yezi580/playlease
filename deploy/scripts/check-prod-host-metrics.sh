#!/usr/bin/env bash
set -euo pipefail

SAMPLE_SECONDS="${1:-1}"

case "${SAMPLE_SECONDS}" in
  ''|*[!0-9]*)
    echo "Usage: bash deploy/scripts/check-prod-host-metrics.sh [sample_seconds]" >&2
    exit 1
    ;;
esac

if [ "${SAMPLE_SECONDS}" -lt 1 ]; then
  SAMPLE_SECONDS=1
fi

cpu_sample() {
  awk '/^cpu / {print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat
}

read -r u1 n1 s1 i1 w1 irq1 sirq1 st1 g1 gn1 <<< "$(cpu_sample)"
sleep "${SAMPLE_SECONDS}"
read -r u2 n2 s2 i2 w2 irq2 sirq2 st2 g2 gn2 <<< "$(cpu_sample)"

idle1=$((i1 + w1))
idle2=$((i2 + w2))
non_idle1=$((u1 + n1 + s1 + irq1 + sirq1 + st1))
non_idle2=$((u2 + n2 + s2 + irq2 + sirq2 + st2))
total1=$((idle1 + non_idle1))
total2=$((idle2 + non_idle2))
total_delta=$((total2 - total1))
idle_delta=$((idle2 - idle1))

cpu_usage="$(awk -v td="${total_delta}" -v id="${idle_delta}" 'BEGIN { if (td <= 0) { print "0.00" } else { printf "%.2f", ((td - id) / td) * 100 } }')"

mem_line="$(free -m | awk 'NR==2 {printf "%s %s %s", $2, $3, $7}')"
read -r mem_total_mb mem_used_mb mem_available_mb <<< "${mem_line}"
mem_usage="$(awk -v total="${mem_total_mb}" -v used="${mem_used_mb}" 'BEGIN { if (total <= 0) { print "0.00" } else { printf "%.2f", (used / total) * 100 } }')"

disk_lines="$(df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x overlay | sed '1d')"

net_snapshot() {
  awk -F ':' 'NR > 2 {
    iface = $1
    gsub(/^[ \t]+|[ \t]+$/, "", iface)
    if (iface ~ /^(lo|docker[0-9]*|br-.+|veth.+)$/) {
      next
    }
    split($2, stats, /[[:space:]]+/)
    print iface, stats[2], stats[10]
  }' /proc/net/dev
}

NET_BEFORE="$(net_snapshot)"
sleep "${SAMPLE_SECONDS}"
NET_AFTER="$(net_snapshot)"

net_report="$(NET_BEFORE_DATA="${NET_BEFORE}" NET_AFTER_DATA="${NET_AFTER}" SAMPLE_SECONDS_ENV="${SAMPLE_SECONDS}" python3 - <<'PY'
import os

before = {}
for line in os.environ.get("NET_BEFORE_DATA", "").splitlines():
    parts = line.split()
    if len(parts) == 3:
        before[parts[0]] = (int(parts[1]), int(parts[2]))

after = {}
for line in os.environ.get("NET_AFTER_DATA", "").splitlines():
    parts = line.split()
    if len(parts) == 3:
        after[parts[0]] = (int(parts[1]), int(parts[2]))

sample_seconds = max(1, int(os.environ.get("SAMPLE_SECONDS_ENV", "1")))
lines = []
for iface in sorted(set(before) & set(after)):
    rx_bps = (after[iface][0] - before[iface][0]) / sample_seconds
    tx_bps = (after[iface][1] - before[iface][1]) / sample_seconds
    lines.append(f"{iface} rx={rx_bps:.2f}B/s tx={tx_bps:.2f}B/s")

print("\n".join(lines))
PY
)"

agent_report="$(python3 - <<'PY'
import glob
import sqlite3
import subprocess

process_targets = {
    "sgagent": "stargate",
    "barad_agent": "monitor",
    "tat_agent": "tat"
}

processes = subprocess.check_output(["ps", "-eo", "comm="], text=True).splitlines()
for process_name, label in process_targets.items():
    status = "running" if process_name in processes else "stopped"
    print(f"agent_{label}_status={status}")

db_files = sorted(glob.glob("/usr/local/qcloud/monitor/barad/log/*_record.db"))
if not db_files:
    print("agent_record_db=missing")
    raise SystemExit(0)

db_path = db_files[-1]
print(f"agent_record_db={db_path}")

try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for table in ("VMSTAT", "NETSTAT", "SOCKSTAT", "ARP_CACHE"):
        cur.execute(f"SELECT COUNT(*), MAX(CREATETIME) FROM {table}")
        count, max_time = cur.fetchone()
        print(f"agent_{table.lower()}_rows={count}")
        print(f"agent_{table.lower()}_latest={max_time or 'n/a'}")
except Exception as exc:
    print(f"agent_record_db_error={exc}")
PY
)"

echo "== Tencent Cloud Agent =="
printf '%s\n' "${agent_report}"
echo
echo "== Host Metrics =="
echo "cpu_usage=${cpu_usage}%"
echo "memory_used=${mem_used_mb}MB/${mem_total_mb}MB (${mem_usage}%)"
echo "memory_available=${mem_available_mb}MB"
echo
echo "== Disk Usage =="
printf '%s\n' "${disk_lines}"
echo
echo "== Network Throughput =="
if [ -n "${net_report}" ]; then
  printf '%s\n' "${net_report}"
else
  echo "No active non-loopback interface detected."
fi
