$pass = "2512"
$server = "root@161.97.115.59"
$cmds = "cd /root/zivvvo && git pull origin main && npm run build:web"

echo "Connecting to server..."
$proc = Start-Process -FilePath "ssh" -ArgumentList "-o","StrictHostKeyChecking=no","-o","ConnectTimeout=10",$server,$cmds -NoNewWindow -Wait -PassThru
echo "Done with exit code: $($proc.ExitCode)"
