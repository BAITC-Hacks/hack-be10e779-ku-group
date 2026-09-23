// Ошибка рендера во вкладке не должна давать белый экран всего приложения: показываем понятное сообщение и «Повторить».

import { Component, type ReactNode } from 'react'
import { Notice } from './ui'

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`Ошибка во вкладке «${this.props.name}»:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Notice
        tone="error"
        action={
          <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
            Повторить
          </button>
        }
      >
        Не удалось показать вкладку «{this.props.name}»: {this.state.error.message}. Остальные вкладки работают.
      </Notice>
    )
  }
}
