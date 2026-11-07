fn main() {
    // tauri-build 会读取 tauri.conf.json、校验 identifier / capabilities，
    // 并把前端资源与图标信息生成到编译期上下文。
    tauri_build::build()
}
