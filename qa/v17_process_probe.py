# [Diubah oleh Codex - 2026-11-21] QA-only fallback when WMI is unavailable.
# Returns only PIDs/names of the exact synthetic test marker; no command lines.
import ctypes
import json
import os
import sys
from ctypes import wintypes

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
ntdll = ctypes.WinDLL('ntdll')
kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
class Entry(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('usage', wintypes.DWORD), ('pid', wintypes.DWORD),
                ('heap', ctypes.c_size_t), ('module', wintypes.DWORD), ('threads', wintypes.DWORD),
                ('parent', wintypes.DWORD), ('priority', wintypes.LONG), ('flags', wintypes.DWORD),
                ('name', wintypes.WCHAR * 260)]
class UnicodeString(ctypes.Structure):
    _fields_ = [('length', wintypes.USHORT), ('maximum', wintypes.USHORT), ('buffer', ctypes.c_void_p)]
kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
ntdll.NtQueryInformationProcess.argtypes = [wintypes.HANDLE, wintypes.ULONG, ctypes.c_void_p, wintypes.ULONG, ctypes.c_void_p]
marker = sys.argv[1]
if not marker.startswith('OFFICE_ORPHAN_') or not marker.replace('_', '').isalnum():
    raise SystemExit(2)
snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
entry = Entry(); entry.size = ctypes.sizeof(entry)
rows = []
try:
    more = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
    while more:
        if entry.pid != os.getpid() and entry.name.lower() in ('node.exe', 'python.exe', 'python3.exe', 'cmd.exe'):
            handle = kernel.OpenProcess(0x1000, False, entry.pid)
            if handle:
                try:
                    size = wintypes.ULONG()
                    ntdll.NtQueryInformationProcess(handle, 60, None, 0, ctypes.byref(size))
                    if 0 < size.value < 131072:
                        buf = ctypes.create_string_buffer(size.value)
                        if ntdll.NtQueryInformationProcess(handle, 60, buf, len(buf), None) == 0:
                            value = UnicodeString.from_buffer(buf)
                            line = ctypes.wstring_at(value.buffer, value.length // 2)
                            if marker in line and 'fake_agent_' in line:
                                rows.append({'ProcessId': entry.pid, 'Name': entry.name})
                finally:
                    kernel.CloseHandle(handle)
        more = kernel.Process32NextW(snapshot, ctypes.byref(entry))
finally:
    kernel.CloseHandle(snapshot)
print(json.dumps(rows))
