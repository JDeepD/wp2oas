import { createElement, StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

export function render(): string {
  return renderToString(createElement(StrictMode, null, createElement(App)))
}
