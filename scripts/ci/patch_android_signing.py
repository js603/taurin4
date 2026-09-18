from __future__ import annotations

from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

imports = []
if "import java.io.FileInputStream" not in text:
    imports.append("import java.io.FileInputStream")
if "import java.util.Properties" not in text:
    imports.append("import java.util.Properties")
if imports:
    text = "\n".join(imports) + "\n" + text

if 'create("release")' not in text or "keystorePropertiesFile" not in text:
    marker = "    buildTypes {"
    lines = [
        '    signingConfigs {',
        '        create("release") {',
        '            val keystorePropertiesFile = rootProject.file("keystore.properties")',
        '            val keystoreProperties = Properties()',
        '            if (keystorePropertiesFile.exists()) {',
        '                keystoreProperties.load(FileInputStream(keystorePropertiesFile))',
        '            }',
        '',
        '            keyAlias = keystoreProperties["keyAlias"] as String',
        '            keyPassword = keystoreProperties["keyPassword"] as String',
        '            storeFile = file(keystoreProperties["storeFile"] as String)',
        '            storePassword = keystoreProperties["storePassword"] as String',
        '        }',
        '    }',
        '',
    ]
    signing_block = "\n".join(lines) + "\n"
    if marker not in text:
        raise SystemExit("Could not find Android buildTypes block.")
    text = text.replace(marker, signing_block + marker, 1)

release_marker = '        getByName("release") {'
if release_marker not in text:
    raise SystemExit("Could not find Android release buildType.")

release_start = text.index(release_marker)
release_head = text[release_start:].split("        }", 1)[0]
if 'signingConfig = signingConfigs.getByName("release")' not in release_head:
    insert_at = release_start + len(release_marker)
    text = (
        text[:insert_at]
        + '\n            signingConfig = signingConfigs.getByName("release")'
        + text[insert_at:]
    )

path.write_text(text, encoding="utf-8")
print(f"Patched Android signing in {path}")
