# PR validation probe: actual Android OpenMMO runtime acceptance.
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


def set_field(desc: str, value: str):
    node = wait_node(desc=desc, timeout=20)
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
    args = parser.parse_args()

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

    # Start the launcher activity without coupling the test to generated activity names.
    adb(
        "shell",
        "monkey",
        "-p",
        PACKAGE,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
    )

    wait_node(contains_text="Android OpenMMO Connection", timeout=30)
    screenshot("01-android-openmmo-entry")

    set_field("OpenMMO server websocket", args.server)
    set_field("OpenMMO token", args.token)
    screenshot("02-android-openmmo-configured")

    play = wait_node(desc="OpenMMO play", timeout=15)
    tap_node(play)

    wait_node(desc="OpenMMO character lobby", timeout=45)
    wait_node(contains_text="CryptMira", timeout=15)
    screenshot("03-android-character-lobby")

    enter = wait_node(desc="Enter character CryptMira", timeout=15)
    tap_node(enter)

    wait_node(desc="OpenMMO game screen", timeout=35)
    wait_node(contains_text="SERVER AUTHORITATIVE", timeout=15)
    screenshot("04-android-game-screen")

    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        if ui_contains("MONSTER") and (
            ui_contains("WORLD ENCOUNTER")
            or ui_contains("Attention action 살펴본다")
            or ui_contains("Attention action 빠른 공격")
        ):
            break
        time.sleep(0.5)
    else:
        raise TimeoutError(
            "real Android GameScreen never exposed a MONSTER encounter/combat state"
        )

    screenshot("05-android-monster-encounter")

    root, _ = dump_ui()
    investigate = find_node(root, desc="Attention action 살펴본다")
    if investigate is not None:
        tap_node(investigate)

    attack_seen = wait_node(desc="Attention action 빠른 공격", timeout=20)
    if attack_seen is None:
        raise RuntimeError("Android combat did not expose the attack control")

    resolved = False
    for _ in range(10):
        if ui_contains("REWARD") or ui_contains("처치"):
            resolved = True
            break

        attack = wait_node(desc="Attention action 빠른 공격", timeout=12)
        tap_node(attack)
        time.sleep(1.5)

    if not resolved:
        resolved = ui_contains("REWARD") or ui_contains("처치")

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
