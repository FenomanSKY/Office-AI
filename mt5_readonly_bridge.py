# [Diubah oleh Codex - 2026-11-21] V17 persistent read-only snapshots, probe and reconnect.
# [Diubah oleh Gemini - 2026-11-20] Jembatan baca-saja MetaTrader 5 untuk Office AI V12 & V13 (riwayat --history-days 1..365, filter deal trading murni tanpa balance/credit, tanpa order/login/kredensial)
"""Jembatan telemetri MetaTrader 5 murni baca-saja (read-only) untuk Office AI V12 & V13.

Jaminan keamanan:
- 100% BACA-SAJA: tidak pernah mengimpor, mengekspos, atau memanggil fungsi eksekusi
  trading (tanpa order API, tanpa modifikasi posisi, tanpa penutupan posisi).
- Tidak pernah membaca, menerima, atau menyimpan nomor akun, nama pemilik, kata sandi,
  ataupun kredensial broker.
- Mengeluarkan JSON terstruktur ke stdout dan keluar dengan kode 0 secara anggun
  meskipun paket MetaTrader5 belum terpasang atau terminal MT5 sedang tertutup.
"""

import argparse
import datetime
import json
import re
import sys
import time
import threading
import os


def _utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def terminal_is_running():
    """[Diubah oleh Claude - 2026-11-21] mt5.initialize() MELUNCURKAN terminal bila belum berjalan.
    Jembatan baca-saja TIDAK boleh membuka MetaTrader 5 sendiri (mengganggu pengguna/EA): hanya
    menyambung ke terminal yang SUDAH hidup. Deteksi lewat tasklist (tanpa jendela, tanpa dependensi)."""
    if os.name != "nt":
        return True
    try:
        import subprocess
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        out = subprocess.run(["tasklist.exe", "/FI", "IMAGENAME eq terminal64.exe", "/NH", "/FO", "CSV"],
                             capture_output=True, text=True, timeout=5, creationflags=flags).stdout.lower()
        if "terminal64.exe" in out:
            return True
        out = subprocess.run(["tasklist.exe", "/FI", "IMAGENAME eq terminal.exe", "/NH", "/FO", "CSV"],
                             capture_output=True, text=True, timeout=5, creationflags=flags).stdout.lower()
        return "terminal.exe" in out
    except Exception:
        return False


def _epoch_to_iso(epoch_val, fallback_iso):
    try:
        ts = float(epoch_val)
        if ts > 0:
            return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    except Exception:
        pass
    return fallback_iso


def _mask_server(raw_server):
    s = str(raw_server or "").strip()
    if not s:
        return "***"
    if len(s) <= 4:
        return "***"
    return s[:3] + "***" + s[-3:]


def _sanitize_comment(raw_comment, max_len=64):
    if raw_comment is None:
        return ""
    cleaned = re.sub(r"[\x00-\x1f\x7f]+", " ", str(raw_comment)).strip()
    return cleaned[:max_len]


