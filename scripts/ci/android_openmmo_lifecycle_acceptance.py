#!/usr/bin/env python3
import argparse
import glob
import json
import re
import time
from pathlib import Path

import android_openmmo_runtime_acceptance as base

PACKAGE = base.PACKAGE
ARTIFACT_DIR = Path("artifacts/android-openmmo-lifecycle")
STATE_PATTERN = re.compile(
    r"OpenMMO player state\s*·\s*"
    r"HP (?P<hp>\d+)/(?P<max_hp>\d+)\s*·\s*"
    r"MP (?P<mp>\d+)/(?P<max_mp>\d+)\s*·\s*"
    r"FLOOR (?P<floor>-?\d+)\s*·\s*"
    r"X (?P<x>-?\d+(?:\.\d+)?)\s*·\s*"
    r"Z (?P<z>-?\d+(?:\.\d+)?)"
)


def launcher_component() -> str:
    resolved = base.adb(
        "shell",
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
        PACKAGE,
        check=False,
    )
    component = next(
        (
            line.strip()
            for line in reversed(resolved.splitlines())
            if "/" in line and PACKAGE in line
        ),
        "",
    )
    if not component:
        raise RuntimeError("could not resolve taurin4 Android launcher activity")
    return component


def bring_to_front(component: str):
    base.adb(
        "shell",
        "am",
        "start",
        "-W",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
        "-n",
        component,
    )


def node_value(node) -> str:
    return node.attrib.get("content-desc", "") or node.attrib.get("text", "")


def read_player_state(timeout: float = 12.0) -> dict[str, float | int]:
    node = base.wait_node(
        contains_text="OpenMMO player state",
        timeout=timeout,
    )
    value = node_value(node)
    match = STATE_PATTERN.search(value)
    if not match:
        raise RuntimeError(f"could not parse authoritative player state: {value}")
    return {
        "hp": int(match.group("hp")),
        "max_hp": int(match.group("max_hp")),
        "mp": int(match.group("mp")),
        "max_mp": int(match.group("max_mp")),
        "floor": int(match.group("floor")),
        "x": float(match.group("x")),
        "z": float(match.group("z")),
    }


def state_equal(expected: dict, actual: dict, *, position_tolerance: float = 0.15):
    for key in ("hp", "max_hp", "mp", "max_mp", "floor"):
        if actual[key] != expected[key]:
            raise AssertionError(
                f"authoritative state changed for {key}: "
                f"{expected[key]} -> {actual[key]}"
            )
    for key in ("x", "z"):
        if abs(float(actual[key]) - float(expected[key])) > position_tolerance:
            raise AssertionError(
                f"authoritative position changed for {key}: "
                f"{expected[key]} -> {actual[key]}"
            )


def log_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def read_log_since(path: Path, offset: int) -> tuple[str, int]:
    if not path.exists():
        return "", offset
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(offset)
        content = handle.read()
        return content, handle.tell()


def wait_for_log(path: Path, offset: int, needle: str, timeout: float = 10.0) -> int:
    deadline = time.monotonic() + timeout
    cursor = offset
    while time.monotonic() < deadline:
        recent, cursor = read_log_since(path, cursor)
        if needle in recent:
            return cursor
        time.sleep(0.2)
    raise TimeoutError(f"server log never contained after offset {offset}: {needle}")


def assert_credentials_cleared():
    root, xml_text = base.dump_ui()
    server = base.find_edit_text_for_label(root, "SERVER WEBSOCKET · LAN / REMOTE")
    token = base.find_edit_text_for_label(root, "LOCAL AUTH TOKEN")
    if server is None or token is None:
        (ARTIFACT_DIR / "credential-check-window.xml").write_text(
            xml_text, encoding="utf-8"
        )
        raise RuntimeError("relaunch connection form did not expose expected fields")

    server_value = server.attrib.get("text", "")
    token_value = token.attrib.get("text", "")
    if server_value:
        raise AssertionError(
            f"Android relaunch unexpectedly persisted server URL: {server_value}"
        )
    if token_value:
        raise AssertionError("Android relaunch unexpectedly persisted auth token")


def connect_to_lobby(server: str, token: str, prefix: str):
    base.wait_node(contains_text="Android OpenMMO Connection", timeout=30)
    base.set_field("SERVER WEBSOCKET · LAN / REMOTE", server)
    base.set_field("LOCAL AUTH TOKEN", token)
    base.screenshot(f"{prefix}-configured")

    play = base.wait_node(text="OpenMMO play", timeout=15)
    base.tap_node(play)

    base.wait_node(text="Character Lobby", timeout=45)
    base.wait_node(contains_text="CryptMira", timeout=15)
    base.screenshot(f"{prefix}-lobby")


