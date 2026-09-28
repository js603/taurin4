#!/usr/bin/env python3
import glob
import json
import time
from pathlib import Path

import android_openmmo_runtime_acceptance as base

PACKAGE = base.PACKAGE
ARTIFACT_DIR = Path("artifacts/android-openmmo-standalone")
CHARACTER = "StandaloneMira"


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


def field_value(label: str) -> str:
    root, xml_text = base.dump_ui()
    field = base.find_edit_text_for_label(root, label)
    if field is None:
        (ARTIFACT_DIR / "missing-field-window.xml").write_text(
            xml_text,
            encoding="utf-8",
        )
        raise RuntimeError(f"Android field not found: {label}")
    return field.attrib.get("text", "")


def assert_external_credentials_empty():
    server = field_value("SERVER WEBSOCKET · LAN / REMOTE")
    token = field_value("LOCAL AUTH TOKEN")
    if server:
        raise AssertionError(
            f"standalone entry unexpectedly has persisted server URL: {server}"
        )
    if token:
        raise AssertionError("standalone entry unexpectedly has persisted auth token")


def start_singleplayer(prefix: str):
    base.wait_node(contains_text="Android OpenMMO Connection", timeout=30)
    assert_external_credentials_empty()
    base.screenshot(f"{prefix}-entry")

    singleplayer = base.wait_node(text="Singleplayer", timeout=15)
    base.tap_node(singleplayer)

    base.wait_node(text="Character Lobby", timeout=75)
    base.wait_node(
        contains_text="ANDROID STANDALONE · EMBEDDED AUTHORITATIVE CORE",
        timeout=15,
    )
    base.screenshot(f"{prefix}-lobby")


def ensure_character():
    if base.ui_contains(CHARACTER):
        return

    base.set_field("NAME", CHARACTER)
    roll = base.wait_node(text="스탯 굴리기", timeout=15)
    base.tap_node(roll)
    base.wait_node(contains_text="MAX HP", timeout=20)

    create = base.wait_node(text="생성", timeout=15)
    base.tap_node(create)
    base.wait_node(contains_text=CHARACTER, timeout=25)


def safe_stop_to_entry():
    stop = base.wait_node(text="연결 종료", timeout=15)
    base.tap_node(stop)
    # reset() awaits the native controller's upstream graceful shutdown, so the
    # reappearance of Singleplayer is the user-visible persistence barrier.
    base.wait_node(text="Singleplayer", timeout=55)
    assert_external_credentials_empty()


def enter_game():
    enter = base.wait_node(text=f"Enter character {CHARACTER}", timeout=20)
    base.tap_node(enter)
    base.wait_node(text="OpenMMO World", timeout=30)
    base.wait_node(contains_text="SERVER AUTHORITATIVE", timeout=15)
    base.wait_node(contains_text="OpenMMO player state", timeout=15)


def main():
    base.ARTIFACT_DIR = ARTIFACT_DIR
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    apks = sorted(
        glob.glob(
            "src-tauri/gen/android/app/build/outputs/apk/**/*.apk",
            recursive=True,
        )
    )
    if not apks:
        raise RuntimeError("Android standalone debug APK was not produced")
    apk = next((path for path in apks if "debug" in path.lower()), apks[0])

    base.adb("wait-for-device")
    # Start from a genuinely empty app-private state. Persistence is then
    # validated across the second launch without reinstalling the APK.
    base.adb("uninstall", PACKAGE, check=False)
    base.adb("install", apk)
    component = launcher_component()
    bring_to_front(component)

    start_singleplayer("01-first")
    ensure_character()
    base.wait_node(contains_text=CHARACTER, timeout=15)
    base.screenshot("02-character-created")

    # User-visible safe shutdown: disconnect the adapter, stop the embedded
    # authoritative core, wait for upstream persistence, then return to entry.
    safe_stop_to_entry()
    base.screenshot("03-safe-stop-complete")

    # Simulate closing and reopening the app only after graceful native stop.
    base.adb("shell", "am", "force-stop", PACKAGE)
    time.sleep(0.5)
    bring_to_front(component)

    start_singleplayer("04-relaunch")
    base.wait_node(contains_text=CHARACTER, timeout=20)
    base.screenshot("05-persisted-character")

    enter_game()
    base.screenshot("06-authoritative-gameplay")

    evidence = {
        "standalone_without_server_input": True,
        "embedded_authoritative_core": True,
        "character_created": CHARACTER,
        "safe_stop_completed": True,
        "relaunch_character_persisted": True,
        "server_authoritative_game_screen": True,
        "external_credentials_persisted": False,
    }
    (ARTIFACT_DIR / "standalone-state.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("M3-D ANDROID STANDALONE USER FLOW ACCEPTANCE PASS")


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
                xml_text,
                encoding="utf-8",
            )
        except Exception:
            pass
        try:
            logcat = base.adb("logcat", "-d", "-t", "1600", check=False)
            (ARTIFACT_DIR / "failure-logcat.txt").write_text(
                logcat,
                encoding="utf-8",
            )
        except Exception:
            pass
        print(
            f"ANDROID STANDALONE ACCEPTANCE FAILURE: {exc}",
            file=__import__("sys").stderr,
        )
        raise