# [Diubah oleh Gemini - 2026-11-20] Tambah dukungan history_days (1..365), filter DEAL_TYPE_BALANCE/credit/bonus, serta field price/entry/comment terurut kronologis
def fetch_mt5_snapshot(terminal_path="", history_hours=24, history_days=None, _session=None, _cache=None):
    fetched_at = _utc_now_iso()
    try:
        import MetaTrader5 as mt5  # type: ignore
    except ImportError:
        return {
            "ok": False,
            "connected": False,
            "readonly": True,
            "reason": "mt5_unavailable",
            "error": "Paket Python MetaTrader5 belum terpasang (pip install MetaTrader5).",
            "account": None,
            "positions": [],
            "closed_deals": [],
            "balance_ops_count": 0,
            "fetched_at": fetched_at,
        }

    # Inisialisasi murni baca-saja ke terminal lokal yang sudah berjalan (tanpa parameter akun/sandi)
    init_ok = _session is not None
    try:
        clean_path = str(terminal_path or "").strip()
        if _session is not None:
            pass
        elif not terminal_is_running():
            init_ok = False  # [Diubah oleh Claude - 2026-11-21] jangan pernah meluncurkan terminal sendiri
        elif clean_path:
            init_ok = bool(mt5.initialize(path=clean_path))
        else:
            init_ok = bool(mt5.initialize())
    except Exception:
        init_ok = False

    if not init_ok:
        return {
            "ok": False,
            "connected": False,
            "readonly": True,
            "reason": "terminal_not_running",
            "error": "Terminal MetaTrader 5 lokal tidak aktif atau gagal terhubung secara baca-saja.",
            "account": None,
            "positions": [],
            "closed_deals": [],
            "balance_ops_count": 0,
            "fetched_at": fetched_at,
        }

    try:
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        fetched_at = now_dt.isoformat()
        info = mt5.account_info()
        if info is None:
            return {
                "ok": False,
                "connected": False,
                "readonly": True,
                "reason": "account_not_logged_in",
                "error": "Informasi akun MT5 belum tersedia di terminal lokal.",
                "account": None,
                "positions": [],
                "closed_deals": [],
                "balance_ops_count": 0,
                "fetched_at": fetched_at,
            }

        currency = str(getattr(info, "currency", "USD") or "USD")
        account_payload = {
            "balance": round(float(getattr(info, "balance", 0.0) or 0.0), 2),
            "equity": round(float(getattr(info, "equity", 0.0) or 0.0), 2),
            "profit": round(float(getattr(info, "profit", 0.0) or 0.0), 2),
            "currency": currency,
            "margin_free": round(float(getattr(info, "margin_free", 0.0) or 0.0), 2),
            "server_masked": _mask_server(getattr(info, "server", "")),
        }

        terminal = mt5.terminal_info() if hasattr(mt5, "terminal_info") else None
        if terminal is not None and not getattr(terminal, "connected", True):
            return failure("terminal_not_running")
        raw_positions = mt5.positions_get()
        if raw_positions is None:
            return failure("snapshot_unavailable")
        positions_list = []
        for pos in raw_positions:
            pos_id = int(getattr(pos, "identifier", 0) or getattr(pos, "ticket", 0))
            try:
                opening = mt5.history_deals_get(position=pos_id)
                entries = [d for d in opening if int(getattr(d, "entry", -1)) in (0, 2)
                           and int(getattr(d, "type", -1)) in (0, 1)] if opening is not None else []
                # Allocate entry commissions to the remaining open volume after partial closes.
                entered_volume = sum(float(getattr(d, "volume", 0) or 0) for d in entries)
                commission = (sum(float(d.commission) for d in entries) *
                              min(1, float(getattr(pos, "volume", 0)) / entered_volume)
                              if entered_volume and all(hasattr(d, "commission") for d in entries) else None)
            except Exception:
                commission = None
            profit = float(getattr(pos, "profit", 0) or 0)
            swap = float(getattr(pos, "swap", 0) or 0)
            pos_type = int(getattr(pos, "type", 0) or 0)
            side = "SELL" if pos_type == 1 else "BUY"
            positions_list.append({
                "ticket": str(getattr(pos, "ticket", "")),
                "symbol": str(getattr(pos, "symbol", "")),
                "side": side,
                "volume": round(float(getattr(pos, "volume", 0.0) or 0.0), 4),
                "price_open": round(float(getattr(pos, "price_open", 0.0) or 0.0), 5),
                "price_current": round(float(getattr(pos, "price_current", 0.0) or 0.0), 5),
                "profit": round(profit, 2),
                "swap": round(swap, 2),
                "commission": round(commission, 2) if commission is not None else None,
                "net_floating": round(profit + swap + (commission or 0), 2),
                "sl": float(getattr(pos, "sl", 0) or 0),
                "tp": float(getattr(pos, "tp", 0) or 0),
                "time": _epoch_to_iso(getattr(pos, "time", 0), fetched_at),
            })

        if history_days is not None:
            days = max(1, min(int(history_days or 30), 365))
            start_dt = now_dt - datetime.timedelta(days=days)
        else:
            hours = max(1, min(int(history_hours or 24), 720))
            start_dt = now_dt - datetime.timedelta(hours=hours)

        raw_deals = mt5.history_deals_get(start_dt, now_dt)
        if raw_deals is None:
            raw_deals = []  # Never interpret an unavailable position read as a close.

        # [Diubah oleh Gemini - 2026-11-20] Pindai deal pembuka (DEAL_ENTRY_IN) per position_id agar arah posisi (BUY/SELL) & komentar EA sinkron dengan MT5 History (karena deal penutup DEAL_ENTRY_OUT bertipe kebalikan dari posisi)
        # Reuse closed-position opening metadata across stream ticks; bound the cache.
        open_deals_by_pos = _cache.setdefault("opening", {}) if _cache is not None else {}
        if len(open_deals_by_pos) > 4000:
            open_deals_by_pos.clear()
        for deal in raw_deals:
            d_type = int(getattr(deal, "type", -1))
            d_entry = int(getattr(deal, "entry", -1))
            if d_type in (0, 1) and d_entry == 0:
                pos_key = str(getattr(deal, "position_id", "") or "")
                if pos_key and pos_key != "0" and pos_key not in open_deals_by_pos:
                    open_deals_by_pos[pos_key] = {
                        "side": "SELL" if d_type == 1 else "BUY",
                        "comment": _sanitize_comment(getattr(deal, "comment", ""), 64),
                        "price_open": round(float(getattr(deal, "price", 0.0) or 0.0), 5),
                        "open_time": _epoch_to_iso(getattr(deal, "time", 0), fetched_at),
                    }

        closed_deals = []
        balance_ops_count = 0
        for deal in raw_deals:
            deal_type = int(getattr(deal, "type", -1))
            # Exclude DEAL_TYPE_BALANCE (2), CREDIT (3), CHARGE (4), CORRECTION (5), BONUS (6)
            if deal_type not in (0, 1):
                if deal_type in (2, 3, 4, 5, 6):
                    balance_ops_count += 1
                continue
            # entry == 1 (DEAL_ENTRY_OUT), 2 (DEAL_ENTRY_INOUT), 3 (DEAL_ENTRY_OUT_BY) = penutupan posisi terealisasi
            entry_kind = int(getattr(deal, "entry", 0) or 0)
            if entry_kind not in (1, 2, 3):
                continue

            pos_id_raw = getattr(deal, "position_id", 0) or 0
            pos_id_str = str(pos_id_raw) if pos_id_raw else str(getattr(deal, "ticket", ""))
            open_info = open_deals_by_pos.get(pos_id_str)
            if open_info is None and pos_id_raw:
                try:
                    pos_deals = mt5.history_deals_get(position=int(pos_id_raw)) or []
                    for pd in pos_deals:
                        pd_type = int(getattr(pd, "type", -1))
                        pd_entry = int(getattr(pd, "entry", -1))
                        if pd_type in (0, 1) and pd_entry == 0:
                            open_info = {
                                "side": "SELL" if pd_type == 1 else "BUY",
                                "comment": _sanitize_comment(getattr(pd, "comment", ""), 64),
                                "price_open": round(float(getattr(pd, "price", 0.0) or 0.0), 5),
                                "open_time": _epoch_to_iso(getattr(pd, "time", 0), fetched_at),
                            }
                            open_deals_by_pos[pos_id_str] = open_info
                            break
                except Exception:
                    open_info = None

            profit = round(float(getattr(deal, "profit", 0.0) or 0.0), 2)
            commission = round(float(getattr(deal, "commission", 0.0) or 0.0), 2)
            swap = round(float(getattr(deal, "swap", 0.0) or 0.0), 2)
            net_profit = round(profit + commission + swap, 2)
            price = round(float(getattr(deal, "price", 0.0) or 0.0), 5)
            entry_label = "inout" if entry_kind == 2 else "out"
            close_comment = _sanitize_comment(getattr(deal, "comment", ""), 64)
            open_comment = open_info["comment"] if open_info else ""
            if open_comment and close_comment and close_comment.lower() != open_comment.lower():
                comment = _sanitize_comment(f"{open_comment} · {close_comment}", 64)
            else:
                comment = open_comment or close_comment

            # Arah posisi asli: ambil dari deal pembuka (DEAL_ENTRY_IN), atau balikkan tipe deal penutup (OUT BUY = menutup posisi SELL, OUT SELL = menutup posisi BUY)
            if open_info:
                side = open_info["side"]
            else:
                side = "BUY" if deal_type == 1 else "SELL"

            closed_deals.append({
                "ticket": str(getattr(deal, "ticket", "")),
                "position_id": pos_id_str,
                "symbol": str(getattr(deal, "symbol", "")),
                "side": side,
                "entry": entry_label,
                "volume": round(float(getattr(deal, "volume", 0.0) or 0.0), 4),
                "price": price,
                "price_open": open_info["price_open"] if open_info else 0.0,
                "open_time": open_info["open_time"] if open_info else "",
                "profit": profit,
                "commission": commission,
                "swap": swap,
                "net_profit": net_profit,
                "comment": comment,
                "time": _epoch_to_iso(getattr(deal, "time", 0), fetched_at),
            })

        closed_deals.sort(key=lambda d: (d.get("time", ""), d.get("ticket", "")))

        return {
            "ok": True,
            "connected": True,
            "readonly": True,
            "reason": None,
            "account": account_payload,
            "positions": positions_list,
            "closed_deals": closed_deals[-2000:],
            "balance_ops_count": balance_ops_count,
            "fetched_at": fetched_at,
        }
    finally:
        try:
            if _session is None:
                mt5.shutdown()
        except Exception:
            pass


