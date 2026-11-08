/**
 * 构建期注入的常量（见 vite.config.ts 的 define）。
 * 版本号来源是 apps/desktop/package.json，这样界面上显示的版本不会和
 * 打包配置、CHANGELOG 对不上。
 */
declare const __APP_VERSION__: string;
