import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Ловит ошибку в части интерфейса и показывает её текст вместо белого экрана. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const text = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}\n${stack.split('\n').slice(0, 8).join('\n')}`;
    return (
      <div className="crash" role="alert">
        <h2>{this.props.label} не загрузился</h2>
        <p>Скопируйте текст ниже и пришлите его — по нему видно, что именно сломалось.</p>
        <pre>{text}</pre>
        <div className="crash-actions">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(text)}>
            Скопировать
          </button>
          <button className="btn" onClick={() => this.setState({ error: null, stack: '' })}>
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }
}
