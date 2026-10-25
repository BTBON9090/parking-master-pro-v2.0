import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** 用于日志区分崩溃来源（如「地图编辑器」「游戏视图」）。 */
  label?: string;
  /** 点击「返回」时触发：通常用于退出到上一级（菜单/编辑器列表）。 */
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 渲染崩溃兜底边界。
 *
 * 任何子树在渲染期间抛错（例如某条畸形道路/标线让 Three.js 构建失败）都不会
 * 再让整块界面黑屏：边界捕获错误、记录堆栈，并展示一个可恢复的面板，用户点
 * 「返回」即可回到安全状态。配合 buildScene / recomputeJunctions 内的逐元素
 * try/catch，保证「最坏情况」也只是跳过坏元素，而不是整屏黑。
 */
export default class ErrorBoundary extends Component<Props, State> {
  // 本项目未安装 @types/react，`react` 经 allowJs 推断为宽松类型，
  // 类组件实例成员不会被自动推断。这里显式声明（declare 不产生运行时代码，
  // 运行时仍真正继承 React.Component，生命周期照常工作）。
  declare props: Readonly<Props>;
  declare setState: (state: Partial<State> | ((prev: State) => Partial<State>)) => void;
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const where = this.props.label ? ` · ${this.props.label}` : '';
    console.error(`[ErrorBoundary${where}] 渲染崩溃：`, error, info.componentStack);
  }

  private handleRecover = () => {
    // 先复位边界状态，再回调退出；这样即便 onRecover 又渲染本边界也不会卡在错误页。
    this.setState({ hasError: false, error: null });
    this.props.onRecover?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          background: 'var(--bg, #16181d)',
          color: 'var(--text, #e5e7eb)',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
          zIndex: 9999,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cyan, #22d3ee)' }}>渲染出错</div>
        <div style={{ fontSize: 13, opacity: 0.75, maxWidth: 520 }}>
          {this.props.label ? `${this.props.label} ` : ''}在渲染时遇到问题，已安全拦截以避免黑屏。
          错误详情已记录到控制台，可返回后重试。
        </div>
        {this.state.error?.message && (
          <pre
            style={{
              maxWidth: 640,
              maxHeight: 160,
              overflow: 'auto',
              fontSize: 11,
              lineHeight: 1.5,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}
          >
            {this.state.error.message}
          </pre>
        )}
        <button
          onClick={this.handleRecover}
          style={{
            marginTop: 6,
            padding: '9px 26px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--bg, #16181d)',
            background: 'var(--cyan, #22d3ee)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          返回
        </button>
      </div>
    );
  }
}
