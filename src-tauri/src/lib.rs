use tauri::Manager;

/// Картинка из буфера обмена → файл на диске → абсолютный путь в промпт.
///
/// Спайк 2026-08-13 подтвердил канал живьём: и Claude Code, и Codex открывают картинку
/// по абсолютному пути (проверено на изображении со случайным числом — угадать нельзя,
/// значит файл действительно читали). Но `send-keys` проносит только текст, поэтому
/// картинку из буфера надо сперва материализовать.
///
/// Почему своя команда, а не `fs:allow-write-file` из плагина: та permission открывает
/// вебвью ТРИ команды — `write_file`, `open`, `write` (проверено в
/// gen/schemas/acl-manifests.json, plugin-fs 2.4.5; собственное описание permission
/// упоминает только первую). В паре с уже выданным `fs:scope-home-recursive` это
/// generic open+write по всему домашнему каталогу — несоразмерно задаче «сохранить
/// один PNG в свой же каталог данных».
///
/// Здесь вебвью не задаёт НИЧЕГО, кроме самих байтов:
/// - каталог назначения берётся из `app_local_data_dir()`,
/// - имя генерируется тут же,
/// - расширение выводится из сигнатуры файла, а не приходит строкой из JS —
///   поэтому путь вида `../../evil.sh` невозможен не по проверке, а по отсутствию входа.
#[tauri::command]
fn save_clipboard_image(
  app: tauri::AppHandle,
  request: tauri::ipc::Request,
) -> Result<String, String> {
  // Сырое тело, а не JSON: скриншот на несколько мегабайт в виде массива чисел
  // сериализуется и разбирается заметно дольше самой записи на диск.
  let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
    return Err("expected a raw request body".into());
  };

  let ext = sniff_image_ext(bytes).ok_or("unsupported image format")?;

  let dir = app
    .path()
    .app_local_data_dir()
    .map_err(|err| format!("no app data dir: {err}"))?
    .join("images");
  std::fs::create_dir_all(&dir).map_err(|err| format!("cannot create {dir:?}: {err}"))?;

  // Миллисекунд мало: две вставки подряд попадают в одну и ту же. Счётчик процесса
  // разводит их, не заводя зависимости ради uuid.
  static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
  let millis = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_err(|err| format!("clock before epoch: {err}"))?
    .as_millis();
  let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
  let path = dir.join(format!("sendoff-{millis}-{seq}.{ext}"));

  std::fs::write(&path, bytes).map_err(|err| format!("cannot write {path:?}: {err}"))?;

  path
    .to_str()
    .map(str::to_owned)
    .ok_or_else(|| "image path is not valid UTF-8".into())
}

/// Формат по сигнатуре, а не по тому, что скажет фронт. Список закрытый: сюда попадает
/// только то, что агент на том конце действительно откроет.
fn sniff_image_ext(bytes: &[u8]) -> Option<&'static str> {
  const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
  if bytes.starts_with(PNG) {
    return Some("png");
  }
  if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
    return Some("jpg");
  }
  if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
    return Some("gif");
  }
  // RIFF....WEBP — четыре байта размера между сигнатурами не проверяем.
  if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
    return Some("webp");
  }
  None
}

/// Список бинарей, о которых Doctor вправе спрашивать. Задан ЗДЕСЬ, а не приходит из
/// вебвью: иначе команда превратилась бы в «проверь наличие произвольного файла» —
/// generic-проба файловой системы под видом диагностики. Вебвью не передаёт ничего.
const DIAGNOSED_EXECUTABLES: [&str; 4] = ["tmux", "herdr", "orca-ide", "hc"];

#[derive(serde::Serialize)]
struct ExecutableLocation {
  name: String,
  /// Абсолютный путь, если найден. `None` = «в PATH процесса Sendoff нет».
  path: Option<String>,
}

