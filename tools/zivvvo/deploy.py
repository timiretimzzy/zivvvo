import subprocess, os

ssh = os.path.expandvars(r'%windir%\Sysnative\OpenSSH\ssh.exe')

cmds = "cd /root/zivvvo && git pull origin main && npm run build:web"

proc = subprocess.Popen(
    [ssh, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", "root@161.97.115.59", cmds],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)
out, _ = proc.communicate(input="2512\n", timeout=180)
print(out)
print(f"Exit code: {proc.returncode}")
