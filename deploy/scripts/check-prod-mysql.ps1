

param(
  [string]$HostName = "49.235.59.19",
  [string]$UserName = "root",
  [string]$KeyPath = "D:\pic\only_key.pem"
)

$remoteScript = @'
set -e
DB_PASSWORD=$(grep '^DB_PASSWORD=' /opt/my-app/deploy/env/prod.env | cut -d= -f2-)
cat <<'SQL' >/tmp/check-prod-mysql.sql
SHOW VARIABLES WHERE Variable_name IN ('slow_query_log','long_query_time','min_examined_row_limit','max_connections','performance_schema','log_output');
SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections');
SQL
docker exec -i my-app-prod-mysql-1 mysql -uroot -p"${DB_PASSWORD}" < /tmp/check-prod-mysql.sql
'@

$remoteScript = $remoteScript -replace "`r`n", "`n"

ssh -o StrictHostKeyChecking=no -i $KeyPath "$UserName@$HostName" $remoteScript
