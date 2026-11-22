"""V14-A + V15 [Diubah oleh Gemini - 2026-11-21]: own a Windows process tree via Job Object kill-on-close.

Supports both legacy invocation (`short_process_runner.py <cmd...>`) and V15 flags:
  short_process_runner.py [--parent-pid <pid>] [--stdin-file <path>] -- <cmd...>

The job handle never leaves this process (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`).
Closing stdin, parent process death (crash / Task Manager kill), or killing this
wrapper terminates every descendant in the process tree immediately.
"""
import ctypes
import os
import subprocess
import sys
import threading
from ctypes import wintypes


def parse_args(argv):
    parent_pid = 0
    stdin_file = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--":
            return parent_pid, stdin_file, argv[i + 1:]
        if arg == "--parent-pid" and i + 1 < len(argv):
            try:
                parent_pid = int(argv[i + 1])
            except ValueError:
                parent_pid = 0
            i += 2
            continue
        if arg == "--stdin-file" and i + 1 < len(argv):
            stdin_file = argv[i + 1]
            i += 2
            continue
        # Legacy positional mode (short_pipeline.js without --)
        return parent_pid, stdin_file, argv[i:]
    return parent_pid, stdin_file, []


def main():
    parent_pid, stdin_file, cmd = parse_args(sys.argv[1:])
    if not cmd:
        return 2

    stdin_handle = None
    try:
        if stdin_file:
            stdin_handle = open(stdin_file, "rb")
        if os.name != "nt":
            return subprocess.call(cmd, stdin=stdin_handle if stdin_handle else subprocess.DEVNULL)

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD

        class Basic(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong), ("PerJobUserTimeLimit", ctypes.c_longlong),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount", "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

        class Extended(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", Basic), ("IoInfo", IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                        ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = Extended()
        limits.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            kernel.CloseHandle(job)
            raise ctypes.WinError(ctypes.get_last_error())

        # Start child suspended so even immediate grandchildren join the Job Object
        child = subprocess.Popen(
            cmd,
            stdin=stdin_handle if stdin_handle else subprocess.DEVNULL,
            creationflags=0x4 | subprocess.CREATE_NO_WINDOW  # CREATE_SUSPENDED | CREATE_NO_WINDOW
        )
        terminated = threading.Event()

        def terminate_job():
            if not terminated.is_set():
                terminated.set()
                try:
                    kernel.TerminateJobObject(job, 130)
                except Exception:
                    pass

        try:
            if not kernel.AssignProcessToJobObject(job, wintypes.HANDLE(child._handle)):
                child.kill()
                raise ctypes.WinError(ctypes.get_last_error())
            resume = ctypes.WinDLL("ntdll").NtResumeProcess
            resume.argtypes = [wintypes.HANDLE]
            if resume(wintypes.HANDLE(child._handle)) != 0:
                child.kill()
                raise RuntimeError("Cannot resume owned job process")

            # Watch 1: Control pipe EOF (triggered immediately on parent stop/cancel OR parent crash)
            def watch_stdin_eof():
                try:
                    while True:
                        chunk = os.read(0, 1)
                        if not chunk:
                            break
                except OSError:
                    pass
                terminate_job()

            threading.Thread(target=watch_stdin_eof, daemon=True).start()

            # Watch 2: Direct kernel wait on parent PID handle (instant kill on hard crash / taskkill /PID /F)
            if parent_pid > 0:
                def watch_parent_handle():
                    SYNCHRONIZE = 0x00100000
                    INFINITE = 0xFFFFFFFF
                    h_parent = kernel.OpenProcess(SYNCHRONIZE, False, parent_pid)
                    if not h_parent:
                        # Parent already dead
                        terminate_job()
                        return
                    try:
                        kernel.WaitForSingleObject(h_parent, INFINITE)
                    finally:
                        kernel.CloseHandle(h_parent)
                    terminate_job()

                threading.Thread(target=watch_parent_handle, daemon=True).start()

            rc = child.wait()
            # Ensure any lingering grandchildren in the job are terminated before wrapper exits
            terminate_job()
            return rc
        finally:
            kernel.CloseHandle(job)
    finally:
        if stdin_handle:
            try:
                stdin_handle.close()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
