from setuptools import setup

APP = ['openego.py']
DATA_FILES = [
    ('src', ['src/index.html', 'src/styles.css', 'src/app.js', 'src/updater.js']),
    ('src/assets', ['src/assets/*']),
    ('src-tauri/icons', ['src-tauri/icons/icon.icns'])
]
OPTIONS = {
    'argv_emulation': True,
    'packages': ['webview'],
    'iconfile': 'src-tauri/icons/icon.icns',
    'plist': {
        'CFBundleName': 'OpenEgo',
        'CFBundleShortVersionString': '0.1.0',
        'CFBundleVersion': '0.1.0',
        'CFBundleIdentifier': 'com.openego.app',
        'NSHighResolutionCapable': True,
    }
}

setup(
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