/// Где лежат бинари терминальных провайдеров — по PATH ЭТОГО процесса.
///
/// Зачем отдельно от `listTargets()`: tauri-plugin-shell схлопывает все варианты
/// `scope::Error` в одно `ProgramNotAllowed` (`commands.rs`, настоящая причина живёт
/// только под `#[cfg(debug_assertions)]`), поэтому «бинаря нет» и «запрещено scope» по
/// тексту не различить. Наличие файла — второй, независимый и структурированный сигнал:
/// связка «найден + discovery упал» уже означает не отсутствие программы, а отказ scope
/// или саму программу. Разбирать строки ошибок регулярками не требуется.
///
/// Процесс НЕ запускается: только обход PATH и проверка бита исполняемости. Отвечает на
/// вопрос «виден ли бинарь Sendoff'у», а не «установлен ли он в системе» — у GUI-запуска
/// PATH урезанный (ровно поэтому выше в `run()` дотягивается ~/.local/bin).
#[tauri::command]
fn locate_executables() -> Vec<ExecutableLocation> {
  DIAGNOSED_EXECUTABLES
    .iter()
    .map(|name| ExecutableLocation {
      name: (*name).to_string(),
      path: which(name).and_then(|p| p.to_str().map(str::to_owned)),
    })
    .collect()
}

fn which(name: &str) -> Option<std::path::PathBuf> {
  let path = std::env::var_os("PATH")?;
  let found = std::env::split_paths(&path)
    .map(|dir| dir.join(name))
    .find(|candidate| is_executable_file(candidate))?;

  // Канонизация обязательна, иначе отчёт уводит в ложный след: на Arch `/usr/sbin` —
  // симлинка на `/usr/bin`, и первое совпадение по PATH даёт `/usr/sbin/tmux`. Путь
  // верный, но читается как аномалия. Заодно видно, на какую сборку смотрит символьная
  // ссылка из ~/.local/bin. Отказ канонизации не теряем: показываем найденное как есть.
  Some(std::fs::canonicalize(&found).unwrap_or(found))
}

fn is_executable_file(path: &std::path::Path) -> bool {
  let Ok(meta) = std::fs::metadata(path) else {
    return false; // битая симлинка или нет прав на каталог — считаем, что не нашли
  };
  if !meta.is_file() {
    return false;
  }
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    return meta.permissions().mode() & 0o111 != 0;
  }
  #[cfg(not(unix))]
  {
    true
  }
}

