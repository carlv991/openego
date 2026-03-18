#!/usr/bin/env python3
"""OpenEgo Desktop App - Python WebView"""

import webview
import os
import sys

def create_app():
    # Get the directory where this script is located
    if getattr(sys, 'frozen', False):
        # Running as compiled app
        base_dir = os.path.dirname(sys.executable)
    else:
        # Running as script
        base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Path to the HTML file
    html_path = os.path.join(base_dir, 'src', 'index.html')
    
    # Create the window
    window = webview.create_window(
        title='OpenEgo - Your Personal Digital Twin',
        url=html_path,
        width=1200,
        height=800,
        min_size=(900, 600),
        resizable=True,
        confirm_close=False
    )
    
    # Start the app
    webview.start(debug=False)

if __name__ == '__main__':
    create_app()
