import { App } from './app/app';
import { Game } from './sim/Game';
import { FLOOR_1 } from './data/floors';
import { loadModels } from './render3d/models';

// the Blender-built people come in before anything builds a room (src/render3d/models.ts)
await loadModels();

const app = new App(document.getElementById('game') as HTMLCanvasElement, document.getElementById('hud') as HTMLCanvasElement);

// live state for the e2e harness and the debug console
(window as any).__app = app;
(window as any).__Game = Game;
Object.defineProperty(window, '__game', { get: () => app.game });
(window as any).__floors = { FLOOR_1 };
