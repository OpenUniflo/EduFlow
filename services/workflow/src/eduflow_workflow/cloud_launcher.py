"""Trusted microVM bootstrap. Runs before user code; fails closed on any limit error."""
import ctypes
import json
import os
from pathlib import Path
import resource
import subprocess
import sys


def main():
    payload = Path(sys.argv[1]).resolve()
    data = json.loads(payload.read_text())
    root = Path('/sys/fs/cgroup')
    infra = root / 'eduflow-infrastructure'
    infra.mkdir(exist_ok=True)
    for process in (root / 'cgroup.procs').read_text().split():
        try: (infra / 'cgroup.procs').write_text(process)
        except ProcessLookupError: pass
    (root / 'cgroup.subtree_control').write_text('+memory +pids +cpu')
    group = root / 'eduflow-untrusted'
    group.mkdir()
    for name, value in {'memory.max':'268435456', 'memory.swap.max':'0',
                        'pids.max':'32', 'cpu.max':'50000 100000'}.items():
        (group / name).write_text(value)
    os.chmod(payload, 0o444)
    result = subprocess.run(['/usr/bin/unshare', '--mount', '--pid', '--fork', '--mount-proc',
        '/usr/local/bin/python3', '-I', str(Path(__file__).resolve()), '--inside', str(payload)])
    events = dict(line.split() for line in (group / 'memory.events').read_text().splitlines())
    # A child PID namespace exit may be translated to status 1 by unshare.
    # The trusted supervisor remains outside the limit to read kernel evidence.
    sys.exit(137 if int(events.get('oom_kill',0)) else result.returncode)


def inside():
    payload = Path(sys.argv[2])
    data = json.loads(payload.read_text())
    (Path('/sys/fs/cgroup/eduflow-untrusted/cgroup.procs')).write_text(str(os.getpid()))
    def run(*args): subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run('/bin/mount', '--make-rprivate', '/')
    run('/bin/mount', '--bind', '/', '/')
    run('/bin/mount', '-o', 'remount,bind,ro', '/')
    run('/bin/mount', '-t', 'tmpfs', '-o', 'rw,noexec,nosuid,nodev,size=16m,mode=1777', 'tmpfs', '/tmp')
    if Path('/dev/shm').exists(): run('/bin/mount', '-o', 'remount,ro', '/dev/shm')
    resource.setrlimit(resource.RLIMIT_NOFILE, (64,64))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16384,16384))
    resource.setrlimit(resource.RLIMIT_CORE, (0,0))
    resource.setrlimit(resource.RLIMIT_NPROC, (32,32))
    resource.setrlimit(resource.RLIMIT_CPU, (30,30))
    os.chdir('/tmp')
    descriptor = os.open(payload, os.O_RDONLY)
    os.dup2(descriptor, 0); os.close(descriptor)
    os.setgroups([]); os.setgid(65534); os.setuid(65534)
    if ctypes.CDLL(None).prctl(38,1,0,0,0) != 0: raise RuntimeError('Cannot restrict privileges')
    # No provider, platform identity or service credential is forwarded.
    environment = {'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/tmp','LANG':'C.UTF-8'}
    if data['language'] == 'python':
        command = ['/usr/local/bin/python3','-I','-c',data['wrapper']]
    else:
        command = ['/usr/local/bin/node','--max-old-space-size=128','-e',data['wrapper']]
    os.execve(command[0],command,environment)


if __name__ == '__main__':
    inside() if len(sys.argv)>1 and sys.argv[1]=='--inside' else main()
