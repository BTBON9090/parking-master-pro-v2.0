"""Package the synced Xcode project and bundled game assets, without user data."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
version = json.loads((root/'package.json').read_text())['version']
output = root/'release'/f'Parking-Master-Pro-{version}-iOS-Project.zip'
excluded = {'build', 'DerivedData', 'Pods', 'xcuserdata', '.DS_Store'}
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for source in sorted((root/'ios').rglob('*')):
        if source.is_file() and not excluded.intersection(source.relative_to(root/'ios').parts):
            archive.write(source, source.relative_to(root))
    archive.write(root/'docs/CLIENTS.md', 'README.md')
    # Capacitor plugins in CapApp-SPM refer to ../../../../node_modules.
    # Include the lockfile so npm ci recreates those exact native dependencies.
    for name in ('package.json', 'package-lock.json', 'capacitor.config.ts'):
        archive.write(root/name, name)
print(output.name, output.stat().st_size)
