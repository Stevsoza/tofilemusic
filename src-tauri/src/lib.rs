use serde::Serialize;
use std::process::Command;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

fn ffmpeg_sidecar_path(app: &tauri::AppHandle) -> Option<String> {
    let exe = tauri::process::current_binary(&app.env()).ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let path = dir.join(name);
    path.exists().then(|| path.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_mp3(app: tauri::AppHandle, url: String, output_dir: String) -> Result<String, String> {
    let mut args = vec![
        "--extract-audio".to_string(),
        "--audio-format".to_string(), "mp3".to_string(),
        "--audio-quality".to_string(), "0".to_string(),
        "-o".to_string(), format!("{}/%(title)s.%(ext)s", output_dir),
        "--no-playlist".to_string(),
        "--newline".to_string(),
    ];
    if let Some(ffmpeg) = ffmpeg_sidecar_path(&app) {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }
    args.push(url);

    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| format!("No se pudo preparar yt-dlp: {}", e))?;
    let output = sidecar
        .args(args)
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let last_line = stdout.lines().last().unwrap_or("");

        let filename = if let Some(dest) = last_line.strip_prefix("[download] Destination: ") {
            dest.to_string()
        } else if let Some(dest) = last_line.strip_prefix("[download] ") {
            if dest.ends_with(" has already been downloaded") {
                dest.replace(" has already been downloaded", "")
            } else {
                dest.to_string()
            }
        } else {
            String::from("Descarga completada")
        };

        Ok(filename)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Error de yt-dlp: {}", stderr))
    }
}

#[tauri::command]
async fn get_video_info(app: tauri::AppHandle, url: String) -> Result<VideoInfo, String> {
    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| format!("No se pudo preparar yt-dlp: {}", e))?;
    let output = sidecar
        .args([
            "--print", "title",
            "--print", "duration",
            "--print", "uploader",
            "--no-playlist",
            "--skip-download",
            &url,
        ])
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let lines: Vec<&str> = stdout.trim().lines().collect();
        let title = lines.get(0).unwrap_or(&"Desconocido").to_string();
        let duration = lines.get(1).unwrap_or(&"0").to_string();
        let uploader = lines.get(2).unwrap_or(&"Desconocido").to_string();

        Ok(VideoInfo { title, duration, uploader })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("No se pudo obtener info: {}", stderr))
    }
}

#[tauri::command]
fn get_default_dir() -> Result<String, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| ".".to_string());

    if let Ok(output) = Command::new("xdg-user-dir").arg("DOWNLOAD").output() {
        if output.status.success() {
            let dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !dir.is_empty() && dir != home {
                return Ok(dir);
            }
        }
    }

    let dir = format!("{}/Downloads", home);
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir)
}

#[derive(Clone, Serialize)]
struct VideoInfo {
    title: String,
    duration: String,
    uploader: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let icon_bytes = include_bytes!("../icons/128x128.png");
            let icon = tauri::image::Image::from_bytes(icon_bytes).expect("failed to load icon");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(icon);
            }

            if let Some(home) = std::env::var("HOME").ok() {
                let icon_dir = format!("{}/.local/share/icons/hicolor/128x128/apps", home);
                let _ = std::fs::create_dir_all(&icon_dir);
                let _ = std::fs::write(format!("{}/converter.png", icon_dir), icon_bytes);

                let desktop_dir = format!("{}/.local/share/applications", home);
                let _ = std::fs::create_dir_all(&desktop_dir);
                let desktop_file = format!(
                    "[Desktop Entry]\nType=Application\nName=Converter\nComment=YouTube a MP3\nIcon=converter\nTerminal=false\nCategories=AudioVideo;Audio;\n"
                );
                let _ = std::fs::write(format!("{}/converter.desktop", desktop_dir), desktop_file);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![download_mp3, get_video_info, get_default_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
