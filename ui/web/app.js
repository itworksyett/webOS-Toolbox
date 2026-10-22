/**
 * lg-webos-toolbox — Client Controller (v1.2.0 Real-Time Telemetry & App Detection)
 */

class AppController {
  constructor() {
    this.currentTab = 'dashboard';
    this.deviceInfo = null;
    this.auditResults = null;
    this.telemetryTimer = null;
    this.isPolling = false;
    this.cpuHistory = [0, 0, 0, 0, 0, 0, 0, 0];
    this.ramHistory = [0, 0, 0, 0, 0, 0, 0, 0];
    this.logCount = 1;
    this.otaActive = false;
    this.otaCountdownTimer = null;
    this.tweaksCountdownTimer = null;
    this.matrixModels = [];
    this.isConnecting = false;
    this.catalogItems = [];
    this.installedApps = [];
    this.activeCatalogFilter = 'all';
    this.catalogSearchQuery = '';
    this.pendingUninstallAppId = null;
    this.pendingUninstallAppTitle = '';
    this.pendingUninstallOrigin = '';
    this.activeChangelogAppId = null;
    this.terminalHistory = [];
    this.terminalHistoryIndex = -1;
    this.isTerminalBusy = false;

    this.initElements();
    this.bindEvents();

    setTimeout(async () => {
      this.loadCompatibilityMatrix();

      // Auto-restore last known IP and attempt seamless auto-connect
      const savedIp = localStorage.getItem('tv_ip');
      if (savedIp && this.el.ipInput) {
        this.el.ipInput.value = savedIp;
      }

      const curIp = this.el.ipInput ? this.el.ipInput.value.trim() : '';
      if (curIp) {
        try {
          await this.handleConnect();
        } catch (e) {
          console.warn('Startup auto-connect warning:', e);
        }
      }

      const dismissed = localStorage.getItem('wizard_dismissed') === 'true';
      if (!dismissed && (!this.deviceInfo || !this.deviceInfo.root_active) && (!this.currentDevice || this.currentDevice.connection_state === 'OFFLINE')) {
        this.openWizardModal();
      }
    }, 400);
  }

