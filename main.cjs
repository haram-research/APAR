const { app, BrowserWindow, Menu, ipcMain, nativeTheme, dialog } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'

// 자동 업데이트 (프로덕션 전용)
let autoUpdater = null
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
  } catch (e) {
    // electron-updater 로드 실패 시 무시
  }
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'APAR - Automated Provisional Answer Review',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-app/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    // macOS app menu
    ...(isMac ? [{
      label: app.name,
      submenu: [
        {
          label: '환경설정...',
          accelerator: 'Cmd+,',
          click: () => mainWindow?.webContents.send('open-preferences'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // File menu (Windows/Linux — provides Settings entry)
    ...(!isMac ? [{
      label: '파일(&F)',
      submenu: [
        {
          label: '환경설정(&S)',
          accelerator: 'Ctrl+,',
          click: () => mainWindow?.webContents.send('open-preferences'),
        },
        { type: 'separator' },
        { role: 'quit', label: '종료(&X)' },
      ],
    }] : []),

    // Edit
    {
      label: isMac ? '편집' : '편집(&E)',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },

    // View
    {
      label: isMac ? '보기' : '보기(&V)',
      submenu: [
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '기본 배율' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체화면' },
      ],
    },

    // Window
    {
      label: isMac ? '윈도우' : '창(&W)',
      submenu: [
        { role: 'minimize', label: '최소화' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : [
          { role: 'close', label: '닫기' },
        ]),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // 업데이트 체크 (프로덕션 전용, 앱 준비 후 3초 뒤)
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 3000)

    autoUpdater.on('update-available', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'APAR 업데이트',
        message: '새 버전이 있습니다. 백그라운드에서 다운로드합니다.\n완료 후 앱 재시작 시 자동으로 설치됩니다.',
        buttons: ['확인'],
      })
    })

    autoUpdater.on('error', () => {
      // 업데이트 오류는 조용히 무시
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
