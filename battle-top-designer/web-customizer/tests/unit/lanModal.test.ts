// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanModal } from '../../../../src/ui/lanModal';
import { deriveWebSocketUrl } from '../../../../src/network/networkClient';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('LAN matchmaking modal', () => {
  it('derives the LAN WebSocket URL and forwards a trimmed custom URL', () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const modal = new LanModal();
    modal.setupCallbacks(onStart, onCancel);

    expect(deriveWebSocketUrl('http://192.168.1.8:4176/arena/?mode=lan')).toBe('ws://192.168.1.8:8080/');
    expect(modal.urlInput.value).toBe(deriveWebSocketUrl(window.location.href));
    modal.urlInput.value = '  ws://192.168.1.20:8080/  ';
    modal.matchBtn.click();
    expect(onStart).toHaveBeenCalledWith('ws://192.168.1.20:8080/');

    modal.updateStatus('queued', '等待朋友加入');
    expect(modal.cancelBtn.style.display).toBe('inline-block');
    modal.cancelBtn.click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows, hides, and resets the action controls when idle', () => {
    const modal = new LanModal();
    modal.show();
    expect(modal.root.style.display).toBe('flex');

    modal.updateStatus('matched', '匹配成功');
    expect(modal.matchBtn.textContent).toContain('匹配成功');
    modal.updateStatus('idle', '服务就绪');
    expect(modal.cancelBtn.style.display).toBe('none');

    modal.closeBtn.click();
    expect(modal.root.style.display).toBe('none');
  });
});
