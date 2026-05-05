use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    thread::{self, JoinHandle},
    time::Duration,
};

const BLOG_ADDR: &str = "127.0.0.1:4321";
const HEALTH_PAGE: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OI Notebook Blog</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #171717;
        background: #fafafa;
      }

      main {
        width: min(640px, calc(100vw - 48px));
      }

      h1 {
        margin: 0 0 12px;
        font-size: 32px;
        line-height: 1.15;
      }

      p {
        margin: 0;
        color: #555;
        font-size: 16px;
        line-height: 1.7;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>OI Notebook Blog</h1>
      <p>The local blog server is running. Full note pages will be connected in a later preview step.</p>
    </main>
  </body>
</html>"#;

pub(crate) struct ProductionBlogServer {
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl ProductionBlogServer {
    pub(crate) fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }

    pub(crate) fn ensure_running(&self) -> Result<(), String> {
        let mut handle_guard = self
            .handle
            .lock()
            .map_err(|e| format!("Failed to lock local blog server state: {e}"))?;

        if handle_guard.is_some() {
            return Ok(());
        }

        let listener = TcpListener::bind(BLOG_ADDR)
            .map_err(|e| format!("Failed to start local blog server at http://{BLOG_ADDR}: {e}"))?;

        let handle = thread::Builder::new()
            .name("oinb-blog-health-server".to_string())
            .spawn(move || {
                for stream in listener.incoming() {
                    match stream {
                        Ok(stream) => handle_connection(stream),
                        Err(e) => eprintln!("Local blog server connection failed: {e}"),
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn local blog server thread: {e}"))?;

        *handle_guard = Some(handle);
        Ok(())
    }
}

fn handle_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));

    let mut buffer = [0; 1024];
    let _ = stream.read(&mut buffer);

    let body = HEALTH_PAGE.as_bytes();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog response body: {e}");
    }
}
