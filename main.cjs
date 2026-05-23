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

    // 업데이트 발견 — 버전 표시 + 백그라운드 다운로드 안내
    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'APAR 업데이트',
        message: `새 버전 v${info.version}을 발견했습니다.`,
        detail: '백그라운드에서 다운로드합니다.\n완료되면 재시작 안내가 표시됩니다.',
        buttons: ['확인'],
      })
    })

    // 다운로드 완료 — 패치 노트 + 재시작 선택
    autoUpdater.on('update-downloaded', (info) => {
      const fallbackNotes = [
        '■ v1.2.0 주요 변경사항',
        '• 채점 알고리즘 버그 6건 수정 (Q102/104/108/109/110/111)',
        '• 문항 유형 검토 패널 추가 (자동 감지 유형 강제 지정)',
        '• Type A/C 스펠링 오류 허용 설정 분리',
        '• 전체 내역: CHANGELOG.md 참조',
      ].join('\n')

      const notes = (typeof info.releaseNotes === 'string' && info.releaseNotes.trim())
        ? info.releaseNotes.trim()
        : fallbackNotes

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: `APAR v${info.version} 업데이트 준비 완료`,
        message: `v${info.version} 다운로드가 완료되었습니다.`,
        detail: notes,
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          // isSilent=false, isForceRunAfter=true — 설치 후 자동 재실행 (Windows)
          autoUpdater.quitAndInstall(false, true)
        }
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
