"""Rakit Aplikasi/OfficeAI-win32-x64 tanpa electron-packager (yang berhenti diam-diam di Node 26).
Jalankan: python -I repack.py   (butuh node_modules/electron/dist sudah terekstrak)."""
import json, os, re, shutil, filecmp
root = os.path.dirname(os.path.abspath(__file__)).replace(chr(92), '/')
src = open(root + '/pack.js', encoding='utf8').read()
src_nc = re.sub(r'/\*.*?\*/', '', src, flags=re.S)  # [Diubah oleh Claude - 2026-11-21] buang komentar blok supaya ']' di komentar tidak memotong daftar
src_nc = re.sub(r'(?m)^\s*//.*$', '', src_nc)
files = re.findall(r"'([^']+)'", re.search(r"RUNTIME_FILES = Object\.freeze\(\[(.*?)\]", src_nc, re.S).group(1))
files += ['locales/' + l['code'] + '.json' for l in json.load(open(root + '/locales/index.json', encoding='utf8'))]
out = root + '/Aplikasi/OfficeAI-win32-x64'
# Perbarui hanya runtime eksplisit; aplikasi user yang sedang hidup tetap berjalan.
assert os.path.commonpath([os.path.realpath(root), os.path.realpath(out)]) == os.path.realpath(root)
def copy_changed(src, dst):
    if not os.path.isfile(dst) or not filecmp.cmp(src, dst, shallow=False):
        shutil.copy2(src, dst)
    return dst
os.makedirs(out, exist_ok=True)
for entry in os.scandir(root + '/node_modules/electron/dist'):
    dest = out + '/' + ('OfficeAI.exe' if entry.name == 'electron.exe' else entry.name)
    if entry.is_dir(): shutil.copytree(entry.path, dest, dirs_exist_ok=True, copy_function=copy_changed)
    else: copy_changed(entry.path, dest)
app = out + '/resources/app'
for f in files:
    os.makedirs(os.path.dirname(f'{app}/{f}'), exist_ok=True)
    copy_changed(f'{root}/{f}', f'{app}/{f}')
cfg = json.load(open(root + '/package.json', encoding='utf8'))
package_text = json.dumps({'name': cfg['name'], 'version': cfg['version'], 'description': cfg.get('description', ''),
           'author': 'Office AI', 'main': 'main.js'}, indent=2)
package_path = app + '/package.json'
if not os.path.isfile(package_path) or open(package_path, encoding='utf8').read() != package_text:
    with open(package_path, 'w', encoding='utf8') as package_file:
        package_file.write(package_text)
copy_changed(root + '/hook_send.py', out + '/hook_send.py')
p = out + '/resources/default_app.asar'
if os.path.exists(p): os.remove(p)
print('Paket siap:', out + '/OfficeAI.exe', len(files), 'berkas runtime')
