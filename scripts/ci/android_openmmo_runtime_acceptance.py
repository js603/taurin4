#!/usr/bin/env python3
import argparse
import glob
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.js603.taurin4"
ARTIFACT_DIR = Path("artifacts/android-openmmo-runtime")


def run(*args: str, check: bool = True, capture: bool = True) -> str:
    result = subprocess.run(
        list(args),
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    if check and result.returncode != 0:
        output = result.stdout or ""
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(args)}\n{output}"
        )
    return result.stdout or ""


def adb(*args: str, check: bool = True) -> str:
    return run("adb", *args, check=check)


def parse_bounds(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", value)
    if not match:
        raise ValueError(f"invalid Android bounds: {value}")
    x1, y1, x2, y2 = map(int, match.groups())
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def dump_ui() -> tuple[ET.Element, str]:
    remote = "/sdcard/taurin4-window.xml"
    adb("shell", "uiautomator", "dump", remote)
    xml_text = adb("shell", "cat", remote)
    if "<hierarchy" not in xml_text:
        raise RuntimeError("UIAutomator did not return an accessibility hierarchy")
    return ET.fromstring(xml_text), xml_text


def all_nodes(root: ET.Element):
    return list(root.iter("node"))


def find_node(
    root: ET.Element,
    *,
    desc: str | None = None,
    text: str | None = None,
    contains_text: str | None = None,
):
    for node in all_nodes(root):
        node_desc = node.attrib.get("content-desc", "")
        node_text = node.attrib.get("text", "")
        if desc is not None and node_desc == desc:
            return node
        if text is not None and node_text == text:
            return node
        if contains_text is not None and (
            contains_text in node_text or contains_text in node_desc
        ):
            return node
    return None


def find_edit_text_for_label(root: ET.Element, label: str):
    # Android WebView exposes HTML <label><span>TEXT</span><input/></label>
    # as a container with a TextView followed by an EditText. aria-label on
    # EditText is not surfaced as content-desc in UIAutomator.
    for container in root.iter("node"):
        children = list(container)
        has_label = any(
            child.attrib.get("text", "") == label for child in children
        )
        if not has_label:
            continue

        for child in children:
            if child.attrib.get("class") == "android.widget.EditText":
                return child

    return None


def wait_node(
    *,
    desc: str | None = None,
    text: str | None = None,
    contains_text: str | None = None,
    timeout: float = 30.0,
):
    deadline = time.monotonic() + timeout
    last_xml = ""
    while time.monotonic() < deadline:
        try:
            root, last_xml = dump_ui()
            if dismiss_blocking_system_dialog(root):
                continue
            node = find_node(
                root,
                desc=desc,
                text=text,
                contains_text=contains_text,
            )
            if node is not None:
                return node
        except Exception:
            pass
        time.sleep(0.5)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_DIR / "timeout-window.xml").write_text(
        last_xml, encoding="utf-8"
    )
    target = desc or text or contains_text
    raise TimeoutError(f"timed out waiting for Android UI node: {target}")


def tap_node(node: ET.Element):
    x, y = parse_bounds(node.attrib["bounds"])
    adb("shell", "input", "tap", str(x), str(y))


def dismiss_blocking_system_dialog(root: ET.Element) -> bool:
    # Android emulator system UI can surface launcher/ANR dialogs over the
    # already-running Tauri WebView. They are unrelated to taurin4 but block
    # UIAutomator from seeing the app hierarchy.
    alert = find_node(root, contains_text="isn't responding")
    if alert is None:
        return False

    for label in ("Close app", "Wait"):
        button = find_node(root, text=label)
        if button is not None:
            tap_node(button)
            time.sleep(0.8)
            return True

    adb("shell", "input", "keyevent", "KEYCODE_BACK", check=False)
    time.sleep(0.8)
    return True


