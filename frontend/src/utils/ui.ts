import {
  ElLoading,
  ElMessage,
  ElMessageBox,
  ElNotification,
} from 'element-plus';
import {
  showNotify,
  showLoadingToast,
  showConfirmDialog,
  closeToast,
} from 'vant';
import { useAppStore } from '@/stores/app';

/** 可关闭的加载句柄（统一桌面/移动）。 */
export interface LoadingHandle {
  close: () => void;
}

/** 确认弹窗参数。allowHtml 时 message 作为 HTML 渲染。 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  allowHtml?: boolean;
}

function isPhone(): boolean {
  return useAppStore().isPhone;
}

/** 成功通知（桌面右下角 ElNotification / 移动 vant Notify）。 */
export function notifySuccess(title: string, message: string): void {
  if (isPhone()) {
    showNotify({ type: 'success', message });
  } else {
    ElNotification({ title, message, type: 'success', position: 'bottom-right' });
  }
}

/** 错误通知。 */
export function notifyError(title: string, message: string): void {
  if (isPhone()) {
    showNotify({ type: 'danger', message });
  } else {
    ElNotification({ title, message, type: 'error', position: 'bottom-right' });
  }
}

/** 全屏加载，返回可 close 的句柄。 */
export function showLoading(text: string): LoadingHandle {
  if (isPhone()) {
    showLoadingToast({ message: text, forbidClick: true, duration: 0 });
    return { close: () => closeToast() };
  }
  const instance = ElLoading.service({
    lock: true,
    text,
    background: 'rgba(0, 0, 0, 0.7)',
  });
  return { close: () => instance.close() };
}

/** 确认弹窗：确认 resolve，取消 reject。 */
export function confirmDialog(opts: ConfirmOptions): Promise<unknown> {
  if (isPhone()) {
    return showConfirmDialog({
      title: opts.title,
      message: opts.message,
      allowHtml: opts.allowHtml,
      confirmButtonText: opts.confirmButtonText,
      cancelButtonText: opts.cancelButtonText,
    });
  }
  return ElMessageBox.confirm(opts.message, opts.title, {
    dangerouslyUseHTMLString: opts.allowHtml,
    confirmButtonText: opts.confirmButtonText ?? '确定',
    cancelButtonText: opts.cancelButtonText ?? '取消',
  });
}

/** 直接暴露 element-plus 的错误条（少数场景用，桌面/移动通用兜底）。 */
export function messageError(message: string): void {
  if (isPhone()) {
    showNotify({ type: 'danger', message });
  } else {
    ElMessage.error(message);
  }
}