def failure(reason):
    return {"ok": False, "connected": False, "readonly": True, "reason": reason,
            "account": None, "positions": [], "closed_deals": [], "fetched_at": _utc_now_iso()}


def stream(args):
    """One initialize per connection; parent-owned pipe/job also handles forced death."""
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print(json.dumps(failure("mt5_unavailable")), flush=True)
        return 0
    stopped = threading.Event()
    # Direct mode: EOF on the private parent control pipe ends the bridge.
    def watch_eof():
        try:
            while os.read(0, 1):
                pass
        except OSError:
            pass
        stopped.set()
    if not args.job_owned:
        threading.Thread(target=watch_eof, daemon=True).start()
    initialized, backoff = False, 1
    cache = {}
    try:
        while not stopped.is_set():
            started = time.monotonic()
            try:
                if not initialized and terminal_is_running():  # [Diubah oleh Claude - 2026-11-21] tidak meluncurkan terminal
                    kwargs = {"path": args.terminal_path} if args.terminal_path else {}
                    initialized = bool(mt5.initialize(**kwargs))
                snap = (fetch_mt5_snapshot(args.terminal_path, args.history_hours,
                                           args.history_days, _session=mt5, _cache=cache)
                        if initialized else failure("terminal_not_running"))
            except Exception:
                snap = failure("snapshot_unavailable")
            print(json.dumps(snap, ensure_ascii=False, allow_nan=False), flush=True)
            if snap.get("connected"):
                backoff = 1
                delay = args.interval
            else:
                if initialized:
                    mt5.shutdown()
                initialized = False
                cache.clear()
                delay, backoff = backoff, min(5, backoff * 2)
            stopped.wait(max(0.05, delay - (time.monotonic() - started)))
    finally:
        mt5.shutdown()
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Office AI V12/V13 MetaTrader 5 Read-Only Telemetry Bridge"
    )
    parser.add_argument(
        "--terminal-path",
        type=str,
        default="",
        help="Path opsional ke terminal64.exe MetaTrader 5 lokal",
    )
    parser.add_argument(
        "--history-hours",
        type=int,
        default=24,
        help="Rentang jam riwayat deal tertutup yang dipindai (default: 24)",
    )
    parser.add_argument(
        "--history-days",
        type=int,
        nargs="?",
        const=30,
        default=None,
        help="Rentang hari riwayat deal tertutup yang dipindai (1..365, default: 30 bila dipanggil)",
    )
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--stream", action="store_true")
    parser.add_argument("--job-owned", action="store_true")
    parser.add_argument("--interval", type=float, default=1)
    args = parser.parse_args()
    if args.probe:
        try:
            import MetaTrader5
            available = True
        except ImportError:
            available = False
        print(json.dumps({"python": True, "module": available, "executable": sys.executable}))
        return 0
    if args.stream:
        args.interval = max(1, min(5, args.interval))
        return stream(args)
    snapshot = fetch_mt5_snapshot(
        terminal_path=args.terminal_path,
        history_hours=args.history_hours,
        history_days=args.history_days,
    )
    sys.stdout.write(json.dumps(snapshot, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
