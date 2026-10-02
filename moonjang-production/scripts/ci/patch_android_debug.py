from pathlib import Path
p=Path('src-tauri/gen/android/app/src/main/AndroidManifest.xml')
text=p.read_text()
if 'android:usesCleartextTraffic=' not in text:
    text=text.replace('<application ', '<application android:usesCleartextTraffic="true" ')
p.write_text(text)
print('Android internal-test cleartext LAN access enabled')
