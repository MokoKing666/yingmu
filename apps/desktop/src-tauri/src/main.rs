// Windows release 构建不弹出控制台窗口（GUI 子系统）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yingmu_desktop_lib::run();
}