  initElements() {
    this.el = {
      ipInput: document.getElementById('tv-ip'),
      btnConnect: document.getElementById('btn-connect'),
      btnConnectLabel: document.getElementById('btn-connect-label'),
      btnScan: document.getElementById('btn-scan'),
      btnScanLabel: document.getElementById('btn-scan-label'),
      pingBadge: document.getElementById('ping-badge'),
      pingText: document.getElementById('ping-text'),

      // Header Quick TV Strip
      hdrTvStrip: document.getElementById('hdr-tv-strip'),
      hdrActiveApp: document.getElementById('hdr-active-app'),
      hdrAppTitle: document.getElementById('hdr-app-title'),
      hdrBtnScreenOff: document.getElementById('hdr-btn-screen-off'),
      hdrBtnMute: document.getElementById('hdr-btn-mute'),
      hdrBtnHome: document.getElementById('hdr-btn-home'),
      muteIcon: document.getElementById('mute-icon'),

      // Dashboard Elements
      dashValModel: document.getElementById('dash-val-model'),
      dashValDisplay: document.getElementById('dash-val-display'),
      dashValSoc: document.getElementById('dash-val-soc'),
      dashValWebos: document.getElementById('dash-val-webos'),
      dashValKernel: document.getElementById('dash-val-kernel'),
      dashValUptime: document.getElementById('dash-val-uptime'),
      dashValStorageApp: document.getElementById('dash-val-storage-app'),
      dashStorageAppBar: document.getElementById('dash-storage-app-bar'),
      dashValStorageData: document.getElementById('dash-val-storage-data'),
      dashStorageDataBar: document.getElementById('dash-storage-data-bar'),
      dashValSwapStatus: document.getElementById('dash-val-swap-status'),
      dashValSwapRatio: document.getElementById('dash-val-swap-ratio'),
      dashValActiveapp: document.getElementById('dash-val-activeapp'),
      dashValVolume: document.getElementById('dash-val-volume'),
      dashValDisplayState: document.getElementById('dash-val-display-state'),
      dashValIp: document.getElementById('dash-val-ip'),
      dashValTelnet: document.getElementById('dash-val-telnet'),
      dashValSsap: document.getElementById('dash-val-ssap'),
      dashValInit: document.getElementById('dash-val-init'),
      dashValRdxd: document.getElementById('dash-val-rdxd'),
      dashPlatformBadge: document.getElementById('dash-platform-badge'),
      dashMediaBadge: document.getElementById('dash-media-badge'),

      dashValOta: document.getElementById('dash-val-ota'),
      btnToggleOta: document.getElementById('btn-toggle-ota'),
      dashProcsBody: document.getElementById('dash-procs-body'),
      btnDashRefreshProcs: document.getElementById('btn-dash-refresh-procs'),
      btnDashKillLag: document.getElementById('btn-dash-kill-lag'),

      // Service Menu & Backups
      btnLaunchInstart: document.getElementById('btn-launch-instart'),
      btnLaunchEzadjust: document.getElementById('btn-launch-ezadjust'),
      btnCloseService: document.getElementById('btn-close-service'),
      btnCreateBackup: document.getElementById('btn-create-backup'),
      btnRefreshBackups: document.getElementById('btn-refresh-backups'),
      backupListBox: document.getElementById('backup-list-box'),

      // OTA Modal
      otaModal: document.getElementById('ota-modal'),
      btnOtaCancel: document.getElementById('btn-ota-cancel'),
      btnOtaCancelTop: document.getElementById('btn-ota-cancel-top'),
      btnOtaConfirm: document.getElementById('btn-ota-confirm'),
      otaConfirmText: document.getElementById('ota-confirm-text'),
      otaModalQuestion: document.getElementById('ota-modal-question'),

      // Tweaks Modal
      tweaksModal: document.getElementById('tweaks-modal'),
      btnTweaksCancel: document.getElementById('btn-tweaks-cancel'),
      btnTweaksCancelTop: document.getElementById('btn-tweaks-cancel-top'),
      btnTweaksConfirm: document.getElementById('btn-tweaks-confirm'),
      tweaksConfirmText: document.getElementById('tweaks-confirm-text'),

      // Wizard Modal
      btnOpenWizard: document.getElementById('btn-open-wizard'),
      wizardModal: document.getElementById('wizard-modal'),
      btnWizardClose: document.getElementById('btn-wizard-close'),
      btnWizardSkip: document.getElementById('btn-wizard-skip'),
      wizardIpInput: document.getElementById('wizard-ip-input'),
      btnWizardScan: document.getElementById('btn-wizard-scan'),
      wizardScanBtnText: document.getElementById('wizard-scan-btn-text'),
      wizardStatusPill: document.getElementById('wizard-status-pill'),
      wizardStatusDot: document.getElementById('wizard-status-dot'),
      wizardStatusText: document.getElementById('wizard-status-text'),
      wizardTabBtns: document.querySelectorAll('.wizard-tab-btn'),
      wizardTabContents: document.querySelectorAll('.wizard-tab-content'),
      wizardDevmodePass: document.getElementById('wizard-devmode-pass'),
      btnWizardDevmodeConnect: document.getElementById('btn-wizard-devmode-connect'),
      wizardDevmodeMsg: document.getElementById('wizard-devmode-msg'),
      wizardRootIp: document.getElementById('wizard-root-ip'),
      btnWizardRootConnect: document.getElementById('btn-wizard-root-connect'),
      wizardRootMsg: document.getElementById('wizard-root-msg'),
      wizardChkStartup: document.getElementById('wizard-chk-startup'),

      btnDashRefresh: document.getElementById('btn-dash-refresh'),
      btnDashFlush: document.getElementById('btn-dash-flush'),
      btnDashScreenoffAction: document.getElementById('btn-dash-screenoff-action'),
      btnDashMuteAction: document.getElementById('btn-dash-mute-action'),
      btnDashHomeAction: document.getElementById('btn-dash-home-action'),

      btnReAudit: document.getElementById('btn-re-audit'),
      btnFixAll: document.getElementById('btn-fix-all'),
      btnSendToast: document.getElementById('btn-send-toast'),
      btnFlushRam: document.getElementById('btn-flush-ram'),
      btnReboot: document.getElementById('btn-reboot'),
      btnClearLog: document.getElementById('btn-clear-log'),
      btnRefreshApps: document.getElementById('btn-refresh-apps'),
      btnCheckUpdate: document.getElementById('btn-check-update'),
      btnReportIssue: document.getElementById('btn-report-issue'),
      toastInput: document.getElementById('toast-text'),

      // Metrics
      valModel: document.getElementById('val-model'),
      valFirmware: document.getElementById('val-firmware'),
      badgeRoot: document.getElementById('badge-root'),
      valRootPill: document.getElementById('val-root-pill'),
      valRootVer: document.getElementById('val-root-ver'),

      // CPU Telemetry & Sparkline
      valCpuPct: document.getElementById('val-cpu-pct'),
      valCpuTag: document.getElementById('val-cpu-tag'),
      cpuProgress: document.getElementById('cpu-progress'),
      valCpuSub: document.getElementById('val-cpu-sub'),
      liveIndicatorCpu: document.getElementById('live-indicator-cpu'),
      cpuSparkline: document.getElementById('cpu-sparkline'),

      // RAM Telemetry & Sparkline
      valRam: document.getElementById('val-ram'),
      ramProgress: document.getElementById('ram-progress'),
      valSwap: document.getElementById('val-swap'),
      valSwappiness: document.getElementById('val-swappiness'),
      liveIndicator: document.getElementById('live-indicator'),
      ramSparkline: document.getElementById('ram-sparkline'),

      // Health
      valScore: document.getElementById('val-score'),
      valScoreLabel: document.getElementById('val-score-label'),
      valIssuesTag: document.getElementById('val-issues-tag'),
      healthProgress: document.getElementById('health-progress'),

      // Findings & Status
      findingsList: document.getElementById('findings-list'),
      findingsSummary: document.getElementById('findings-summary'),
      footerDot: document.getElementById('footer-dot'),
      footerStatusText: document.getElementById('footer-status-text'),

      // Statusbar & Terminal Drawer
      statusConnDot: document.getElementById('status-conn-dot'),
      statusConnText: document.getElementById('status-conn-text'),
      statusLastMsg: document.getElementById('status-last-msg'),
      btnToggleTerminal: document.getElementById('btn-toggle-terminal'),
      btnCloseTerminal: document.getElementById('btn-close-terminal'),
      btnCopyLog: document.getElementById('btn-copy-log'),
      terminalDrawer: document.getElementById('terminal-drawer'),
      drawerArrow: document.getElementById('drawer-arrow'),
      logCounter: document.getElementById('log-counter'),

      // Apps Catalog & Sideload
      catalogGrid: document.getElementById('catalog-grid'),
      btnSideloadLocal: document.getElementById('btn-sideload-local'),
      appsSearchInput: document.getElementById('apps-search-input'),
      btnClearAppsSearch: document.getElementById('btn-clear-apps-search'),
      catalogFilterChips: document.getElementById('catalog-filter-chips'),
      countAll: document.getElementById('count-all'),
      countNoRoot: document.getElementById('count-noroot'),
      countRoot: document.getElementById('count-root'),
      countInstalled: document.getElementById('count-installed'),
      countUpdates: document.getElementById('count-updates'),
      installedManagerSection: document.getElementById('installed-manager-section'),
      installedStatsBadge: document.getElementById('installed-stats-badge'),
      installedAppsTbody: document.getElementById('installed-apps-tbody'),

      // Changelog Modal
      changelogModal: document.getElementById('changelog-modal'),
      changelogAppTitle: document.getElementById('changelog-app-title'),
      changelogAppMeta: document.getElementById('changelog-app-meta'),
      changelogList: document.getElementById('changelog-list'),
      changelogReleaseDate: document.getElementById('changelog-release-date'),
      changelogSourceLink: document.getElementById('changelog-source-link'),
      btnChangelogCloseTop: document.getElementById('btn-changelog-close-top'),
      btnChangelogClose: document.getElementById('btn-changelog-close'),
      btnChangelogAction: document.getElementById('btn-changelog-action'),

      // Uninstall Modal
      uninstallModal: document.getElementById('uninstall-modal'),
      uninstallAppTitle: document.getElementById('uninstall-app-title'),
      uninstallAppId: document.getElementById('uninstall-app-id'),
      uninstallAppOrigin: document.getElementById('uninstall-app-origin'),
      btnUninstallCancelTop: document.getElementById('btn-uninstall-cancel-top'),
      btnUninstallCancel: document.getElementById('btn-uninstall-cancel'),
      btnUninstallConfirm: document.getElementById('btn-uninstall-confirm'),

      // Root Card & Matrix
      rootCardTitle: document.getElementById('root-card-title'),
      rootCardSub: document.getElementById('root-card-sub'),
      rootCardDesc: document.getElementById('root-card-desc'),
      rootCardDot: document.getElementById('root-card-dot'),
      rootEvalBadge: document.getElementById('root-eval-badge'),
      btnRootExec: document.getElementById('btn-root-exec'),
      btnLaunchBrowserRoot: document.getElementById('btn-launch-browser-root'),
      btnGotoDevmodePair: document.getElementById('btn-goto-devmode-pair'),
      btnSyncMatrix: document.getElementById('btn-sync-matrix'),
      btnSyncMatrixLabel: document.getElementById('btn-sync-matrix-label'),
      matrixSearchInput: document.getElementById('matrix-search-input'),
      matrixTbody: document.getElementById('matrix-tbody'),
      btnWizardGotoRoot: document.getElementById('btn-wizard-goto-root'),

      // Root Terminal
      terminalInput: document.getElementById('terminal-input'),
      btnTerminalExec: document.getElementById('btn-terminal-exec'),
      terminalScreen: document.getElementById('terminal-screen'),
      terminalOutputBody: document.getElementById('terminal-output-body'),
      terminalPromptBadge: document.getElementById('terminal-prompt-badge'),
      terminalSessionTitle: document.getElementById('terminal-session-title'),
      terminalSessionSub: document.getElementById('terminal-session-sub'),
      terminalBannerHost: document.getElementById('terminal-banner-host'),
      btnTerminalClear: document.getElementById('btn-terminal-clear'),
      btnTerminalCopy: document.getElementById('btn-terminal-copy'),
      terminalPresets: document.querySelectorAll('.preset-chip'),

      // Console
      consoleOutput: document.getElementById('console-output'),

      // Headings
      pageTitle: document.getElementById('page-title'),
      pageSubtitle: document.getElementById('page-subtitle')
    };
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Dashboard Toolbar & Action Handlers
    if (this.el.btnDashRefresh) {
      this.el.btnDashRefresh.addEventListener('click', () => this.handleRefreshDash());
    }
    if (this.el.btnDashFlush) {
      this.el.btnDashFlush.addEventListener('click', () => this.handleFlushRam());
    }
    if (this.el.btnDashScreenoffAction) {
      this.el.btnDashScreenoffAction.addEventListener('click', () => this.handleScreenOff());
    }
    if (this.el.btnDashMuteAction) {
      this.el.btnDashMuteAction.addEventListener('click', () => this.handleToggleMute());
    }
    if (this.el.btnDashHomeAction) {
      this.el.btnDashHomeAction.addEventListener('click', () => this.handleGoHome());
    }

    // OTA Shield & Process Handlers
    if (this.el.btnToggleOta) {
      this.el.btnToggleOta.addEventListener('click', () => this.openOtaModal());
    }
    if (this.el.btnOtaCancel) {
      this.el.btnOtaCancel.addEventListener('click', () => this.closeOtaModal());
    }
    if (this.el.btnOtaCancelTop) {
      this.el.btnOtaCancelTop.addEventListener('click', () => this.closeOtaModal());
    }
    if (this.el.btnOtaConfirm) {
      this.el.btnOtaConfirm.addEventListener('click', () => this.confirmOtaToggle());
    }
    if (this.el.btnDashRefreshProcs) {
      this.el.btnDashRefreshProcs.addEventListener('click', () => this.loadProcesses());
    }
    if (this.el.btnDashKillLag) {
      this.el.btnDashKillLag.addEventListener('click', () => this.handleKillLag());
    }

    // Engineering Service Menu Handlers
    if (this.el.btnLaunchInstart) {
      this.el.btnLaunchInstart.addEventListener('click', () => this.handleLaunchServiceMenu('instart'));
    }
    if (this.el.btnLaunchEzadjust) {
      this.el.btnLaunchEzadjust.addEventListener('click', () => this.handleLaunchServiceMenu('ezadjust'));
    }
    if (this.el.btnCloseService) {
      this.el.btnCloseService.addEventListener('click', () => this.handleCloseServiceMenu());
    }

    // Backup & Restore Handlers
    if (this.el.btnCreateBackup) {
      this.el.btnCreateBackup.addEventListener('click', () => this.handleCreateBackup());
    }
    if (this.el.btnRefreshBackups) {
      this.el.btnRefreshBackups.addEventListener('click', () => this.loadBackups());
    }

    // Topbar Actions
    this.el.btnConnect.addEventListener('click', () => this.handleConnect());
    this.el.btnScan.addEventListener('click', () => this.handleScan());
    this.el.ipInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleConnect();
    });

    // TV Quick Remote Strip Actions
    if (this.el.hdrBtnScreenOff) {
      this.el.hdrBtnScreenOff.addEventListener('click', () => this.handleScreenOff());
    }
    if (this.el.hdrBtnMute) {
      this.el.hdrBtnMute.addEventListener('click', () => this.handleToggleMute());
    }
    if (this.el.hdrBtnHome) {
      this.el.hdrBtnHome.addEventListener('click', () => this.handleGoHome());
    }

    // GitHub Updates & Issue Reporter
    if (this.el.btnCheckUpdate) {
      this.el.btnCheckUpdate.addEventListener('click', () => this.handleCheckUpdate());
    }
    if (this.el.btnReportIssue) {
      this.el.btnReportIssue.addEventListener('click', () => this.handleReportIssue());
    }

    // Terminal Drawer Actions
    if (this.el.btnToggleTerminal) {
      this.el.btnToggleTerminal.addEventListener('click', () => this.toggleTerminal());
    }
    if (this.el.btnCloseTerminal) {
      this.el.btnCloseTerminal.addEventListener('click', () => this.closeTerminal());
    }
    if (this.el.btnCopyLog) {
      this.el.btnCopyLog.addEventListener('click', () => this.handleCopyLog());
    }

    // Tweaks Modal Handlers
    if (this.el.btnTweaksCancel) {
      this.el.btnTweaksCancel.addEventListener('click', () => this.closeTweaksModal());
    }
    if (this.el.btnTweaksCancelTop) {
      this.el.btnTweaksCancelTop.addEventListener('click', () => this.closeTweaksModal());
    }
    if (this.el.btnTweaksConfirm) {
      this.el.btnTweaksConfirm.addEventListener('click', () => this.confirmTweaks());
    }

    // Wizard Modal Handlers
    if (this.el.btnOpenWizard) {
      this.el.btnOpenWizard.addEventListener('click', () => this.openWizardModal());
    }
    if (this.el.btnWizardClose) {
      this.el.btnWizardClose.addEventListener('click', () => this.closeWizardModal());
    }
    if (this.el.btnWizardSkip) {
      this.el.btnWizardSkip.addEventListener('click', () => this.closeWizardModal());
    }
    if (this.el.wizardTabBtns) {
      this.el.wizardTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-wizard-tab');
          this.switchWizardTab(tab);
        });
      });
    }
    if (this.el.btnWizardScan) {
      this.el.btnWizardScan.addEventListener('click', () => this.runWizardScan());
    }
    if (this.el.btnWizardDevmodeConnect) {
      this.el.btnWizardDevmodeConnect.addEventListener('click', () => this.connectWizardDevmode());
    }
    if (this.el.btnWizardRootConnect) {
      this.el.btnWizardRootConnect.addEventListener('click', () => this.connectWizardRoot());
    }
    if (this.el.wizardChkStartup) {
      this.el.wizardChkStartup.addEventListener('change', (e) => {
        if (e.target.checked) {
          localStorage.removeItem('wizard_dismissed');
        } else {
          localStorage.setItem('wizard_dismissed', 'true');
        }
      });
    }

    if (this.el.btnWizardGotoRoot) {
      this.el.btnWizardGotoRoot.addEventListener('click', () => {
        this.closeWizardModal();
        this.switchTab('root');
      });
    }

    // Root Assistant Actions
    if (this.el.btnLaunchBrowserRoot) {
      this.el.btnLaunchBrowserRoot.addEventListener('click', () => this.handleLaunchBrowserRoot());
    }
    if (this.el.btnGotoDevmodePair) {
      this.el.btnGotoDevmodePair.addEventListener('click', () => {
        this.openWizardModal();
        this.switchWizardTab('devmode');
      });
    }
    if (this.el.btnSyncMatrix) {
      this.el.btnSyncMatrix.addEventListener('click', () => this.handleSyncMatrix());
    }
    if (this.el.matrixSearchInput) {
      this.el.matrixSearchInput.addEventListener('input', (e) => this.filterMatrixTable(e.target.value));
    }

    // Optimizer Actions
    this.el.btnReAudit.addEventListener('click', () => this.handleAudit());
    this.el.btnFixAll.addEventListener('click', () => this.openTweaksModal());

    // Apps Actions & Sideload
    if (this.el.btnRefreshApps) {
      this.el.btnRefreshApps.addEventListener('click', () => this.loadAppsCatalog(true));
    }
    if (this.el.btnSideloadLocal) {
      this.el.btnSideloadLocal.addEventListener('click', () => this.handleSideloadLocal());
    }
    if (this.el.appsSearchInput) {
      this.el.appsSearchInput.addEventListener('input', (e) => {
        this.catalogSearchQuery = e.target.value.toLowerCase().trim();
        if (this.el.btnClearAppsSearch) {
          this.el.btnClearAppsSearch.style.display = this.catalogSearchQuery ? 'block' : 'none';
        }
        this.renderCatalog();
        this.renderInstalledTable();
      });
    }
    if (this.el.btnClearAppsSearch) {
      this.el.btnClearAppsSearch.addEventListener('click', () => {
        this.el.appsSearchInput.value = '';
        this.catalogSearchQuery = '';
        this.el.btnClearAppsSearch.style.display = 'none';
        this.renderCatalog();
        this.renderInstalledTable();
      });
    }
    if (this.el.catalogFilterChips) {
      this.el.catalogFilterChips.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.el.catalogFilterChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.activeCatalogFilter = chip.dataset.filter || 'all';
          this.renderCatalog();
        });
      });
    }

    // Changelog Modal Events
    if (this.el.btnChangelogCloseTop) {
      this.el.btnChangelogCloseTop.addEventListener('click', () => this.closeChangelogModal());
    }
    if (this.el.btnChangelogClose) {
      this.el.btnChangelogClose.addEventListener('click', () => this.closeChangelogModal());
    }
    if (this.el.btnChangelogAction) {
      this.el.btnChangelogAction.addEventListener('click', () => {
        if (this.activeChangelogAppId) {
          const id = this.activeChangelogAppId;
          this.closeChangelogModal();
          this.installApp(id);
        }
      });
    }

    // Uninstall Modal Events
    if (this.el.btnUninstallCancelTop) {
      this.el.btnUninstallCancelTop.addEventListener('click', () => this.closeUninstallModal());
    }
    if (this.el.btnUninstallCancel) {
      this.el.btnUninstallCancel.addEventListener('click', () => this.closeUninstallModal());
    }
    if (this.el.btnUninstallConfirm) {
      this.el.btnUninstallConfirm.addEventListener('click', () => this.executeUninstall());
    }

    // Tools Actions
    this.el.btnSendToast.addEventListener('click', () => this.handleSendToast());
    this.el.toastInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSendToast();
    });
    this.el.btnFlushRam.addEventListener('click', () => this.handleFlushRam());
    this.el.btnReboot.addEventListener('click', () => this.handleReboot());

    // Terminal Events
    if (this.el.btnTerminalExec) {
      this.el.btnTerminalExec.addEventListener('click', () => this.handleTerminalSubmit());
    }
    if (this.el.terminalInput) {
      this.el.terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleTerminalSubmit();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateTerminalHistory(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateTerminalHistory(1);
        }
      });
    }
    if (this.el.btnTerminalClear) {
      this.el.btnTerminalClear.addEventListener('click', () => {
        if (this.el.terminalOutputBody) this.el.terminalOutputBody.innerHTML = '';
      });
    }
    if (this.el.btnTerminalCopy) {
      this.el.btnTerminalCopy.addEventListener('click', () => this.copyTerminalOutput());
    }
    if (this.el.terminalPresets) {
      this.el.terminalPresets.forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.getAttribute('data-cmd');
          if (cmd && this.el.terminalInput) {
            this.el.terminalInput.value = cmd;
            this.handleTerminalSubmit();
          }
        });
      });
    }

    // Console Clear
    this.el.btnClearLog.addEventListener('click', () => {
      this.el.consoleOutput.innerHTML = '';
      this.logCount = 0;
      if (this.el.logCounter) this.el.logCounter.innerText = '0';
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));

    const titles = {
      dashboard: ['System Dashboard', 'Real-time hardware status, storage breakdown, and quick console'],
      optimizer: ['Performance Optimizer', 'Diagnostics and persistent acceleration for LG webOS'],
      root: ['Root Assistant', 'Firmware vulnerability tier and privilege management'],
      terminal: ['SSH & Root Terminal', 'Interactive webOS root shell, system logs & live execution'],
      apps: ['Apps & Sideload', 'Smart version detection, update advisor, and package manager'],
      tools: ['Quick Tools', 'Direct TV controls, on-screen toasts, and service maintenance']
    };

    if (titles[tab]) {
      this.el.pageTitle.innerText = titles[tab][0];
      this.el.pageSubtitle.innerText = titles[tab][1];
    }

    if (tab === 'terminal') {
      setTimeout(() => {
        if (this.el.terminalInput) this.el.terminalInput.focus();
        if (this.el.terminalScreen) this.el.terminalScreen.scrollTop = this.el.terminalScreen.scrollHeight;
      }, 80);
    }

    if (tab === 'root') {
      this.loadCompatibilityMatrix();
    }

    if (this.deviceInfo && this.deviceInfo.connection_state !== 'OFFLINE') {
      if (tab === 'apps') this.loadAppsCatalog();
      if (this.deviceInfo.root_active) {
        if (tab === 'dashboard') {
          this.loadProcesses();
          this.checkOtaStatus();
        }
        if (tab === 'tools') this.loadBackups();
      }
    }
  }

  async handleRefreshDash() {
    if (!this.deviceInfo) return;
    this.log('INFO', 'Refreshing system environment & storage metrics...');
    try {
      const info = await window.pywebview.api.get_device_info();
      this.updateDeviceState(info);
      await this.loadProcesses();
      await this.checkOtaStatus();
      this.log('OK', 'Dashboard stats updated.');
    } catch (e) {
      this.log('ERROR', `Refresh error: ${e}`);
    }
  }

  // ---------------- Process Manager & Lag Killer ----------------

  async loadProcesses() {
    if (!this.deviceInfo || !this.deviceInfo.root_active) return;
    try {
      const procs = await window.pywebview.api.get_top_processes();
      this.renderProcesses(procs);
    } catch (e) {
      // silent
    }
  }

  renderProcesses(procs) {
    if (!this.el.dashProcsBody) return;
    if (!procs || procs.length === 0) {
      this.el.dashProcsBody.innerHTML = '<div class="proc-empty-line">No high-memory tasks detected.</div>';
      return;
    }
    this.el.dashProcsBody.innerHTML = '';
    procs.forEach(p => {
      const row = document.createElement('div');
      row.className = 'proc-row';
      const actionHtml = p.protected
        ? `<span class="proc-badge-protected" title="Core webOS system daemon. Protected to prevent UI crash.">Protected</span>`
        : `<button class="btn btn-secondary btn-xs" onclick="app.handleKillProcess(${p.pid}, '${p.comm}', ${p.protected ? 'true' : 'false'})">Kill</button>`;
      row.innerHTML = `
        <span class="proc-col-pid">${p.pid}</span>
        <span class="proc-col-name" title="${p.comm}">${p.comm}</span>
        <span class="proc-col-cpu">${p.cpu}%</span>
        <span class="proc-col-mem">${p.mem}%</span>
        <span class="proc-col-act">${actionHtml}</span>
      `;
      this.el.dashProcsBody.appendChild(row);
    });
  }

  async handleKillProcess(pid, comm, isProtected = false) {
    if (isProtected) {
      this.log('WARN', `Cannot terminate protected system process '${comm}' (prevents UI crash).`);
      return;
    }
    this.log('WARN', `Terminating process ${comm} (PID: ${pid})...`);
    try {
      const res = await window.pywebview.api.kill_process(pid);
      if (res && res.success) {
        this.log('OK', `Process ${comm} [PID ${pid}] terminated.`);
        await this.loadProcesses();
        const mem = await window.pywebview.api.poll_memory();
        if (mem && mem.active) {
          this.el.valRam.innerText = `${mem.available} MB Free / ${mem.total} MB`;
          this.el.ramProgress.style.width = `${mem.pct}%`;
        }
      } else {
        this.log('WARN', (res && res.error) || `Could not terminate PID ${pid}.`);
      }
    } catch (e) {
      this.log('ERROR', `Kill error: ${e}`);
    }
  }

  async handleKillLag() {
    this.log('INFO', 'Flushing background lag and purging dormant web apps...');
    if (this.el.btnDashKillLag) this.el.btnDashKillLag.disabled = true;
    try {
      const res = await window.pywebview.api.kill_lag_apps();
      if (res && res.success) {
        this.log('OK', 'Background lag purged. Foreground apps closed and pagecache dropped.');
        await this.loadProcesses();
        const mem = await window.pywebview.api.poll_memory();
        if (mem && mem.active) {
          this.el.valRam.innerText = `${mem.available} MB Free / ${mem.total} MB`;
          this.el.ramProgress.style.width = `${mem.pct}%`;
        }
      }
    } catch (e) {
      this.log('ERROR', `Lag flush error: ${e}`);
    } finally {
      if (this.el.btnDashKillLag) this.el.btnDashKillLag.disabled = false;
    }
  }

  // ---------------- OTA Shield (Firmware Update Blocker) ----------------

  async checkOtaStatus() {
    if (!this.deviceInfo || !this.deviceInfo.root_active) return;
    try {
      this.otaActive = await window.pywebview.api.get_ota_status();
      if (this.el.dashValOta) {
        if (this.otaActive) {
          this.el.dashValOta.className = 'status-badge online';
          this.el.dashValOta.innerText = 'Active (Protected)';
        } else {
          this.el.dashValOta.className = 'status-badge unrooted';
          this.el.dashValOta.innerText = 'Disabled (Unsafe)';
        }
      }
    } catch (e) {
      // silent
    }
  }

  openOtaModal() {
    if (!this.deviceInfo || !this.deviceInfo.root_active) {
      this.log('ERROR', 'Connect to TV before configuring OTA Shield.');
      return;
    }
    const targetAction = this.otaActive ? 'DISABLE' : 'ENABLE';
    if (this.el.otaModalQuestion) {
      this.el.otaModalQuestion.innerHTML = `Do you understand the risks and want to <strong>${targetAction}</strong> the LG Firmware OTA Shield?`;
    }
    this.el.otaModal.style.display = 'flex';
    
    // 5-second Countdown setup
    let count = 5;
    this.el.btnOtaConfirm.disabled = true;
    this.el.btnOtaConfirm.className = 'btn btn-countdown-danger';
    this.el.otaConfirmText.innerText = `Please wait (${count}s)...`;

    if (this.otaCountdownTimer) clearInterval(this.otaCountdownTimer);
    this.otaCountdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.el.otaConfirmText.innerText = `Please wait (${count}s)...`;
      } else {
        clearInterval(this.otaCountdownTimer);
        this.otaCountdownTimer = null;
        this.el.btnOtaConfirm.disabled = false;
        this.el.btnOtaConfirm.className = 'btn btn-countdown-success';
        this.el.otaConfirmText.innerText = `I understand risks, ${this.otaActive ? 'disable' : 'apply'} shield`;
      }
    }, 1000);
  }

  closeOtaModal() {
    if (this.otaCountdownTimer) {
      clearInterval(this.otaCountdownTimer);
      this.otaCountdownTimer = null;
    }
    if (this.el.otaModal) {
      this.el.otaModal.style.display = 'none';
    }
  }

  async confirmOtaToggle() {
    const newTarget = !this.otaActive;
    this.closeOtaModal();
    this.log('WARN', `${newTarget ? 'Enabling' : 'Disabling'} LG Firmware OTA Shield...`);
    try {
      const ok = await window.pywebview.api.set_ota_shield(newTarget);
      await this.checkOtaStatus();
      if (ok) {
        this.log('OK', `LG Firmware OTA Shield is now ${newTarget ? 'ACTIVE (Protected)' : 'DISABLED'}.`);
      } else {
        this.log('ERROR', 'Failed to update OTA Shield configuration in /etc/hosts.');
      }
    } catch (e) {
      this.log('ERROR', `OTA Shield error: ${e}`);
    }
  }

  // ---------------- Optimization Tweaks Confirmation Modal ----------------

  openTweaksModal() {
    if (this.tweaksCountdownTimer) {
      clearInterval(this.tweaksCountdownTimer);
      this.tweaksCountdownTimer = null;
    }
    if (!this.el.tweaksModal) return;

    this.el.tweaksModal.style.display = 'flex';
    this.el.btnTweaksConfirm.disabled = true;
    this.el.btnTweaksConfirm.className = 'btn btn-countdown-danger';

    let count = 5;
    this.el.tweaksConfirmText.innerText = `Please wait (${count}s)...`;

    this.tweaksCountdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.el.tweaksConfirmText.innerText = `Please wait (${count}s)...`;
      } else {
        clearInterval(this.tweaksCountdownTimer);
        this.tweaksCountdownTimer = null;
        this.el.btnTweaksConfirm.disabled = false;
        this.el.btnTweaksConfirm.className = 'btn btn-countdown-success';
        this.el.tweaksConfirmText.innerText = 'I understand changes, apply tweaks';
      }
    }, 1000);
  }

  closeTweaksModal() {
    if (this.tweaksCountdownTimer) {
      clearInterval(this.tweaksCountdownTimer);
      this.tweaksCountdownTimer = null;
    }
    if (this.el.tweaksModal) {
      this.el.tweaksModal.style.display = 'none';
    }
  }

  async confirmTweaks() {
    this.closeTweaksModal();
    await this.handleFixAll();
  }

  // ---------------- First-Run Setup & Connection Wizard ----------------

  openWizardModal() {
    if (!this.el.wizardModal) return;
    if (this.deviceInfo && this.deviceInfo.root_active) {
      this.log('INFO', 'TV is already rooted and connected. Setup Wizard bypassed.');
      return;
    }
    this.el.wizardModal.style.display = 'flex';
    const curIp = this.el.ipInput ? this.el.ipInput.value.trim() : '';
    if (this.el.wizardIpInput) this.el.wizardIpInput.value = curIp;
    if (this.el.wizardRootIp) this.el.wizardRootIp.value = curIp;

    const dismissed = localStorage.getItem('wizard_dismissed') === 'true';
    if (this.el.wizardChkStartup) {
      this.el.wizardChkStartup.checked = !dismissed;
    }

    if (this.currentDevice && this.currentDevice.connection_state === 'ONLINE_ROOTED') {
      this.updateWizardStatus('online', `Connected: Root Shell on ${this.currentDevice.ip || curIp}`);
    } else if (this.currentDevice && this.currentDevice.connection_state === 'ONLINE_DEVMODE') {
      this.updateWizardStatus('online', `Connected: Developer Mode on ${this.currentDevice.ip || curIp}`);
    }
  }

  closeWizardModal() {
    if (this.el.wizardModal) {
      this.el.wizardModal.style.display = 'none';
    }
  }

  switchWizardTab(tab) {
    if (this.el.wizardTabBtns) {
      this.el.wizardTabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-wizard-tab') === tab);
      });
    }
    if (this.el.wizardTabContents) {
      this.el.wizardTabContents.forEach(pane => {
        pane.classList.toggle('active', pane.id === `wizard-tab-${tab}`);
      });
    }
  }

  updateWizardStatus(type, msg) {
    if (!this.el.wizardStatusPill || !this.el.wizardStatusDot || !this.el.wizardStatusText) return;
    this.el.wizardStatusDot.className = `status-dot ${type}`;
    this.el.wizardStatusText.innerText = msg;
  }

  async runWizardScan() {
    if (!this.el.btnWizardScan) return;
    this.el.btnWizardScan.disabled = true;
    if (this.el.wizardScanBtnText) this.el.wizardScanBtnText.innerText = 'Scanning...';
    this.updateWizardStatus('amber', 'Probing subnet for webOS ports (23, 9922, 3000)...');

    try {
      const res = await window.pywebview.api.scan_wizard();
      if (res && res.found) {
        const foundIp = res.ip;
        if (this.el.wizardIpInput) this.el.wizardIpInput.value = foundIp;
        if (this.el.wizardRootIp) this.el.wizardRootIp.value = foundIp;
        if (this.el.ipInput) this.el.ipInput.value = foundIp;

        if (res.state === 'ONLINE_ROOTED') {
          this.updateWizardStatus('online', `Found LG TV at ${foundIp} (Port 23 Root open). Connecting...`);
          this.log('OK', `Wizard discovered rooted TV at ${foundIp}. Connecting to TV...`);
          setTimeout(() => {
            this.closeWizardModal();
            this.handleConnect();
          }, 1000);
        } else if (res.state === 'ONLINE_DEVMODE') {
          this.updateWizardStatus('online', `Found Developer Mode on ${foundIp} (Port 9922). Enter Passphrase.`);
          this.switchWizardTab('devmode');
        } else if (res.state === 'ONLINE_UNROOTED') {
          this.updateWizardStatus('amber', `Found unrooted webOS TV at ${foundIp} (Port 3000 open)`);
          this.switchWizardTab('devmode');
        }
        this.log('OK', `Wizard discovered TV at ${foundIp} (State: ${res.state})`);
      } else {
        this.updateWizardStatus('gray', 'No TV automatically detected. Enter IP manually.');
        this.log('WARN', 'Wizard subnet scan did not detect open webOS ports.');
      }
    } catch (e) {
      this.updateWizardStatus('offline', `Scan error: ${e}`);
      this.log('ERROR', `Wizard scan error: ${e}`);
    } finally {
      this.el.btnWizardScan.disabled = false;
      if (this.el.wizardScanBtnText) this.el.wizardScanBtnText.innerText = 'Scan Network';
    }
  }

  async connectWizardDevmode() {
    const ip = (this.el.wizardIpInput ? this.el.wizardIpInput.value.trim() : '');
    const pass = this.el.wizardDevmodePass ? this.el.wizardDevmodePass.value.trim().toUpperCase() : '';

    if (!pass) {
      if (this.el.wizardDevmodeMsg) {
        this.el.wizardDevmodeMsg.className = 'wizard-feedback error';
        this.el.wizardDevmodeMsg.innerText = 'Please enter the 6-character Passphrase from your TV screen.';
      }
      return;
    }

    if (this.el.btnWizardDevmodeConnect) {
      this.el.btnWizardDevmodeConnect.disabled = true;
      this.el.btnWizardDevmodeConnect.innerText = 'Pairing...';
    }

    this.log('INFO', `Pairing with Developer Mode on ${ip}:9922...`);
    try {
      const res = await window.pywebview.api.connect_devmode(ip, pass);
      if (res && res.success) {
        if (this.el.wizardDevmodeMsg) {
          this.el.wizardDevmodeMsg.className = 'wizard-feedback ok';
          this.el.wizardDevmodeMsg.innerText = 'Paired successfully! Private SSH key acquired.';
        }
        this.log('OK', `Developer Mode paired with ${ip}! Key saved.`);
        if (this.el.ipInput) this.el.ipInput.value = ip;
        this.updateDeviceState(res.info);
        setTimeout(() => this.closeWizardModal(), 1200);
      } else {
        if (this.el.wizardDevmodeMsg) {
          this.el.wizardDevmodeMsg.className = 'wizard-feedback error';
          this.el.wizardDevmodeMsg.innerText = res.error || 'Pairing failed. Check passphrase and port 9922.';
        }
        this.log('ERROR', `DevMode pairing failed: ${res.error}`);
      }
    } catch (e) {
      if (this.el.wizardDevmodeMsg) {
        this.el.wizardDevmodeMsg.className = 'wizard-feedback error';
        this.el.wizardDevmodeMsg.innerText = `Pairing error: ${e}`;
      }
      this.log('ERROR', `DevMode pairing error: ${e}`);
    } finally {
      if (this.el.btnWizardDevmodeConnect) {
        this.el.btnWizardDevmodeConnect.disabled = false;
        this.el.btnWizardDevmodeConnect.innerText = 'Pair & Connect DevMode';
      }
    }
  }

  async connectWizardRoot() {
    const ip = (this.el.wizardRootIp ? this.el.wizardRootIp.value.trim() : '');
    if (this.el.btnWizardRootConnect) {
      this.el.btnWizardRootConnect.disabled = true;
      this.el.btnWizardRootConnect.innerText = 'Connecting...';
    }
    try {
      if (this.el.ipInput) this.el.ipInput.value = ip;
      await this.handleConnect();
      if ((this.currentDevice && this.currentDevice.connection_state === 'ONLINE_ROOTED') || (this.deviceInfo && this.deviceInfo.root_active)) {
        if (this.el.wizardRootMsg) {
          this.el.wizardRootMsg.className = 'wizard-feedback ok';
          this.el.wizardRootMsg.innerText = 'Connected with root privileges!';
        }
        setTimeout(() => this.closeWizardModal(), 900);
      } else {
        if (this.el.wizardRootMsg) {
          this.el.wizardRootMsg.className = 'wizard-feedback error';
          this.el.wizardRootMsg.innerText = 'Failed to connect via root shell (Port 23 closed). If unrooted, use Mode B or follow the guide.';
        }
      }
    } catch (e) {
      if (this.el.wizardRootMsg) {
        this.el.wizardRootMsg.className = 'wizard-feedback error';
        this.el.wizardRootMsg.innerText = `Connect error: ${e}`;
      }
    } finally {
      if (this.el.btnWizardRootConnect) {
        this.el.btnWizardRootConnect.disabled = false;
        this.el.btnWizardRootConnect.innerText = 'Connect Root Shell (Port 23)';
      }
    }
  }

  // ---------------- Root Assistant & Compatibility Matrix ----------------

  async loadCompatibilityMatrix() {
    try {
      const res = await window.pywebview.api.get_compatibility_catalog();
      if (res && res.models) {
        this.matrixModels = res.models;
        this.renderMatrixTable(res.models);
      }
    } catch (e) {
      // silent
    }
  }

  renderMatrixTable(models) {
    if (!this.el.matrixTbody) return;
    this.el.matrixTbody.innerHTML = '';
    if (!models || models.length === 0) {
      this.el.matrixTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 12px; color: var(--text-muted);">No matching TV models found in matrix.</td></tr>';
      return;
    }
    models.forEach(m => {
      const tr = document.createElement('tr');
      const badgeClass = m.status === 'TESTED' ? 'badge-tested' : (m.status === 'COMMUNITY' ? 'badge-community' : 'badge-patched');
      const badgeLabel = m.status === 'TESTED' ? 'TESTED ✅' : (m.status === 'COMMUNITY' ? 'COMMUNITY ⚠️' : 'PATCHED ❌');
      tr.innerHTML = `
        <td><strong>${this.escapeHtml(m.series)}</strong></td>
        <td><code>${this.escapeHtml(m.webos)}</code></td>
        <td>${this.escapeHtml(m.soc)}</td>
        <td>${this.escapeHtml(m.method)}</td>
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
      `;
      this.el.matrixTbody.appendChild(tr);
    });
  }

  filterMatrixTable(query) {
    const q = (query || '').toLowerCase().trim();
    if (!this.matrixModels) return;
    if (!q) {
      this.renderMatrixTable(this.matrixModels);
      return;
    }
    const filtered = this.matrixModels.filter(m =>
      m.series.toLowerCase().includes(q) ||
      m.webos.toLowerCase().includes(q) ||
      m.soc.toLowerCase().includes(q) ||
      m.method.toLowerCase().includes(q) ||
      m.status.toLowerCase().includes(q)
    );
    this.renderMatrixTable(filtered);
  }

  async handleLaunchBrowserRoot() {
    this.log('INFO', 'Launching built-in web browser on TV to https://rootmy.tv...');
    try {
      const ok = await window.pywebview.api.launch_browser_url('https://rootmy.tv');
      if (ok) {
        this.log('OK', 'TV Web Browser launched to https://rootmy.tv! Follow on-screen Magic Remote slider.');
      } else {
        this.log('ERROR', 'Could not open TV browser. Connect to TV or open browser manually on TV.');
      }
    } catch (e) {
      this.log('ERROR', `Launch error: ${e}`);
    }
  }

  async handleSyncMatrix() {
    if (this.el.btnSyncMatrix) this.el.btnSyncMatrix.disabled = true;
    if (this.el.btnSyncMatrixLabel) this.el.btnSyncMatrixLabel.innerText = 'Syncing...';
    this.log('INFO', 'Syncing hardware compatibility matrix with backend API...');
    try {
      const res = await window.pywebview.api.sync_compatibility_catalog();
      if (res && res.success) {
        this.log('OK', res.message || 'Database successfully updated from backend.');
        await this.loadCompatibilityMatrix();
      } else {
        this.log('INFO', res.error || 'Using verified offline matrix.');
        await this.loadCompatibilityMatrix();
      }
    } catch (e) {
      this.log('WARN', `Sync notice: ${e}`);
    } finally {
      if (this.el.btnSyncMatrix) this.el.btnSyncMatrix.disabled = false;
      if (this.el.btnSyncMatrixLabel) this.el.btnSyncMatrixLabel.innerText = 'Sync Matrix';
    }
  }

  // ---------------- LG Engineering & Service Menu ----------------

  async handleLaunchServiceMenu(mode) {
    const title = mode === 'instart' ? 'In-Start' : 'Ez-Adjust';
    this.log('WARN', `Triggering LG Service Menu (${title}) on TV screen. Factory PIN: 0413 (or 0000)...`);
    try {
      const ok = await window.pywebview.api.launch_service_menu(mode);
      if (ok) {
        this.log('OK', `Service window '${title}' launched on TV.`);
      } else {
        this.log('ERROR', `Failed to open ${title}. App com.webos.app.factorywin did not respond.`);
      }
    } catch (e) {
      this.log('ERROR', `Service menu error: ${e}`);
    }
  }

  async handleCloseServiceMenu() {
    this.log('INFO', 'Closing LG Service Menu window...');
    try {
      await window.pywebview.api.close_service_menu();
      this.log('OK', 'Service window dismissed.');
    } catch (e) {
      this.log('ERROR', `Close error: ${e}`);
    }
  }

  // ---------------- Configuration Backup & Restore ----------------

  async handleCreateBackup() {
    if (this.el.btnCreateBackup) {
      this.el.btnCreateBackup.disabled = true;
      this.el.btnCreateBackup.innerText = 'Creating Archive...';
    }
    this.log('INFO', 'Archiving /var/lib/webosbrew/ and system hosts...');
    try {
      const res = await window.pywebview.api.create_backup();
      if (res && res.success) {
        this.log('OK', `Full backup saved: ${res.filename} (${res.size_kb} KB)`);
        await this.loadBackups();
      } else {
        this.log('ERROR', `Backup failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Backup error: ${e}`);
    } finally {
      if (this.el.btnCreateBackup) {
        this.el.btnCreateBackup.disabled = false;
        this.el.btnCreateBackup.innerText = 'Create Full Backup (.tar.gz)';
      }
    }
  }

  async loadBackups() {
    try {
      const list = await window.pywebview.api.list_backups();
      this.renderBackups(list);
    } catch (e) {
      // silent
    }
  }

  renderBackups(list) {
    if (!this.el.backupListBox) return;
    if (!list || list.length === 0) {
      this.el.backupListBox.innerHTML = '<div class="backup-empty">No local backups stored yet. Click \'Create Full Backup\' above.</div>';
      return;
    }
    this.el.backupListBox.innerHTML = '';
    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'backup-item';
      row.innerHTML = `
        <div class="backup-info-left">
          <span class="backup-name">${item.filename}</span>
          <span class="backup-meta">${item.date} • ${item.size_kb} KB</span>
        </div>
        <button class="btn btn-secondary btn-xs" onclick="app.handleRestoreBackup('${item.filename}')">Restore</button>
      `;
      this.el.backupListBox.appendChild(row);
    });
  }

  async handleRestoreBackup(filename) {
    if (!confirm(`Restore TV configuration from archive '${filename}' now? Existing /var/lib/webosbrew/ will be overwritten.`)) {
      return;
    }
    this.log('WARN', `Restoring backup '${filename}' to TV...`);
    try {
      const res = await window.pywebview.api.restore_backup(filename);
      if (res && res.success) {
        this.log('OK', `Configuration restored successfully from ${filename}!`);
        await this.handleAudit();
      } else {
        this.log('ERROR', `Restore failed: ${res.error || 'Extraction error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Restore error: ${e}`);
    }
  }

  // ---------------- Async API Methods ----------------

  async handleConnect() {
    if (this.isConnecting) return;
    const ip = this.el.ipInput.value.trim();
    if (!ip) {
      this.log('ERROR', 'Please enter a valid TV IP address.');
      return;
    }

    this.isConnecting = true;
    this.stopTelemetry();
    this.el.btnConnect.disabled = true;
    this.el.btnConnectLabel.innerText = 'Connecting...';
    this.log('INFO', `Connecting to ${ip}...`);

    try {
      const info = await window.pywebview.api.connect(ip);
      this.updateDeviceState(info);
      if (info && info.connection_state && info.connection_state !== 'OFFLINE') {
        localStorage.setItem('tv_ip', ip);
      }
    } catch (e) {
      this.log('ERROR', `Connection failed: ${e}`);
    } finally {
      this.isConnecting = false;
      this.el.btnConnect.disabled = false;
      this.el.btnConnectLabel.innerText = 'Connect';
    }
  }

  async handleScan() {
    if (this.isConnecting) return;
    this.stopTelemetry();
    this.el.btnScan.disabled = true;
    this.el.btnScanLabel.innerText = 'Scanning...';
    this.log('INFO', 'Scanning local subnet with router protection (12 workers)...');

    try {
      const res = await window.pywebview.api.scan_lan();
      if (res && res.found && res.ip) {
        this.el.ipInput.value = res.ip;
        this.log('OK', `Discovered LG webOS TV at ${res.ip}! Connecting...`);
        await this.handleConnect();
      } else {
        this.log('WARN', 'No LG webOS devices discovered on local network.');
      }
    } catch (e) {
      this.log('ERROR', `Scan error: ${e}`);
    } finally {
      this.el.btnScan.disabled = false;
      this.el.btnScanLabel.innerText = 'Scan LAN';
    }
  }

  async handleAudit() {
    this.el.btnReAudit.disabled = true;
    this.el.btnReAudit.innerText = 'Auditing...';
    this.log('INFO', 'Auditing system configuration...');

    try {
      const diag = await window.pywebview.api.run_audit();
      this.updateAuditState(diag);
    } catch (e) {
      this.log('ERROR', `Audit error: ${e}`);
    } finally {
      this.el.btnReAudit.disabled = false;
      this.el.btnReAudit.innerText = 'Run Audit';
    }
  }

  async handleFixAll() {
    this.el.btnFixAll.disabled = true;
    this.el.btnFixAll.innerText = 'Applying...';
    this.log('INFO', 'Applying full optimization stack to webOS...');

    try {
      const res = await window.pywebview.api.fix_all();
      if (res && res.success) {
        this.updateDeviceState(res.info);
        this.updateAuditState(res.diag);
        this.log('OK', 'All optimizations applied and registered in /var/lib/webosbrew/init.d/05-performance!');
      } else {
        this.log('ERROR', `Optimization failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Optimization error: ${e}`);
    } finally {
      this.el.btnFixAll.disabled = false;
      if (this.el.btnFixAll.innerText === 'Applying...') {
        this.el.btnFixAll.innerText = 'Re-Apply Tweaks';
      }
    }
  }

  // ---------------- Real-time Memory & CPU Telemetry ----------------

  startTelemetry() {
    this.stopTelemetry();
    if (this.el.liveIndicator) this.el.liveIndicator.classList.add('active');
    if (this.el.liveIndicatorCpu) this.el.liveIndicatorCpu.classList.add('active');

    this.telemetryTimer = setInterval(async () => {
      if (!this.deviceInfo || !this.deviceInfo.root_active) {
        this.stopTelemetry();
        return;
      }
      if (this.isPolling) return;

      this.isPolling = true;
      try {
        const mem = await window.pywebview.api.poll_memory();
        if (mem && mem.active) {
          // Update RAM
          this.el.valRam.innerText = `${mem.available} MB Free / ${mem.total} MB`;
          this.el.ramProgress.style.width = `${mem.pct}%`;
          this.el.valSwap.innerText = `Flash Swap: ${mem.swap_used} MB used`;
          this.el.valSwappiness.innerText = `swap: ${mem.swappiness}`;

          // RAM Sparkline
          this.ramHistory.push(mem.pct);
          if (this.ramHistory.length > 8) this.ramHistory.shift();
          this.renderSparkline(this.el.ramSparkline, this.ramHistory, 100);

          // Update CPU
          const cpuVal = typeof mem.cpu_pct === 'number' ? mem.cpu_pct : 0;
          this.el.valCpuPct.innerText = `${cpuVal}% Load`;
          this.el.cpuProgress.style.width = `${Math.min(100, Math.max(0, cpuVal))}%`;

          // CPU Sparkline
          this.cpuHistory.push(cpuVal);
          if (this.cpuHistory.length > 8) this.cpuHistory.shift();
          this.renderSparkline(this.el.cpuSparkline, this.cpuHistory, 100);

          // Dynamic CPU alert styling
          if (cpuVal > 85) {
            this.el.cpuProgress.style.backgroundColor = 'var(--accent-red)';
          } else if (cpuVal > 60) {
            this.el.cpuProgress.style.backgroundColor = 'var(--accent-amber)';
          } else {
            this.el.cpuProgress.style.backgroundColor = 'var(--accent-green)';
          }

          const loadStr = mem.load_avg ? `LoadAvg: ${mem.load_avg}` : 'Quad-Core Active';
          this.el.valCpuSub.innerText = `ARM Cortex-A53 • ${loadStr}`;
        }
      } catch (e) {
        // Silent error to prevent console spam
      } finally {
        this.isPolling = false;
      }
    }, 2500); // polls every 2.5 seconds
  }

  stopTelemetry() {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    if (this.el.liveIndicator) {
      this.el.liveIndicator.classList.remove('active');
    }
    if (this.el.liveIndicatorCpu) {
      this.el.liveIndicatorCpu.classList.remove('active');
    }
  }

  // ---------------- Apps Catalog & Package Manager ----------------

  async loadAppsCatalog(forceOnline = false) {
    if (!this.deviceInfo || this.deviceInfo.connection_state === 'OFFLINE') return;

    if (this.el.btnRefreshApps) {
      this.el.btnRefreshApps.disabled = true;
      this.el.btnRefreshApps.innerText = forceOnline ? 'Syncing...' : 'Inspecting...';
    }

    try {
      if (forceOnline) {
        this.log('INFO', 'Syncing catalog with official webosbrew repository & community indexes...');
      }
      const res = await window.pywebview.api.get_apps_catalog(forceOnline);
      if (res && res.connected) {
        this.catalogItems = res.catalog || [];
        this.installedApps = res.installed_apps || [];

        // Update counts
        const total = this.catalogItems.length;
        const norootCount = this.catalogItems.filter(i => !i.root_required).length;
        const rootCount = this.catalogItems.filter(i => i.root_required).length;
        const installedCount = this.catalogItems.filter(i => i.installed).length;
        const updatesCount = this.catalogItems.filter(i => i.update_available).length;

        if (this.el.countAll) this.el.countAll.innerText = total;
        if (this.el.countNoRoot) this.el.countNoRoot.innerText = norootCount;
        if (this.el.countRoot) this.el.countRoot.innerText = rootCount;
        if (this.el.countInstalled) this.el.countInstalled.innerText = installedCount;
        if (this.el.countUpdates) this.el.countUpdates.innerText = updatesCount;

        this.renderCatalog();
        this.renderInstalledTable();

        if (forceOnline) {
          this.log('OK', `Catalog synchronized. ${total} apps cataloged, ${updatesCount} updates available.`);
        }
      }
    } catch (e) {
      this.log('ERROR', `Catalog query failed: ${e}`);
    } finally {
      if (this.el.btnRefreshApps) {
        this.el.btnRefreshApps.disabled = false;
        this.el.btnRefreshApps.innerText = 'Check Updates & Sync';
      }
    }
  }

  renderCatalog() {
    if (!this.el.catalogGrid) return;
    this.el.catalogGrid.innerHTML = '';

    // Apply active filter and search query
    let filtered = this.catalogItems;

    if (this.activeCatalogFilter === 'noroot') {
      filtered = filtered.filter(i => !i.root_required);
    } else if (this.activeCatalogFilter === 'root') {
      filtered = filtered.filter(i => i.root_required);
    } else if (this.activeCatalogFilter === 'installed') {
      filtered = filtered.filter(i => i.installed);
    } else if (this.activeCatalogFilter === 'updates') {
      filtered = filtered.filter(i => i.update_available);
    }

    if (this.catalogSearchQuery) {
      const q = this.catalogSearchQuery;
      filtered = filtered.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.desc && i.desc.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      this.el.catalogGrid.innerHTML = `
        <div class="placeholder-card" style="grid-column: 1 / -1; padding: 32px 16px; text-align: center;">
          <div class="placeholder-title">No Matching Applications Found</div>
          <div class="placeholder-desc">Try clearing your search query or switching the category filter.</div>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'app-card';

      const rootBadge = item.root_required
        ? `<span class="app-root-badge root">🔴 Root Required</span>`
        : `<span class="app-root-badge noroot">🟢 No Root</span>`;

      // Icon fallback SVG
      const iconHtml = item.icon_url
        ? `<img src="${item.icon_url}" onerror="this.onerror=null;this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><path d=\\'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\\'/></svg>';" />`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

      let badgeHtml = '';
      let actionButtonsHtml = '';

      if (item.installed) {
        if (item.update_available) {
          badgeHtml = `<span class="app-version-pill warning">${item.status_badge}</span>`;
          actionButtonsHtml = `
            <button class="btn btn-accent btn-sm" onclick="app.installApp('${item.id}')">Update App</button>
            <button class="btn btn-secondary btn-sm" onclick="app.launchApp('${item.id}')">Launch</button>
            <button class="btn-uninstall-icon" title="Uninstall from TV" onclick="app.confirmUninstall('${item.id}', '${item.title}', '${item.origin}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          `;
        } else {
          badgeHtml = `<span class="app-version-pill online">${item.status_badge}</span>`;
          actionButtonsHtml = `
            <button class="btn btn-primary btn-sm" onclick="app.launchApp('${item.id}')">Launch on TV</button>
            <button class="btn btn-secondary btn-sm" onclick="app.installApp('${item.id}')">Reinstall</button>
            <button class="btn-uninstall-icon" title="Uninstall from TV" onclick="app.confirmUninstall('${item.id}', '${item.title}', '${item.origin}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          `;
        }
      } else {
        badgeHtml = `<span class="app-version-pill offline">${item.status_badge}</span>`;
        actionButtonsHtml = `
          <button class="btn btn-primary btn-sm" onclick="app.installApp('${item.id}')">Install App</button>
        `;
      }

      card.innerHTML = `
        <div class="app-card-top-row">
          <div class="app-card-icon">${iconHtml}</div>
          <div class="app-card-info">
            <div class="app-name-row">
              <span class="app-name">${item.title}</span>
              ${rootBadge}
            </div>
            <div class="app-category">${item.category}</div>
            <div class="app-status-badge-wrap">${badgeHtml}</div>
          </div>
        </div>
        <p class="app-desc">${item.desc}</p>
        <div class="app-meta-row">
          <span class="app-latest-text">Latest: v${item.latest}</span>
          <button class="btn-changelog-link" onclick="app.openChangelogModal('${item.id}')">
            <span>Improvements</span> ↗
          </button>
        </div>
        <div class="app-card-footer">
          ${actionButtonsHtml}
        </div>
      `;

      this.el.catalogGrid.appendChild(card);
    });
  }

  renderInstalledTable() {
    if (!this.el.installedAppsTbody) return;
    this.el.installedAppsTbody.innerHTML = '';

    let apps = this.installedApps;
    if (this.catalogSearchQuery) {
      const q = this.catalogSearchQuery;
      apps = apps.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.vendor.toLowerCase().includes(q)
      );
    }

    if (this.el.installedStatsBadge) {
      this.el.installedStatsBadge.innerText = `${apps.length} Packages Installed`;
    }

    if (apps.length === 0) {
      this.el.installedAppsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty-cell">No installed applications found matching criteria.</td>
        </tr>
      `;
      return;
    }

    apps.forEach(app => {
      const tr = document.createElement('tr');

      const isSideload = app.origin.includes('Sideloaded') || app.origin.includes('Homebrew');
      const originClass = isSideload ? 'sideload' : (app.origin.includes('Store') ? 'store' : 'system');
      const originBadge = `<span class="origin-badge ${originClass}">${app.origin}</span>`;

      const typeStr = isSideload ? 'User Homebrew' : 'LG Content Store';

      tr.innerHTML = `
        <td>
          <span class="table-app-title">${app.title}</span>
          <span class="table-app-vendor">${app.vendor}</span>
        </td>
        <td><code class="table-app-id">${app.id}</code></td>
        <td><span style="font-family: var(--font-mono); font-size: 11px;">v${app.version}</span></td>
        <td>${originBadge}</td>
        <td><span style="font-size: 11px; color: var(--text-secondary);">${typeStr}</span></td>
        <td class="table-actions-cell">
          <button class="btn btn-secondary btn-sm" onclick="app.launchApp('${app.id}')">Launch</button>
          <button class="btn btn-danger btn-sm" onclick="app.confirmUninstall('${app.id}', '${app.title}', '${app.origin}')">Uninstall</button>
        </td>
      `;

      this.el.installedAppsTbody.appendChild(tr);
    });
  }

  async installApp(appId) {
    const item = this.catalogItems.find(i => i.id === appId);
    const title = item ? item.title : appId;

    if (item && item.root_required && (!this.deviceInfo || !this.deviceInfo.root_active)) {
      this.log('WARN', `Installation warning: ${title} requires Root privileges. Elevate TV first in Root Assistant.`);
    }

    this.log('INFO', `Starting installation of ${title} (${appId})...`);
    try {
      const res = await window.pywebview.api.install_catalog_app(appId);
      if (res && res.success) {
        this.log('OK', res.message || `${title} installed successfully!`);
        await this.loadAppsCatalog(false);
      } else {
        this.log('ERROR', `Installation failed: ${res ? res.error : 'Unknown error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Install error: ${e}`);
    }
  }

  confirmUninstall(appId, appTitle, origin) {
    this.pendingUninstallAppId = appId;
    this.pendingUninstallAppTitle = appTitle || appId;
    this.pendingUninstallOrigin = origin || 'Application';

    if (this.el.uninstallAppTitle) this.el.uninstallAppTitle.innerText = this.pendingUninstallAppTitle;
    if (this.el.uninstallAppId) this.el.uninstallAppId.innerText = appId;
    if (this.el.uninstallAppOrigin) this.el.uninstallAppOrigin.innerText = this.pendingUninstallOrigin;

    if (this.el.uninstallModal) {
      this.el.uninstallModal.style.display = 'flex';
    }
  }

  closeUninstallModal() {
    this.pendingUninstallAppId = null;
    if (this.el.uninstallModal) {
      this.el.uninstallModal.style.display = 'none';
    }
  }

  async executeUninstall() {
    const appId = this.pendingUninstallAppId;
    const title = this.pendingUninstallAppTitle;
    this.closeUninstallModal();

    if (!appId) return;

    this.log('WARN', `Initiating 1-click uninstallation of ${title} (${appId}) from TV...`);
    try {
      const res = await window.pywebview.api.uninstall_app(appId);
      if (res && res.success) {
        this.log('OK', res.message || `${title} uninstalled successfully.`);
        await this.loadAppsCatalog(false);
      } else {
        this.log('ERROR', `Uninstall failed: ${res ? res.error : 'Unknown error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Uninstall error: ${e}`);
    }
  }

  async openChangelogModal(appId) {
    this.activeChangelogAppId = appId;
    try {
      const res = await window.pywebview.api.get_app_changelog(appId);
      if (res && res.success) {
        if (this.el.changelogAppTitle) this.el.changelogAppTitle.innerText = res.title;
        if (this.el.changelogAppMeta) {
          const rootLabel = res.root_required ? '🔴 Root Required' : '🟢 No Root (DevMode Ready)';
          this.el.changelogAppMeta.innerText = `Latest: v${res.latest} • ${res.category} • ${rootLabel}`;
        }
        if (this.el.changelogReleaseDate) {
          this.el.changelogReleaseDate.innerText = `Release Date: ${res.release_date}`;
        }
        if (this.el.changelogSourceLink) {
          this.el.changelogSourceLink.href = res.source_url || '#';
        }

        if (this.el.changelogList) {
          this.el.changelogList.innerHTML = '';
          const items = res.changelog || [];
          if (items.length > 0) {
            items.forEach(point => {
              const li = document.createElement('li');
              li.innerText = point;
              this.el.changelogList.appendChild(li);
            });
          } else {
            const li = document.createElement('li');
            li.innerText = 'General stability improvements and webOS performance optimizations.';
            this.el.changelogList.appendChild(li);
          }
        }

        const catItem = this.catalogItems.find(i => i.id === appId);
        if (this.el.btnChangelogAction) {
          if (catItem && catItem.installed) {
            this.el.btnChangelogAction.innerText = catItem.update_available ? 'Update App' : 'Reinstall App';
          } else {
            this.el.btnChangelogAction.innerText = 'Install App';
          }
        }

        if (this.el.changelogModal) {
          this.el.changelogModal.style.display = 'flex';
        }
      }
    } catch (e) {
      this.log('ERROR', `Changelog fetch error: ${e}`);
    }
  }

  closeChangelogModal() {
    this.activeChangelogAppId = null;
    if (this.el.changelogModal) {
      this.el.changelogModal.style.display = 'none';
    }
  }

  async handleSideloadLocal() {
    this.log('INFO', 'Opening file picker to select local webOS .IPK package...');
    try {
      const res = await window.pywebview.api.sideload_local_dialog();
      if (res && res.cancelled) {
        this.log('INFO', 'Local IPK selection cancelled.');
      } else if (res && res.success) {
        this.log('OK', res.message || 'Local package installed successfully!');
        await this.loadAppsCatalog(false);
      } else {
        this.log('ERROR', `Sideload failed: ${res ? res.error : 'Unknown error'}`);
      }
    } catch (e) {
      this.log('ERROR', `Sideload error: ${e}`);
    }
  }

  async launchApp(appId) {
    this.log('INFO', `Launching ${appId} on TV display...`);
    try {
      const ok = await window.pywebview.api.launch_app(appId);
      if (ok) {
        this.log('OK', `Application launched on TV: ${appId}`);
      } else {
        this.log('ERROR', `Failed to launch ${appId}`);
      }
    } catch (e) {
      this.log('ERROR', `Launch error: ${e}`);
    }
  }

  async handleSendToast() {
    const msg = this.el.toastInput.value.trim();
    if (!msg) return;

    try {
      const ok = await window.pywebview.api.send_toast(msg);
      if (ok) {
        this.log('OK', `Toast sent to TV: "${msg}"`);
        this.el.toastInput.value = '';
      } else {
        this.log('ERROR', 'Failed to display toast notification.');
      }
    } catch (e) {
      this.log('ERROR', `Toast error: ${e}`);
    }
  }

  async handleFlushRam() {
    this.log('INFO', 'Flushing kernel pagecaches...');
    try {
      const ok = await window.pywebview.api.drop_caches();
      if (ok) {
        this.log('OK', 'RAM caches flushed.');
        const mem = await window.pywebview.api.poll_memory();
        if (mem && mem.active) {
          this.el.valRam.innerText = `${mem.available} MB Free / ${mem.total} MB`;
          this.el.ramProgress.style.width = `${mem.pct}%`;
        }
      }
    } catch (e) {
      this.log('ERROR', `Flush error: ${e}`);
    }
  }

  async handleReboot() {
    if (confirm('Reboot TV cleanly now?')) {
      this.stopTelemetry();
      this.log('WARN', 'Sending machine reboot command to TV...');
      try {
        await window.pywebview.api.reboot();
      } catch (e) {
        this.log('ERROR', `Reboot command failed: ${e}`);
      }
    }
  }

  setToastPreset(text) {
    this.el.toastInput.value = text;
  }

  installAppPreset(name) {
    this.log('INFO', `Package installer requested for: ${name}. Available in upcoming update.`);
  }

  // ---------------- UI State Updates ----------------

  updateDeviceState(info) {
    this.deviceInfo = info;
    this.currentDevice = info;
    const state = info.connection_state || 'OFFLINE';

    if (state === 'ONLINE_ROOTED') {
      this.el.valModel.innerText = `LG ${info.model}`;
      this.el.valFirmware.innerText = `webOS ${info.sdk} • FW ${info.firmware}`;
      this.el.badgeRoot.innerText = '● Rooted';
      this.el.badgeRoot.className = 'status-badge online';

      // Root pill in Device Card
      this.el.valRootVer.innerText = `Root: ${info.root_version || 'Homebrew Channel v0.7.3'}`;
      this.el.valRootPill.className = 'metric-root-pill rooted';

      // Header Ping / Status Badge
      this.el.pingBadge.style.display = 'inline-flex';
      this.el.pingText.innerText = 'Online';

      // CPU Card Initial
      this.el.valCpuTag.innerText = `4C • ${info.soc_hardware || 'm7621'}`;
      this.el.valCpuSub.innerText = `ARM Cortex-A53 • Load: ${info.load_avg || '--'}`;

      // TV Quick Strip
      if (this.el.hdrTvStrip) this.el.hdrTvStrip.style.display = 'flex';
      if (this.el.hdrActiveApp) this.el.hdrActiveApp.style.display = 'inline-flex';
      if (this.el.hdrAppTitle) this.el.hdrAppTitle.innerText = info.active_app || 'Home Menu';
      this.updateMuteIcon(info.muted || false);

      // Terminal Labels
      if (this.el.terminalSessionTitle) this.el.terminalSessionTitle.innerText = `root@LG-${info.model || 'webOS'}`;
      if (this.el.terminalSessionSub) this.el.terminalSessionSub.innerText = `${info.ip || 'Local Network'} • Port 23 / 22 • Interactive Root Shell`;
      if (this.el.terminalBannerHost) this.el.terminalBannerHost.innerText = `  Host: LG ${info.model || 'Smart TV'} (${info.ip || 'Connected'}) | webOS ${info.sdk || 'Unknown'} | UID: 0 (root)`;
      if (this.el.terminalPromptBadge) this.el.terminalPromptBadge.innerText = `root@${(info.model || 'webos').toLowerCase().replace(/[^a-z0-9]/g, '')}:~#`;

      // Statusbar
      if (this.el.statusConnDot) this.el.statusConnDot.className = 'status-dot online';
      if (this.el.statusConnText) this.el.statusConnText.innerText = `Connected: ${info.model} • Telnet: OK`;

      this.el.footerDot.className = 'status-dot online';
      this.el.footerStatusText.innerText = `Connected (${info.model})`;

      const total = info.mem_total_mb || 0;
      const free = info.mem_avail_mb || 0;
      const used = total - free;
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;

      this.el.valRam.innerText = `${free} MB Free / ${total} MB`;
      this.el.ramProgress.style.width = `${pct}%`;
      this.el.valSwap.innerText = `Flash Swap: ${info.swap_used_mb} MB used`;
      this.el.valSwappiness.innerText = `swap: ${info.swappiness}`;

      // Dashboard View Elements
      if (this.el.dashValModel) this.el.dashValModel.innerText = `LG ${info.model}`;
      if (this.el.dashValDisplay) this.el.dashValDisplay.innerText = info.uhd ? '4K UHD (3840×2160) • HDR Active' : 'FHD (1920×1080)';
      if (this.el.dashValSoc) this.el.dashValSoc.innerText = `${info.soc_hardware || 'm7621'} Quad-Core ARM Cortex-A53`;
      if (this.el.dashValWebos) this.el.dashValWebos.innerText = `webOS ${info.sdk} • FW ${info.firmware}`;
      if (this.el.dashValKernel) this.el.dashValKernel.innerText = info.kernel || 'Linux 4.4.84';
      if (this.el.dashValUptime) this.el.dashValUptime.innerText = info.uptime_str || 'Active';
      if (this.el.dashPlatformBadge) this.el.dashPlatformBadge.innerText = `webOS ${info.sdk}`;

      // Storage Partitions
      if (info.storage) {
        if (this.el.dashValStorageApp && info.storage.app_total_mb > 0) {
          this.el.dashValStorageApp.innerText = `${info.storage.app_used_mb} MB / ${info.storage.app_total_mb} MB (${info.storage.app_avail_mb} MB free)`;
        }
        if (this.el.dashStorageAppBar) {
          this.el.dashStorageAppBar.style.width = `${info.storage.app_pct || 0}%`;
        }
        if (this.el.dashValStorageData && info.storage.data_total_mb > 0) {
          this.el.dashValStorageData.innerText = `${info.storage.data_used_mb} MB / ${info.storage.data_total_mb} MB (${info.storage.data_avail_mb} MB free)`;
        }
        if (this.el.dashStorageDataBar) {
          this.el.dashStorageDataBar.style.width = `${info.storage.data_pct || 0}%`;
        }
      }

      if (this.el.dashValSwapStatus) {
        this.el.dashValSwapStatus.innerText = `${info.swap_used_mb > 0 ? info.swap_used_mb + ' MB Used / 100 MB' : '100 MB Flash Swap File Active'}`;
      }
      if (this.el.dashValSwapRatio) {
        this.el.dashValSwapRatio.innerText = `${info.swappiness} (Aggressive Low-Latency)`;
      }

      if (this.el.dashValActiveapp) this.el.dashValActiveapp.innerText = info.active_app || 'Home Menu';
      if (this.el.dashValVolume) {
        const vol = info.volume !== undefined ? info.volume : 5;
        this.el.dashValVolume.innerText = `TV Speaker • Vol: ${vol} • ${info.muted ? 'Muted' : 'Unmuted'}`;
      }
      if (this.el.dashValIp) this.el.dashValIp.innerText = this.el.ipInput.value;

      // Update Root View
      if (this.el.rootCardDot) this.el.rootCardDot.className = 'status-dot online';
      if (this.el.rootCardTitle) this.el.rootCardTitle.innerText = `Root Privileges Active (${info.root_version || 'Homebrew Channel'})`;
      if (this.el.rootCardSub) this.el.rootCardSub.innerText = `${info.model} • webOS ${info.sdk} • FW ${info.firmware} • Full root confirmed`;
      if (this.el.rootEvalBadge) {
        this.el.rootEvalBadge.className = 'badge badge-tested';
        this.el.rootEvalBadge.innerText = 'Root Active ✅';
      }
      if (this.el.rootCardDesc) this.el.rootCardDesc.innerText = 'Your TV has unrestricted root shell access enabled. All system optimizations, debloating tools, and Homebrew packages can be managed directly without any exploits.';
      if (this.el.btnRootExec) {
        this.el.btnRootExec.disabled = true;
        this.el.btnRootExec.innerText = 'Root Active (uid 0)';
      }

      this.log('OK', `Connected to LG ${info.model}! Full root privileges confirmed.`);

      // Trigger Audit automatically upon connect
      this.handleAudit();

      // Start Real-Time Telemetry Polling!
      this.startTelemetry();

      // Load Apps Catalog only if currently on Apps tab
      if (this.currentTab === 'apps') {
        this.loadAppsCatalog();
      }

      // Load processes, OTA shield status, and backups
      this.loadProcesses();
      this.checkOtaStatus();
      this.loadBackups();

    } else if (state === 'ONLINE_UNROOTED') {
      this.stopTelemetry();
      if (this.el.hdrTvStrip) this.el.hdrTvStrip.style.display = 'none';
      if (this.el.statusConnDot) this.el.statusConnDot.className = 'status-dot amber';
      if (this.el.statusConnText) this.el.statusConnText.innerText = 'Connected (Unrooted)';

      this.el.valModel.innerText = 'LG Smart TV';
      this.el.valFirmware.innerText = 'webOS detected (Port 3000)';
      this.el.badgeRoot.innerText = '○ Unrooted';
      this.el.badgeRoot.className = 'status-badge unrooted';

      this.el.valRootVer.innerText = 'Root: Inactive';
      this.el.valRootPill.className = 'metric-root-pill unrooted';

      this.el.pingBadge.style.display = 'inline-flex';
      this.el.pingText.innerText = 'Unrooted';

      this.el.valCpuPct.innerText = '-- % Load';
      this.el.cpuProgress.style.width = '0%';
      this.el.valCpuSub.innerText = 'Root required for CPU telemetry';

      this.el.footerDot.className = 'status-dot amber';
      this.el.footerStatusText.innerText = 'Connected (Unrooted)';

      this.el.valRam.innerText = '-- / -- MB';
      this.el.ramProgress.style.width = '0%';
      this.el.valSwap.innerText = 'Root required';
      this.el.valSwappiness.innerText = 'swappiness: --';

      if (this.el.rootCardDot) this.el.rootCardDot.className = 'status-dot amber';
      if (this.el.rootCardTitle) this.el.rootCardTitle.innerText = 'Unrooted webOS TV Detected';
      if (this.el.rootCardSub) this.el.rootCardSub.innerText = `${info.model || 'LG Smart TV'} • Port 3000 Open • Root Closed`;
      if (this.el.rootEvalBadge) {
        this.el.rootEvalBadge.className = 'badge badge-community';
        this.el.rootEvalBadge.innerText = 'Exploit Eligible';
      }
      if (this.el.rootCardDesc) this.el.rootCardDesc.innerText = 'Elevated root shell is closed. Use RootMy.tv for webOS 3.5-6.x or Developer Mode privilege escalation for webOS 7/22/23/24 below.';
      if (this.el.btnRootExec) {
        this.el.btnRootExec.disabled = false;
        this.el.btnRootExec.innerText = 'Select Root Method Below';
      }

      this.log('WARN', 'Connected to TV, but Telnet root shell is closed. View Root Assistant tab.');

    } else {
      this.stopTelemetry();
      if (this.el.hdrTvStrip) this.el.hdrTvStrip.style.display = 'none';
      if (this.el.statusConnDot) this.el.statusConnDot.className = 'status-dot offline';
      if (this.el.statusConnText) this.el.statusConnText.innerText = 'Disconnected';

      // Terminal Labels
      if (this.el.terminalSessionTitle) this.el.terminalSessionTitle.innerText = 'Disconnected';
      if (this.el.terminalSessionSub) this.el.terminalSessionSub.innerText = 'TV Offline • Root Shell Closed';
      if (this.el.terminalBannerHost) this.el.terminalBannerHost.innerText = '  Host: Disconnected | Please connect to TV to activate root shell';

      this.el.valModel.innerText = 'Device Offline';
      this.el.valFirmware.innerText = 'webOS: -- • FW: --';
      this.el.badgeRoot.innerText = '○ Offline';
      this.el.badgeRoot.className = 'status-badge offline';

      this.el.valRootVer.innerText = 'Root: Offline';
      this.el.valRootPill.className = 'metric-root-pill';

      this.el.pingBadge.style.display = 'none';

      this.el.valCpuPct.innerText = '-- % Load';
      this.el.cpuProgress.style.width = '0%';
      this.el.valCpuSub.innerText = 'Quad-Core ARM Cortex-A53 • Load: --';

      this.el.footerDot.className = 'status-dot offline';
      this.el.footerStatusText.innerText = 'Disconnected';

      this.el.valRam.innerText = '-- / -- MB';
      this.el.ramProgress.style.width = '0%';
      this.el.valSwap.innerText = 'Flash Swap: -- MB';
      this.el.valSwappiness.innerText = 'swappiness: --';
      this.el.valScore.innerText = '-- %';
      this.el.valScoreLabel.innerText = 'Offline';

      // Reset Dashboard View
      if (this.el.dashValModel) this.el.dashValModel.innerText = 'Awaiting Connection';
      if (this.el.dashValWebos) this.el.dashValWebos.innerText = 'webOS -- • FW: --';
      if (this.el.dashValKernel) this.el.dashValKernel.innerText = 'Linux --';
      if (this.el.dashValUptime) this.el.dashValUptime.innerText = '--';
      if (this.el.dashValStorageApp) this.el.dashValStorageApp.innerText = '-- MB / -- MB';
      if (this.el.dashStorageAppBar) this.el.dashStorageAppBar.style.width = '0%';
      if (this.el.dashValStorageData) this.el.dashValStorageData.innerText = '-- MB / -- MB';
      if (this.el.dashStorageDataBar) this.el.dashStorageDataBar.style.width = '0%';
      if (this.el.dashValActiveapp) this.el.dashValActiveapp.innerText = 'Disconnected';
      if (this.el.dashValIp) this.el.dashValIp.innerText = '--';

      this.log('ERROR', 'Device unreachable. TV may be powered off, rebooting, or IP incorrect.');
    }
  }

  updateAuditState(diag) {
    this.auditResults = diag;

    this.el.valScore.innerText = `${diag.score} %`;
    this.el.valScoreLabel.innerText = diag.status_label;
    this.el.valIssuesTag.innerText = diag.issues_count > 0 ? `${diag.issues_count} issue(s)` : 'Optimal';

    // Update Health Progress Bar
    if (this.el.healthProgress) {
      this.el.healthProgress.style.width = `${diag.score}%`;
      if (diag.score === 100) {
        this.el.healthProgress.style.backgroundColor = 'var(--accent-green)';
      } else if (diag.score >= 60) {
        this.el.healthProgress.style.backgroundColor = 'var(--accent-amber)';
      } else {
        this.el.healthProgress.style.backgroundColor = 'var(--accent-red)';
      }
    }

    const findings = diag.findings || [];
    const issues = findings.filter(f => !f.passed);
    const passed = findings.filter(f => f.passed);

    this.el.findingsList.innerHTML = '';

    if (issues.length > 0) {
      this.el.btnFixAll.disabled = false;
      this.el.btnFixAll.innerText = `Fix All Issues (${issues.length})`;
      this.el.findingsSummary.innerText = `${issues.length} active bottleneck(s) degrading TV responsiveness:`;

      // Render Issues
      issues.forEach(item => {
        const det = this.getFindingDetails(item);
        const div = document.createElement('div');
        div.className = 'finding-item issue';
        div.innerHTML = `
          <div class="finding-item-header">
            <div class="finding-left">
              <div class="finding-title-row">
                <span class="status-dot amber"></span>
                <span class="finding-title">${item.title}</span>
              </div>
              <div class="finding-metrics">Current: ${item.current}  •  Target: ${item.recommended}</div>
            </div>
            <div class="finding-right">
              <span class="finding-badge warning">Action Required</span>
              <span class="finding-chevron">▼</span>
            </div>
          </div>
          <div class="finding-details">
            <div class="finding-tech-note">${det.note}</div>
            <div class="finding-cmd-box"><code>$ ${det.cmd}</code></div>
          </div>
        `;
        div.addEventListener('click', () => div.classList.toggle('expanded'));
        this.el.findingsList.appendChild(div);
      });

      // Render Passed Below
      if (passed.length > 0) {
        passed.forEach(item => {
          const det = this.getFindingDetails(item);
          const div = document.createElement('div');
          div.className = 'finding-item';
          div.innerHTML = `
            <div class="finding-item-header">
              <div class="finding-left">
                <div class="finding-title-row">
                  <span class="status-dot online"></span>
                  <span class="finding-title">${item.title}</span>
                </div>
                <div class="finding-metrics">${item.current} (Optimal)</div>
              </div>
              <div class="finding-right">
                <span class="finding-badge optimal">Passed</span>
                <span class="finding-chevron">▼</span>
              </div>
            </div>
            <div class="finding-details">
              <div class="finding-tech-note">${det.note}</div>
              <div class="finding-cmd-box"><code>$ ${det.cmd}</code></div>
            </div>
          `;
          div.addEventListener('click', () => div.classList.toggle('expanded'));
          this.el.findingsList.appendChild(div);
        });
      }
    } else {
      // 100% Score
      this.el.btnFixAll.disabled = false;
      this.el.btnFixAll.innerText = 'Re-Apply Tweaks';
      this.el.findingsSummary.innerText = 'All 5 system optimization checks passed. Operating at maximum responsiveness.';

      const hero = document.createElement('div');
      hero.className = 'optimal-hero-banner';
      hero.innerHTML = `
        <div class="optimal-hero-left">
          <span class="pulse-dot"></span>
          <span class="optimal-hero-title">All Systems Optimal • 100% Score</span>
          <span class="optimal-hero-desc">— Flash Swap, Swappiness, and background daemon scripts active</span>
        </div>
        <span class="optimal-hero-badge">Optimal</span>
      `;
      this.el.findingsList.appendChild(hero);

      passed.forEach(item => {
        const det = this.getFindingDetails(item);
        const div = document.createElement('div');
        div.className = 'finding-item';
        div.innerHTML = `
          <div class="finding-item-header">
            <div class="finding-left">
              <div class="finding-title-row">
                <span class="status-dot online"></span>
                <span class="finding-title">${item.title}</span>
              </div>
              <div class="finding-metrics">${item.current} (Optimal)</div>
            </div>
            <div class="finding-right">
              <span class="finding-badge optimal">Optimal</span>
              <span class="finding-chevron">▼</span>
            </div>
          </div>
          <div class="finding-details">
            <div class="finding-tech-note">${det.note}</div>
            <div class="finding-cmd-box"><code>$ ${det.cmd}</code></div>
          </div>
        `;
        div.addEventListener('click', () => div.classList.toggle('expanded'));
        this.el.findingsList.appendChild(div);
      });
    }

    this.log('OK', `Audit complete. Health Score: ${diag.score}%. ${diag.issues_count} issue(s) detected.`);
  }

  getFindingDetails(item) {
    const details = {
      swappiness: {
        note: 'Linux/webOS defaults to swappiness=100, which aggressively writes RAM pages into NAND flash. Lowering swappiness to 30 keeps active memory resident and protects internal TV flash storage from wear.',
        cmd: 'sysctl -w vm.swappiness=30 && echo 30 > /proc/sys/vm/swappiness'
      },
      kill_preload: {
        note: 'webOS preloads hidden YouTube and Chromium/Cobalt browser daemons on system startup. Neutralizing the preloader recovers ~150 MB of memory exclusively for active media players like Lampa and TorrServer.',
        cmd: 'initctl stop webos-preload-manager 2>/dev/null; pkill -9 -f cobalt'
      },
      block_ads: {
        note: 'Redirects LG promotional ad telemetry domains (ad.lgsmartad.com, lgtvsdp.com) to localhost (127.0.0.1) using an /etc/hosts bind mount, eliminating home launcher lag.',
        cmd: 'mount -o bind /var/lib/webosbrew/hosts /etc/hosts'
      }
    };
    return details[item.id] || {
      note: item.impact || 'System performance and privilege check verified optimal.',
      cmd: '# Verified by webOS service manager'
    };
  }

  renderSparkline(container, history, maxVal) {
    if (!container) return;
    container.innerHTML = '';
    history.forEach((val, idx) => {
      const bar = document.createElement('div');
      bar.className = 'spark-bar';
      const pct = Math.max(0, Math.min(100, (val / maxVal) * 100));
      bar.style.height = `${Math.max(2, Math.round((pct / 100) * 14))}px`;
      if (idx === history.length - 1) {
        if (pct > 85) bar.className = 'spark-bar alert';
        else if (pct > 60) bar.className = 'spark-bar warn';
        else bar.className = 'spark-bar active';
      }
      container.appendChild(bar);
    });
  }

  // ---------------- Quick Remote & Drawer Helpers ----------------

  async handleScreenOff() {
    this.log('INFO', 'Sending Screen Off command to TV...');
    try {
      const ok = await window.pywebview.api.screen_off();
      if (ok) {
        this.log('OK', 'TV display panel turned OFF. Sound and apps continue playing. Press any key on physical remote to wake screen.');
      } else {
        this.log('WARN', 'Screen off command sent.');
      }
    } catch (e) {
      this.log('ERROR', `Screen off error: ${e}`);
    }
  }

  async handleToggleMute() {
    try {
      const res = await window.pywebview.api.toggle_mute();
      if (res && res.success) {
        this.log('OK', res.muted ? 'TV master audio MUTED' : 'TV audio UNMUTED');
        this.updateMuteIcon(res.muted);
      }
    } catch (e) {
      this.log('ERROR', `Mute toggle error: ${e}`);
    }
  }

  updateMuteIcon(isMuted) {
    if (!this.el.muteIcon) return;
    if (isMuted) {
      this.el.muteIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
    } else {
      this.el.muteIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    }
  }

  async handleGoHome() {
    this.log('INFO', 'Returning TV to Home Menu...');
    try {
      await window.pywebview.api.go_home();
      if (this.el.hdrAppTitle) this.el.hdrAppTitle.innerText = 'Home Menu';
      this.log('OK', 'TV Home Menu launched.');
    } catch (e) {
      this.log('ERROR', `Go home error: ${e}`);
    }
  }

  async handleCheckUpdate() {
    try {
      await window.pywebview.api.open_github();
      this.log('INFO', 'Opened GitHub repository & releases in browser.');
    } catch (e) {
      this.log('ERROR', `Update check error: ${e}`);
    }
  }

  async handleReportIssue() {
    try {
      this.log('INFO', 'Preparing diagnostic report & opening GitHub Issues...');
      await window.pywebview.api.report_issue();
      this.log('OK', 'GitHub Issues page opened with pre-filled system diagnosis.');
    } catch (e) {
      this.log('ERROR', `Failed to open GitHub Issues: ${e}`);
    }
  }

  toggleTerminal() {
    if (!this.el.terminalDrawer) return;
    const isOpen = this.el.terminalDrawer.classList.toggle('open');
    if (this.el.drawerArrow) {
      this.el.drawerArrow.classList.toggle('open', isOpen);
    }
  }

  closeTerminal() {
    if (!this.el.terminalDrawer) return;
    this.el.terminalDrawer.classList.remove('open');
    if (this.el.drawerArrow) {
      this.el.drawerArrow.classList.remove('open');
    }
  }

  async handleCopyLog() {
    const text = this.el.consoleOutput ? this.el.consoleOutput.innerText : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (this.el.btnCopyLog) {
        const old = this.el.btnCopyLog.innerText;
        this.el.btnCopyLog.innerText = 'Copied!';
        setTimeout(() => this.el.btnCopyLog.innerText = old, 1500);
      }
      this.log('OK', 'Console log copied to clipboard.');
    } catch (e) {
      this.log('WARN', 'Clipboard write error.');
    }
  }

  // ---------------- Interactive Root Terminal ----------------

  async handleTerminalSubmit() {
    if (!this.el.terminalInput || this.isTerminalBusy) return;
    const cmd = this.el.terminalInput.value.trim();
    if (!cmd) return;

    this.el.terminalInput.value = '';

    if (this.terminalHistory.length === 0 || this.terminalHistory[this.terminalHistory.length - 1] !== cmd) {
      this.terminalHistory.push(cmd);
    }
    this.terminalHistoryIndex = this.terminalHistory.length;

    if (cmd.toLowerCase() === 'clear') {
      if (this.el.terminalOutputBody) this.el.terminalOutputBody.innerHTML = '';
      return;
    }

    this.appendTerminalLine('prompt', `root@webos:~# ${cmd}`);

    this.isTerminalBusy = true;
    if (this.el.btnTerminalExec) {
      this.el.btnTerminalExec.disabled = true;
      const span = this.el.btnTerminalExec.querySelector('span');
      if (span) span.innerText = '...';
    }

    try {
      const res = await window.pywebview.api.execute_terminal_cmd(cmd);
      if (res && res.success) {
        const out = res.output ? res.output.trim() : '';
        if (out) {
          this.appendTerminalLine('output', out);
        } else {
          this.appendTerminalLine('system', '[Command executed successfully with no stdout output]');
        }
      } else {
        this.appendTerminalLine('error', `Error: ${res ? res.error : 'Unknown error'}`);
      }
    } catch (e) {
      this.appendTerminalLine('error', `Execution error: ${e}`);
    } finally {
      this.isTerminalBusy = false;
      if (this.el.btnTerminalExec) {
        this.el.btnTerminalExec.disabled = false;
        const span = this.el.btnTerminalExec.querySelector('span');
        if (span) span.innerText = 'Run';
      }
      if (this.el.terminalInput) this.el.terminalInput.focus();
    }
  }

  appendTerminalLine(type, text) {
    if (!this.el.terminalOutputBody) return;
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.innerText = text;
    this.el.terminalOutputBody.appendChild(line);
    if (this.el.terminalScreen) {
      this.el.terminalScreen.scrollTop = this.el.terminalScreen.scrollHeight;
    }
  }

  navigateTerminalHistory(direction) {
    if (!this.el.terminalInput || this.terminalHistory.length === 0) return;
    const nextIdx = this.terminalHistoryIndex + direction;
    if (nextIdx >= 0 && nextIdx < this.terminalHistory.length) {
      this.terminalHistoryIndex = nextIdx;
      this.el.terminalInput.value = this.terminalHistory[this.terminalHistoryIndex];
    } else if (nextIdx >= this.terminalHistory.length) {
      this.terminalHistoryIndex = this.terminalHistory.length;
      this.el.terminalInput.value = '';
    }
  }

  copyTerminalOutput() {
    if (!this.el.terminalScreen) return;
    const text = this.el.terminalScreen.innerText;
    navigator.clipboard.writeText(text).then(() => {
      this.log('OK', 'Terminal output copied to clipboard.');
    }).catch(() => {
      this.log('WARN', 'Failed to copy output to clipboard.');
    });
  }

  log(tag, text) {
    const time = new Date().toTimeString().split(' ')[0];
    const tagClass = {
      INFO: 'tag-info',
      OK: 'tag-ok',
      WARN: 'tag-warn',
      ERROR: 'tag-error',
      CMD: 'tag-cmd'
    }[tag] || 'tag-info';

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-tag ${tagClass}">[${tag}]</span> ${this.escapeHtml(text)}`;
    if (this.el.consoleOutput) {
      this.el.consoleOutput.appendChild(line);
      this.el.consoleOutput.scrollTop = this.el.consoleOutput.scrollHeight;
    }

    this.logCount++;
    if (this.el.logCounter) this.el.logCounter.innerText = this.logCount;
    if (this.el.statusLastMsg) this.el.statusLastMsg.innerText = text;
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
}

// Global initialization
window.addEventListener('pywebviewready', () => {
  window.app = new AppController();
});
