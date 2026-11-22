// [Diubah oleh Gemini - 2026-11-21] Pusat Setup / "Mulai di sini" Office AI V15: daftar periksa 6 item dengan status nyata, penemuan otomatis folder proyek & dasbor, tombol Pilih Folder Electron, penjelasan risiko Full Access satu kali, dan langkah berikutnya dinamis
'use strict';

window.OfficeSetupUI = {
  create(opts = {}) {
    const {
      dialog: openDialogFn,
      isDemo = () => true,
      before,
      onOpenShorts,
      onOpenYoutube,
      onOpenPrompt,
      onOpenFinance,
      onOpenSettings,
      onConfigChanged
    } = opts;

    const $ = id => document.getElementById(id);
    const isLocalDemo = () => isDemo() || location.protocol === 'file:';
    const getToken = () => document.querySelector('meta[name="office-vault-token"]')?.content || '';
    const tr = (key, params) => (window.I18n?.t ? window.I18n.t(key, params) : key);

    let active = false;
    let generation = 0;
    let busy = false;
    let statusData = null;
    let notice = { text: '', kind: '' };
    let testState = { running: false, text: '', ok: null };
    // V16-B [Diubah oleh Gemini - 2026-11-21] State bagian "Hook Office AI" di Pusat Setup (mengikuti kontrak V16B_CONTRACT.md: tidak membaca konfigurasi asli otomatis; wajib preview + konfirmasi eksplisit)
    const hookState = {
      scope: 'project',
      folder: '',
      folderTouched: false,
      sendPromptText: false,
      busy: false,
      notice: { text: '', kind: '' },
      providers: {
        claude: { status: 'unchecked', target: '', backup: '', restored: '' },
        codex: { status: 'unchecked', target: '', backup: '', restored: '' }
      },
      preview: null, // { provider, scope, folder, sendPromptText, target, changed, writes, backupRequired, previewId }
      confirming: null // { action: 'install'|'uninstall', provider }
    };

    const HOOK_ERR_MAP = {
      forbidden_path: 'flow16.hookErrForbidden',
      symlink_path: 'flow16.hookErrSymlink',
      invalid_json: 'flow16.hookErrInvalidJson',
      invalid_config_file: 'flow16.hookErrInvalidFile',
      invalid_hooks_object: 'flow16.hookErrInvalidJson',
      invalid_hook_entries: 'flow16.hookErrInvalidJson',
      incomplete_install_uninstall_first: 'flow16.hookErrBrokenFirst',
      concurrent_config_change: 'flow16.hookErrConcurrent',
      missing_restore_manifest: 'flow16.hookErrNoManifest',
      invalid_restore_manifest: 'flow16.hookErrNoManifest',
      backup_integrity_error: 'flow16.hookErrBackupIntegrity',
      preview_required: 'flow16.hookErrPreviewRequired',
      preview_expired: 'flow16.hookErrPreviewExpired',
      confirm_required: 'flow16.hookErrConfirmRequired',
      project_folder_required: 'flow16.hookErrFolderRequired',
      global_has_no_folder: 'flow16.hookErrGlobalFolder',
      credentials_detected: 'flow16.hookErrCredentials',
      configuration_not_safe_or_invalid: 'flow16.hookErrUnsafe'
    };

    function hookErrorText(err) {
      const raw = String(err?.code || err?.message || '');
      if (HOOK_ERR_MAP[raw]) return tr(HOOK_ERR_MAP[raw]);
      if (raw === 'HTTP:409') return tr('flow16.hookErrConcurrent');
      if (raw === 'HTTP:403') return tr('flow16.hookErrForbidden');
      if (raw === 'HTTP:404') return tr('flow16.hookErrRouteUnavailable');
      return tr('flow16.hookErrUnsafe');
    }

    function effectiveHookFolder() {
      if (hookState.folderTouched) return hookState.folder.trim();
      return (hookState.folder || statusData?.project?.savedDir || statusData?.project?.effectiveDir || '').trim();
    }

    function hookPayload(provider) {
      const payload = {
        provider,
        scope: hookState.scope,
        sendPromptText: Boolean(hookState.sendPromptText)
      };
      if (hookState.scope === 'project') {
        payload.folder = effectiveHookFolder();
      }
      return payload;
    }

    function clearHookPreview() {
      hookState.preview = null;
      hookState.confirming = null;
    }

    async function checkHookStatus(provider) {
      if (hookState.busy || isLocalDemo()) return;
      if (hookState.scope === 'project' && !effectiveHookFolder()) {
        hookState.notice = { text: tr('flow16.hookErrFolderRequired'), kind: 'error' };
        render();
        return;
      }
      hookState.busy = true;
      hookState.notice = { text: '', kind: '' };
      render();
      try {
        const res = await req('POST', '/flow/hooks/status', hookPayload(provider));
        hookState.providers[provider] = {
          status: res?.status || 'absent',
          target: res?.target || '',
          backup: hookState.providers[provider]?.backup || '',
          restored: ''
        };
        hookState.notice = {
          text: tr('flow16.hookStatusChecked', {
            provider: tr('flow16.hookProvider.' + provider),
            status: tr('flow16.hookStatus.' + (res?.status || 'absent'))
          }),
          kind: res?.status === 'broken' ? 'error' : 'ok'
        };
      } catch (err) {
        hookState.notice = { text: hookErrorText(err), kind: 'error' };
      } finally {
        hookState.busy = false;
        render();
      }
    }

    async function previewHook(provider, openConfirmAction = null) {
      if (hookState.busy || isLocalDemo()) return null;
      if (hookState.scope === 'project' && !effectiveHookFolder()) {
        hookState.notice = { text: tr('flow16.hookErrFolderRequired'), kind: 'error' };
        render();
        return null;
      }
      hookState.busy = true;
      hookState.notice = { text: '', kind: '' };
      hookState.confirming = null;
      render();
      try {
        const payload = hookPayload(provider);
        const res = await req('POST', '/flow/hooks/preview', payload);
        hookState.providers[provider] = {
          status: res?.status || 'absent',
          target: res?.target || '',
          backup: hookState.providers[provider]?.backup || '',
          restored: ''
        };
        hookState.preview = {
          provider,
          scope: payload.scope,
          folder: payload.folder || '',
          sendPromptText: payload.sendPromptText,
          status: res?.status || 'absent',
          target: res?.target || '',
          changed: Boolean(res?.changed),
          writes: Array.isArray(res?.writes) ? res.writes : [],
          backupRequired: Boolean(res?.backupRequired),
          previewId: res?.previewId || ''
        };
        if (openConfirmAction) {
          hookState.confirming = { action: openConfirmAction, provider };
        }
        return hookState.preview;
      } catch (err) {
        hookState.preview = null;
        hookState.notice = { text: hookErrorText(err), kind: 'error' };
        return null;
      } finally {
        hookState.busy = false;
        render();
      }
    }

    async function executeHookAction(action, provider) {
      if (hookState.busy || isLocalDemo()) return;
      const pv = hookState.preview;
      if (!pv || pv.provider !== provider || !pv.previewId) {
        hookState.notice = { text: tr('flow16.hookErrPreviewRequired'), kind: 'error' };
        render();
        return;
      }
      hookState.busy = true;
      hookState.notice = { text: '', kind: '' };
      render();
      try {
        const body = {
          ...hookPayload(provider),
          confirm: true,
          previewId: pv.previewId
        };
        const route = action === 'uninstall' ? '/flow/hooks/uninstall' : '/flow/hooks/install';
        const res = await req('POST', route, body);
        hookState.providers[provider] = {
          status: res?.status || (action === 'uninstall' ? 'absent' : 'installed'),
          target: res?.target || pv.target || '',
          backup: res?.backup || hookState.providers[provider]?.backup || '',
          restored: res?.restored || ''
        };
        hookState.preview = null;
        hookState.confirming = null;
        const restoredText = res?.restored === 'exact'
          ? tr('flow16.hookRestoredExact')
          : res?.restored === 'merged'
            ? tr('flow16.hookRestoredMerged')
            : tr('flow16.hookRestoredExact');
        hookState.notice = {
          text: action === 'uninstall'
            ? tr('flow16.hookUninstallOk', {
                provider: tr('flow16.hookProvider.' + provider),
                restored: restoredText
              })
            : tr('flow16.hookInstallOk', {
                provider: tr('flow16.hookProvider.' + provider),
                backup: res?.backup || tr('flow16.hookBackupNone')
              }),
          kind: 'ok'
        };
      } catch (err) {
        hookState.confirming = null;
        hookState.notice = { text: hookErrorText(err), kind: 'error' };
      } finally {
        hookState.busy = false;
        render();
      }
    }

    function renderHooksSection() {
      const sec = el('section', null, ['v12-section', 'flow16-hooks-section']);
      sec.id = 'setup16HooksSection';

      const head = el('div', null, 'flow16-hooks-head');
      const headText = el('div');
      headText.append(
        el('h3', tr('flow16.hooksTitle')),
        el('p', tr('flow16.hooksSubtitle'), 'v12-muted')
      );
      head.append(headText);
      sec.append(head);

      // Controls: scope, folder, optional sanitized title toggle
      const ctrls = el('div', null, 'flow16-hooks-controls');

      const scopeWrap = el('label', null, 'v12-field');
      scopeWrap.htmlFor = 'setup16HookScope';
      scopeWrap.append(el('span', tr('flow16.hookScopeLabel')));
      const scopeSel = el('select');
      scopeSel.id = 'setup16HookScope';
      for (const [val, key] of [['project', 'flow16.hookScopeProject'], ['global', 'flow16.hookScopeGlobal']]) {
        const o = el('option', tr(key));
        o.value = val;
        scopeSel.append(o);
      }
      scopeSel.value = hookState.scope;
      scopeSel.addEventListener('change', () => {
        hookState.scope = scopeSel.value;
        clearHookPreview();
        hookState.notice = { text: '', kind: '' };
        render();
      });
      scopeWrap.append(scopeSel);
      ctrls.append(scopeWrap);

      const folderWrap = el('label', null, 'v12-field');
      folderWrap.htmlFor = 'setup16HookFolder';
      folderWrap.append(el('span', tr('flow16.hookFolderLabel')));
      const folderRow = el('div', null, 'setup15-input-row');
      const fInp = el('input');
      fInp.type = 'text';
      fInp.id = 'setup16HookFolder';
      fInp.value = hookState.scope === 'project' ? effectiveHookFolder() : '';
      fInp.disabled = hookState.scope === 'global';
      fInp.placeholder = tr(hookState.scope === 'global' ? 'flow16.hookFolderGlobalPlaceholder' : 'flow16.hookFolderPlaceholder');
      fInp.addEventListener('input', () => {
        hookState.folder = fInp.value;
        hookState.folderTouched = true;
        clearHookPreview();
      });
      folderRow.append(fInp);
      if (window.officeDesktop?.pickFolder && hookState.scope === 'project') {
        folderRow.append(btn(tr('setup15.btnPickFolder'), async () => {
          const picked = await pickNativeFolder('flow16.hookFolderLabel', effectiveHookFolder());
          if (picked) {
            hookState.folder = picked;
            hookState.folderTouched = true;
            clearHookPreview();
            render();
          }
        }));
      }
      folderWrap.append(folderRow);
      ctrls.append(folderWrap);

      const titleLabel = el('label', null, 'setup15-dismiss-label');
      const titleChk = el('input');
      titleChk.type = 'checkbox';
      titleChk.id = 'setup16HookSendTitle';
      titleChk.checked = Boolean(hookState.sendPromptText);
      titleChk.addEventListener('change', () => {
        hookState.sendPromptText = titleChk.checked;
        clearHookPreview();
        render();
      });
      titleLabel.append(titleChk, el('span', tr('flow16.hookSendTitleLabel')));
      ctrls.append(titleLabel);
      sec.append(ctrls);

      // Scope explanation & risk notice
      const scopeHint = el('div', tr(hookState.scope === 'global' ? 'flow16.hookScopeGlobalRisk' : 'flow16.hookScopeProjectRisk'), ['v12-notice', hookState.scope === 'global' ? 'warn' : '']);
      scopeHint.id = 'setup16HookScopeRisk';
      sec.append(scopeHint);

      if (hookState.notice.text) {
        const n = el('div', hookState.notice.text, ['v12-notice', hookState.notice.kind || '']);
        n.id = 'setup16HookNotice';
        n.setAttribute('role', 'status');
        sec.append(n);
      }

      // Provider cards: Claude Code & Codex
      const cards = el('div', null, 'flow16-hooks-cards');
      for (const provider of ['claude', 'codex']) {
        const info = hookState.providers[provider];
        const card = el('div', null, 'flow16-hook-card');
        card.id = 'setup16HookCard-' + provider;

        const cHead = el('div', null, 'flow16-hook-card-head');
        cHead.append(el('strong', tr('flow16.hookProvider.' + provider)));
        const pillKind = info.status === 'installed' ? 'pos' : info.status === 'broken' ? 'neg' : '';
        const pill = el('span', tr('flow16.hookStatus.' + info.status), ['v12-pill', pillKind]);
        pill.id = 'setup16HookStatus-' + provider;
        cHead.append(pill);
        card.append(cHead);

        card.append(el('p', tr('flow16.hookTargetHint.' + provider), 'v12-muted'));
        if (info.target) {
          card.append(el('p', info.target, 'flow16-hook-target'));
        }
        if (info.backup) {
          card.append(el('p', tr('flow16.hookBackupSaved', { file: info.backup }), 'v12-muted'));
        }

        const btnRow = el('div', null, 'v12-btn-row');
        const checkBtn = btn(tr('flow16.hookBtnCheck'), () => checkHookStatus(provider));
        checkBtn.id = 'setup16HookCheck-' + provider;
        checkBtn.disabled = hookState.busy || isLocalDemo();

        const prevBtn = btn(tr('flow16.hookBtnPreview'), () => previewHook(provider));
        prevBtn.id = 'setup16HookPreview-' + provider;
        prevBtn.disabled = hookState.busy || isLocalDemo();

        const hasMatchingPreview = Boolean(hookState.preview && hookState.preview.provider === provider && hookState.preview.previewId);
        const installBtn = btn(tr('flow16.hookBtnInstall'), async () => {
          if (hasMatchingPreview && hookState.preview.changed) {
            hookState.confirming = { action: 'install', provider };
            render();
          } else {
            const pv = await previewHook(provider, 'install');
            if (pv && !pv.changed) {
              hookState.confirming = null;
              hookState.notice = { text: tr('flow16.hookAlreadyInstalled'), kind: 'ok' };
              render();
            }
          }
        }, ['v12-btn-compact', 'v12-btn-primary']);
        installBtn.id = 'setup16HookInstall-' + provider;
        installBtn.disabled = hookState.busy || isLocalDemo() || info.status === 'broken';

        const uninstallBtn = btn(tr('flow16.hookBtnUninstall'), async () => {
          if (hasMatchingPreview) {
            hookState.confirming = { action: 'uninstall', provider };
            render();
          } else {
            await previewHook(provider, 'uninstall');
          }
        }, ['v12-btn-compact', 'v12-btn-danger']);
        uninstallBtn.id = 'setup16HookUninstall-' + provider;
        uninstallBtn.disabled = hookState.busy || isLocalDemo() || (info.status !== 'installed' && info.status !== 'broken');

        btnRow.append(checkBtn, prevBtn, installBtn, uninstallBtn);
        card.append(btnRow);
        cards.append(card);
      }
      sec.append(cards);

      // Exact JSON Preview box
      if (hookState.preview) {
        const pv = hookState.preview;
        const pBox = el('div', null, 'flow16-hook-preview');
        pBox.id = 'setup16HookPreviewBox';

        const pHead = el('div', null, 'flow16-hook-preview-head');
        pHead.append(
          el('strong', tr('flow16.hookPreviewTitle', { provider: tr('flow16.hookProvider.' + pv.provider) })),
          el('span', tr(pv.backupRequired ? 'flow16.hookBackupWillCreate' : 'flow16.hookBackupNewFile'), ['v12-pill', pv.backupRequired ? 'warn' : ''])
        );
        pBox.append(pHead);
        if (pv.target) pBox.append(el('p', pv.target, 'flow16-hook-target'));

        if (pv.writes.length > 0) {
          for (const w of pv.writes) {
            const pre = el('pre', w.content || '');
            pre.id = 'setup16HookPreviewCode';
            pBox.append(pre);
          }
        } else {
          pBox.append(el('p', tr('flow16.hookAlreadyInstalled'), 'v12-muted'));
        }
        sec.append(pBox);
      }

      // Explicit Confirmation Box (Install / Uninstall)
      if (hookState.confirming) {
        const { action, provider } = hookState.confirming;
        const cBox = el('div', null, 'flow16-hook-confirm');
        cBox.id = 'setup16HookConfirmBox';
        cBox.setAttribute('role', 'alert');
        cBox.append(el('p', tr(action === 'uninstall' ? 'flow16.hookConfirmUninstallText' : 'flow16.hookConfirmInstallText', {
          provider: tr('flow16.hookProvider.' + provider),
          target: hookState.preview?.target || hookState.providers[provider]?.target || ''
        })));
        const row = el('div', null, 'v12-btn-row');
        const cancelBtn = btn(tr('strings.batal'), () => {
          hookState.confirming = null;
          render();
        });
        cancelBtn.id = 'setup16HookConfirmCancel';
        const okBtn = btn(tr(action === 'uninstall' ? 'flow16.hookConfirmUninstallBtn' : 'flow16.hookConfirmInstallBtn'), () => executeHookAction(action, provider), ['v12-btn-compact', action === 'uninstall' ? 'v12-btn-danger' : 'v12-btn-primary']);
        okBtn.id = 'setup16HookConfirmOk';
        okBtn.disabled = hookState.busy;
        row.append(cancelBtn, okBtn);
        cBox.append(row);
        sec.append(cBox);
      }

      return sec;
    }

    function el(tag, text, cls) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (Array.isArray(cls)) {
        for (const c of cls) if (c) node.classList.add(c);
      } else if (cls) {
        node.classList.add(cls);
      }
      return node;
    }

    function btn(label, onClick, cls = ['v12-btn-compact']) {
      const b = el('button', label, cls);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }

    async function req(method, url, body) {
      const headers = { 'X-Office-Token': getToken() };
      const init = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(url, init);
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const err = new Error(data?.error || data?.message || ('HTTP:' + res.status));
        err.code = data?.code || data?.error || ('HTTP:' + res.status);
        err.status = res.status;
        throw err;
      }
      return data;
    }

    async function pickNativeFolder(titleKey, defaultPath) {
      if (!window.officeDesktop?.pickFolder) return null;
      try {
        const res = await window.officeDesktop.pickFolder({
          title: tr(titleKey),
          defaultPath: defaultPath || ''
        });
        if (res && !res.canceled && res.path) return res.path;
      } catch {}
      return null;
    }

    async function fetchStatus(forceRefresh = false) {
      if (isLocalDemo()) return null;
      const url = forceRefresh ? '/setup/status?refresh=1' : '/setup/status';
      const data = await req('GET', url).catch(() => null);
      if (data && data.ok) statusData = data;
      return statusData;
    }

    async function applySetup(patch, showSaved = true) {
      if (busy || isLocalDemo()) return;
      busy = true;
      notice = { text: '', kind: '' };
      render();
      try {
        const next = await req('POST', '/setup/apply', patch);
        if (next && next.ok) statusData = next;
        if (showSaved) notice = { text: tr('setup15.savedOk'), kind: 'ok' };
        onConfigChanged?.(statusData);
      } catch (err) {
        notice = { text: err.message, kind: 'error' };
      } finally {
        busy = false;
        render();
      }
    }

    async function runQuickAgentTest() {
      if (testState.running || isLocalDemo()) return;
      const agents = statusData?.agents?.list || [];
      const target =
        agents.find(a => a.id !== 'gemini-api' && a.installed && a.status === 'ready') ||
        agents.find(a => a.id === 'gemini-api' && a.status === 'ready') ||
        agents[0];
      if (!target) return;
      testState = { running: true, text: tr('setup15.row2Testing'), ok: null };
      render();
      try {
        const res = await req('POST', '/prompt/test', { agentId: target.id });
        if (res?.ok) {
          testState = {
            running: false,
            ok: true,
            text: tr('setup15.row2TestOk', {
              agent: target.name,
              ms: res.latencyMs || 0,
              snippet: res.snippet || 'OK'
            })
          };
        } else {
          testState = {
            running: false,
            ok: false,
            text: tr('setup15.row2TestFail', {
              agent: target.name,
              reason: res?.error || res?.snippet || res?.status || 'Error'
            })
          };
        }
      } catch (err) {
        testState = {
          running: false,
          ok: false,
          text: tr('setup15.row2TestFail', { agent: target.name, reason: err.message })
        };
      }
      render();
    }

    function sourceLabel(src) {
      if (src === 'saved') return tr('setup15.sourceSaved');
      if (src === 'env') return tr('setup15.sourceEnv');
      return tr('setup15.sourceAuto');
    }

    function makeMetaBlock(whatKey, howKey, expectedKey, guideKey) {
      const list = el('div', null, 'setup15-meta');
      const items = [
        [tr('setup15.lblWhatFor'), tr(whatKey)],
        [tr('setup15.lblHowTo'), tr(howKey)],
        [tr('setup15.lblExpected'), tr(expectedKey)],
        [tr('setup15.lblGuide'), tr(guideKey)]
      ];
      for (const [k, v] of items) {
        const p = el('p', null, 'setup15-meta-line');
        p.append(el('strong', k + ' '), el('span', v));
        list.append(p);
      }
      return list;
    }

    function makeRowShell(id, titleKey, badgeText, badgeKind, statusText, actionEl) {
      const card = el('section', null, ['v12-section', 'setup15-row']);
      card.id = id;
      const head = el('div', null, 'setup15-row-head');
      const titleWrap = el('div', null, 'setup15-row-title');
      const pill = el('span', badgeText, ['v12-pill', badgeKind]);
      titleWrap.append(el('h3', tr(titleKey)), pill);
      const right = el('div', null, 'setup15-row-right');
      if (actionEl) right.append(actionEl);
      head.append(titleWrap, right);
      card.append(head);
      if (statusText) card.append(el('p', statusText, 'setup15-row-status'));
      return card;
    }

    function render() {
      if (!active) return;
      const content = $('panelContent');
      if (!content) return;
      content.replaceChildren();
      content.classList.remove('quality-panel', 'short14-panel', 'yt14-panel');
      content.classList.add('v12-panel', 'setup15-panel');

      const st = statusData;
      const top = el('section', null, 'setup15-hero');
      const topText = el('div');
      topText.append(el('p', tr('setup15.subtitle'), 'v12-muted'));
      const topRight = el('div', null, 'v12-btn-row');
      if (st) {
        const prog = el('span', tr('setup15.progress', { ready: st.readyCount || 0, total: st.totalItems || 6 }), ['v12-pill', 'pos']);
        prog.id = 'setup15ProgressPill';
        topRight.append(prog);
      }
      if (!isLocalDemo()) {
        const rescan = btn(tr('setup15.btnRescan'), async () => {
          busy = true;
          render();
          try {
            const d = await req('POST', '/setup/discover', {});
            if (d?.ok) statusData = d;
          } catch (e) {
            notice = { text: e.message, kind: 'error' };
          } finally {
            busy = false;
            render();
          }
        });
        rescan.id = 'setup15RescanBtn';
        rescan.disabled = busy;
        topRight.append(rescan);
      }
      top.append(topText, topRight);
      content.append(top);

      if (notice.text) {
        const n = el('div', notice.text, ['v12-notice', notice.kind || '']);
        n.setAttribute('role', 'status');
        content.append(n);
      }

      if (isLocalDemo()) {
        const demoBox = el('section', null, ['v12-section', 'setup15-next']);
        demoBox.append(el('p', tr('setup15.demoNotice')));
        content.append(demoBox);
      }

      // Dynamic Recommended Next Step
      if (st?.recommendedNextStep) {
        const ns = st.recommendedNextStep;
        const nextBox = el('section', null, ['v12-section', 'setup15-next']);
        nextBox.id = 'setup15NextStep';
        const nextTextWrap = el('div');
        nextTextWrap.append(el('span', tr('setup15.nextStepLabel'), 'setup15-eyebrow'));
        let msg = tr('setup15.nextConfigureStart');
        let cta = null;
        if (ns.code === 'create_first_short') {
          msg = tr('setup15.nextCreateShort', { channel: ns.channel || 'channel' });
          cta = btn(tr('setup15.nextCreateShortBtn'), () => {
            $('panel')?.close();
            onOpenShorts?.();
          }, ['v12-btn-compact', 'v12-btn-primary']);
        } else if (ns.code === 'try_prompt_or_project') {
          msg = tr('setup15.nextTryPrompt');
          cta = btn(tr('setup15.nextTryPromptBtn'), () => {
            $('panel')?.close();
            onOpenPrompt?.();
          }, ['v12-btn-compact', 'v12-btn-primary']);
        } else if (ns.code === 'pick_discovered_project') {
          msg = tr('setup15.nextPickProject');
        }
        nextTextWrap.append(el('p', msg, 'setup15-next-msg'));
        nextBox.append(nextTextWrap);
        if (cta) nextBox.append(cta);
        content.append(nextBox);
      }

      // One-time Full Access risk explanation
      if (!st?.setupState?.fullAccessAck) {
        const risk = el('section', null, ['v12-notice', 'warn', 'setup15-risk']);
        risk.id = 'setup15FullAccessNotice';
        const rText = el('div');
        rText.append(el('strong', tr('setup15.fullAccessTitle')), el('p', tr('setup15.fullAccessBody')));
        const ackBtn = btn(tr('setup15.fullAccessAckBtn'), () => applySetup({ fullAccessAck: true }, false));
        ackBtn.id = 'setup15AckRiskBtn';
        ackBtn.disabled = busy || isLocalDemo();
        risk.append(rText, ackBtn);
        content.append(risk);
      }

      const list = el('div', null, 'setup15-grid');

      // === 1. Local Project Folder ===
      const proj = st?.project || { ready: false, savedDir: '', effectiveDir: '', displayPath: '', source: 'none', needsConfirmation: false, channelsCount: 0, candidates: [] };
      const r1Badge = proj.ready ? tr('setup15.badgeReady') : proj.needsConfirmation ? tr('setup15.badgeChoose') : tr('setup15.badgeNeeded');
      const r1Kind = proj.ready ? 'pos' : proj.needsConfirmation ? 'warn' : '';
      const r1Status = proj.ready
        ? tr('setup15.row1StatusReady', { count: proj.channelsCount, source: sourceLabel(proj.source) }) + (proj.displayPath ? ' · ' + proj.displayPath : '')
        : proj.needsConfirmation
          ? tr('setup15.row1StatusAmbiguous', { count: proj.candidates.length })
          : tr('setup15.row1StatusMissing');
      const r1Action = btn(tr('setup15.row1Action'), () => { $('panel')?.close(); onOpenShorts?.(); });
      const row1 = makeRowShell('setup15RowProject', 'setup15.row1Title', r1Badge, r1Kind, r1Status, r1Action);
      row1.append(makeMetaBlock('setup15.row1WhatFor', 'setup15.row1HowTo', 'setup15.row1Expected', 'setup15.row1Guide'));

      const pInputRow = el('div', null, 'setup15-input-row');
      const pInput = el('input');
      pInput.type = 'text';
      pInput.id = 'setup15ProjectInput';
      pInput.value = proj.savedDir || proj.effectiveDir || '';
      pInput.placeholder = tr('setup15.row1Placeholder');
      pInputRow.append(pInput);
      if (window.officeDesktop?.pickFolder) {
        pInputRow.append(btn(tr('setup15.btnPickFolder'), async () => {
          const picked = await pickNativeFolder('setup15.row1Title', pInput.value);
          if (picked) {
            pInput.value = picked;
            await applySetup({ localProjectDir: picked });
          }
        }));
      }
      const pSave = btn(tr('setup15.btnSave'), () => applySetup({ localProjectDir: pInput.value.trim() }), ['v12-btn-compact', 'v12-btn-primary']);
      pSave.id = 'setup15ProjectSaveBtn';
      pSave.disabled = busy || isLocalDemo();
      pInputRow.append(pSave);
      row1.append(pInputRow);

      if (Array.isArray(proj.candidates) && proj.candidates.length > 0) {
        const cWrap = el('div', null, 'setup15-candidates');
        cWrap.append(el('small', tr(proj.needsConfirmation ? 'setup15.ambiguousHint' : 'setup15.candidatesHint'), 'v12-muted'));
        const cRow = el('div', null, 'setup15-cand-list');
        for (const cand of proj.candidates) {
          const label = `${cand.name} (${cand.channelsCount}) — ${cand.displayPath}`;
          const cb = btn(label, () => applySetup({ localProjectDir: cand.path }));
          cb.disabled = busy || isLocalDemo();
          cRow.append(cb);
        }
        cWrap.append(cRow);
        row1.append(cWrap);
      }
      list.append(row1);

      // === 2. Installed AI CLI Agents ===
      const ag = st?.agents || { ready: false, readyCount: 0, totalCli: 5, list: [] };
      const r2Badge = ag.ready ? tr('setup15.badgeReady') : tr('setup15.badgeOptional');
      const r2Kind = ag.ready ? 'pos' : '';
      const r2Status = ag.ready
        ? tr('setup15.row2StatusReady', { ready: ag.readyCount, total: ag.totalCli })
        : tr('setup15.row2StatusNone');
      const r2Actions = el('div', null, 'v12-btn-row');
      const testBtn = btn(testState.running ? tr('setup15.row2Testing') : tr('setup15.row2TestBtn'), () => runQuickAgentTest(), ['v12-btn-compact', 'v12-btn-primary']);
      testBtn.id = 'setup15TestAgentBtn';
      testBtn.disabled = testState.running || isLocalDemo() || !(ag.list || []).some(a => a.status === 'ready');
      r2Actions.append(testBtn, btn(tr('setup15.row2Action'), () => { $('panel')?.close(); onOpenPrompt?.(); }));
      const row2 = makeRowShell('setup15RowAgents', 'setup15.row2Title', r2Badge, r2Kind, r2Status, r2Actions);
      row2.append(makeMetaBlock('setup15.row2WhatFor', 'setup15.row2HowTo', 'setup15.row2Expected', 'setup15.row2Guide'));
      if (Array.isArray(ag.list) && ag.list.length > 0) {
        const pills = el('div', null, 'setup15-agent-pills');
        for (const a of ag.list) {
          if (a.id === 'gemini-api') continue;
          const kind = a.status === 'ready' ? 'pos' : a.status === 'service_offline' ? 'warn' : '';
          pills.append(el('span', `${a.name}: ${a.status}`, ['v12-pill', kind]));
        }
        row2.append(pills);
      }
      if (testState.text) {
        row2.append(el('p', testState.text, ['v12-notice', testState.ok === true ? 'ok' : testState.ok === false ? 'error' : '']));
      }
      list.append(row2);

      // === 3. Gemini API Key (Optional) ===
      const gem = st?.gemini || { ready: false, hasKey: false, keyHint: '', model: 'gemini-2.5-flash' };
      const r3Badge = gem.hasKey ? tr('setup15.badgeReady') : tr('setup15.badgeOptional');
      const r3Kind = gem.hasKey ? 'pos' : '';
      const r3Status = gem.hasKey
        ? tr('setup15.row3StatusReady', { hint: gem.keyHint, model: gem.model })
        : tr('setup15.row3StatusMissing');
      const row3 = makeRowShell('setup15RowGemini', 'setup15.row3Title', r3Badge, r3Kind, r3Status, null);
      row3.append(makeMetaBlock('setup15.row3WhatFor', 'setup15.row3HowTo', 'setup15.row3Expected', 'setup15.row3Guide'));
      const gRow = el('div', null, 'setup15-input-row');
      const gInput = el('input');
      gInput.type = 'password';
      gInput.id = 'setup15GeminiKeyInput';
      gInput.autocomplete = 'off';
      gInput.placeholder = tr('setup15.row3Placeholder');
      const gSave = btn(tr('setup15.row3SaveKey'), () => {
        const val = gInput.value.trim();
        if (!val) return;
        gInput.value = '';
        void applySetup({ geminiApiKey: val });
      }, ['v12-btn-compact', 'v12-btn-primary']);
      gSave.id = 'setup15GeminiSaveBtn';
      gSave.disabled = busy || isLocalDemo();
      gRow.append(gInput, gSave);
      if (gem.hasKey) {
        const gClear = btn(tr('setup15.row3ClearKey'), () => applySetup({ clearGeminiKey: true }), ['v12-btn-compact', 'v12-btn-danger']);
        gClear.disabled = busy || isLocalDemo();
        gRow.append(gClear);
      }
      row3.append(gRow);
      list.append(row3);

      // === 4. YouTube Dashboard ===
      const dash = st?.dashboard || { ready: false, savedDir: '', effectiveDir: '', displayPath: '', running: false, serverAvailable: false, connectedChannels: 0, totalChannels: 0, candidates: [], repoUrl: '' };
      const r4Badge = dash.running ? tr('setup15.badgeReady') : dash.serverAvailable ? tr('setup15.badgeReady') : tr('setup15.badgeOptional');
      const r4Kind = dash.running || dash.serverAvailable ? 'pos' : '';
      const r4Status = dash.running
        ? tr('setup15.row4StatusRunning', { connected: dash.connectedChannels || 0, total: dash.totalChannels || 0 })
        : dash.serverAvailable
          ? tr('setup15.row4StatusAvailable') + (dash.displayPath ? ' · ' + dash.displayPath : '')
          : tr('setup15.row4StatusMissing');
      const r4Action = btn(tr('setup15.row4Action'), () => { $('panel')?.close(); onOpenYoutube?.(); });
      const row4 = makeRowShell('setup15RowDashboard', 'setup15.row4Title', r4Badge, r4Kind, r4Status, r4Action);
      row4.append(makeMetaBlock('setup15.row4WhatFor', 'setup15.row4HowTo', 'setup15.row4Expected', 'setup15.row4Guide'));
      const dRow = el('div', null, 'setup15-input-row');
      const dInput = el('input');
      dInput.type = 'text';
      dInput.id = 'setup15DashboardInput';
      dInput.value = dash.savedDir || dash.effectiveDir || '';
      dInput.placeholder = tr('setup15.row4Placeholder');
      dRow.append(dInput);
      if (window.officeDesktop?.pickFolder) {
        dRow.append(btn(tr('setup15.btnPickFolder'), async () => {
          const picked = await pickNativeFolder('setup15.row4Title', dInput.value);
          if (picked) {
            dInput.value = picked;
            await applySetup({ dashboardDir: picked });
          }
        }));
      }
      const dSave = btn(tr('setup15.btnSave'), () => applySetup({ dashboardDir: dInput.value.trim() }), ['v12-btn-compact', 'v12-btn-primary']);
      dSave.id = 'setup15DashboardSaveBtn';
      dSave.disabled = busy || isLocalDemo();
      dRow.append(dSave);
      row4.append(dRow);
      if (Array.isArray(dash.candidates) && dash.candidates.length > 0 && !dash.savedDir) {
        const dcRow = el('div', null, 'setup15-cand-list');
        for (const cand of dash.candidates) {
          const cb = btn(`${cand.name} — ${cand.displayPath}`, () => applySetup({ dashboardDir: cand.path }));
          cb.disabled = busy || isLocalDemo();
          dcRow.append(cb);
        }
        row4.append(dcRow);
      }
      list.append(row4);

      // === 5. MT5 Read-Only (Optional) ===
      const mt5 = st?.mt5 || { connected: false, enabled: false };
      const r5Badge = mt5.connected ? tr('setup15.badgeReady') : tr('setup15.badgeOptional');
      const r5Status = mt5.connected ? tr('setup15.row5StatusConnected') : tr('setup15.row5StatusStandby');
      const r5Action = btn(tr('setup15.row5Action'), () => { $('panel')?.close(); onOpenFinance?.(); });
      const row5 = makeRowShell('setup15RowMt5', 'setup15.row5Title', r5Badge, mt5.connected ? 'pos' : '', r5Status, r5Action);
      row5.append(makeMetaBlock('setup15.row5WhatFor', 'setup15.row5HowTo', 'setup15.row5Expected', 'setup15.row5Guide'));
      // [Diubah oleh Codex - 2026-11-21] V17 detection and explicit opt-out.
      const detection = mt5.detection || {};
      const diag = el('p', tr('mt5v17.detection', {
        python: tr(detection.python ? 'mt5v17.yes' : 'mt5v17.no'),
        module: tr(detection.module ? 'mt5v17.yes' : 'mt5v17.no'),
        terminal: tr(detection.terminal ? 'mt5v17.yes' : 'mt5v17.no'),
        account: tr(mt5.connected ? 'mt5v17.yes' : 'mt5v17.no'),
        sync: tr(mt5.enabled ? 'mt5v17.yes' : 'mt5v17.no')
      }), 'v12-muted');
      diag.id = 'v17SetupDetection';
      row5.append(diag);
      const syncRow = el('label', null, 'v12-check-row');
      syncRow.append(el('span', tr('mt5v17.autoSync')));
      const syncInput = el('input');
      syncInput.id = 'v17SetupAutoSync'; syncInput.type = 'checkbox';
      syncInput.checked = Boolean(mt5.enabled); syncInput.disabled = busy || isLocalDemo();
      syncInput.onchange = async () => {
        syncInput.disabled = true;
        try { await req('POST', '/mt5/config', { enabled: syncInput.checked }); await fetchStatus(); render(); }
        catch { syncInput.checked = !syncInput.checked; syncInput.disabled = false; }
      };
      syncRow.append(syncInput); row5.append(syncRow);
      const testMt5 = btn(tr('mt5v17.testNow'), async () => {
        testMt5.disabled = true;
        try { await req('POST', '/mt5/test', {}); await fetchStatus(); render(); }
        finally { testMt5.disabled = false; }
      });
      testMt5.id = 'v17SetupTestMt5'; testMt5.disabled = busy || isLocalDemo();
      row5.append(testMt5);
      list.append(row5);

      // === 6. Language, Currency & Theme ===
      const curSet = window.OfficeSettings?.get?.() || { language: 'auto', currency: 'auto', appearance: { theme: 'system' } };
      const r6Action = btn(tr('setup15.row6Action'), () => { $('panel')?.close(); onOpenSettings?.(); });
      const row6 = makeRowShell('setup15RowPrefs', 'setup15.row6Title', tr('setup15.badgeReady'), 'pos', '', r6Action);
      row6.append(makeMetaBlock('setup15.row6WhatFor', 'setup15.row6HowTo', 'setup15.row6Expected', 'setup15.row6Guide'));
      const prefGrid = el('div', null, 'setup15-pref-grid');
      const makeSel = (id, labelKey, options, current, onChange) => {
        const wrap = el('label', null, 'v12-field');
        wrap.append(el('span', tr(labelKey)));
        const sel = el('select');
        sel.id = id;
        for (const [val, txt] of options) {
          const o = el('option', txt);
          o.value = val;
          sel.append(o);
        }
        sel.value = current;
        sel.addEventListener('change', () => onChange(sel.value));
        wrap.append(sel);
        return wrap;
      };
      const locales = (window.I18n?.locales || []).map(l => [l.code, l.name]);
      prefGrid.append(
        makeSel('setup15LangSelect', 'setup15.lblLanguage', [['auto', tr('strings.otomatis_ikuti_sistem')], ...locales], curSet.language, val => {
          const next = window.OfficeSettings.get();
          next.language = val;
          window.OfficeSettings.set(next);
        }),
        makeSel('setup15CurSelect', 'setup15.lblCurrency', [['auto', tr('strings.otomatis_ikuti_bahasa')], ['IDR', 'IDR'], ['USD', 'USD'], ['EUR', 'EUR'], ['JPY', 'JPY'], ['CNY', 'CNY']], curSet.currency, val => {
          const next = window.OfficeSettings.get();
          next.currency = val;
          window.OfficeSettings.set(next);
        }),
        makeSel('setup15ThemeSelect', 'setup15.lblTheme', [['system', tr('strings.ikuti_sistem')], ['light', tr('strings.terang')], ['dark', tr('strings.gelap')]], curSet.appearance?.theme || 'system', val => {
          const next = window.OfficeSettings.get();
          next.appearance.theme = val;
          window.OfficeSettings.set(next);
        })
      );
      row6.append(prefGrid);
      list.append(row6);

      content.append(list);

      // V16-B [Diubah oleh Gemini - 2026-11-21] Bagian "Hook Office AI" penuh (di luar .setup15-grid agar jumlah 6 kartu checklist V15 tetap utuh)
      content.append(renderHooksSection());

      // Footer: dismiss / quit confirmation toggle / enter office
      const foot = el('div', null, 'setup15-footer');
      const footChecks = el('div', null, 'setup15-footer-checks');
      const chkLabel = el('label', null, 'setup15-dismiss-label');
      const chk = el('input');
      chk.type = 'checkbox';
      chk.id = 'setup15DontShowChk';
      chk.checked = Boolean(st?.setupState?.dismissed);
      chkLabel.append(chk, el('span', tr('setup15.dontShowAgain')));

      const quitLabel = el('label', null, 'setup15-dismiss-label');
      const quitChk = el('input');
      quitChk.type = 'checkbox';
      quitChk.id = 'setup15QuitConfirmChk';
      quitChk.checked = !st?.setupState?.skipQuitConfirm;
      quitChk.addEventListener('change', () => {
        if (!isLocalDemo()) {
          void req('POST', '/setup/state', { skipQuitConfirm: !quitChk.checked }).catch(() => {});
        }
      });
      quitLabel.append(quitChk, el('span', tr('setup15.quitConfirmSetting')));
      footChecks.append(chkLabel, quitLabel);

      const doneBtn = btn(tr('setup15.btnFinish'), async () => {
        if (!isLocalDemo()) {
          const shouldDismiss = chk.checked || Boolean(st?.project?.ready || st?.agents?.ready || st?.gemini?.hasKey);
          await req('POST', '/setup/state', {
            dismissed: shouldDismiss,
            completed: Boolean(st?.project?.ready || st?.agents?.ready || st?.gemini?.hasKey),
            skipQuitConfirm: !quitChk.checked
          }).catch(() => {});
          try {
            if (shouldDismiss) localStorage.setItem('office-v15-setup-dismissed', '1');
          } catch {}
        }
        $('panel')?.close();
      }, ['v12-btn-compact', 'v12-btn-primary']);
      doneBtn.id = 'setup15FinishBtn';

      foot.append(footChecks, doneBtn);
      content.append(foot);
    }

    async function openSetup({ forceRefresh = false } = {}) {
      before?.();
      const g = ++generation;
      active = true;
      notice = { text: '', kind: '' };
      openDialogFn?.(tr('setup15.title'));
      $('panel')?.classList.add('setup15-dialog');
      render();
      if (!isLocalDemo()) {
        await fetchStatus(forceRefresh);
        if (g === generation && active && $('panel')?.open) render();
      }
      if (window.__officeScrollToHooks) {
        window.__officeScrollToHooks = false;
        requestAnimationFrame(() => {
          const sec = $('setup16HooksSection');
          sec?.scrollIntoView({ behavior: 'auto', block: 'start' });
          $('setup16HookScope')?.focus?.({ preventScroll: true });
        });
      }
    }

    function close() {
      generation++;
      active = false;
      $('panel')?.classList.remove('setup15-dialog');
      $('panelContent')?.classList.remove('setup15-panel');
    }

    async function maybeAutoOpen() {
      if (isLocalDemo()) return false;
      const params = new URLSearchParams(location.search);
      if (params.get('qa') === '1' || params.get('demo') === '1') return false;
      if (params.get('setup') === '1') {
        await openSetup();
        return true;
      }
      try {
        if (localStorage.getItem('office-v15-setup-dismissed') === '1') return false;
      } catch {}
      const data = await fetchStatus(false);
      if (!data?.ok) return false;
      onConfigChanged?.(data);
      if (!data.setupState?.dismissed && !data.setupState?.completed) {
        await openSetup();
        return true;
      }
      return false;
    }

    $('panel')?.addEventListener('close', () => {
      if (active) close();
    });

    window.I18n?.subscribe?.(() => {
      if (active && $('panel')?.open) {
        if ($('panelTitle')) $('panelTitle').textContent = tr('setup15.title');
        render();
      }
    });

    // [Diubah oleh Codex - 2026-11-21] Update just the MT5 row from SSE; preserve other Setup edits.
    function handleMt5State(state) {
      if (!state || isLocalDemo()) return;
      const mt5 = { connected: Boolean(state.connected), enabled: Boolean(state.config?.enabled),
        status: state.status, reason: state.reason, detection: state.detection || {} };
      if (statusData) statusData.mt5 = { ...(statusData.mt5 || {}), ...mt5 };
      if (!active) return;
      const detection = mt5.detection;
      const diag = $('v17SetupDetection');
      if (diag) diag.textContent = tr('mt5v17.detection', {
        python: tr(detection.python ? 'mt5v17.yes' : 'mt5v17.no'),
        module: tr(detection.module ? 'mt5v17.yes' : 'mt5v17.no'),
        terminal: tr(detection.terminal ? 'mt5v17.yes' : 'mt5v17.no'),
        account: tr(mt5.connected ? 'mt5v17.yes' : 'mt5v17.no'),
        sync: tr(mt5.enabled ? 'mt5v17.yes' : 'mt5v17.no')
      });
      const check = $('v17SetupAutoSync'); if (check) check.checked = mt5.enabled;
      const row = $('setup15RowMt5');
      const pill = row?.querySelector('.v12-pill');
      if (pill) { pill.textContent = tr(mt5.connected ? 'setup15.badgeReady' : 'setup15.badgeOptional'); pill.classList.toggle('pos', mt5.connected); }
      const status = row?.querySelector('.setup15-row-status');
      if (status) status.textContent = tr(mt5.connected ? 'setup15.row5StatusConnected' : 'setup15.row5StatusStandby');
    }

    return {
      handleMt5State,
      open: openSetup,
      openSetup,
      close,
      fetchStatus,
      maybeAutoOpen,
      getState: () => statusData,
      get active() { return active; }
    };
  }
};
