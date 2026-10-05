import './styles/main.css';
import { App } from './app/App';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui');
if (!canvas || !uiRoot) throw new Error('Missing #renderCanvas or #ui');

new App(canvas, uiRoot).boot().catch((err: unknown) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div class="boot-error">${err instanceof Error ? err.message : String(err)}</div>`;
});
