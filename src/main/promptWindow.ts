import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

export async function showPrompt(message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 400,
      height: 200,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: 'SN Utils Prompt',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, '../preload/prompt.js'),
        v8CacheOptions: 'bypassHeatCheck',
        spellcheck: false
      }
    })

    const html = `
      <html>
      <body style="font-family: sans-serif; padding: 20px; background: #f4f4f4;">
        <div style="margin-bottom: 10px;">${message}</div>
        <input id="input" style="width: 100%; padding: 5px;" value="${defaultValue}" />
        <div style="margin-top: 15px; text-align: right;">
          <button id="cancel" style="padding: 5px 15px;">Cancel</button>
          <button id="ok" style="padding: 5px 15px; background: #293e40; color: white; border: none;">OK</button>
        </div>
        <script>
          const input = document.getElementById('input');
          input.focus();
          input.select();
          input.onkeydown = (e) => {
            if (e.key === 'Enter') document.getElementById('ok').click();
            if (e.key === 'Escape') document.getElementById('cancel').click();
          };
          document.getElementById('ok').onclick = () => {
             window.promptBridge.sendResponse(input.value);
             window.close();
          };
          document.getElementById('cancel').onclick = () => {
             window.promptBridge.sendResponse(null);
             window.close();
          };
        </script>
      </body>
      </html>
    `
    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    ipcMain.once('prompt-response', (_event, value) => {
      resolve(value)
    })

    promptWin.on('closed', () => {
      resolve(null)
    })
  })
}