def launch_installed_app():
    resolved = adb(
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

    if component:
        adb("shell", "am", "force-stop", PACKAGE, check=False)
        adb("shell", "am", "start", "-W", "-n", component)
        return

    # Fallback for unusual generated manifests.
    adb(
        "shell",
        "monkey",
        "-p",
        PACKAGE,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
    )


def set_field(label: str, value: str):
    deadline = time.monotonic() + 20
    node = None
    last_xml = ""
    while time.monotonic() < deadline:
        root, last_xml = dump_ui()
        node = find_edit_text_for_label(root, label)
        if node is not None:
            break
        time.sleep(0.5)

    if node is None:
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        (ARTIFACT_DIR / "field-timeout-window.xml").write_text(
            last_xml, encoding="utf-8"
        )
        raise TimeoutError(
            f"timed out waiting for Android EditText after label: {label}"
        )

    tap_node(node)
    time.sleep(0.2)
    # Clear any pre-existing value without depending on desktop keyboard shortcuts.
    for _ in range(96):
        adb("shell", "input", "keyevent", "KEYCODE_DEL")
    adb("shell", "input", "text", value)
    time.sleep(0.3)


def screenshot(name: str):
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    remote = f"/sdcard/{name}.png"
    adb("shell", "screencap", "-p", remote)
    adb("pull", remote, str(ARTIFACT_DIR / f"{name}.png"))


def tap_primary_action_fast(server_log: Path | None = None):
    # The Android GameScreen uses a stable two-column Attention Card. The
    # primary action occupies ~30% width / 62.5% height on the Pixel 6 profile.
    # This slot is "살펴본다" during WORLD ENCOUNTER, "빠른 공격" in combat,
    # and "전리품 획득" in reward. Using screen-relative coordinates lets the
    # acceptance send the first real combat input before an expensive
    # UIAutomator hierarchy dump can cost the player several seconds.
    size = adb("shell", "wm", "size")
    match = re.search(r"(\d+)x(\d+)", size)
    if not match:
        raise RuntimeError(f"could not resolve Android display size: {size}")

    width, height = map(int, match.groups())
    x = round(width * 0.297)
    y = round(height * 0.625)

    # Keep pressing the stable primary-action slot long enough for the
    # safe-staged kobold to chase ~17.5m from its deterministic spawn. Before
    # the encounter appears these taps are harmless. Once WORLD ENCOUNTER is
    # shown, a tap becomes "살펴본다"; once combat starts, the same slot becomes
    # "빠른 공격". Repeated taps are intentionally faster than the authoritative
    # 1.38 s attack cooldown so the first legal attack is never delayed by UI
    # inspection or polling. The server still accepts/rejects every command.
    log_offset = 0
    if server_log is not None and server_log.exists():
        log_offset = server_log.stat().st_size

    deadline = time.monotonic() + 22
    while time.monotonic() < deadline:
        adb("shell", "input", "tap", str(x), str(y))

        if server_log is not None and server_log.exists():
            try:
                with server_log.open("r", encoding="utf-8", errors="replace") as handle:
                    handle.seek(log_offset)
                    recent = handle.read()
                    log_offset = handle.tell()
                if "Player CryptMira killed kobold" in recent:
                    return True
            except OSError:
                pass

        time.sleep(0.4)

    return False


def ui_contains(value: str) -> bool:
    try:
        root, _ = dump_ui()
    except Exception:
        return False
    return find_node(root, contains_text=value) is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument(
        "--server",
        default="ws://10.0.2.2:10006",
    )
    parser.add_argument("--server-log")
    args = parser.parse_args()
    server_log = Path(args.server_log) if args.server_log else None

    apks = sorted(
        glob.glob(
            "src-tauri/gen/android/app/build/outputs/apk/**/*.apk",
            recursive=True,
        )
    )
    if not apks:
        raise RuntimeError("Android debug APK was not produced")
    apk = next((p for p in apks if "debug" in p.lower()), apks[0])

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    adb("wait-for-device")
    adb("install", "-r", apk)

    # Launch the generated activity directly so Pixel Launcher health is not
    # part of the taurin4 acceptance boundary.
    launch_installed_app()

    wait_node(contains_text="Android OpenMMO Connection", timeout=30)
    screenshot("01-android-openmmo-entry")

    set_field("SERVER WEBSOCKET · LAN / REMOTE", args.server)
    set_field("LOCAL AUTH TOKEN", args.token)
    screenshot("02-android-openmmo-configured")

    play = wait_node(text="OpenMMO play", timeout=15)
    tap_node(play)

    wait_node(text="Character Lobby", timeout=45)
    wait_node(contains_text="CryptMira", timeout=15)
    screenshot("03-android-character-lobby")

    enter = wait_node(text="Enter character CryptMira", timeout=15)
    tap_node(enter)

    # Combat survival is part of the real acceptance. Do not spend the first
    # several seconds taking screenshots or dumping the accessibility tree:
    # the seeded character reconnects inside an aggressive old_crypt pack.
    time.sleep(0.25)
    server_kill_seen = tap_primary_action_fast(server_log)

    # Stop generating input immediately after the authoritative kill. This
    # preserves the REWARD/처치 event in the visible event log even if another
    # kobold kills CryptMira a moment later.
    if server_kill_seen:
        time.sleep(1.5)

    resolved = False
    combat_root = None
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        root, _ = dump_ui()
        if dismiss_blocking_system_dialog(root):
            continue

        has_world = find_node(root, text="OpenMMO World") is not None
        has_authority = (
            find_node(root, contains_text="SERVER AUTHORITATIVE") is not None
        )
        has_monster = find_node(root, contains_text="MONSTER") is not None
        has_reward = (
            find_node(root, contains_text="REWARD") is not None
            or find_node(root, contains_text="처치") is not None
        )

        if has_world and has_authority and has_reward:
            resolved = True
            combat_root = root
            break

        if has_world and has_authority and has_monster:
            combat_root = root

        time.sleep(0.2)

    if combat_root is None:
        raise TimeoutError(
            "real Android GameScreen never exposed the server-authoritative world"
        )

    screenshot("04-android-game-screen")
    screenshot("05-android-monster-encounter")

    screenshot("06-android-combat-result")
    if not resolved:
        raise RuntimeError(
            "Android visible attack controls did not reach an authoritative kill/reward"
        )

    if not ui_contains("SERVER AUTHORITATIVE"):
        raise RuntimeError("Android GameScreen lost the server-authoritative marker")

    print("M3-C ANDROID REAL OPENMMO ACCEPTANCE PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            screenshot("failure")
        except Exception:
            pass
        try:
            _, xml_text = dump_ui()
            (ARTIFACT_DIR / "failure-window.xml").write_text(
                xml_text, encoding="utf-8"
            )
        except Exception:
            pass
        try:
            logcat = adb("logcat", "-d", "-t", "1200", check=False)
            (ARTIFACT_DIR / "failure-logcat.txt").write_text(
                logcat, encoding="utf-8"
            )
        except Exception:
            pass
        print(f"ANDROID ACCEPTANCE FAILURE: {exc}", file=sys.stderr)
        raise