/// Версия WebKitGTK, под которой РЕАЛЬНО работает вебвью.
///
/// Нужна Doctor'у не для красоты: штатный отказ чтения IndexedDB (см. StorageErrorBanner)
/// происходит, когда базу писал более новый WebKit, чем тот, что её открывает. Из JS эта
/// версия недоступна — WebKitGTK репортит в User-Agent фиксированное Safari-compat число.
#[tauri::command]
fn webkit_version() -> Option<String> {
  #[cfg(target_os = "linux")]
  {
    // SAFETY: три FFI-геттера webkit2gtk без аргументов и побочных эффектов, возвращают
    // константы, вкомпилированные в саму библиотеку. Библиотека уже загружена — вебвью
    // на ней и работает.
    let (major, minor, micro) = unsafe {
      (
        webkit2gtk_sys::webkit_get_major_version(),
        webkit2gtk_sys::webkit_get_minor_version(),
        webkit2gtk_sys::webkit_get_micro_version(),
      )
    };
    Some(format!("{major}.{minor}.{micro}"))
  }
  #[cfg(not(target_os = "linux"))]
  {
    None
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // WebKitGTK (Linux): DMABUF-рендерер даёт tearing/артефакты при скролле на части
  // GPU-драйверов (Nvidia, отдельные Mesa/Wayland). Отключаем глючный путь шаринга
  // буферов — аппаратный композитинг при этом остаётся. Ставим до создания webview.
  // Уважаем явный override: если переменная уже задана в окружении — не трогаем.
  #[cfg(target_os = "linux")]
  if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  }

  // GUI-запуск (.desktop/лаунчер) наследует урезанный PATH без ~/.local/bin,
  // где лежит orca-ide → tauri-plugin-shell не находит бинарь и orca-send
  // молча отваливается (в `bun run dev` PATH шелла богатый, потому работает).
  // Дотягиваем ~/.local/bin в начало PATH процесса до старта плагинов.
  #[cfg(target_os = "linux")]
  if let Some(home) = std::env::var_os("HOME") {
    let local_bin = std::path::Path::new(&home).join(".local/bin");
    let path = std::env::var_os("PATH").unwrap_or_default();
    if !std::env::split_paths(&path).any(|p| p == local_bin) {
      let mut paths = vec![local_bin];
      paths.extend(std::env::split_paths(&path));
      if let Ok(joined) = std::env::join_paths(paths) {
        std::env::set_var("PATH", joined);
      }
    }
  }

  // Переезд каталога данных после переименования проекта (Rewrite → Sendoff, 2026-08-13).
  // Каталог задаётся identifier'ом, поэтому у обновившегося пользователя данные остались
  // бы лежать под старым именем, а приложение завело бы ПУСТУЮ базу — снаружи это
  // неотличимо от потери данных, причём молча: баннер StorageError сюда не приходит,
  // потому что чтение не падает, читать просто нечего.
  //
  // install.sh делает ровно то же, но до него доходят только собирающие из исходников —
  // пользователь AppImage не запускает его никогда. Это перенос пути, а не миграция
  // схемы: база и её версия те же самые (DB_NAME намеренно остался "rewrite-db").
  //
  // Идёт до старта плагинов и webview. Гонка двух запусков безопасна: rename атомарен,
  // проигравший не пройдёт проверку на существование источника.
  #[cfg(target_os = "linux")]
  {
    let base = std::env::var_os("XDG_DATA_HOME")
      .map(std::path::PathBuf::from)
      .filter(|p| p.is_absolute())
      .or_else(|| {
        std::env::var_os("HOME").map(|h| std::path::Path::new(&h).join(".local/share"))
      });
    if let Some(base) = base {
      let old = base.join("com.rewrite.app");
      let new = base.join("dev.sendoff.app");
      // Только когда старый каталог есть, а нового ещё нет. Если новый уже существует,
      // приложение под новым именем уже запускалось — перенос затёр бы его данные.
      if old.is_dir() && !new.exists() {
        if let Err(err) = std::fs::rename(&old, &new) {
          eprintln!("[sendoff] не удалось перенести каталог данных {old:?} → {new:?}: {err}");
        }
      }
    }
  }

  #[cfg_attr(not(feature = "mcp-bridge"), allow(unused_mut))]
  let mut builder = tauri::Builder::default()
    // Регистрируется ПЕРВЫМ — требование плагина (плагины стартуют в порядке добавления).
    //
    // Зачем вообще: два инстанса на одной IndexedDB тихо съедают работу друг друга.
    // saveSession не дописывает, а делает clear() + переписывает сторы целиком снапшотом
    // из памяти СВОЕГО инстанса (web/src/lib/db.ts). Поэтому второй инстанс, у которого
    // в памяти состояние на момент его запуска, при первой же записи стирает всё, что
    // первый успел создать после. Хуже того, ему для этого не нужно ничего делать:
    // beforeunload зовёт flushSession(), то есть достаточно ЗАКРЫТЬ лишнее окно.
    //
    // Гард обязан быть нативным: BroadcastChannel и Web Locks не выходят за пределы
    // своего webview-процесса, два инстанса друг друга оттуда не видят.
    //
    // На Linux плагин держит DBus-имя по identifier, а он один и тот же у сборки из
    // исходников и у AppImage — то есть эта пара тоже ловится (случай 2026-08-10).
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      // Лейбл окна в tauri.conf.json не задан → Tauri даёт дефолтный "main". Фолбэк на
      // любое окно оставлен намеренно: разъехавшийся лейбл иначе дал бы молчаливый no-op,
      // и второй запуск выглядел бы как «приложение не реагирует».
      let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next());
      if let Some(window) = window {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init());

  #[cfg(feature = "mcp-bridge")]
  {
    // bind loopback only — dev-мост по умолчанию слушает 0.0.0.0, на LAN торчать не должен
    builder = builder.plugin(
      tauri_plugin_mcp_bridge::Builder::new()
        .bind_address("127.0.0.1")
        .build(),
    );
  }

  builder
    .invoke_handler(tauri::generate_handler![
      save_clipboard_image,
      locate_executables,
      webkit_version
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
