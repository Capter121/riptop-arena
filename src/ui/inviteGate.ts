import type { InviteRedemption } from '../auth/inviteClient';

interface InviteGateOptions {
  inviteCode: string;
  onSubmit: (input: InviteRedemption, gate: InviteGate) => Promise<void>;
}

export class InviteGate {
  readonly element = document.createElement('section');
  private readonly form = document.createElement('form');
  private readonly error = document.createElement('p');
  private readonly status = document.createElement('p');
  private readonly submitButton = document.createElement('button');
  private readonly nicknameInput = document.createElement('input');
  private readonly inviteInput: HTMLInputElement | null;
  private readonly options: InviteGateOptions;

  constructor(options: InviteGateOptions) {
    this.options = options;
    this.element.className = 'invite-gate';
    this.element.innerHTML = `
      <p class="invite-gate__eyebrow">PRIVATE SERVER ACCESS</p>
      <h1>Nova Spin System</h1>
      <p class="invite-gate__lead">输入朋友提供的邀请码，建立这台浏览器的本地玩家身份。</p>
    `;
    this.form.className = 'invite-gate__form';

    this.inviteInput = options.inviteCode ? null : this.createInput('inviteCode', '邀请码', 'text');
    this.nicknameInput.name = 'displayName';
    this.nicknameInput.id = 'invite-gate-display-name';
    this.nicknameInput.type = 'text';
    this.nicknameInput.required = true;
    this.nicknameInput.maxLength = 32;
    this.nicknameInput.setAttribute('autocomplete', 'nickname');
    this.form.append(this.createLabel('invite-gate-display-name', '昵称'), this.nicknameInput);

    this.submitButton.type = 'submit';
    this.submitButton.textContent = '进入据点';
    this.form.append(this.submitButton);

    this.status.className = 'invite-gate__status';
    this.status.setAttribute('role', 'status');
    if (options.inviteCode) this.status.textContent = '邀请链接已载入';
    this.error.className = 'invite-gate__error';
    this.error.setAttribute('role', 'alert');

    this.element.append(this.form, this.status, this.error);
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.submit();
    });
  }

  setError(message: string) {
    this.error.textContent = message;
  }

  showSaveRetry(onRetry: () => boolean) {
    this.form.hidden = true;
    this.setError('身份已创建，但浏览器尚未保存。请重试保存。');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重试保存';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      if (!onRetry()) {
        retry.disabled = false;
        this.setError('浏览器仍然无法保存身份。');
      }
    });
    this.element.append(retry);
  }

  private createInput(name: string, label: string, type: string) {
    const id = `invite-gate-${name}`;
    const input = document.createElement('input');
    input.id = id;
    input.name = name;
    input.type = type;
    input.required = true;
    input.autocomplete = 'off';
    this.form.append(this.createLabel(id, label), input);
    return input;
  }

  private createLabel(forId: string, text: string) {
    const label = document.createElement('label');
    label.htmlFor = forId;
    label.textContent = text;
    return label;
  }

  private async submit() {
    this.setError('');
    this.submitButton.disabled = true;
    this.status.textContent = '正在验证邀请…';
    try {
      await this.options.onSubmit({
        inviteCode: this.options.inviteCode || this.inviteInput?.value.trim() || '',
        displayName: this.nicknameInput.value.trim(),
      }, this);
    } finally {
      this.submitButton.disabled = false;
      if (!this.form.hidden) this.status.textContent = '';
    }
  }
}
