// Every floor-1 table's module, by id.
import type { TableModule } from './table';
import { bandit } from './bandit';
import { twentyone } from './twentyone';
import { hilo } from './hilo';
import { wheel } from './wheel';
import { redline } from './redline';
import { deadman } from './deadman';

export const MODULES: TableModule[] = [bandit, twentyone, hilo, wheel, redline, deadman];
export const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