def enter_cryptmira(prefix: str) -> dict:
    enter = base.wait_node(text="Enter character CryptMira", timeout=15)
    base.tap_node(enter)
    base.wait_node(text="OpenMMO World", timeout=20)
    base.wait_node(contains_text="SERVER AUTHORITATIVE", timeout=10)
    state = read_player_state(timeout=10)
    base.screenshot(f"{prefix}-game")
    return state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--server", default="ws://10.0.2.2:10006")
    parser.add_argument("--server-log", required=True)
    parser.add_argument("--server-pid", type=int)
    args = parser.parse_args()

    base.ARTIFACT_DIR = ARTIFACT_DIR
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    server_log = Path(args.server_log)

    apks = sorted(
        glob.glob(
            "src-tauri/gen/android/app/build/outputs/apk/**/*.apk",
            recursive=True,
        )
    )
    if not apks:
        raise RuntimeError("Android debug APK was not produced")
    apk = next((path for path in apks if "debug" in path.lower()), apks[0])

    base.adb("wait-for-device")
    base.adb("install", "-r", apk)
    component = launcher_component()
    base.adb("shell", "am", "force-stop", PACKAGE, check=False)
    bring_to_front(component)

    connect_to_lobby(args.server, args.token, "01-initial")
    initial = enter_cryptmira("02-initial")
    if initial["floor"] != -1:
        raise AssertionError(f"expected old_crypt floor -1, got {initial['floor']}")

    # Short HOME/background interruption must preserve the live Tauri/WebSocket
    # session; it must not require credentials or character selection again.
    background_log_offset = log_size(server_log)
    base.adb("shell", "input", "keyevent", "KEYCODE_HOME")
    time.sleep(2.0)
    bring_to_front(component)

    base.wait_node(text="OpenMMO World", timeout=12)
    resumed = read_player_state(timeout=10)
    state_equal(initial, resumed)
    resumed_log, _ = read_log_since(server_log, background_log_offset)
    if "Session ended for CryptMira" in resumed_log:
        raise AssertionError("short Android background/resume disconnected CryptMira")
    base.screenshot("03-background-resumed")

    # A real process death must disconnect. Credentials stay memory-only, so a
    # fresh launch returns to setup; the test deliberately re-enters them.
    disconnect_offset = log_size(server_log)
    base.adb("shell", "am", "force-stop", PACKAGE)
    wait_for_log(
        server_log,
        disconnect_offset,
        "Session ended for CryptMira",
        timeout=12,
    )

    bring_to_front(component)
    base.wait_node(contains_text="Android OpenMMO Connection", timeout=30)
    assert_credentials_cleared()
    base.screenshot("04-relaunch-clean-credentials")

    reconnect_offset = log_size(server_log)
    connect_to_lobby(args.server, args.token, "05-reconnect")

    reconnected = enter_cryptmira("06-reconnected")
    state_equal(resumed, reconnected)

    reconnect_log, _ = read_log_since(server_log, reconnect_offset)
    if "entered game as character 'CryptMira'" not in reconnect_log:
        raise AssertionError(
            "server did not confirm CryptMira EnterGame after Android relaunch"
        )

    evidence = {
        "initial": initial,
        "background_resumed": resumed,
        "force_stop_reconnected": reconnected,
        "credentials_persisted": False,
        "background_disconnect_seen": False,
        "force_stop_disconnect_seen": True,
    }
    (ARTIFACT_DIR / "lifecycle-state.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("M3-C ANDROID LIFECYCLE RECONNECT ACCEPTANCE PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            base.screenshot("failure")
        except Exception:
            pass
        try:
            _, xml_text = base.dump_ui()
            (ARTIFACT_DIR / "failure-window.xml").write_text(
                xml_text, encoding="utf-8"
            )
        except Exception:
            pass
        try:
            logcat = base.adb("logcat", "-d", "-t", "1200", check=False)
            (ARTIFACT_DIR / "failure-logcat.txt").write_text(
                logcat, encoding="utf-8"
            )
        except Exception:
            pass
        print(f"ANDROID LIFECYCLE ACCEPTANCE FAILURE: {exc}", file=__import__("sys").stderr)
        raise
