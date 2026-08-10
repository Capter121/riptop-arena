import { deriveWebSocketUrl } from '../network/networkClient';
import { loadOnlineIdentity, normalizeOnlineDisplayName, saveOnlineGuestName } from '../network/onlineIdentity';

type LanModalCallbacks = {
  onRandom: (url: string, displayName: string) => void;
  onCreate: (url: string, displayName: string) => void;
  onJoin: (url: string, displayName: string, roomToken: string) => void;
  onCancel: () => void;
};

export class LanModal {
  readonly root = document.createElement('div');
  readonly dialog = document.createElement('div');
  readonly closeBtn = document.createElement('button');
  readonly matchBtn = document.createElement('button');
  readonly createBtn = document.createElement('button');
  readonly joinBtn = document.createElement('button');
  readonly cancelBtn = document.createElement('button');
  readonly copyBtn = document.createElement('button');
  readonly nameInput = document.createElement('input');
  readonly urlInput = document.createElement('input');
  readonly shareInput = document.createElement('input');
  readonly shareGroup = document.createElement('div');
  readonly statusBadge = document.createElement('div');
  readonly instructions = document.createElement('div');

  private callbacks?: LanModalCallbacks;
  private roomToken = '';
  private busy = false;
  private identityLocked = false;

  constructor() {
    this.root.className = 'modal-overlay lan-modal-overlay';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(5, 8, 18, 0.88)',
      backdropFilter: 'blur(10px)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '99999',
    });

    this.dialog.className = 'modal-card lan-modal-card';
    Object.assign(this.dialog.style, {
      position: 'relative',
      width: '90%',
      maxWidth: '560px',
      maxHeight: '92vh',
      overflowY: 'auto',
      boxSizing: 'border-box',
      background: 'linear-gradient(135deg, rgba(16, 24, 42, 0.98), rgba(28, 14, 36, 0.98))',
      border: '2px solid rgba(0, 240, 255, 0.8)',
      borderRadius: '20px',
      padding: '28px 32px',
      boxShadow: '0 0 40px rgba(0, 240, 255, 0.4), inset 0 0 20px rgba(0, 240, 255, 0.1)',
      color: '#ffffff',
      fontFamily: "'Space Grotesk', 'Microsoft YaHei', sans-serif",
    });

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';

    const title = document.createElement('h2');
    title.textContent = '🌐 真人联机对战';
    title.style.margin = '0';
    title.style.fontSize = '22px';
    title.style.color = '#00f0ff';
    title.style.textShadow = '0 0 10px rgba(0, 240, 255, 0.7)';

    this.closeBtn.textContent = '✕';
    Object.assign(this.closeBtn.style, {
      background: 'none',
      border: 'none',
      color: '#a0aec0',
      fontSize: '24px',
      cursor: 'pointer',
      padding: '0 8px',
    });
    this.closeBtn.onclick = () => {
      if (this.busy) this.callbacks?.onCancel();
      else this.hide();
    };
    header.append(title, this.closeBtn);

    // Guide section
    this.instructions.className = 'lan-instructions';
    this.instructions.innerHTML = `
      <div style="background: rgba(0, 240, 255, 0.08); border-left: 4px solid #00f0ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #e2e8f0;">
        <strong style="color: #ffe600;">📖 联机方式：</strong><br/>
        随机匹配会加入公共等待队列；创建好友房间会生成一次性链接，只在你在线等待期间有效。
      </div>
    `;

    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'online-display-name';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '8px';
    nameLabel.style.fontSize = '14px';
    nameLabel.style.color = '#a0aec0';
    nameLabel.textContent = '联机昵称：';

    this.nameInput.id = 'online-display-name';
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 32;
    Object.assign(this.nameInput.style, {
      width: '100%',
      padding: '12px 16px',
      fontSize: '15px',
      borderRadius: '10px',
      border: '1px solid rgba(0, 240, 255, 0.5)',
      background: 'rgba(10, 15, 28, 0.9)',
      color: '#ffffff',
      outline: 'none',
      marginBottom: '16px',
      boxSizing: 'border-box',
    });

    // Server URL Field
    const fieldLabel = document.createElement('label');
    fieldLabel.htmlFor = 'online-server-url';
    fieldLabel.style.display = 'block';
    fieldLabel.style.marginBottom = '8px';
    fieldLabel.style.fontSize = '14px';
    fieldLabel.style.color = '#a0aec0';
    fieldLabel.textContent = '匹配服务器地址：';

    this.urlInput.type = 'text';
    this.urlInput.id = 'online-server-url';
    this.urlInput.value = this.getDefaultUrl();
    Object.assign(this.urlInput.style, {
      width: '100%',
      padding: '12px 16px',
      fontSize: '15px',
      borderRadius: '10px',
      border: '1px solid rgba(0, 240, 255, 0.5)',
      background: 'rgba(10, 15, 28, 0.9)',
      color: '#00f0ff',
      outline: 'none',
      marginBottom: '16px',
      boxSizing: 'border-box',
    });

    this.shareGroup.style.display = 'none';
    this.shareGroup.style.marginBottom = '16px';
    const shareLabel = document.createElement('label');
    shareLabel.htmlFor = 'online-room-link';
    shareLabel.style.display = 'block';
    shareLabel.style.marginBottom = '8px';
    shareLabel.style.fontSize = '14px';
    shareLabel.style.color = '#a0aec0';
    shareLabel.textContent = '好友房间链接：';
    const shareRow = document.createElement('div');
    shareRow.style.display = 'flex';
    shareRow.style.gap = '8px';
    this.shareInput.id = 'online-room-link';
    this.shareInput.type = 'text';
    this.shareInput.readOnly = true;
    Object.assign(this.shareInput.style, {
      flex: '1', minWidth: '0', padding: '11px 12px', borderRadius: '9px',
      border: '1px solid rgba(0, 255, 136, 0.5)', background: 'rgba(10, 15, 28, 0.9)', color: '#80ffd0',
    });
    this.copyBtn.type = 'button';
    this.copyBtn.textContent = '复制链接';
    Object.assign(this.copyBtn.style, {
      padding: '10px 14px', borderRadius: '9px', border: '1px solid #00ff88',
      background: 'rgba(0, 255, 136, 0.14)', color: '#ffffff', cursor: 'pointer',
    });
    this.copyBtn.onclick = () => void this.copyShareLink();
    shareRow.append(this.shareInput, this.copyBtn);
    this.shareGroup.append(shareLabel, shareRow);

    // Status Badge
    this.statusBadge.className = 'lan-status-badge';
    this.updateStatus('idle', '请选择匹配方式');

    // Buttons Container
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'grid';
    btnGroup.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    btnGroup.style.gap = '12px';
    btnGroup.style.marginTop = '20px';

    this.matchBtn.textContent = '🎲 随机匹配';
    for (const button of [this.matchBtn, this.createBtn, this.joinBtn]) Object.assign(button.style, {
      padding: '14px 20px',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#000',
      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
      border: 'none',
      borderRadius: '12px',
      cursor: 'pointer',
      boxShadow: '0 0 20px rgba(0, 242, 254, 0.6)',
    });
    this.createBtn.textContent = '🔗 创建好友房间';
    this.joinBtn.textContent = '⚔️ 加入指定房间';
    this.joinBtn.style.display = 'none';
    this.matchBtn.onclick = () => this.submit('random');
    this.createBtn.onclick = () => this.submit('create');
    this.joinBtn.onclick = () => this.submit('join');

    this.cancelBtn.textContent = '❌ 取消 / 断开';
    Object.assign(this.cancelBtn.style, {
      padding: '14px 20px',
      fontSize: '15px',
      fontWeight: 'bold',
      color: '#ffffff',
      background: 'rgba(255, 50, 80, 0.2)',
      border: '1px solid rgba(255, 50, 80, 0.6)',
      borderRadius: '12px',
      cursor: 'pointer',
      display: 'none',
      gridColumn: '1 / -1',
    });
    this.cancelBtn.onclick = () => this.callbacks?.onCancel();

    btnGroup.append(this.matchBtn, this.createBtn, this.joinBtn, this.cancelBtn);
    this.dialog.append(header, this.instructions, nameLabel, this.nameInput, fieldLabel, this.urlInput, this.shareGroup, this.statusBadge, btnGroup);
    this.root.appendChild(this.dialog);
    document.body.appendChild(this.root);
  }

  private getDefaultUrl(): string {
    return import.meta.env.VITE_WS_URL || deriveWebSocketUrl(window.location.href);
  }

  setupCallbacks(callbacks: LanModalCallbacks) {
    this.callbacks = callbacks;
  }

  show() {
    this.roomToken = '';
    this.matchBtn.style.display = 'inline-block';
    this.createBtn.style.display = 'inline-block';
    this.joinBtn.style.display = 'none';
    this.shareGroup.style.display = 'none';
    this.refreshIdentity();
    this.updateStatus('idle', '请选择随机匹配或创建好友房间');
    this.root.style.display = 'flex';
  }

  showJoin(roomToken: string) {
    this.roomToken = roomToken;
    this.matchBtn.style.display = 'none';
    this.createBtn.style.display = 'none';
    this.joinBtn.style.display = 'inline-block';
    this.shareGroup.style.display = 'none';
    this.refreshIdentity();
    this.updateStatus('idle', '确认昵称后加入指定好友房间');
    this.root.style.display = 'flex';
  }

  hide() {
    this.root.style.display = 'none';
  }

  showPrivateRoomLink(link: string) {
    this.shareInput.value = link;
    this.shareGroup.style.display = 'block';
    this.updateStatus('private_waiting', '房间已创建，复制链接发送给指定朋友');
  }

  private refreshIdentity() {
    const identity = loadOnlineIdentity();
    this.nameInput.value = identity?.displayName ?? '';
    this.identityLocked = identity?.kind === 'identity';
    this.nameInput.disabled = this.identityLocked;
    this.nameInput.title = this.identityLocked ? '使用已认领身份昵称' : '游客昵称会保存在当前浏览器';
  }

  private submit(action: 'random' | 'create' | 'join') {
    const displayName = normalizeOnlineDisplayName(this.nameInput.value);
    if (!displayName) {
      this.updateStatus('error', '请输入 1–32 个字符的联机昵称');
      this.nameInput.focus();
      return;
    }
    if (!this.nameInput.disabled) saveOnlineGuestName(displayName);
    const url = this.urlInput.value.trim();
    if (action === 'random') this.callbacks?.onRandom(url, displayName);
    else if (action === 'create') this.callbacks?.onCreate(url, displayName);
    else this.callbacks?.onJoin(url, displayName, this.roomToken);
  }

  private async copyShareLink() {
    try {
      await navigator.clipboard.writeText(this.shareInput.value);
      this.updateStatus('private_waiting', '链接已复制，等待好友加入');
    } catch {
      this.shareInput.focus();
      this.shareInput.select();
      this.updateStatus('private_waiting', '无法自动复制，请手动复制上方链接');
    }
  }

  updateStatus(state: string, message: string) {
    let color = '#00f0ff';
    let bg = 'rgba(0, 240, 255, 0.1)';
    let border = '1px solid rgba(0, 240, 255, 0.4)';

    this.busy = ['connecting', 'queued', 'private_waiting', 'matched', 'in_battle'].includes(state);
    if (state === 'queued' || state === 'connecting' || state === 'private_waiting') {
      color = '#ffe600';
      bg = 'rgba(255, 230, 0, 0.15)';
      border = '1px solid rgba(255, 230, 0, 0.6)';
      this.cancelBtn.style.display = 'inline-block';
      if (state === 'queued') this.matchBtn.textContent = '⏳ 随机匹配中...';
    } else if (state === 'matched' || state === 'in_battle') {
      color = '#00ff88';
      bg = 'rgba(0, 255, 136, 0.15)';
      border = '1px solid rgba(0, 255, 136, 0.6)';
      this.cancelBtn.style.display = 'inline-block';
      this.matchBtn.textContent = '⚔️ 匹配成功';
    } else {
      this.cancelBtn.style.display = 'none';
      this.matchBtn.textContent = '🎲 随机匹配';
    }

    this.matchBtn.disabled = this.busy;
    this.createBtn.disabled = this.busy;
    this.joinBtn.disabled = this.busy;
    this.nameInput.disabled = this.identityLocked || this.busy;
    this.urlInput.disabled = this.busy;

    Object.assign(this.statusBadge.style, {
      padding: '10px 16px',
      borderRadius: '8px',
      background: bg,
      border: border,
      color: color,
      fontSize: '14px',
      fontWeight: 'bold',
      textAlign: 'center',
    });
    this.statusBadge.textContent = `● [${state.toUpperCase()}] ${message}`;
  }
}
