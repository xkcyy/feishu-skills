import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const SCRIPTS_DIR = path.resolve(LIB_DIR, '..');
export const SKILL_DIR = path.resolve(SCRIPTS_DIR, '..');
export const LOCAL_DIR = path.join(SKILL_DIR, '.local');
export const DEFAULT_CONFIG_PATH = path.join(LOCAL_DIR, 'config.json');
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, '.config.example.json');
export const DEFAULT_STATE_PATH = path.join(SKILL_DIR, '.state.json');
export const RUNTIME_DIR = path.join(SKILL_DIR, '.runtime');
export const RUNTIME_PACKAGE_JSON = path.join(RUNTIME_DIR, 'package.json');
export const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..');
export const ROOT_PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');
