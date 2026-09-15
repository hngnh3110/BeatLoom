"""Install the YouTube extractor inside this project, without changing system Python."""
from pathlib import Path
import os
import subprocess
import sys

if sys.version_info < (3, 10):
    raise SystemExit('Cần Python 3.10 trở lên để cài bộ chuyển đổi YouTube.')
root = Path(__file__).resolve().parent.parent
runtime = root / '.tools' / 'python'
subprocess.run([sys.executable, '-m', 'venv', str(runtime)], check=True)
python = runtime / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', '--upgrade', '-r', str(root / 'requirements-youtube.txt')], check=True)
print('Đã cài bộ chuyển đổi YouTube. Khởi động lại BEATLOOM để sử dụng.')
