/**
 * Toast 工具函数
 * 提供全局的 Toast 提示功能
 */

export type ToastType = "success" | "warning" | "error";

interface ToastAPI {
  success: (message: string, duration?: number) => number;
  warning: (message: string, duration?: number) => number;
  error: (message: string, duration?: number) => number;
  show: (message: string, type?: ToastType, duration?: number) => number;
}

/**
 * 获取 Toast API
 */
const getToastAPI = (): ToastAPI | null => {
  return (window as any).$toast || null;
};

/**
 * 显示成功提示
 */
export const toastSuccess = (message: string, duration?: number): void => {
  const api = getToastAPI();
  if (api) {
    api.success(message, duration);
  } else {
    // 降级到 alert
    console.warn("Toast API not available, falling back to alert");
    alert(message);
  }
};

/**
 * 显示警告提示
 */
export const toastWarning = (message: string, duration?: number): void => {
  const api = getToastAPI();
  if (api) {
    api.warning(message, duration);
  } else {
    console.warn("Toast API not available, falling back to alert");
    alert(message);
  }
};

/**
 * 显示错误提示
 */
export const toastError = (message: string, duration?: number): void => {
  const api = getToastAPI();
  if (api) {
    api.error(message, duration);
  } else {
    console.warn("Toast API not available, falling back to alert");
    alert(message);
  }
};

/**
 * 显示提示（通用方法）
 */
export const toast = (message: string, type: ToastType = "success", duration?: number): void => {
  const api = getToastAPI();
  if (api) {
    api.show(message, type, duration);
  } else {
    console.warn("Toast API not available, falling back to alert");
    alert(message);
  }
};

/**
 * 默认导出，方便使用
 */
export default {
  success: toastSuccess,
  warning: toastWarning,
  error: toastError,
  show: toast,
};

