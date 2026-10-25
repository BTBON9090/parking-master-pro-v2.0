"""Build with the persistent private signing key, never stored in Git."""
import json,os,subprocess
from pathlib import Path
config=Path(os.environ.get('PARKING_SIGNING_CONFIG',str(Path.home()/'.local/share/parking-master/signing/android-signing.json')))
if not config.exists():raise SystemExit('Missing local signing config; see docs/CLIENTS.md')
s=json.loads(config.read_text())
env=dict(os.environ,PARKING_KEYSTORE=s['keystore'],PARKING_STORE_PASSWORD=s['password'],PARKING_KEY_ALIAS=s['alias'],PARKING_KEY_PASSWORD=s['password'])
env.setdefault('JAVA_HOME','/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
subprocess.run(['./gradlew','assembleRelease','--console=plain'],cwd=Path(__file__).resolve().parent.parent/'android',env=env,check=True)
