import { deriveWebSocketUrl } from '../network/networkClient';

export class LanModal {
  readonly root = document.createElement('div');
  readonly dialog = document.createElement('div');
  readonly closeBtn = document.createElement('button');
  readonly matchBtn = document.createElement('button');
  readonly cancelBtn = document.createElement('button');
  readonly urlInput = document.createElement('input');
  readonly statusBadge = document.createElement('div');
  readonly instructions = document.createElement('div');

  private onStartMatch?: (customUrl: string) => void;
  private onCancelMatch?: () => void;

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
    title.textContent = '🌐 局域网真人联机对战 (LAN PvP)';
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
    this.closeBtn.onclick = () => this.hide();
    header.append(title, this.closeBtn);

    // Guide section
    this.instructions.className = 'lan-instructions';
    this.instructions.innerHTML = `
      <div style="background: rgba(0, 240, 255, 0.08); border-left: 4px solid #00f0ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #e2e8f0;">
        <strong style="color: #ffe600;">📖 局域网快速联机指南：</strong><br/>
        1️⃣ <strong>主机启动匹配服务：</strong>终端运行 <code style="color: #00f0ff; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">npm run server</code><br/>
        2️⃣ <strong>主机开启局域网共享：</strong>终端运行 <code style="color: #00f0ff; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">npm run dev -- --host</code><br/>
        3️⃣ <strong>客机设备加入：</strong>连同一 Wi-Fi，用浏览器打开主机 IP 页面，双方点击【开始匹配】！
      </div>
    `;

    // Server URL Field
    const fieldLabel = document.createElement('label');
    fieldLabel.style.display = 'block';
    fieldLabel.style.marginBottom = '8px';
    fieldLabel.style.fontSize = '14px';
    fieldLabel.style.color = '#a0aec0';
    fieldLabel.textContent = 'WebSocket 匹配服务器地址 (WS Server URL)：';

    this.urlInput.type = 'text';
    this.urlInput.value = this.getDerivedDefaultUrl();
    Object.assign(this.urlInput.style, {
      width: '100%',
      padding: '12px 16px',
      fontSize: '15px',
      borderRadius: '10px',
      border: '1px solid rgba(0, 240, 255, 0.5)',
      background: 'rgba(10, 15, 28, 0.9)',
      color: '#00f0ff',
      outline: 'none',
      marginBottom: '20px',
      boxSizing: 'border-box',
    });

    // Status Badge
    this.statusBadge.className = 'lan-status-badge';
    this.updateStatus('idle', '局域网 WebSocket 服务就绪');

    // Buttons Container
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '12px';
    btnGroup.style.marginTop = '20px';

    this.matchBtn.textContent = '🚀 开始局域网匹配';
    Object.assign(this.matchBtn.style, {
      flex: '1',
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
    this.matchBtn.onclick = () => {
      if (this.onStartMatch) {
        this.onStartMatch(this.urlInput.value.trim());
      }
    };

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
    });
    this.cancelBtn.onclick = () => {
      if (this.onCancelMatch) {
        this.onCancelMatch();
      }
    };

    btnGroup.append(this.matchBtn, this.cancelBtn);
    this.dialog.append(header, this.instructions, fieldLabel, this.urlInput, this.statusBadge, btnGroup);
    this.root.appendChild(this.dialog);
    document.body.appendChild(this.root);
  }

  private getDerivedDefaultUrl(): string {
    return deriveWebSocketUrl(window.location.href);
  }

  setupCallbacks(onStart: (url: string) => void, onCancel: () => void) {
    this.onStartMatch = onStart;
    this.onCancelMatch = onCancel;
  }

  show() {
    this.root.style.display = 'flex';
  }

  hide() {
    this.root.style.display = 'none';
  }

  updateStatus(state: string, message: string) {
    let color = '#00f0ff';
    let bg = 'rgba(0, 240, 255, 0.1)';
    let border = '1px solid rgba(0, 240, 255, 0.4)';

    if (state === 'queued' || state === 'connecting') {
      color = '#ffe600';
      bg = 'rgba(255, 230, 0, 0.15)';
      border = '1px solid rgba(255, 230, 0, 0.6)';
      this.cancelBtn.style.display = 'inline-block';
      this.matchBtn.textContent = '⏳ 匹配排队中...';
    } else if (state === 'matched' || state === 'in_battle') {
      color = '#00ff88';
      bg = 'rgba(0, 255, 136, 0.15)';
      border = '1px solid rgba(0, 255, 136, 0.6)';
      this.cancelBtn.style.display = 'inline-block';
      this.matchBtn.textContent = '⚔️ 匹配成功！准备进入战场';
    } else {
      this.cancelBtn.style.display = 'none';
      this.matchBtn.textContent = '🚀 开始局域网匹配';
    }

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
